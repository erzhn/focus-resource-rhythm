/**
 * Чистая логика выбора цепочки AI-провайдеров (без сети и секретов — тестируется).
 *
 * Идея: провайдеры пробуются по порядку. Если очередной падает ДО того, как выдал
 * первый фрагмент ответа, берётся следующий. Это даёт устойчивость к исчерпанию
 * квоты или временной недоступности одного из сервисов.
 */

export type AssistantProvider = "ollama" | "gemini" | "groq" | "anthropic";

export const ASSISTANT_PROVIDERS: AssistantProvider[] = ["ollama", "gemini", "groq", "anthropic"];

export interface ChainInput {
  /** Значение ASSISTANT_PROVIDER (может быть пустым). */
  forced: string;
  hasGemini: boolean;
  hasGroq: boolean;
  hasAnthropic: boolean;
  /** Разрешён ли локальный Ollama (в облаке его нет — там он бесполезен). */
  allowOllama: boolean;
}

export type ChainResult =
  | { ok: true; chain: AssistantProvider[] }
  | { ok: false; reason: string };

/** Порядок предпочтения при автоопределении: бесплатные раньше платного. */
const AUTO_ORDER: AssistantProvider[] = ["gemini", "groq", "anthropic"];

export function buildProviderChain(input: ChainInput): ChainResult {
  const forced = input.forced.trim().toLowerCase();
  const hasKey: Record<AssistantProvider, boolean> = {
    gemini: input.hasGemini,
    groq: input.hasGroq,
    anthropic: input.hasAnthropic,
    ollama: true, // локальный сервер, ключ не нужен
  };

  const chain: AssistantProvider[] = [];

  if (forced) {
    if (!ASSISTANT_PROVIDERS.includes(forced as AssistantProvider)) {
      return { ok: false, reason: `Неизвестный ASSISTANT_PROVIDER: ${forced}` };
    }
    const p = forced as AssistantProvider;
    if (!hasKey[p]) {
      return { ok: false, reason: `Для провайдера ${p} не задан API-ключ.` };
    }
    // Явно выбранный идёт первым, остальные остаются запасными.
    chain.push(p);
  }

  for (const p of AUTO_ORDER) {
    if (hasKey[p] && !chain.includes(p)) chain.push(p);
  }

  // Ollama — последний: локально это рабочий бесплатный вариант, в облаке недоступен.
  if (input.allowOllama && !chain.includes("ollama")) chain.push("ollama");

  if (chain.length === 0) {
    return {
      ok: false,
      reason: "Не настроен ни один AI-провайдер. Задайте GEMINI_API_KEY, GROQ_API_KEY или ANTHROPIC_API_KEY.",
    };
  }
  return { ok: true, chain };
}

/**
 * Перебирает кандидатов, пока один не начнёт отдавать текст.
 *
 * Ключевое правило: подменять провайдера можно ТОЛЬКО до первого выданного
 * фрагмента. Если поток уже пошёл и оборвался — ошибка пробрасывается, иначе
 * ответ склеился бы из двух разных моделей.
 */
export async function* streamFirstAvailable<T>(
  candidates: T[],
  open: (candidate: T) => AsyncGenerator<string>,
  onChosen?: (candidate: T) => void,
): AsyncGenerator<string> {
  let lastError: unknown = null;

  for (const candidate of candidates) {
    let started = false;
    try {
      for await (const chunk of open(candidate)) {
        if (!started) {
          started = true;
          onChosen?.(candidate);
        }
        yield chunk;
      }
      return;
    } catch (e) {
      lastError = e;
      if (started) throw e; // поток уже начался — переключаться нельзя
    }
  }

  throw lastError ?? new Error("нет доступных провайдеров");
}
