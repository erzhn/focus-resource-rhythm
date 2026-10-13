import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { backup, exportFileName, toCsv, type CsvColumn } from "@/domain/trading/export";
import { DIRECTION_LABELS, ENTRY_MODE_LABELS } from "@/domain/trading/format";
import type { TradeRow } from "@/lib/trading/mappers";

/**
 * Выгрузка журнала.
 *
 * Доступ тот же, что у экранов: клиент создаётся на сессии пользователя, и
 * строки отбирает RLS. Service-role здесь не используется намеренно — иначе
 * выгрузка стала бы каналом, обходящим изоляцию, которую соблюдает весь
 * остальной модуль.
 *
 * Денежные поля идут из представлений строками и такими же попадают в файл:
 * числа, прошедшие через JS, потеряли бы знаки.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Модуль работает только с базой." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get("account");
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const kind = req.nextUrl.searchParams.get("kind") ?? "trades";
  if (!accountId) return NextResponse.json({ error: "Не указан счёт." }, { status: 400 });

  const { data: account } = await supabase
    .from("trading_accounts_v")
    .select("id, title, currency, timezone")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Счёт не найден." }, { status: 404 });

  if (kind === "cash") return await cashFlows(supabase, account);
  if (format === "json") return await jsonBackup(supabase, account);
  return await tradesCsv(supabase, account);
}

type Db = Awaited<ReturnType<typeof createClient>>;
interface Account {
  id: string;
  title: string;
  currency: string;
  timezone: string;
}

async function tradesCsv(sb: Db, account: Account) {
  const { data } = await sb
    .from("trading_trades_v")
    .select("*")
    .eq("account_id", account.id)
    .neq("status", "voided")
    .order("opened_at", { ascending: false })
    .limit(MAX_ROWS);

  const trades = (data ?? []) as TradeRow[];
  // Пустой список превратился бы в «in.()» — синтаксическую ошибку PostgREST.
  const { data: exitRows } = trades.length
    ? await sb
        .from("trade_exits_v")
        .select("*")
        .eq("account_id", account.id)
        .order("exited_at")
    : { data: [] };

  const exitsByTrade = new Map<string, { quantity: string; price: string; exited_at: string }[]>();
  for (const e of (exitRows ?? []) as { trade_id: string; quantity: string; price: string; exited_at: string }[]) {
    const list = exitsByTrade.get(e.trade_id) ?? [];
    list.push(e);
    exitsByTrade.set(e.trade_id, list);
  }

  const columns: CsvColumn<TradeRow>[] = [
    { header: "Дата (локальная)", value: (t) => t.local_date },
    { header: "Открыта", value: (t) => t.opened_at },
    { header: "Закрыта", value: (t) => t.closed_at },
    { header: "Рынок", value: (t) => t.market_title },
    { header: "Инструмент", value: (t) => t.instrument_code },
    { header: "Тип продукта", value: (t) => t.product_type },
    { header: "Направление", value: (t) => DIRECTION_LABELS[t.direction] },
    { header: "Статус", value: (t) => (t.status === "closed" ? "закрыта" : "открыта") },
    { header: "Как записана", value: (t) => ENTRY_MODE_LABELS[t.entry_mode] },
    { header: "Источник", value: (t) => t.source },
    { header: "Объём", value: (t) => t.quantity },
    { header: "Единица объёма", value: (t) => t.spec_volume_unit },
    { header: "Остаток", value: (t) => t.remaining_quantity },
    { header: "Вход", value: (t) => t.entry_price },
    { header: "Исходный стоп", value: (t) => t.initial_stop },
    { header: "Текущий стоп", value: (t) => t.current_stop },
    { header: "Цель", value: (t) => t.target },
    { header: "Средний выход", value: (t) => t.avg_exit_price },
    { header: "Множитель", value: (t) => t.spec_contract_multiplier },
    { header: "Версия спецификации", value: (t) => (t.spec_version ? String(t.spec_version) : null) },
    { header: "Валюта инструмента", value: (t) => t.spec_quote_currency },
    { header: "Курс на входе", value: (t) => t.fx_at_entry },
    { header: "Баланс перед входом", value: (t) => t.balance_at_entry },
    { header: "Риск, валюта счёта", value: (t) => t.initial_risk_account },
    { header: "Риск, % от баланса", value: (t) => t.risk_pct },
    { header: "Плановое R/R", value: (t) => t.planned_rr },
    { header: "Валовой результат", value: (t) => t.gross_realized_account },
    { header: "Расходы", value: (t) => t.adjustments_account },
    { header: "Чистый результат", value: (t) => t.net_realized_account },
    { header: "Итоговый R", value: (t) => t.final_r },
    { header: "Почему неизвестно", value: (t) => t.unknown_reason },
    { header: "Валюта счёта", value: () => account.currency },
    { header: "Выходов", value: (t) => String((exitsByTrade.get(t.id) ?? []).length) },
    {
      header: "Выходы (объём@цена)",
      value: (t) =>
        (exitsByTrade.get(t.id) ?? []).map((e) => `${e.quantity}@${e.price}`).join(" | ") || null,
    },
    { header: "Эмоция до", value: (t) => t.emotion_before },
    { header: "Эмоция после", value: (t) => t.emotion_after },
    { header: "Причина выхода", value: (t) => t.exit_reason },
    { header: "Урок", value: (t) => t.lesson },
    { header: "Заметка", value: (t) => t.notes },
  ];

  return file(toCsv(trades, columns), exportFileName(`trades-${slug(account.title)}`, "csv"), "text/csv");
}

async function cashFlows(sb: Db, account: Account) {
  const { data } = await sb
    .from("trading_cash_flows")
    .select("kind, amount, occurred_at, note")
    .eq("account_id", account.id)
    .order("occurred_at", { ascending: false })
    .limit(MAX_ROWS);

  const rows = (data ?? []) as { kind: string; amount: unknown; occurred_at: string; note: string | null }[];

  const csv = toCsv(rows, [
    { header: "Дата", value: (r) => r.occurred_at },
    { header: "Тип", value: (r) => (r.kind === "deposit" ? "пополнение" : "вывод") },
    { header: "Сумма", value: (r) => String(r.amount) },
    { header: "Валюта", value: () => account.currency },
    { header: "Примечание", value: (r) => r.note },
  ]);

  return file(csv, exportFileName(`cash-${slug(account.title)}`, "csv"), "text/csv");
}

async function jsonBackup(sb: Db, account: Account) {
  const [trades, exits, adjustments, flows, journal, evaluations] = await Promise.all([
    sb.from("trading_trades_v").select("*").eq("account_id", account.id).limit(MAX_ROWS),
    sb.from("trade_exits_v").select("*").limit(MAX_ROWS),
    sb.from("trade_cash_adjustments").select("*").limit(MAX_ROWS),
    sb.from("trading_cash_flows").select("*").eq("account_id", account.id).limit(MAX_ROWS),
    sb.from("trading_journal_days").select("*").eq("account_id", account.id).limit(MAX_ROWS),
    sb.from("trade_rule_evaluations").select("*").limit(MAX_ROWS),
  ]);

  const tradeIds = new Set(((trades.data ?? []) as TradeRow[]).map((t) => t.id));
  const own = <T extends { trade_id?: string }>(rows: T[] | null) =>
    (rows ?? []).filter((r) => !r.trade_id || tradeIds.has(r.trade_id));

  const envelope = backup(account, {
    trades: trades.data ?? [],
    exits: own(exits.data as { trade_id?: string }[] | null),
    adjustments: own(adjustments.data as { trade_id?: string }[] | null),
    cashFlows: flows.data ?? [],
    journal: journal.data ?? [],
    ruleEvaluations: own(evaluations.data as { trade_id?: string }[] | null),
  });

  return file(
    JSON.stringify(envelope, null, 2),
    exportFileName(`backup-${slug(account.title)}`, "json"),
    "application/json",
  );
}

function file(body: string, name: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${name}"`,
      // Приватные данные не должны оседать в кэшах по дороге.
      "Cache-Control": "private, no-store",
    },
  });
}

/** Безопасное имя файла: кириллица и пробелы в заголовке ломают загрузку. */
const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "account";
