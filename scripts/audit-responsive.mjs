import { chromium } from "@playwright/test";
const BASE = "http://localhost:3200";
const PAGES = ["/", "/plans", "/goals", "/calendar", "/resources", "/stats", "/reviews", "/notifications", "/settings", "/assistant", "/login", "/onboarding"];
const WIDTHS = [320, 375, 414, 768, 1024, 1440, 1920];

const b = await chromium.launch();
const p = await b.newPage();

console.log("=== 1. ГОРИЗОНТАЛЬНЫЙ СКРОЛЛ (prod build) ===");
const grid = {};
for (const path of PAGES) {
  const row = [];
  for (const w of WIDTHS) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    row.push(over > 1 ? `+${over}` : "ok");
  }
  grid[path] = row;
}
console.log("страница".padEnd(15) + WIDTHS.map(w => String(w).padStart(7)).join(""));
for (const [path, row] of Object.entries(grid)) {
  console.log(path.padEnd(15) + row.map(v => v.padStart(7)).join(""));
}

console.log("\n=== 2. ТАЧ-ТАРГЕТЫ < 44x44 (375px) ===");
await p.setViewportSize({ width: 375, height: 812 });
for (const path of PAGES) {
  await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  const small = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="tab"], [role="option"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 44 || r.height < 44) {
        out.push({ w: Math.round(r.width), h: Math.round(r.height),
          label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 28) });
      }
    }
    return out;
  });
  if (small.length) {
    console.log(`  ${path}: ${small.length} шт`);
    small.slice(0, 4).forEach(s => console.log(`      ${s.w}x${s.h}  "${s.label}"`));
  }
}

console.log("\n=== 3. ШРИФТ В ПОЛЯХ < 16px (iOS зумит) ===");
for (const path of PAGES) {
  await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  const small = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("input, textarea, select")) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.push({ fs, id: el.id || el.getAttribute("placeholder") || el.type || el.tagName });
    }
    return out;
  });
  if (small.length) console.log(`  ${path}: ${small.length} полей — ${[...new Set(small.map(s => s.fs + "px"))].join(", ")}`);
}
await b.close();
