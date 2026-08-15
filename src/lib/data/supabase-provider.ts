import { format, startOfWeek } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FocusZone } from "@/domain/focus";
import { createClient } from "@/lib/supabase/client";
import { createEmptyState } from "@/lib/demo/seed";
import type {
  DemoLifeArea,
  DemoPostponement,
  DemoResult,
  DemoState,
  DemoTask,
  ResultDecision,
} from "@/lib/demo/types";
import type { Scale1to5, SchedulingMode, TaskStatus } from "@/domain/types";
import type { DataProvider } from "./provider";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
type Row = Record<string, unknown>;

/**
 * Реальный источник данных на Supabase (RLS). Читает снимок и персистит мутации
 * через браузерный клиент от имени аутентифицированного пользователя.
 *
 * Примечание: активируется при заданных ключах Supabase. Проверка на живой БД —
 * этап P1.2 (в текущей среде нет Docker/ключей). Часть связей (goal/project у
 * задачи при создании) уточняется на этапе P1.2.
 */
export class SupabaseDataProvider implements DataProvider {
  readonly mode = "supabase" as const;
  private client: SupabaseClient;

  constructor() {
    this.client = createClient();
  }

  private async userId(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("Не авторизован");
    return data.user.id;
  }

  async loadSnapshot(now: Date): Promise<DemoState> {
    const state = createEmptyState();
    const sb = this.client;

    const [areas, goals, projects, tasks, deps, events, settings, checkin, plan, postp, review, weekly] =
      await Promise.all([
        sb.from("life_areas").select("*").is("archived_at", null),
        sb.from("goals").select("*").is("archived_at", null),
        sb.from("projects").select("*").is("archived_at", null),
        sb.from("tasks").select("*").is("archived_at", null).order("created_at", { ascending: false }),
        sb.from("task_dependencies").select("task_id, depends_on_task_id"),
        sb.from("personal_events").select("*"),
        sb.from("user_settings").select("*").maybeSingle(),
        sb.from("daily_checkins").select("*").eq("checkin_date", iso(now)).maybeSingle(),
        sb.from("daily_plans").select("*").eq("plan_date", iso(now)).maybeSingle(),
        sb.from("postponements").select("*").order("created_at", { ascending: false }),
        sb.from("daily_reviews").select("*").eq("review_date", iso(now)).maybeSingle(),
        sb.from("weekly_reviews").select("*").order("week_start", { ascending: false }).limit(1).maybeSingle(),
      ]);

    state.lifeAreas = (areas.data ?? []).map(
      (a: Row): DemoLifeArea => ({ id: String(a.id), name: String(a.name), color: String(a.color ?? "#888") }),
    );

    const toResult = (r: Row, kind: "goal" | "project"): DemoResult => ({
      id: String(r.id),
      title: String(r.title),
      kind,
      lifeAreaId: (r.life_area_id as string) ?? null,
      zone: (r.zone as FocusZone) ?? "later",
      horizonDays: (r.horizon_days as number) ?? null,
      progress: 0,
    });
    state.results = [
      ...(goals.data ?? []).map((g: Row) => toResult(g, "goal")),
      ...(projects.data ?? []).map((p: Row) => toResult(p, "project")),
    ];

    const dependsOn = new Map<string, string[]>();
    const unblocks = new Map<string, string[]>();
    (deps.data ?? []).forEach((d: Row) => {
      const t = String(d.task_id);
      const on = String(d.depends_on_task_id);
      dependsOn.set(t, [...(dependsOn.get(t) ?? []), on]);
      unblocks.set(on, [...(unblocks.get(on) ?? []), t]);
    });
    const activeResultIds = new Set(state.results.filter((r) => r.zone === "now").map((r) => r.id));

    state.tasks = (tasks.data ?? []).map((t: Row): DemoTask => {
      const resultId = (t.project_id as string) ?? (t.goal_id as string) ?? null;
      return {
        id: String(t.id),
        title: String(t.title),
        status: (t.status as TaskStatus) ?? "inbox",
        dueDate: t.due_date ? new Date(String(t.due_date)) : null,
        importance: (t.importance as Scale1to5) ?? 3,
        consequence: (t.consequence as Scale1to5) ?? 3,
        goalLink: (t.goal_link as Scale1to5) ?? 3,
        energyRequired: (t.energy_required as Scale1to5) ?? 3,
        plannedMinutes: (t.planned_minutes as number) ?? 30,
        plannedMoneyMinor: Math.round(Number(t.planned_money ?? 0) * 100),
        schedulingMode: (t.scheduling_mode as SchedulingMode) ?? "unordered",
        isRecurringToday: Boolean(t.is_recurring),
        unblocks: unblocks.get(String(t.id)) ?? [],
        dependsOn: dependsOn.get(String(t.id)) ?? [],
        linkedToActiveResult: resultId ? activeResultIds.has(resultId) : false,
        description: (t.description as string) ?? null,
        resultId,
        manualPriority: (t.manual_priority as number) ?? null,
        manualPriorityNote: (t.manual_priority_note as string) ?? null,
      };
    });

    // Прогресс результата = доля выполненных из связанных задач.
    state.results = state.results.map((r) => {
      const linked = state.tasks.filter((t) => t.resultId === r.id);
      const done = linked.filter((t) => t.status === "done").length;
      return { ...r, progress: linked.length ? done / linked.length : 0 };
    });

    state.events = (events.data ?? []).map((e: Row) => ({
      id: String(e.id),
      title: String(e.title),
      start: new Date(String(e.starts_at)),
      end: new Date(String(e.ends_at)),
      fixed: Boolean(e.fixed),
      blocksAvailability: Boolean(e.blocks_availability),
    }));

    if (settings.data) {
      state.reserveRatio = Number((settings.data as Row).time_reserve_ratio ?? 0.25);
      const limit = (settings.data as Row).daily_money_limit;
      state.dailyMoneyLimitMajor = limit == null ? null : Number(limit);
    }
    if (checkin.data) {
      const c = checkin.data as Row;
      state.morningEnergy = (c.morning_energy as number) ?? state.morningEnergy;
      state.eveningEnergy = (c.evening_energy as number) ?? null;
      if (c.available_minutes != null) state.availableMinutes = Number(c.available_minutes);
    }
    state.dayPlanConfirmed = (plan.data as Row | null)?.status === "confirmed";
    state.postponements = (postp.data ?? []).map((p: Row): DemoPostponement => ({
      id: String(p.id),
      taskId: String(p.task_id),
      taskTitle: "",
      toDate: new Date(String(p.to_date)),
      reason: String(p.reason),
      at: new Date(String(p.created_at)),
    }));
    state.eveningConclusion = ((review.data as Row | null)?.conclusion as string) ?? null;
    if (weekly.data) {
      const w = weekly.data as Row;
      state.nextWeekResults = (w.next_week_results as string[]) ?? [];
      state.weeklyDecisions =
        (w.decisions as { resultId: string; decision: ResultDecision; reason: string }[]) ?? [];
    }

    return state;
  }

  async createTask(task: DemoTask): Promise<void> {
    const user_id = await this.userId();
    const { error } = await this.client.from("tasks").insert({
      id: task.id,
      user_id,
      title: task.title,
      status: task.status,
      due_date: task.dueDate ? iso(task.dueDate) : null,
      importance: task.importance,
      consequence: task.consequence,
      goal_link: task.goalLink,
      energy_required: task.energyRequired,
      planned_minutes: task.plannedMinutes,
      planned_money: task.plannedMoneyMinor / 100,
      scheduling_mode: task.schedulingMode,
      description: task.description,
    });
    if (error) throw error;
  }

  async updateTask(id: string, patch: Partial<DemoTask>): Promise<void> {
    const columns: Row = {};
    if (patch.title !== undefined) columns.title = patch.title;
    if (patch.status !== undefined) columns.status = patch.status;
    if (patch.dueDate !== undefined) columns.due_date = patch.dueDate ? iso(patch.dueDate) : null;
    if (patch.importance !== undefined) columns.importance = patch.importance;
    if (patch.consequence !== undefined) columns.consequence = patch.consequence;
    if (patch.goalLink !== undefined) columns.goal_link = patch.goalLink;
    if (patch.energyRequired !== undefined) columns.energy_required = patch.energyRequired;
    if (patch.plannedMinutes !== undefined) columns.planned_minutes = patch.plannedMinutes;
    if (patch.plannedMoneyMinor !== undefined) columns.planned_money = patch.plannedMoneyMinor / 100;
    if (patch.schedulingMode !== undefined) columns.scheduling_mode = patch.schedulingMode;
    if (patch.description !== undefined) columns.description = patch.description;
    if (patch.manualPriority !== undefined) columns.manual_priority = patch.manualPriority;
    if (patch.manualPriorityNote !== undefined) columns.manual_priority_note = patch.manualPriorityNote;
    if (Object.keys(columns).length === 0) return;
    const { error } = await this.client.from("tasks").update(columns).eq("id", id);
    if (error) throw error;
  }

  async setResultZone(resultId: string, zone: FocusZone): Promise<void> {
    // id может принадлежать goals или projects — обновляем обе таблицы (одна из них no-op).
    await this.client.from("goals").update({ zone }).eq("id", resultId);
    await this.client.from("projects").update({ zone }).eq("id", resultId);
  }

  async upsertCheckin(
    date: Date,
    patch: { morningEnergy?: number; eveningEnergy?: number; availableMinutes?: number },
  ): Promise<void> {
    const user_id = await this.userId();
    const row: Row = { user_id, checkin_date: iso(date) };
    if (patch.morningEnergy !== undefined) row.morning_energy = patch.morningEnergy;
    if (patch.eveningEnergy !== undefined) row.evening_energy = patch.eveningEnergy;
    if (patch.availableMinutes !== undefined) row.available_minutes = patch.availableMinutes;
    const { error } = await this.client
      .from("daily_checkins")
      .upsert(row, { onConflict: "user_id,checkin_date" });
    if (error) throw error;
  }

  async confirmDayPlan(date: Date): Promise<void> {
    const user_id = await this.userId();
    const { error } = await this.client.from("daily_plans").upsert(
      { user_id, plan_date: iso(date), status: "confirmed", confirmed_at: new Date().toISOString() },
      { onConflict: "user_id,plan_date" },
    );
    if (error) throw error;
  }

  async addPostponement(p: DemoPostponement): Promise<void> {
    const user_id = await this.userId();
    const { error } = await this.client
      .from("postponements")
      .insert({ user_id, task_id: p.taskId, to_date: iso(p.toDate), reason: p.reason });
    if (error) throw error;
  }

  async saveEveningReview(date: Date, conclusion: string): Promise<void> {
    const user_id = await this.userId();
    const { error } = await this.client.from("daily_reviews").upsert(
      { user_id, review_date: iso(date), conclusion },
      { onConflict: "user_id,review_date" },
    );
    if (error) throw error;
  }

  async saveWeeklyReview(
    weekStart: Date,
    nextWeekResults: string[],
    decisions: { resultId: string; decision: ResultDecision; reason: string }[],
  ): Promise<void> {
    const user_id = await this.userId();
    const week_start = iso(startOfWeek(weekStart, { weekStartsOn: 1 }));
    const { error } = await this.client.from("weekly_reviews").upsert(
      { user_id, week_start, next_week_results: nextWeekResults, decisions },
      { onConflict: "user_id,week_start" },
    );
    if (error) throw error;
  }
}
