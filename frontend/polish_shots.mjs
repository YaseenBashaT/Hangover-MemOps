import { chromium } from "playwright";
const OUT = process.env.SHOT_DIR || "/tmp";
const BASE = "http://localhost:5173";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// dashboard
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("svg circle", { timeout: 30000 });
await page.waitForFunction(
  () => /INSIGHT/i.test(document.body.innerText) && !/Analyzing graph/i.test(document.body.innerText),
  { timeout: 45000 }
).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/p_dashboard.png` });

// new alert before
await page.click("text=New Alert");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/p_alert_before.png` });

// new alert after analysis
await page.click("text=Use sample");
await page.click("button:has-text('Analyze')");
await page.waitForSelector("text=Match confidence", { timeout: 45000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/p_alert_after.png` });

// incident detail
await page.goto(`${BASE}/incidents/INC-2024-1014`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/p_detail.png`, fullPage: true });

console.log("CONSOLE_ERRORS " + JSON.stringify(errors.slice(0, 10)));
await browser.close();
