import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR || "/tmp";
const BASE = "http://localhost:5173";
const SEV = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
const ALERT = "payments-api is throwing connection pool errors, pool appears exhausted, service degraded";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const step = (n, msg) => console.log(`STEP ${n}: ${msg}`);

// 1 — dashboard, 17 incident nodes
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("svg circle", { timeout: 30000 });
await page.waitForTimeout(2500);
const incCount = await page.evaluate((SEV) => {
  return [...document.querySelectorAll("svg circle")].filter((c) =>
    SEV.includes((c.getAttribute("fill") || "").toLowerCase())
  ).length;
}, SEV);
step(1, `dashboard graph incident nodes = ${incCount} (expect 17)`);

// 2 — read one insight
await page.waitForFunction(
  () => document.body.innerText.includes("Insight") && !document.body.innerText.includes("Analyzing graph"),
  { timeout: 45000 }
).catch(() => {});
const hasInsight = await page.evaluate(() => /Insight/.test(document.body.innerText));
step(2, `proactive insight visible = ${hasInsight}`);
const lastAnalyzed = await page.evaluate(() => {
  const m = document.body.innerText.match(/Graph last analyzed[^\n]*/);
  return m ? m[0] : "(none)";
});
step(2, `last-analyzed cue = "${lastAnalyzed}"`);
await page.screenshot({ path: `${OUT}/e2e_1_dashboard.png` });

// 3 — New Alert + paste text
await page.click("text=New Alert");
await page.waitForTimeout(500);
await page.fill("textarea", ALERT);
step(3, "pasted alert text");

// 4 — Analyze
await page.click("button:has-text('Analyze')");
await page.waitForSelector("text=Match confidence", { timeout: 45000 });
step(4, "analyze returned, confidence shown");

// 5 — historical context shows the three payments-api incidents
const ctx = await page.evaluate(() => document.body.innerText);
const three = ["INC-2024-1014", "INC-2025-0203", "INC-2025-0819"].filter((x) => ctx.includes(x));
step(5, `payments-api incidents shown = ${JSON.stringify(three)} (expect all 3)`);
await page.screenshot({ path: `${OUT}/e2e_2_alert.png` });

// 6 — Approve Fix
await page.click("button:has-text('Approve Fix')");
await page.waitForSelector("text=Memory reinforced", { timeout: 60000 });
step(6, "memify panel shown (Memory reinforced)");
await page.screenshot({ path: `${OUT}/e2e_3_memify.png` });

// 7 — auto-navigate to dashboard + highlight
await page.waitForFunction(
  () => location.pathname === "/" && /memory reinforced/i.test(document.body.innerText),
  { timeout: 12000 }
).catch(() => {});
await page.waitForTimeout(1500);
const highlighted = await page.evaluate(() => {
  const halos = document.querySelectorAll(".graph-halo").length;
  const cue = /memory reinforced/i.test(document.body.innerText);
  return { halos, cue };
});
step(7, `back on dashboard, highlight halos = ${highlighted.halos}, cue = ${highlighted.cue}`);
await page.screenshot({ path: `${OUT}/e2e_4_dashboard_highlight.png` });

// 8 — click a payments-api node → detail
const clicked = await page.evaluate(() => {
  // click an incident circle (severity-colored) to open detail
  const SEV = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  const c = [...document.querySelectorAll("svg circle")].find((el) =>
    SEV.includes((el.getAttribute("fill") || "").toLowerCase())
  );
  if (!c) return false;
  c.dispatchEvent(new MouseEvent("click", { bubbles: true, view: window }));
  return true;
});
await page.waitForTimeout(1500);
const onDetail = await page.evaluate(() => /Overview|Error Log|Slack Thread/.test(document.body.innerText) && /INC-/.test(location.pathname));
step(8, `node click opened incident detail = ${onDetail} (clicked=${clicked}, path=${await page.evaluate(()=>location.pathname)})`);
await page.screenshot({ path: `${OUT}/e2e_5_detail.png`, fullPage: true });

console.log("CONSOLE_ERRORS " + JSON.stringify(errors.slice(0, 10)));
await browser.close();
