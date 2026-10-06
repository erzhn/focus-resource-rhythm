/**
 * Десятичная арифметика с фиксированной точкой.
 *
 * Деньги, цены и объёмы нельзя считать в JS-числах: 0.1 + 0.2 там не равно 0.3,
 * а при сложении сотни сделок ошибка накапливается и итог журнала расходится с
 * выпиской брокера. Внутренних библиотек в проекте нет, новую зависимость ради
 * пяти операций тянуть не стоит — поэтому минимальная реализация на bigint.
 *
 * Число хранится как пара «целое значение + масштаб»: value × 10^(−scale).
 * bigint не переполняется, поэтому умножение точное; единственное место, где
 * появляется округление, — деление, и там масштаб задаётся явно.
 *
 * Снаружи значения ходят строками: `numeric` из PostgREST приезжает строкой,
 * и превращать её в JS-число по дороге нельзя.
 */

export interface Decimal {
  readonly value: bigint;
  /** Количество знаков после запятой. Всегда ≥ 0. */
  readonly scale: number;
}

const TEN = 10n;

function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/**
 * Разбор десятичной строки. Принимает «1.5», «-0.001», «1e-3» не принимает:
 * экспоненциальная запись в финансовых полях — повод уточнить ввод, а не
 * угадывать.
 */
export function dec(input: string | number | bigint): Decimal {
  if (typeof input === "bigint") return { value: input, scale: 0 };

  const raw = typeof input === "number" ? numberToString(input) : input.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Не десятичное число: «${raw}»`);
  }

  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const value = BigInt(whole + fraction);
  return { value: negative ? -value : value, scale: fraction.length };
}

/**
 * Число превращаем в строку через toString: он даёт кратчайшее представление,
 * однозначно восстанавливающее это же число. Экспоненциальную форму (1e-7,
 * 1e21) не принимаем — такие значения должны приходить строкой.
 */
function numberToString(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Не конечное число: ${n}`);
  const s = String(n);
  if (s.includes("e") || s.includes("E")) {
    throw new Error(`Экспоненциальная запись не поддерживается: ${s}. Передайте строку.`);
  }
  return s;
}

export const ZERO: Decimal = { value: 0n, scale: 0 };
export const ONE: Decimal = { value: 1n, scale: 0 };

/** Приводит число к большему масштабу без потери значения. */
export function rescale(d: Decimal, scale: number): Decimal {
  if (scale === d.scale) return d;
  if (scale > d.scale) return { value: d.value * pow10(scale - d.scale), scale };
  // Уменьшение масштаба — это округление, оно делается явно через round().
  return round(d, scale);
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.value * pow10(scale - a.scale), b.value * pow10(scale - b.scale), scale];
}

export function add(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { value: x + y, scale };
}

export function sub(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { value: x - y, scale };
}

/** Умножение точное: масштабы складываются, ничего не теряется. */
export function mul(a: Decimal, b: Decimal): Decimal {
  return { value: a.value * b.value, scale: a.scale + b.scale };
}

/**
 * Деление с явным масштабом результата и округлением «половина вверх по
 * модулю»: 2.5 → 3, −2.5 → −3. Делитель, равный нулю, — ошибка вызывающего
 * кода: в формулах ноль в знаменателе означает «значение неизвестно», и это
 * состояние обрабатывается до вызова.
 */
export function div(a: Decimal, b: Decimal, scale: number): Decimal {
  if (b.value === 0n) throw new Error("Деление на ноль");

  const negative = a.value < 0n !== b.value < 0n;
  // Считаем на модулях: деление bigint усекает к нулю, и на отрицательных
  // значениях это портило бы округление.
  let numerator = (a.value < 0n ? -a.value : a.value) * TEN; // запасной разряд
  let denominator = b.value < 0n ? -b.value : b.value;

  // Нужный масштаб добираем множителем, а когда он отрицательный — делителем:
  // уменьшать числитель нельзя, точность потерялась бы до деления.
  const shift = scale + b.scale - a.scale;
  if (shift >= 0) numerator *= pow10(shift);
  else denominator *= pow10(-shift);

  const rounded = (numerator / denominator + 5n) / TEN;
  return { value: negative ? -rounded : rounded, scale };
}

/** Округление до указанного масштаба, «половина вверх по модулю». */
export function round(d: Decimal, scale: number): Decimal {
  if (scale >= d.scale) return rescale(d, scale);
  const factor = pow10(d.scale - scale);
  const negative = d.value < 0n;
  const magnitude = negative ? -d.value : d.value;
  const rounded = (magnitude + factor / 2n) / factor;
  return { value: negative ? -rounded : rounded, scale };
}

/** Округление к нулю (отбрасывание хвоста) — для объёмов, которые нельзя завышать. */
export function truncate(d: Decimal, scale: number): Decimal {
  if (scale >= d.scale) return rescale(d, scale);
  const factor = pow10(d.scale - scale);
  const negative = d.value < 0n;
  const magnitude = negative ? -d.value : d.value;
  const cut = magnitude / factor;
  return { value: negative ? -cut : cut, scale };
}

export function neg(d: Decimal): Decimal {
  return { value: -d.value, scale: d.scale };
}

export function abs(d: Decimal): Decimal {
  return d.value < 0n ? neg(d) : d;
}

/** −1, 0 или 1. */
export function cmp(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const isZero = (d: Decimal) => d.value === 0n;
export const isNegative = (d: Decimal) => d.value < 0n;
export const isPositive = (d: Decimal) => d.value > 0n;
export const eq = (a: Decimal, b: Decimal) => cmp(a, b) === 0;
export const lt = (a: Decimal, b: Decimal) => cmp(a, b) < 0;
export const lte = (a: Decimal, b: Decimal) => cmp(a, b) <= 0;
export const gt = (a: Decimal, b: Decimal) => cmp(a, b) > 0;
export const gte = (a: Decimal, b: Decimal) => cmp(a, b) >= 0;

export function sum(items: Decimal[]): Decimal {
  return items.reduce(add, ZERO);
}

export function max(a: Decimal, b: Decimal): Decimal {
  return gte(a, b) ? a : b;
}

export function min(a: Decimal, b: Decimal): Decimal {
  return lte(a, b) ? a : b;
}

/**
 * Наибольшее кратное шага, не превышающее значение, начиная от base.
 * Используется для объёмной сетки брокера: объём округляется только ВНИЗ,
 * иначе проверка риска пропустила бы сделку крупнее разрешённой.
 */
export function floorToStep(value: Decimal, step: Decimal, base: Decimal = ZERO): Decimal {
  if (!isPositive(step)) throw new Error("Шаг должен быть положительным");
  const offset = sub(value, base);
  if (isNegative(offset)) return base;
  const [o, s] = align(offset, step);
  const steps = o / s;
  return add(base, mul(step, { value: steps, scale: 0 }));
}

/** Точная строка с текущим масштабом: «1.50», а не «1.5». */
export function toString(d: Decimal): string {
  const negative = d.value < 0n;
  const digits = (negative ? -d.value : d.value).toString().padStart(d.scale + 1, "0");
  const whole = digits.slice(0, digits.length - d.scale) || "0";
  const fraction = d.scale > 0 ? `.${digits.slice(digits.length - d.scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** Строка без хвостовых нулей: «1.50» → «1.5», «2.00» → «2». */
export function toTrimmedString(d: Decimal): string {
  const s = toString(d);
  if (!s.includes(".")) return s;
  const trimmed = s.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}

/**
 * В число — ТОЛЬКО для отрисовки графиков, где точность до копейки не нужна.
 * В расчётах пользоваться нельзя: именно ради этого всё выше и написано.
 */
export function toNumberForDisplay(d: Decimal): number {
  return Number(toString(d));
}
