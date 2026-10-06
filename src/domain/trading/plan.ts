import type { Decimal } from "./decimal";
import { gt } from "./decimal";
import { initialRisk, checkStop } from "./trade-math";
import type { Maybe, TradeEntry } from "./types";
import { checkVolume, maxVolumeForRisk } from "./volume";

/**
 * Проверка плана сделки до входа.
 *
 * Важное разделение: эта проверка одобряет или не одобряет ПЛАН. Она не
 * запрещает вход — бот и сайт физически не могут помешать нажать кнопку у
 * брокера. Поэтому формулировки точные: «План проверен», а не «Сделка
 * разрешена».
 *
 * Факт уже совершённого входа записывается всегда, даже с нарушениями, —
 * через отдельный режим. Отказ в одобрении плана не должен приводить к тому,
 * что реальная сделка останется вне журнала.
 */

export interface PlanIssue {
  code:
    | "model_unsupported"
    | "stop_invalid"
    | "volume_invalid"
    | "fx_unknown"
    | "risk_over_limit"
    | "volume_over_limit";
  message: string;
  /** block — план не одобряется; warn — требуется осознанное подтверждение. */
  severity: "block" | "warn";
}

export interface PlanCheck {
  /** План готов к записи факта входа. */
  approved: boolean;
  issues: PlanIssue[];
  risk: ReturnType<typeof initialRisk>;
  /** Наибольший объём, укладывающийся в лимит риска. */
  maxVolume: Maybe<Decimal>;
}

export interface PlanLimits {
  /** Максимально допустимая сумма риска на сделку в валюте счёта. */
  riskBudgetAccount: Decimal | null;
}

export function checkPlan(entry: TradeEntry, limits: PlanLimits): PlanCheck {
  const issues: PlanIssue[] = [];

  if (entry.spec.model !== "linear") {
    issues.push({
      code: "model_unsupported",
      severity: "block",
      message: "Для этого инструмента не задана поддерживаемая модель расчёта.",
    });
  }

  const stop = checkStop(entry);
  if (!stop.ok) {
    issues.push({ code: "stop_invalid", severity: "block", message: stop.reason! });
  }

  const volume = checkVolume(entry.quantity, entry.spec);
  if (!volume.ok) {
    issues.push({ code: "volume_invalid", severity: "block", message: volume.reason! });
  }

  const risk = initialRisk(entry);

  if (!risk.riskAccount.known && entry.fxAtEntry === null) {
    issues.push({
      code: "fx_unknown",
      severity: "block",
      message: "Неизвестен курс валюты инструмента к валюте счёта — расчёт нельзя считать проверенным.",
    });
  }

  const maxVolume: Maybe<Decimal> =
    limits.riskBudgetAccount && risk.distance.known
      ? maxVolumeForRisk(
          limits.riskBudgetAccount,
          risk.distance.value,
          entry.spec,
          entry.fxAtEntry?.rate ?? null,
        )
      : { known: false, reason: "Лимит риска не задан." };

  if (limits.riskBudgetAccount && risk.riskAccount.known) {
    if (gt(risk.riskAccount.value, limits.riskBudgetAccount)) {
      issues.push({
        code: "risk_over_limit",
        severity: "warn",
        message: "Риск по этому плану больше вашего лимита на сделку.",
      });
    }
    if (!maxVolume.known) {
      issues.push({ code: "volume_over_limit", severity: "block", message: maxVolume.reason });
    }
  }

  return {
    approved: issues.every((i) => i.severity !== "block"),
    issues,
    risk,
    maxVolume,
  };
}
