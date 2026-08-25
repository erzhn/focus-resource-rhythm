import { describe, expect, it } from "vitest";
import { buildProviderChain, streamFirstAvailable, type ChainInput } from "./chain";

const base: ChainInput = {
  forced: "",
  hasGemini: false,
  hasGroq: false,
  hasAnthropic: false,
  allowOllama: true,
};

const chainOf = (patch: Partial<ChainInput>) => {
  const r = buildProviderChain({ ...base, ...patch });
  if (!r.ok) throw new Error(`ожидали ok, получили: ${r.reason}`);
  return r.chain;
};

describe("buildProviderChain", () => {
  it("автоопределение: бесплатные раньше платного, ollama последним", () => {
    expect(chainOf({ hasGemini: true, hasGroq: true, hasAnthropic: true })).toEqual([
      "gemini",
      "groq",
      "anthropic",
      "ollama",
    ]);
  });

  it("в облаке (без ollama) остаются только провайдеры с ключами", () => {
    expect(chainOf({ hasGemini: true, hasGroq: true, allowOllama: false })).toEqual([
      "gemini",
      "groq",
    ]);
  });

  it("явный ASSISTANT_PROVIDER идёт первым, остальные остаются запасными", () => {
    expect(
      chainOf({ forced: "groq", hasGemini: true, hasGroq: true, allowOllama: false }),
    ).toEqual(["groq", "gemini"]);
  });

  it("явный провайдер не дублируется в цепочке", () => {
    const chain = chainOf({ forced: "gemini", hasGemini: true, allowOllama: false });
    expect(chain).toEqual(["gemini"]);
  });

  it("регистр и пробелы в ASSISTANT_PROVIDER не мешают", () => {
    expect(chainOf({ forced: "  GEMINI  ", hasGemini: true, allowOllama: false })).toEqual([
      "gemini",
    ]);
  });

  it("неизвестный провайдер — понятная ошибка", () => {
    const r = buildProviderChain({ ...base, forced: "openai" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("openai");
  });

  it("явный провайдер без ключа — ошибка конфигурации, а не тихая подмена", () => {
    const r = buildProviderChain({ ...base, forced: "groq", hasGemini: true, allowOllama: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("groq");
  });

  it("ollama доступен без ключа", () => {
    expect(chainOf({ forced: "ollama" })).toEqual(["ollama"]);
  });

  it("нет ключей и нет ollama — ошибка с подсказкой", () => {
    const r = buildProviderChain({ ...base, allowOllama: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("GEMINI_API_KEY");
  });
});

// --- Механика переключения ---

/** Генератор, который падает сразу (до первого фрагмента). */
async function* failsImmediately(): AsyncGenerator<string> {
  throw new Error("quota exceeded");
}
/** Генератор, который отдал часть текста и оборвался. */
async function* failsMidStream(): AsyncGenerator<string> {
  yield "нача";
  throw new Error("connection reset");
}
const yields = (...parts: string[]) =>
  async function* (): AsyncGenerator<string> {
    for (const p of parts) yield p;
  };

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const c of gen) out += c;
  return out;
}

describe("streamFirstAvailable", () => {
  it("падение до первого фрагмента → берётся следующий провайдер", async () => {
    const open = (p: string) => (p === "gemini" ? failsImmediately() : yields("ответ")());
    const text = await collect(streamFirstAvailable(["gemini", "groq"], open));
    expect(text).toBe("ответ");
  });

  it("сообщает, кто фактически ответил", async () => {
    const chosen: string[] = [];
    const open = (p: string) => (p === "gemini" ? failsImmediately() : yields("ok")());
    await collect(streamFirstAvailable(["gemini", "groq"], open, (p) => chosen.push(p)));
    expect(chosen).toEqual(["groq"]);
  });

  it("обрыв ПОСЛЕ начала ответа не подменяет провайдера", async () => {
    const open = (p: string) => (p === "gemini" ? failsMidStream() : yields("другой")());
    // Ответ не должен склеиться из двух моделей — ошибка пробрасывается.
    await expect(collect(streamFirstAvailable(["gemini", "groq"], open))).rejects.toThrow(
      "connection reset",
    );
  });

  it("первый рабочий провайдер используется без обращения к запасным", async () => {
    const tried: string[] = [];
    const open = (p: string) => {
      tried.push(p);
      return yields("быстро")();
    };
    await collect(streamFirstAvailable(["gemini", "groq", "anthropic"], open));
    expect(tried).toEqual(["gemini"]);
  });

  it("все упали → пробрасывается последняя ошибка", async () => {
    await expect(
      collect(streamFirstAvailable(["a", "b"], () => failsImmediately())),
    ).rejects.toThrow("quota exceeded");
  });
});
