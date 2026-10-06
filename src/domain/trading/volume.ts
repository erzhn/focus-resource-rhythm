import {
  type Decimal,
  ZERO,
  div,
  eq,
  floorToStep,
  gt,
  gte,
  isPositive,
  lt,
  mul,
  sub,
  toTrimmedString,
} from "./decimal";
import { SCALE, type InstrumentSpec, type Maybe, known, unknown } from "./types";

/**
 * Объём: сетка брокера и допустимый по лимиту размер.
 *
 * Два правила, которые нельзя нарушать:
 * 1. Объём округляется ТОЛЬКО вниз. Округление вверх провело бы проверку
 *    риска для сделки крупнее разрешённой — то есть соврало бы в опасную
 *    сторону.
 * 2. Если допустимого объёма нет, так и говорим. Не предлагаем сузить стоп
 *    или пополнить счёт ради прохождения проверки: это подгонка условий под
 *    желание войти.
 */

export interface VolumeCheck {
  ok: boolean;
  /** Почему объём недопустим — текстом для интерфейса. */
  reason?: string;
}

/** Соответствует ли объём сетке: минимум, шаг, максимум. */
export function checkVolume(quantity: Decimal, spec: InstrumentSpec): VolumeCheck {
  if (!isPositive(quantity)) return { ok: false, reason: "Объём должен быть больше нуля." };

  if (lt(quantity, spec.minVolume)) {
    return {
      ok: false,
      reason: `Минимальный объём — ${toTrimmedString(spec.minVolume)}.`,
    };
  }

  if (spec.maxVolume && gt(quantity, spec.maxVolume)) {
    return {
      ok: false,
      reason: `Максимальный объём — ${toTrimmedString(spec.maxVolume)}.`,
    };
  }

  if (!eq(floorToStep(quantity, spec.volumeStep, spec.minVolume), quantity)) {
    return {
      ok: false,
      reason: `Объём должен быть кратен шагу ${toTrimmedString(spec.volumeStep)} от ${toTrimmedString(spec.minVolume)}.`,
    };
  }

  return { ok: true };
}

/**
 * Наибольший допустимый объём, укладывающийся в денежный лимит риска.
 *
 * riskBudget — сколько валюты счёта разрешено потерять до стопа.
 * distance — расстояние от входа до стопа в цене.
 * fxQuoteToAccount — курс валюты котировки к валюте счёта; null означает
 * «курс неизвестен», и тогда одобрить расчёт нельзя (а не посчитать по 1:1).
 */
export function maxVolumeForRisk(
  riskBudgetAccount: Decimal,
  distance: Decimal,
  spec: InstrumentSpec,
  fxQuoteToAccount: Decimal | null,
): Maybe<Decimal> {
  if (spec.model !== "linear") {
    return unknown("Для этого инструмента не задана поддерживаемая модель расчёта.");
  }
  if (!isPositive(distance)) {
    return unknown("Расстояние до стопа должно быть больше нуля.");
  }
  if (!isPositive(riskBudgetAccount)) {
    return unknown("Лимит риска не задан.");
  }
  if (fxQuoteToAccount === null) {
    return unknown("Неизвестен курс валюты инструмента к валюте счёта.");
  }

  // Риск на единицу объёма — цена одного «шага объёма» в деньгах счёта.
  const riskPerUnit = mul(mul(distance, spec.contractMultiplier), fxQuoteToAccount);
  if (!isPositive(riskPerUnit)) {
    return unknown("Множитель контракта или курс равны нулю.");
  }

  const raw = div(riskBudgetAccount, riskPerUnit, SCALE.money);
  const allowed = floorToStep(raw, spec.volumeStep, spec.minVolume);

  // floorToStep не опускается ниже базы, поэтому отдельно проверяем, что
  // сырой объём вообще дотянул до минимального.
  if (lt(raw, spec.minVolume)) {
    return unknown(
      `При заданном стопе и минимальном объёме ${toTrimmedString(spec.minVolume)} сделка не укладывается в ваш лимит.`,
    );
  }

  const capped = spec.maxVolume && gt(allowed, spec.maxVolume) ? spec.maxVolume : allowed;
  return known(capped);
}

export interface PartialCloseCheck {
  ok: boolean;
  reason?: string;
  /** Закрывается весь остаток — ограничения частичного закрытия не применяются. */
  full: boolean;
}

/**
 * Можно ли закрыть указанный объём.
 *
 * Закрытие всего остатка разрешено всегда: позиция, которую нельзя закрыть,
 * была бы ловушкой. Ограничения minCloseVolume и minRemainingVolume относятся
 * только к ЧАСТИЧНОМУ закрытию.
 *
 * Невозможность частично зафиксировать — это ограничение брокера, а не
 * нарушение дисциплины: вызывающий код не должен записывать её как нарушение.
 */
export function checkPartialClose(
  quantity: Decimal,
  remaining: Decimal,
  spec: InstrumentSpec,
): PartialCloseCheck {
  if (!isPositive(quantity)) {
    return { ok: false, full: false, reason: "Объём закрытия должен быть больше нуля." };
  }
  if (gt(quantity, remaining)) {
    return {
      ok: false,
      full: false,
      reason: `Нельзя закрыть больше остатка — ${toTrimmedString(remaining)}.`,
    };
  }

  if (eq(quantity, remaining)) return { ok: true, full: true };

  if (lt(quantity, spec.minCloseVolume)) {
    return {
      ok: false,
      full: false,
      reason: `Минимальный объём закрытия — ${toTrimmedString(spec.minCloseVolume)}.`,
    };
  }

  const rest = sub(remaining, quantity);
  if (lt(rest, spec.minRemainingVolume)) {
    return {
      ok: false,
      full: false,
      reason:
        `После закрытия останется ${toTrimmedString(rest)}, а минимальный остаток — ` +
        `${toTrimmedString(spec.minRemainingVolume)}. Закройте позицию целиком.`,
    };
  }

  if (!eq(floorToStep(quantity, spec.volumeStep, ZERO), quantity)) {
    return {
      ok: false,
      full: false,
      reason: `Объём закрытия должен быть кратен шагу ${toTrimmedString(spec.volumeStep)}.`,
    };
  }

  return { ok: true, full: false };
}

/** Остаток позиции после всех выходов. */
export function remainingQuantity(initial: Decimal, exited: Decimal[]): Decimal {
  return exited.reduce(sub, initial);
}

/** Закрыта ли позиция полностью. */
export const isClosed = (remaining: Decimal) => !isPositive(remaining);

/** Не закрыто ли больше, чем было открыто (защита от гонки двух выходов). */
export const isOverClosed = (remaining: Decimal) => !gte(remaining, ZERO);
