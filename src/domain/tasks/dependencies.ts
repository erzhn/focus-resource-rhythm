/**
 * Проверка зависимостей задач на циклы (клиентская, зеркалит серверный триггер).
 * Чистая тестируемая функция.
 */

export interface DependencyEdge {
  taskId: string;
  dependsOnId: string;
}

/**
 * Вернёт true, если добавление ребра «from зависит от to» создаст цикл
 * (то есть to уже прямо или транзитивно зависит от from).
 */
export function createsDependencyCycle(
  edges: readonly DependencyEdge[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  // Строим граф зависимостей: task -> [на кого опирается].
  const graph = new Map<string, string[]>();
  for (const e of edges) {
    graph.set(e.taskId, [...(graph.get(e.taskId) ?? []), e.dependsOnId]);
  }
  // Есть ли путь из `to` в `from` по существующим зависимостям?
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === from) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of graph.get(node) ?? []) stack.push(next);
  }
  return false;
}
