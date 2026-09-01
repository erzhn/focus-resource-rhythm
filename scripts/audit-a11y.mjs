import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const BASE = "http://localhost:3200";
const PAGES = ["/", "/plans", "/goals", "/calendar", "/resources", "/stats", "/reviews", "/notifications", "/settings", "/assistant", "/login", "/onboarding"];

const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
const all = new Map();

for (const path of PAGES) {
  await p.goto(BASE + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const line = r.violations.map(v => `${v.impact}:${v.id}(${v.nodes.length})`).join(" ") || "чисто";
  console.log(`  ${path.padEnd(16)} ${line}`);
  for (const v of r.violations) {
    if (!all.has(v.id)) all.set(v.id, { impact: v.impact, help: v.help, pages: [], sample: v.nodes[0]?.html?.slice(0, 110), fix: v.nodes[0]?.failureSummary?.split("\n")[1]?.trim()?.slice(0, 120) });
    all.get(v.id).pages.push(path);
  }
}

console.log("\n=== СВОДКА НАРУШЕНИЙ ===");
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [id, v] of [...all.entries()].sort((a, c) => order[a[1].impact] - order[c[1].impact])) {
  console.log(`\n[${v.impact}] ${id} — ${v.help}`);
  console.log(`   страниц: ${v.pages.length} (${v.pages.slice(0, 6).join(", ")})`);
  console.log(`   пример: ${v.sample}`);
  if (v.fix) console.log(`   axe: ${v.fix}`);
}
if (!all.size) console.log("нарушений не найдено");
await b.close();
