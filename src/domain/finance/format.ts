/** Отображение денежных сумм. Внутри всё хранится в минорных единицах. */

const SYMBOLS: Record<string, string> = {
  KGS: "сом",
  USD: "$",
  EUR: "€",
  RUB: "₽",
  KZT: "₸",
};

/** Символ или код валюты для подписи. */
export const currencyLabel = (currency: string) => SYMBOLS[currency] ?? currency;

/**
 * «25050, KGS» → «250,50 сом». Копейки показываем только когда они есть:
 * «250 сом» читается легче, чем «250,00 сом».
 */
export function formatMinor(amountMinor: number, currency = "KGS"): string {
  const major = amountMinor / 100;
  const hasFraction = amountMinor % 100 !== 0;
  const num = major.toLocaleString("ru-RU", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const sym = currencyLabel(currency);
  // Символы ставим слитно слева, словесные обозначения — справа.
  return sym === "$" || sym === "€" ? `${sym}${num}` : `${num} ${sym}`;
}

/** Компактно для плиток: «12 450» без валюты. */
export function formatMinorShort(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

/** Разбор введённой пользователем суммы в минорные единицы; null — не число. */
export function parseAmountToMinor(input: string): number | null {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
