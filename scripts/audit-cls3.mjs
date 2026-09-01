import { chromium } from "@playwright/test";
const b = await chromium.launch();
const run = async (label, opts, jsOff = false) => {
  const ctx = await b.newContext({ ...opts, javaScriptEnabled: !jsOff });
  const p = await ctx.newPage();
  if (!jsOff) await p.addInitScript(() => { window.__c = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__c += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  await p.goto("http://localhost:3200/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2200);
  const c = jsOff ? "n/a (JS выключен)" : (await p.evaluate(() => window.__c)).toFixed(3);
  console.log(`  ${label.padEnd(40)} CLS = ${c}`);
  await ctx.close();
};
await run("обычная загрузка", {});
await run("prefers-reduced-motion: reduce", { reducedMotion: "reduce" });
await run("JS выключен (чистый SSR)", {}, true);
await b.close();
