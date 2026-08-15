import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-конфигурация. Тесты в ./e2e гоняются против демо-режима (без Supabase/ключей),
 * поэтому не требуют реальной БД. Сценарии, требующие авторизации и внешних API,
 * помечены и запускаются отдельно с тестовым окружением.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
