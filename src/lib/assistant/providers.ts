import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { buildProviderChain, streamFirstAvailable, type AssistantProvider } from "./chain";

/**
 * Провайдеры AI-ассистента. Поддержаны бесплатные варианты (Ollama локально,
 * Gemini/Groq бесплатные тарифы) и платный Claude.
 *
 * Провайдеры образуют ЦЕПОЧКУ: если первый падает до выдачи первого фрагмента
 * (кончилась квота, сервис недоступен), автоматически берётся следующий с ключом.
 * ASSISTANT_PROVIDER задаёт, кто идёт первым; остальные остаются запасными.
 *
 * Все ключи используются только на сервере и не логируются.
 */

export type { AssistantProvider };

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Candidate {
  provider: AssistantProvider;
  model: string;
}

export type Resolved =
  | { ok: true; provider: AssistantProvider; model: string }
  | { ok: false; reason: string };

export type ResolvedChain =
  | { ok: true; chain: Candidate[] }
  | { ok: false; reason: string };

const env = (k: string) => process.env[k]?.trim() || "";

/** Модель по умолчанию для каждого провайдера (можно переопределить ASSISTANT_MODEL). */
const DEFAULT_MODEL: Record<AssistantProvider, string> = {
  ollama: env("OLLAMA_MODEL") || "llama3.2",
  // Алиас «-latest» всегда указывает на актуальную бесплатную flash-модель
  // (конкретные версии со временем выводятся из обслуживания).
  gemini: "gemini-flash-latest",
  groq: "llama-3.3-70b-versatile",
  anthropic: "claude-opus-5",
};

/** Строит цепочку провайдеров: первый — основной, остальные — запасные. */
export function resolveAssistantChain(): ResolvedChain {
  const built = buildProviderChain({
    forced: env("ASSISTANT_PROVIDER"),
    hasGemini: Boolean(env("GEMINI_API_KEY")),
    hasGroq: Boolean(env("GROQ_API_KEY")),
    hasAnthropic: Boolean(env("ANTHROPIC_API_KEY")),
    // На Vercel локального Ollama нет — не тратим на него попытку.
    allowOllama: !env("VERCEL"),
  });
  if (!built.ok) return built;

  const override = env("ASSISTANT_MODEL");
  return {
    ok: true,
    chain: built.chain.map((provider) => ({
      provider,
      // Явная модель применяется только к основному провайдеру: у запасных
      // своя линейка имён, чужое имя модели там невалидно.
      model: override && provider === built.chain[0] ? override : DEFAULT_MODEL[provider],
    })),
  };
}

/**
 * Поток ответа с автоматическим переходом на запасного провайдера.
 *
 * Переключаемся ТОЛЬКО если сбой случился до первого выданного фрагмента:
 * иначе ответ склеился бы из двух разных моделей. `onProvider` сообщает,
 * кто в итоге отвечает.
 */
export function streamWithFallback(
  chain: Candidate[],
  system: string,
  messages: AssistantMessage[],
  onProvider?: (c: Candidate) => void,
): AsyncGenerator<string> {
  return streamFirstAvailable(
    chain,
    (candidate) => streamAssistant(candidate, system, messages),
    onProvider,
  );
}

/** Единый интерфейс: генератор текстовых фрагментов ответа одного провайдера. */
export async function* streamAssistant(
  resolved: Candidate,
  system: string,
  messages: AssistantMessage[],
): AsyncGenerator<string> {
  switch (resolved.provider) {
    case "anthropic":
      yield* streamAnthropic(resolved.model, system, messages);
      return;
    case "gemini":
      yield* streamGemini(resolved.model, system, messages);
      return;
    case "groq":
      yield* streamGroq(resolved.model, system, messages);
      return;
    case "ollama":
      yield* streamOllama(resolved.model, system, messages);
      return;
  }
}

// --- Anthropic (платно) ---
async function* streamAnthropic(model: string, system: string, messages: AssistantMessage[]) {
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const stream = client.messages.stream({
    model,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    output_config: { effort: "medium" },
    system,
    messages,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// --- Google Gemini (бесплатный тариф) ---
async function* streamGemini(model: string, system: string, messages: AssistantMessage[]) {
  const key = env("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: 2048 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error("gemini request failed");
  for await (const data of sseLines(res.body)) {
    try {
      const json = JSON.parse(data);
      const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
      if (text) yield text;
    } catch {
      /* пропускаем нечитаемую строку */
    }
  }
}

// --- Groq (бесплатный тариф, OpenAI-совместимый) ---
async function* streamGroq(model: string, system: string, messages: AssistantMessage[]) {
  const key = env("GROQ_API_KEY");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 2048,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok || !res.body) throw new Error("groq request failed");
  for await (const data of sseLines(res.body)) {
    if (data === "[DONE]") return;
    try {
      const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      /* пропускаем */
    }
  }
}

// --- Ollama (локально, бесплатно) ---
async function* streamOllama(model: string, system: string, messages: AssistantMessage[]) {
  const base = env("OLLAMA_BASE_URL") || "http://localhost:11434";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  }).catch(() => null);
  if (!res || !res.ok || !res.body) {
    throw new Error("ollama unavailable");
  }
  // Ollama отдаёт NDJSON (по одному JSON-объекту на строку).
  for await (const line of ndjsonLines(res.body)) {
    try {
      const chunk = JSON.parse(line)?.message?.content;
      if (chunk) yield chunk;
    } catch {
      /* пропускаем */
    }
  }
}

// --- Утилиты чтения потоков ---

/** Разбирает SSE-поток, выдавая содержимое строк `data: ...`. */
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

/** Разбирает NDJSON-поток (по объекту на строку). */
async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield line;
    }
  }
}
