/**
 * Чистая раскладка событий дня по дорожкам (колонкам) для таймлайна.
 * Пересекающиеся во времени события собираются в кластер и делят ширину.
 */

export interface DayItem {
  id: string;
  start: Date;
  end: Date;
}

export interface PositionedBlock<T extends DayItem> {
  item: T;
  /** Минуты от начала суток до старта. */
  startMinute: number;
  /** Длительность в минутах (не меньше 15 для читаемости). */
  durationMinute: number;
  /** Индекс дорожки внутри кластера (0-based). */
  lane: number;
  /** Сколько всего дорожек в кластере (ширина = 1 / lanes). */
  lanes: number;
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function layoutDay<T extends DayItem>(items: T[]): PositionedBlock<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  );

  const result: PositionedBlock<T>[] = [];
  let cluster: PositionedBlock<T>[] = [];
  let clusterEnd = -Infinity;
  // Концы дорожек текущего кластера (время окончания последнего события дорожки).
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const block of cluster) block.lanes = lanes;
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    const start = item.start.getTime();
    const startMinute = minutesOfDay(item.start);
    const durationMinute = Math.max(15, (item.end.getTime() - item.start.getTime()) / 60000);

    // Новый кластер, если событие начинается после конца текущего.
    if (start >= clusterEnd && cluster.length > 0) flush();

    // Первая свободная дорожка (та, что уже освободилась к моменту старта).
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end.getTime());
    } else {
      laneEnds[lane] = item.end.getTime();
    }

    cluster.push({ item, startMinute, durationMinute, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end.getTime());
  }
  if (cluster.length > 0) flush();

  return result;
}
