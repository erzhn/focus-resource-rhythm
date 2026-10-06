import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { financialDayOf } from "@/domain/finance/day";
import { detectCategory, CATEGORY_BY_ID, type CategoryId } from "@/domain/finance/categories";
import {
  budgetStatus,
  computeBalance,
  effectiveDailyBudgetMinor,
  summarizeDay,
  summarizeMonth,
  type Transaction,
} from "@/domain/finance/stats";
import { confirmation, dailyReport } from "@/domain/finance/report";
import { learnCategories, suggestCategory } from "@/domain/finance/learn";

/**
 * Учёт личных расходов через бота.
 *
 * Код переехал сюда из обработчика вебхука без изменения поведения: вебхук
 * стал тонким, а эта логика — прежней. Свободный текст по-прежнему означает
 * трату, и торговые команды на неё не влияют.
 */

type Db = SupabaseClient;

/** Операции пользователя за нужный период. */
export async function loadTransactions(
  sb: Db,
  userId: string,
  limit = 1000,
): Promise<Transaction[]> {
  const { data } = await sb
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    kind: t.kind as Transaction["kind"],
    amountMinor: Number(t.amount_minor),
    currency: (t.currency as string) ?? "KGS",
    category: (t.category as CategoryId | null) ?? null,
    description: (t.description as string) ?? "",
    occurredAt: new Date(t.occurred_at as string),
    day: String(t.financial_day),
  }));
}

export async function loadSettings(sb: Db, userId: string) {
  const { data } = await sb
    .from("user_settings")
    .select("opening_balance_minor, daily_budget_minor, monthly_budget_minor, daily_money_limit, main_currency")
    .eq("user_id", userId)
    .maybeSingle();
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    currency: (data?.main_currency as string) ?? "KGS",
    openingBalanceMinor: num(data?.opening_balance_minor),
    // Тот же запасной лимит из онбординга, что и на сайте: иначе бот отвечал
    // «бюджет не задан» там, где экран «Деньги» показывал остаток.
    dailyBudgetMinor: effectiveDailyBudgetMinor(
      num(data?.daily_budget_minor),
      num(data?.daily_money_limit),
    ),
    monthlyBudgetMinor: num(data?.monthly_budget_minor),
  };
}

export async function record(
  sb: Db,
  userId: string,
  entries: { amountMinor: number; currency: string; description: string; kind: Transaction["kind"]; category: CategoryId | null }[],
): Promise<string> {
  const history = await loadTransactions(sb, userId);
  const settings = await loadSettings(sb, userId);

  // Подсказка по истории: встроенный словарь не знает про местные магазины.
  const learned = learnCategories(
    history
      .filter((t) => t.kind === "expense" && t.category)
      .map((t) => ({ description: t.description, category: t.category as CategoryId, occurredAt: t.occurredAt })),
  );

  const now = new Date();
  const day = financialDayOf(now);

  const rows = entries.map((e) => {
    const category =
      e.kind !== "expense"
        ? null
        : e.category ?? suggestCategory(e.description, learned) ?? detectCategory(e.description) ?? "other";
    return {
      user_id: userId,
      kind: e.kind,
      amount_minor: e.amountMinor,
      currency: e.currency,
      category,
      description: e.description,
      occurred_at: now.toISOString(),
      financial_day: day,
    };
  });

  const { error } = await sb.from("transactions").insert(rows);
  if (error) {
    console.error("telegram: запись операций не удалась", error);
    return "Не получилось сохранить. Попробуйте ещё раз.";
  }

  // Пересобираем сводку с учётом новых записей, не перезапрашивая базу.
  const added: Transaction[] = rows.map((r, i) => ({
    id: `new-${i}`,
    kind: r.kind,
    amountMinor: r.amount_minor,
    currency: r.currency,
    category: r.category as CategoryId | null,
    description: r.description,
    occurredAt: now,
    day,
  }));

  const all = [...history, ...added];
  const today = summarizeDay(all, day, settings.currency);

  return confirmation(
    added.map((a) => {
      const meta = a.category ? CATEGORY_BY_ID.get(a.category) : null;
      return {
        amountMinor: a.amountMinor,
        currency: a.currency,
        categoryLabel: meta?.label ?? null,
        emoji: meta?.emoji ?? null,
        kind: a.kind,
      };
    }),
    today.expensesMinor,
    settings.currency,
    budgetStatus(today.expensesMinor, settings.dailyBudgetMinor),
  );
}

export async function report(sb: Db, userId: string, scope: "day" | "month"): Promise<string> {
  const [all, settings] = await Promise.all([loadTransactions(sb, userId), loadSettings(sb, userId)]);
  const day = financialDayOf(new Date());
  const today = summarizeDay(all, day, settings.currency);
  const month = summarizeMonth(all, day, settings.currency);

  return dailyReport({
    day,
    today: scope === "day" ? today : month,
    month,
    currency: settings.currency,
    dayBudget: scope === "day" ? budgetStatus(today.expensesMinor, settings.dailyBudgetMinor) : null,
    balanceMinor: computeBalance(all, settings.openingBalanceMinor, settings.currency),
  });
}

export async function undoLast(sb: Db, userId: string): Promise<string> {
  const { data } = await sb
    .from("transactions")
    .select("id, description, amount_minor, currency")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return "Удалять нечего — записей нет.";

  const { error } = await sb.from("transactions").delete().eq("id", data.id);
  if (error) return "Не получилось удалить запись.";

  return `Удалил: ${data.description} — ${Number(data.amount_minor) / 100} ${data.currency}`;
}
