import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DomainTask, Scale1to5, SchedulingMode, TaskStatus } from "@/domain/types";

/**
 * Серверный доступ к задачам через Supabase с соблюдением RLS.
 * Это «реальный» путь хранения; активируется при наличии ключей Supabase.
 * Демо-режим использует отдельный in-memory стор (src/lib/demo).
 */

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  importance: number;
  consequence: number;
  goal_link: number;
  energy_required: number;
  planned_minutes: number;
  planned_money: string | number;
  scheduling_mode: SchedulingMode;
  is_recurring: boolean;
}

function rowToDomain(row: TaskRow, deps: { unblocks: string[]; dependsOn: string[] }): DomainTask {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date ? new Date(row.due_date) : null,
    importance: row.importance as Scale1to5,
    consequence: row.consequence as Scale1to5,
    goalLink: row.goal_link as Scale1to5,
    energyRequired: row.energy_required as Scale1to5,
    plannedMinutes: row.planned_minutes,
    // numeric приходит строкой — переводим в минорные единицы (тыйын).
    plannedMoneyMinor: Math.round(Number(row.planned_money) * 100),
    schedulingMode: row.scheduling_mode,
    isRecurringToday: row.is_recurring,
    unblocks: deps.unblocks,
    dependsOn: deps.dependsOn,
    linkedToActiveResult: false,
  };
}

export async function listTasks(): Promise<DomainTask[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("tasks")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Не удалось загрузить задачи: ${error.message}`);

  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("task_id, depends_on_task_id");

  const dependsOn = new Map<string, string[]>();
  const unblocks = new Map<string, string[]>();
  (deps ?? []).forEach((d) => {
    dependsOn.set(d.task_id, [...(dependsOn.get(d.task_id) ?? []), d.depends_on_task_id]);
    unblocks.set(d.depends_on_task_id, [...(unblocks.get(d.depends_on_task_id) ?? []), d.task_id]);
  });

  return (rows ?? []).map((r) =>
    rowToDomain(r as TaskRow, {
      dependsOn: dependsOn.get(r.id) ?? [],
      unblocks: unblocks.get(r.id) ?? [],
    }),
  );
}

export interface CreateTaskInput {
  title: string;
  importance?: number;
  consequence?: number;
  goalLink?: number;
  energyRequired?: number;
  plannedMinutes?: number;
  plannedMoneyMajor?: number;
  dueDate?: string | null;
  schedulingMode?: SchedulingMode;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: input.title,
      status: "inbox",
      importance: input.importance ?? 3,
      consequence: input.consequence ?? 3,
      goal_link: input.goalLink ?? 3,
      energy_required: input.energyRequired ?? 3,
      planned_minutes: input.plannedMinutes ?? 30,
      planned_money: input.plannedMoneyMajor ?? 0,
      due_date: input.dueDate ?? null,
      scheduling_mode: input.schedulingMode ?? "unordered",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Не удалось создать задачу: ${error.message}`);
  return data.id;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw new Error(`Не удалось обновить задачу: ${error.message}`);
}
