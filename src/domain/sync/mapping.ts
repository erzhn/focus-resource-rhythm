/**
 * Отображение локальной задачи во внешнее событие календаря и обратно.
 * Проект и приоритет размещаются в структурированном блоке описания (ТЗ §12.2).
 * Чистые тестируемые функции.
 */

export interface OutboundEvent {
  summary: string;
  start: Date;
  end: Date;
  description: string;
}

export interface TaskForExport {
  title: string;
  start: Date;
  end: Date;
  description?: string | null;
  projectTitle?: string | null;
  priority?: number | null;
}

const BLOCK_START = "[ФРР]";
const BLOCK_END = "[/ФРР]";

/** Формирует внешнее событие из подтверждённой задачи с точным временем. */
export function taskToExternalEvent(task: TaskForExport): OutboundEvent {
  const meta: string[] = [];
  if (task.projectTitle) meta.push(`Проект: ${task.projectTitle}`);
  if (task.priority != null) meta.push(`Приоритет: ${task.priority}`);

  const structured = `${BLOCK_START}\n${meta.join("\n")}\n${BLOCK_END}`;
  const description = [task.description?.trim(), structured].filter(Boolean).join("\n\n");

  return { summary: task.title, start: task.start, end: task.end, description };
}

export interface ParsedMeta {
  projectTitle: string | null;
  priority: number | null;
  userDescription: string;
}

/** Извлекает структурированный блок из описания внешнего события. */
export function parseExternalDescription(description: string | null | undefined): ParsedMeta {
  if (!description) return { projectTitle: null, priority: null, userDescription: "" };

  const blockRegex = new RegExp(
    `${escapeRegex(BLOCK_START)}([\\s\\S]*?)${escapeRegex(BLOCK_END)}`,
  );
  const match = description.match(blockRegex);
  const userDescription = description.replace(blockRegex, "").trim();

  if (!match) return { projectTitle: null, priority: null, userDescription };

  const block = match[1];
  const project = block.match(/Проект:\s*(.+)/)?.[1]?.trim() ?? null;
  const priorityRaw = block.match(/Приоритет:\s*(\d+)/)?.[1];
  const priority = priorityRaw ? Number(priorityRaw) : null;

  return { projectTitle: project, priority, userDescription };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
