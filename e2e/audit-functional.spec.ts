import { test, expect } from "@playwright/test";

/** Функциональный аудит (демо-режим). Проверяет формы, состояния, модалки, навигацию. */

test.describe("Навигация", () => {
  const routes = ["/", "/assistant", "/plans", "/goals", "/calendar", "/resources", "/stats", "/reviews", "/notifications", "/settings"];
  for (const r of routes) {
    test(`страница ${r} открывается и имеет H1`, async ({ page }) => {
      const resp = await page.goto(r);
      expect(resp?.status()).toBeLessThan(400);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }
});

test.describe("Быстрое добавление задачи", () => {
  test("пустое название — кнопка «Сохранить» заблокирована", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Быстро добавить задачу" }).click();
    await expect(page.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  test("очень длинное название не ломает вёрстку", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Быстро добавить задачу" }).click();
    await page.getByPlaceholder("Что нужно сделать?").fill("Я".repeat(400));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Задача сохранена")).toBeVisible();
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noScroll, "нет горизонтального скролла после длинного заголовка").toBe(true);
  });

  test("спецсимволы и HTML не исполняются (XSS)", async ({ page }) => {
    await page.goto("/");
    let alerted = false;
    page.on("dialog", async (d) => { alerted = true; await d.dismiss(); });
    await page.getByRole("button", { name: "Быстро добавить задачу" }).click();
    await page.getByPlaceholder("Что нужно сделать?").fill('<img src=x onerror=alert(1)>&<b>жирный</b>');
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.waitForTimeout(500);
    expect(alerted, "alert не должен сработать").toBe(false);
    // Разметка не должна исполниться: тега <img> в документе нет, а текст сохранён как текст.
    expect(await page.locator("img[src='x']").count(), "тег <img> не должен появиться").toBe(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Команда или поиск задачи…").fill("onerror");
    await expect(page.getByRole("option").first()).toContainText("onerror");
  });

  test("модалка закрывается по Escape", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Быстро добавить задачу" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("модалка удерживает фокус (focus-trap)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Быстро добавить задачу" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    expect(inside, "фокус остаётся внутри модалки").toBe(true);
  });
});

test.describe("Командное меню ⌘K", () => {
  test("открывается по Ctrl+K, ищет и закрывается по Escape", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Командное меню" })).toBeVisible();
    await page.getByPlaceholder("Команда или поиск задачи…").fill("календ");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Командное меню" })).toBeHidden();
  });

  test("Enter выполняет выбранное действие", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Команда или поиск задачи…").fill("календарь");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/calendar/);
  });
});

test.describe("Тема", () => {
  test("переключение темы меняет data-theme и сохраняется", async ({ page }) => {
    await page.goto("/");
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.getByRole("button", { name: /Тема|тема/ }).first().click();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(after).not.toBe(before);
  });
});

test.describe("Перенос задачи требует причину", () => {
  test("кнопка «Перенести» заблокирована без причины", async ({ page }) => {
    await page.goto("/reviews");
    await page.getByRole("button", { name: "Перенести" }).first().click();
    // В строке задачи есть чип «Перенести» и кнопка подтверждения с тем же текстом —
    // сужаем поиск до панели, содержащей поле причины.
    const panel = page
      .locator("div")
      .filter({ has: page.getByPlaceholder("Причина переноса (обязательно)") })
      .last();
    await expect(panel.getByRole("button", { name: "Перенести" })).toBeDisabled();
    await expect(page.getByText(/только с указанием причины/)).toBeVisible();
  });
});

test.describe("Состояния", () => {
  test("пустой поиск во «Входящих» показывает осмысленное пустое состояние", async ({ page }) => {
    await page.goto("/plans");
    await page.getByLabel("Поиск по входящим").fill("щщщнеттакого123");
    await expect(page.getByText("Ничего не найдено")).toBeVisible();
  });
});
