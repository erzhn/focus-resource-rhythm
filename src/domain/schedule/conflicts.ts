/** Временной блок в расписании (задача с точным временем или фиксированное событие). */
export interface TimeBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  /** Фиксированный блок (событие/встреча) — система не двигает его сама. */
  fixed: boolean;
}

export interface Conflict {
  a: TimeBlock;
  b: TimeBlock;
  /** Минуты пересечения. */
  overlapMinutes: number;
}

/** Пересекаются ли два блока во времени. */
export function overlaps(a: TimeBlock, b: TimeBlock): boolean {
  return a.start < b.end && b.start < a.end;
}

function overlapMinutes(a: TimeBlock, b: TimeBlock): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return Math.max(0, Math.round((end - start) / 60000));
}

/** Находит все пары пересекающихся блоков (детерминированный порядок). */
export function findConflicts(blocks: readonly TimeBlock[]): Conflict[] {
  const sorted = [...blocks].sort((x, y) => x.start.getTime() - y.start.getTime());
  const conflicts: Conflict[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start >= sorted[i].end) break; // дальше пересечений с i нет
      if (overlaps(sorted[i], sorted[j])) {
        conflicts.push({ a: sorted[i], b: sorted[j], overlapMinutes: overlapMinutes(sorted[i], sorted[j]) });
      }
    }
  }
  return conflicts;
}
