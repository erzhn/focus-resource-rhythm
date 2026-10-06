import {
  type Decimal,
  ZERO,
  abs,
  add,
  div,
  eq,
  gt,
  isPositive,
  isZero,
  lt,
  max,
  mul,
  round,
  sub,
  sum,
} from "./decimal";
import {
  SCALE,
  type CashAdjustment,
  type FxSnapshot,
  type Maybe,
  type PriceExcursion,
  type TradeEntry,
  type TradeExit,
  directionSign,
  known,
  unknown,
} from "./types";
import { remainingQuantity } from "./volume";

/**
 * Ядро расчётов по сделке.
 *
 * Здесь и только здесь живут формулы риска, P/L и R. Интерфейс их не
 * повторяет, SQL их не повторяет: вторая реализация рано или поздно разойдётся
 * с первой, и тогда предварительная проверка начнёт показывать одно, а
 * аналитика — другое.
 *
 * Все функции чистые и ничего не знают о базе. Неизвестные входные данные дают
 * неизвестный результат С ПРИЧИНОЙ, а не ноль.
 */

const LINEAR_ONLY = "Для этого инструмента не задана поддерживаемая модель расчёта.";

/** Проверка стопа: сторона относительно входа и ненулевое расстояние. */
export function checkStop(entry: Pick<TradeEntry, "direction" | "entryPrice" | "initialStop">): {
  ok: boolean;
  reason?: string;
} {
  const { direction, entryPrice, initialStop } = entry;
  if (initialStop === null) {
    return { ok: false, reason: "Стоп не задан — исходный риск неизвестен." };
  }
  if (eq(initialStop, entryPrice)) {
    return { ok: false, reason: "Стоп, равный входу, не задаёт исходный риск." };
  }
  if (direction === "long" && gt(initialStop, entryPrice)) {
    return { ok: false, reason: "Для покупки стоп должен быть ниже входа." };
  }
  if (direction === "short" && lt(initialStop, entryPrice)) {
    return { ok: false, reason: "Для продажи стоп должен быть выше входа." };
  }
  return { ok: true };
}

/** Расстояние от входа до исходного стопа. */
export function initialDistance(entry: TradeEntry): Maybe<Decimal> {
  const check = checkStop(entry);
  if (!check.ok) return unknown(check.reason!);
  return known(abs(sub(entry.entryPrice, entry.initialStop!)));
}

export interface InitialRisk {
  distance: Maybe<Decimal>;
  /** Риск в валюте котировки инструмента. */
  riskQuote: Maybe<Decimal>;
  /** Риск в валюте счёта. */
  riskAccount: Maybe<Decimal>;
  /** Доля от баланса перед входом, в процентах. */
  riskPct: Maybe<Decimal>;
}

/**
 * Исходный риск — тот, что был в момент входа.
 *
 * Перенос стопа его не меняет: иначе «перевёл в безубыток» задним числом
 * превращало бы любой результат в бесконечный R, а историю — в вымысел.
 */
export function initialRisk(entry: TradeEntry): InitialRisk {
  if (entry.spec.model !== "linear") {
    const u = unknown(LINEAR_ONLY);
    return { distance: u, riskQuote: u, riskAccount: u, riskPct: u };
  }

  const distance = initialDistance(entry);
  if (!distance.known) {
    return { distance, riskQuote: distance, riskAccount: distance, riskPct: distance };
  }

  const riskQuote = known(
    round(mul(mul(distance.value, entry.quantity), entry.spec.contractMultiplier), SCALE.money),
  );

  const riskAccount = convert(riskQuote.value, entry.fxAtEntry);
  return { distance, riskQuote, riskAccount, riskPct: percentOfBalance(riskAccount, entry.balanceAtEntry) };
}

/**
 * Доля суммы от баланса в процентах.
 *
 * Неизвестный баланс не заменяется нулём и не берётся «сегодняшний»: доля
 * риска считается от баланса НА МОМЕНТ входа, иначе число меняется от каждой
 * последующей сделки.
 */
function percentOfBalance(amount: Maybe<Decimal>, balance: Decimal | null): Maybe<Decimal> {
  if (!amount.known) return amount;
  if (balance === null) {
    return unknown("Баланс перед входом неизвестен — доля риска не рассчитана.");
  }
  if (isZero(balance)) {
    return unknown("Баланс перед входом равен нулю — доля риска не определена.");
  }
  return known(div(mul({ value: 100n, scale: 0 }, amount.value), balance, SCALE.pct));
}

/** Пересчёт суммы из валюты котировки в валюту счёта по снимку курса. */
function convert(amountQuote: Decimal, fx: FxSnapshot | null): Maybe<Decimal> {
  if (fx === null) {
    return unknown("Неизвестен курс валюты инструмента к валюте счёта.");
  }
  return known(round(mul(amountQuote, fx.rate), SCALE.money));
}

/**
 * Плановое R/R.
 *
 * Цель по неправильную сторону входа не превращаем в положительное число
 * через модуль: отрицательное R/R означает, что план противоречит сам себе,
 * и это надо увидеть, а не спрятать.
 */
export function plannedRR(entry: TradeEntry): Maybe<Decimal> {
  if (entry.spec.model !== "linear") return unknown(LINEAR_ONLY);
  if (entry.target === null) return unknown("Цель не задана — плановое R/R неизвестно.");

  const distance = initialDistance(entry);
  if (!distance.known) return distance;

  const signed = mul(directionSign(entry.direction), sub(entry.target, entry.entryPrice));
  return known(div(signed, distance.value, SCALE.r));
}

export interface Realized {
  /** Валовой результат в валюте котировки. */
  grossQuote: Maybe<Decimal>;
  /** Валовой результат в валюте счёта. */
  grossAccount: Maybe<Decimal>;
  /** Чистый результат: валовой плюс подписанные расходы. */
  netAccount: Maybe<Decimal>;
  /** Сумма расходов и поступлений, не связанных с движением цены. */
  adjustmentsAccount: Decimal;
  remaining: Decimal;
  avgExitPrice: Maybe<Decimal>;
  closed: boolean;
}

/**
 * Реализованный результат по совершённым выходам.
 *
 * Расходы складываются ПОДПИСАННЫМИ: комиссия приходит отрицательной и просто
 * прибавляется. Вычитать её отдельно нельзя — получится двойное списание.
 */
export function realize(
  entry: TradeEntry,
  exits: TradeExit[],
  adjustments: CashAdjustment[],
): Realized {
  const adjustmentsAccount = round(
    sum(adjustments.map((a) => a.amountAccount)),
    SCALE.money,
  );
  const remaining = remainingQuantity(
    entry.quantity,
    exits.map((e) => e.quantity),
  );
  const closed = !isPositive(remaining);

  if (entry.spec.model !== "linear") {
    const u = unknown(LINEAR_ONLY);
    return {
      grossQuote: u,
      grossAccount: u,
      netAccount: u,
      adjustmentsAccount,
      remaining,
      avgExitPrice: u,
      closed,
    };
  }

  const sign = directionSign(entry.direction);
  const perExitQuote = exits.map((e) =>
    round(
      mul(mul(mul(sign, sub(e.price, entry.entryPrice)), e.quantity), entry.spec.contractMultiplier),
      SCALE.money,
    ),
  );

  const grossQuote: Maybe<Decimal> =
    exits.length === 0
      ? known(ZERO)
      : known(round(sum(perExitQuote), SCALE.money));

  // Каждый выход конвертируется по СВОЕМУ курсу: сделка могла идти несколько
  // дней, и один общий курс исказил бы результат.
  let grossAccount: Maybe<Decimal> = known(ZERO);
  for (const [i, e] of exits.entries()) {
    const converted = convert(perExitQuote[i], e.fx);
    if (!converted.known) {
      grossAccount = converted;
      break;
    }
    if (grossAccount.known) {
      grossAccount = known(add(grossAccount.value, converted.value));
    }
  }

  const netAccount: Maybe<Decimal> = grossAccount.known
    ? known(round(add(grossAccount.value, adjustmentsAccount), SCALE.money))
    : grossAccount;

  const exitedQuantity = sum(exits.map((e) => e.quantity));
  const avgExitPrice: Maybe<Decimal> = isPositive(exitedQuantity)
    ? known(
        div(
          sum(exits.map((e) => mul(e.price, e.quantity))),
          exitedQuantity,
          SCALE.money,
        ),
      )
    : unknown("Выходов ещё не было.");

  return {
    grossQuote,
    grossAccount: grossAccount.known ? known(round(grossAccount.value, SCALE.money)) : grossAccount,
    netAccount,
    adjustmentsAccount,
    remaining,
    avgExitPrice,
    closed,
  };
}

/**
 * Итоговый R закрытой сделки.
 *
 * Для неизвестного исходного риска это NULL, а не ноль: ноль означал бы
 * «сделка отработала ровно в ноль», что неправда.
 */
export function finalR(entry: TradeEntry, realized: Realized): Maybe<Decimal> {
  if (!realized.closed) {
    return unknown("Сделка ещё не закрыта — итоговый R не определён.");
  }
  return rOf(entry, realized.netAccount);
}

/**
 * R по уже зафиксированной части открытой сделки.
 *
 * Отдельная функция, а не finalR: это промежуточное значение, и выдавать его
 * за итог сделки нельзя — остаток ещё может всё изменить.
 */
export function realizedRSoFar(entry: TradeEntry, realized: Realized): Maybe<Decimal> {
  if (realized.closed) {
    return unknown("Сделка закрыта — используйте итоговый R.");
  }
  return rOf(entry, realized.netAccount);
}

function rOf(entry: TradeEntry, netAccount: Maybe<Decimal>): Maybe<Decimal> {
  if (!netAccount.known) return netAccount;
  const risk = initialRisk(entry).riskAccount;
  if (!risk.known) return risk;
  if (isZero(risk.value)) return unknown("Исходный риск равен нулю — R не определён.");
  return known(div(netAccount.value, risk.value, SCALE.r));
}

export interface ExcursionR {
  mfeR: Maybe<Decimal>;
  maeR: Maybe<Decimal>;
}

/**
 * Ценовая экскурсия в единицах исходного риска.
 *
 * Это про ЦЕНУ, а не про стоимость позиции: сколько дала бы цена, если бы весь
 * объём дожил до экстремума. Отсутствие значения остаётся отсутствием —
 * нулевая экскурсия означала бы, что цена не двигалась вовсе.
 */
export function excursionR(entry: TradeEntry, excursion: PriceExcursion | null): ExcursionR {
  const distance = initialDistance(entry);
  if (!distance.known) return { mfeR: distance, maeR: distance };
  if (excursion === null) {
    const u = unknown("Экстремумы цены не записаны.");
    return { mfeR: u, maeR: u };
  }

  const sign = directionSign(entry.direction);

  const mfeR: Maybe<Decimal> =
    excursion.mfePrice === null
      ? unknown("Максимум хода цены не записан.")
      : known(
          div(
            max(ZERO, mul(sign, sub(excursion.mfePrice, entry.entryPrice))),
            distance.value,
            SCALE.r,
          ),
        );

  const maeR: Maybe<Decimal> =
    excursion.maePrice === null
      ? unknown("Минимум хода цены не записан.")
      : known(
          div(
            max(ZERO, mul({ value: -1n, scale: 0 }, mul(sign, sub(excursion.maePrice, entry.entryPrice)))),
            distance.value,
            SCALE.r,
          ),
        );

  return { mfeR, maeR };
}

/**
 * «Отданная прибыль» позиции.
 *
 * Считается только когда объём выходил ОДНИМ куском: при частичных выходах
 * часть позиции могла закрыться до экстремума, и разность «ценовой MFE минус
 * итог» перестаёт быть упущенной прибылью. Для точного расчёта нужна временная
 * история цен, выходов и расходов, которой в первой версии нет.
 */
export function positionGivebackR(
  entry: TradeEntry,
  exits: TradeExit[],
  realized: Realized,
  excursion: PriceExcursion | null,
): Maybe<Decimal> {
  if (!realized.closed) {
    return unknown("Сделка ещё не закрыта.");
  }
  if (exits.length > 1) {
    return unknown(
      "При частичных выходах точная отдача не вычисляется: часть объёма могла закрыться до экстремума. Доступно ориентировочное сравнение «ценовая возможность / итог».",
    );
  }
  const { mfeR } = excursionR(entry, excursion);
  if (!mfeR.known) return mfeR;
  const result = finalR(entry, realized);
  if (!result.known) return result;
  return known(sub(mfeR.value, result.value));
}

/**
 * Согласованность экстремумов с направлением, входом и ценами исполнений.
 * Несогласованные данные — повод спросить, а не молча подставить.
 */
export function checkExcursion(
  entry: TradeEntry,
  exits: TradeExit[],
  excursion: PriceExcursion,
): { ok: boolean; reason?: string } {
  const prices = [entry.entryPrice, ...exits.map((e) => e.price)];
  const { mfePrice, maePrice } = excursion;

  if (mfePrice && maePrice) {
    const favourableFirst = entry.direction === "long" ? gt(mfePrice, maePrice) : lt(mfePrice, maePrice);
    if (!favourableFirst && !eq(mfePrice, maePrice)) {
      return { ok: false, reason: "Максимум и минимум хода цены перепутаны местами." };
    }
  }

  for (const p of prices) {
    if (entry.direction === "long") {
      if (mfePrice && gt(p, mfePrice)) {
        return { ok: false, reason: "Цена исполнения выше записанного максимума хода." };
      }
      if (maePrice && lt(p, maePrice)) {
        return { ok: false, reason: "Цена исполнения ниже записанного минимума хода." };
      }
    } else {
      if (mfePrice && lt(p, mfePrice)) {
        return { ok: false, reason: "Цена исполнения ниже записанного максимума хода." };
      }
      if (maePrice && gt(p, maePrice)) {
        return { ok: false, reason: "Цена исполнения выше записанного минимума хода." };
      }
    }
  }

  return { ok: true };
}
