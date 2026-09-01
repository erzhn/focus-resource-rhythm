import { chromium, firefox, webkit } from "@playwright/test";
const BASE = "http://localhost:3200";
const PAGES = ["/", "/calendar", "/reviews", "/login"];
const engines = { chromium, firefox, webkit };

for (const [name, engine] of Object.entries(engines)) {
  const b = await engine.launch();
  const p = await b.newPage();
  const errors = [];
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 90)); });
  p.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 90)));
  console.log(`\n=== ${name.toUpperCase()} ===`);
  for (const w of [375, 1440]) {
    await p.setViewportSize({ width: w, height: 812 });
    for (const path of PAGES) {
      await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) console.log(`  ❌ ${path} @${w}: переполнение +${over}px`);
    }
  }
  // iOS-специфика: 100vh, sticky, date-инпуты
  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const quirks = await p.evaluate(() => {
    const vh = [...document.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return (s.height || "").includes("vh") || (s.minHeight || "").includes("vh");
    }).length;
    const sticky = [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).position === "sticky").length;
    return { vh, sticky, dvhSupport: CSS.supports("height", "100dvh") };
  });
  console.log(`  100vh-элементов: ${quirks.vh} | sticky: ${quirks.sticky} | поддержка dvh: ${quirks.dvhSupport}`);
  console.log(`  ошибок консоли: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  await b.close();
}
