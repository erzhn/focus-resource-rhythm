import type { DataProvider } from "./provider";
import { createSeedState } from "@/lib/demo/seed";
import type { DemoState } from "@/lib/demo/types";

/**
 * Демо-провайдер: снимок из seed, мутации никуда не персистятся (только локальный кэш стора).
 * Используется, когда Supabase не настроен. Явно помечается в интерфейсе.
 */
export class DemoDataProvider implements DataProvider {
  readonly mode = "demo" as const;

  async loadSnapshot(now: Date): Promise<DemoState> {
    return createSeedState(now);
  }

  async saveOnboarding(): Promise<void> {}
  async createTask(): Promise<void> {}
  async updateTask(): Promise<void> {}
  async setResultZone(): Promise<void> {}
  async addDependency(): Promise<void> {}
  async removeDependency(): Promise<void> {}
  async upsertCheckin(): Promise<void> {}
  async confirmDayPlan(): Promise<void> {}
  async addPostponement(): Promise<void> {}
  async saveEveningReview(): Promise<void> {}
  async saveWeeklyReview(): Promise<void> {}
}
