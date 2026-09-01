import { chromium } from "@playwright/test";
const b = await chromium.launch();
const PAGES = [["/", "today"], ["/plans", "plans"], ["/calendar", "calendar"], ["/goals", "goals"], ["/resources", "resources"], ["/reviews", "reviews"]];
for (const [theme, dark] of [["light", false], ["dark", true]]) {
  const ctx = await b.newContext({ colorScheme: dark ? "dark" : "light" });
  const p = await ctx.newPage();
  for (const w of [375, 1440]) {
    await p.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
    for (const [path, name] of PAGES) {
      await p.goto("http://localhost:3200" + path, { waitUntil: "networkidle" });
      await p.waitForTimeout(700);
      await p.screenshot({ path: `audit-screens/after-${name}-${w}-${theme}.png`, fullPage: w === 1440 });
    }
  }
  await ctx.close();
}
await b.close();
console.log("скриншоты «после» готовы");
