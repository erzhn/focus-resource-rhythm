import "server-only";
import { dec, toString, type Decimal } from "@/domain/trading/decimal";
import type {
  CashAdjustment,
  FxSnapshot,
  InstrumentSpec,
  TradeEntry,
  TradeExit,
  VolumeUnit,
} from "@/domain/trading/types";

/**
 * Перевод строк базы в значения ядра расчётов и обратно.
 *
 * Все денежные поля приходят из представлений ТЕКСТОМ. Это не придирка:
 * PostgREST отдаёт numeric полным числом, но JSON.parse превращает его в
 * double, и 10000000000.12345678 возвращается как 10000000000.123457 —
 * проверено на этой базе. Поэтому ни одно число отсюда не проходит через
 * Number().
 */

export const toDec = (value: string | null | undefined): Decimal | null =>
  value === null || value === undefined ? null : dec(value);

/** Обязательное числовое поле: отсутствие — это ошибка данных, а не ноль. */
export function requireDec(value: string | null | undefined, field: string): Decimal {
  const d = toDec(value);
  if (d === null) throw new Error(`В базе нет обязательного значения «${field}».`);
  return d;
}

export const fromDec = (value: Decimal | null | undefined): string | null =>
  value === null || value === undefined ? null : toString(value);

/** Строка представления trading_trades_v. */
export interface TradeRow {
  id: string;
  user_id: string;
  account_id: string;
  instrument_id: string;
  plan_id: string | null;
  status: "open" | "closed" | "voided";
  direction: "long" | "short";
  entry_mode: "planned" | "historical" | "imported";
  source: "web" | "telegram" | "import";
  opened_at: string;
  closed_at: string | null;
  recorded_at: string;
  local_date: string;
  setup_id: string | null;
  emotion_before: string | null;
  emotion_after: string | null;
  exit_reason: string | null;
  lesson: string | null;
  notes: string | null;
  unknown_reason: string | null;
  spec_version: number | null;
  spec_calc_model: "linear" | "unsupported";
  spec_volume_unit: VolumeUnit;
  spec_quote_currency: string;
  account_timezone: string;
  excursion_source: "manual" | "imported" | "market_data" | null;
  excursion_estimated: boolean;
  fx_at_entry_estimated: boolean;
  balance_at_entry_source: "computed" | "manual" | "unknown" | null;

  instrument_code: string;
  instrument_name: string;
  market_code: string;
  market_title: string;
  product_type: string;
  account_currency: string;
  account_title: string;
  is_demo: boolean;

  entry_price: string;
  quantity: string;
  remaining_quantity: string;
  initial_stop: string | null;
  current_stop: string | null;
  target: string | null;
  spec_contract_multiplier: string | null;
  spec_volume_step: string | null;
  spec_min_close_volume: string | null;
  spec_min_remaining_volume: string | null;
  fx_at_entry: string | null;
  balance_at_entry: string | null;
  initial_distance: string | null;
  initial_risk_quote: string | null;
  initial_risk_account: string | null;
  risk_pct: string | null;
  planned_rr: string | null;
  gross_realized_account: string | null;
  adjustments_account: string | null;
  net_realized_account: string | null;
  final_r: string | null;
  avg_exit_price: string | null;
  mfe_price: string | null;
  mae_price: string | null;
}

export interface ExitRow {
  id: string;
  trade_id: string;
  exited_at: string;
  reason: string | null;
  fx_estimated: boolean;
  action_key: string;
  quantity: string;
  price: string;
  fx_rate: string | null;
}

export interface SpecRow {
  id: string;
  account_id: string;
  instrument_id: string;
  version: number;
  calc_model: "linear" | "unsupported";
  volume_unit: VolumeUnit;
  quote_currency: string;
  is_configured: boolean;
  instrument_code: string;
  instrument_name: string;
  market_code: string;
  contract_multiplier: string | null;
  min_volume: string | null;
  volume_step: string | null;
  max_volume: string | null;
  min_close_volume: string | null;
  min_remaining_volume: string | null;
  price_step: string | null;
  pip_size: string | null;
}

/**
 * Спецификация из снимка сделки, а не из текущих настроек.
 *
 * Именно поэтому снимок и хранится в строке сделки: смена минимального лота у
 * брокера не должна задним числом менять P/L закрытых сделок.
 */
export function specFromTradeRow(row: TradeRow): InstrumentSpec {
  const zero = dec("0");
  return {
    version: row.spec_version ?? 0,
    model: row.spec_calc_model,
    volumeUnit: row.spec_volume_unit,
    contractMultiplier: toDec(row.spec_contract_multiplier) ?? zero,
    quoteCurrency: row.spec_quote_currency,
    // Эти поля нужны только для проверки новых действий с позицией, поэтому
    // при их отсутствии берём нули: расчёт P/L от них не зависит.
    minVolume: zero,
    volumeStep: toDec(row.spec_volume_step) ?? zero,
    maxVolume: null,
    minCloseVolume: toDec(row.spec_min_close_volume) ?? zero,
    minRemainingVolume: toDec(row.spec_min_remaining_volume) ?? zero,
    priceStep: zero,
  };
}

export function specFromRow(row: SpecRow): InstrumentSpec {
  const zero = dec("0");
  return {
    version: row.version,
    model: row.calc_model,
    volumeUnit: row.volume_unit,
    contractMultiplier: toDec(row.contract_multiplier) ?? zero,
    quoteCurrency: row.quote_currency,
    minVolume: toDec(row.min_volume) ?? zero,
    volumeStep: toDec(row.volume_step) ?? zero,
    maxVolume: toDec(row.max_volume),
    minCloseVolume: toDec(row.min_close_volume) ?? zero,
    minRemainingVolume: toDec(row.min_remaining_volume) ?? zero,
    priceStep: toDec(row.price_step) ?? zero,
  };
}

export function entryFromRow(row: TradeRow): TradeEntry {
  const fxRate = toDec(row.fx_at_entry);
  const fxAtEntry: FxSnapshot | null = fxRate && {
    rate: fxRate,
    at: new Date(row.opened_at),
    source: "manual",
    estimated: row.fx_at_entry_estimated,
  };

  return {
    direction: row.direction,
    entryPrice: requireDec(row.entry_price, "entry_price"),
    initialStop: toDec(row.initial_stop),
    target: toDec(row.target),
    quantity: requireDec(row.quantity, "quantity"),
    spec: specFromTradeRow(row),
    fxAtEntry,
    balanceAtEntry: toDec(row.balance_at_entry),
  };
}

export function exitFromRow(row: ExitRow): TradeExit {
  const rate = toDec(row.fx_rate);
  return {
    quantity: requireDec(row.quantity, "quantity"),
    price: requireDec(row.price, "price"),
    at: new Date(row.exited_at),
    fx: rate && { rate, at: new Date(row.exited_at), source: "manual", estimated: row.fx_estimated },
  };
}

export interface AdjustmentRow {
  id: string;
  trade_id: string;
  kind: CashAdjustment["kind"];
  amount_account: string | null;
  posted_at: string;
}

export function adjustmentFromRow(row: AdjustmentRow): CashAdjustment | null {
  const amount = toDec(row.amount_account);
  // Без суммы в валюте счёта проводку в расчёт не берём: курс неизвестен, и
  // подставлять вместо него ноль значило бы занизить расходы.
  if (amount === null) return null;
  return { amountAccount: amount, kind: row.kind, at: new Date(row.posted_at) };
}
