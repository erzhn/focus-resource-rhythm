import { test, expect } from "@playwright/test";

/**
 * E2E-сценарии в демо-режиме (без БД). Покрывают ключевые пользовательские потоки
 * методики «Фокус — Ресурс — Ритм», которые работают без авторизации.
 */

test.describe("Демо-режим: основные сценарии", () => {
  test("экран «Сегодня» показывает главное дело и объяснение приоритета", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
    await expect(page.getByText("Главное дело")).toBeVisible();
    await expect(page.getByText("Высокий приоритет")).toBeVisible();
  });

  test("создание задачи вызывает вопрос о формулировке", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Быстро добавить задачу" }).click();
    await page.getByPlaceholder("Что нужно сделать?").fill("Тестовая задача E2E");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Нужно ли помочь правильнее сформулировать задачу?")).toBeVisible();
    // Запуск шаблонного помощника
    await page.getByRole("button", { name: /Да, помочь/ }).click();
    await expect(page.getByText("Улучшенная формулировка")).toBeVisible();
  });

  test("лимит трёх активных результатов защищает от четвёртого", async ({ page }) => {
    await page.goto("/plans");
    // Изначально в «Сейчас» 2 результата. Переносим третий из «Следом».
    const toNow = page.getByRole("button", { name: "→ Сейчас" });
    await toNow.first().click(); // теперь 3 активных
    // Следующая попытка добавить в «Сейчас» должна быть заблокирована.
    await page.getByRole("button", { name: "→ Сейчас" }).first().click();
    await expect(page.getByText(/уже 3 активных результата/)).toBeVisible();
  });

  test("редактор задачи открывается с редакторами повторений и зависимостей", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "изменить" }).first().click();
    await expect(page.getByText("Редактирование задачи")).toBeVisible();
    await expect(page.getByText("Повторяющаяся задача")).toBeVisible();
    await expect(page.getByText("Зависит от")).toBeVisible();
  });

  test("календарь: день показывает события и временные блоки", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "День", exact: true }).click();
    await expect(page.getByText("События")).toBeVisible();
    await expect(page.getByText("Временные блоки")).toBeVisible();
  });

  test("мобильная ширина: нет горизонтального скролла на «Сегодня»", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
  });
});
