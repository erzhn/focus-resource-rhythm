import { detectCategory, detectKind, type CategoryId, type TxKind } from "./categories";

/**
 * Разбор быстрого ввода.
 *
 * Пользователь пишет как думает — «Такси 250», «кофе 180 с коллегой»,
 * «Зарплата 20000», несколько строк подряд. Задача: достать сумму, валюту,
 * описание и предположить тип с категорией.
 *
 * Правило точности: если категорию определить не удалось, возвращается null —
 * интерфейс спросит, а не подставит «Другое» молча.
 */

export interface ParsedEntry {
  /** Сумма в минорных единицах (тыйын/копейки) — деньги не храним во float. */
  amountMinor: number;
  currency: string;
  description: string;
  kind: TxKind;
  /** null — не определилась, нужен вопрос пользователю. */
  category: CategoryId | null;
  /** Исходная строка — для показа в подтверждении. */
  raw: string;
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** Строки, в которых не нашлось суммы. */
  unparsed: string[];
}

const DEFAULT_CURRENCY = "KGS";

/**
 * Обозначения валют. Символы и слова разделены намеренно: односимвольное «с»
 * для сома ловило и предлог «с», и первую букву слова «Подписка» — такие
 * алиасы слишком жадные, поэтому их здесь нет. Сом и так валюта по умолчанию.
 */
const CURRENCY_SYMBOLS: [string, string][] = [
  ["$", "USD"],
  ["€", "EUR"],
  ["₽", "RUB"],
  ["₸", "KZT"],
];

const CURRENCY_WORDS: [string[], string][] = [
  [["сом", "сома", "сомов", "kgs"], "KGS"],
  [["usd", "долл", "доллар", "долларов", "бакс", "баксов"], "USD"],
  [["eur", "евро"], "EUR"],
  [["rub", "руб", "рубл", "рублей", "рубля"], "RUB"],
  [["kzt", "тенге"], "KZT"],
];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Код валюты из строки; null — не указана явно. */
function detectCurrency(text: string): string | null {
  for (const [sym, code] of CURRENCY_SYMBOLS) {
    if (text.includes(sym)) return code;
  }
  const words = norm(text).split(/[^a-zа-я]+/u).filter(Boolean);
  for (const [aliases, code] of CURRENCY_WORDS) {
    if (words.some((w) => aliases.some((a) => w === a || w.startsWith(a)))) return code;
  }
  return null;
}

/**
 * Находит сумму в строке.
 *
 * Понимает «1500», «1 500», «1.500», «1,5к», «2к», «250.50».
 * Возвращает и найденное число, и позиции, чтобы вырезать его из описания.
 */
function findAmount(line: string): { value: number; start: number; end: number } | null {
  // Число с возможными разделителями тысяч и дробной частью, плюс суффикс «к»/«k».
  const re = /(\d[\d\s.,]*)\s*(к|k|тыс)?/giu;
  let best: { value: number; start: number; end: number } | null = null;

  for (const m of line.matchAll(re)) {
    const rawNum = m[1];
    const suffix = m[2];
    if (!rawNum || !/\d/.test(rawNum)) continue;

    const value = toNumber(rawNum, Boolean(suffix));
    if (value === null || value <= 0) continue;

    const start = m.index ?? 0;
    const end = start + m[0].trimEnd().length;
    // Берём наибольшую сумму: в «кофе 2 шт 180» цена важнее количества.
    if (!best || value > best.value) best = { value, start, end };
  }
  return best;
}

/** «1 500» → 1500, «250,50» → 250.5, «2к» → 2000. */
function toNumber(raw: string, thousandSuffix: boolean): number | null {
  let s = raw.replace(/\s/g, "").trim();
  // Хвостовые разделители не значащие: «250.» → «250».
  s = s.replace(/[.,]+$/, "");
  if (!s) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  if (lastSep !== -1) {
    const tail = s.slice(lastSep + 1);
    // Ровно две цифры после последнего разделителя — это копейки,
    // иначе разделитель тысяч («1.500» — это полторы тысячи).
    if (tail.length === 2 && !thousandSuffix) {
      s = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + tail;
    } else if (tail.length === 1 && thousandSuffix) {
      s = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + tail;
    } else {
      s = s.replace(/[.,]/g, "");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return thousandSuffix ? n * 1000 : n;
}

/** Убирает из описания сумму, обозначение валюты и лишние знаки. */
function cleanDescription(line: string, amountStart: number, amountEnd: number): string {
  const withoutAmount = line.slice(0, amountStart) + " " + line.slice(amountEnd);
  const words = withoutAmount.split(/\s+/).filter((w) => {
    // Оставляем только буквы: символы валют и знаки препинания отбрасываются.
    const bare = norm(w).replace(/[^a-zа-я]/gu, "");
    if (!bare) return false;
    // Само обозначение валюты в описании не нужно.
    return !CURRENCY_WORDS.some(([aliases]) =>
      aliases.some((a) => bare === a || bare.startsWith(a)),
    );
  });
  return words.join(" ").replace(/\s*[-—:;,]\s*$/, "").trim();
}

/** Разбирает одну строку. null — суммы нет. */
export function parseLine(line: string): ParsedEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const found = findAmount(trimmed);
  if (!found) return null;

  const description = cleanDescription(trimmed, found.start, found.end) || "Без описания";
  const currency = detectCurrency(trimmed) ?? DEFAULT_CURRENCY;
  const kind = detectKind(description);

  return {
    // Округляем до минорных единиц: 250.555 → 25056 тыйын.
    amountMinor: Math.round(found.value * 100),
    currency,
    description,
    kind,
    // У доходов и возвратов категории расходов не применяются.
    category: kind === "expense" ? detectCategory(description) : null,
    raw: trimmed,
  };
}

/** Разбирает многострочный ввод: каждая непустая строка — отдельная операция. */
export function parseEntries(input: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const unparsed: string[] = [];

  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (parsed) entries.push(parsed);
    else unparsed.push(line.trim());
  }
  return { entries, unparsed };
}
