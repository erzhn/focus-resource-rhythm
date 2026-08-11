import type { CalendarProvider, ProviderName } from "./provider";
import { googleProvider } from "./google";
import { microsoftProvider } from "./microsoft";

export * from "./provider";

/** Возвращает адаптер по имени провайдера (единая точка выбора). */
export function getProvider(name: ProviderName): CalendarProvider {
  return name === "google" ? googleProvider : microsoftProvider;
}
