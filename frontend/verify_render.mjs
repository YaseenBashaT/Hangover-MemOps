import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR || "/tmp";
const BASE = "http://localhost:5173";
const SEV = ["#ef4444", "#f97316", "#eab308", "#22c55e"];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// ---- Dashboard + graph ----
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector("svg circle", { timeout: 30000 });
} catch {
  console.log("NO_CIRCLES_RENDERED");
}
await page.waitForTimeout(3000); // let the force sim settle
const counts = await page.evaluate((SEV) => {
  const circles = [...document.querySelectorAll("svg circle")];
  const inc = circles.filter((c) =>
    SEV.includes((c.getAttribute("fill") || "").toLowerCase())
  );
  const labels = [...document.querySelectorAll("svg text")].map((t) => t.textContent);
  return { total: circles.length, incident: inc.length, sampleLabels: labels.slice(0, 6) };
}, SEV);
console.log("DASHBOARD_CIRCLES " + JSON.stringify(counts));
// give the (LLM-backed) insights panel a chance to populate before the shot
await page
  .waitForFunction(
    () => {
      const t = document.body.innerText;
      return t.includes("Insight") && !t.includes("Analyzing graph");
    },
    { timeout: 40000 }
  )
  .catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/dashboard.png` });

// ---- Incident detail (direct route via SPA fallback) ----
await page.goto(`${BASE}/incidents/INC-2024-1014`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const detailOk = await page.evaluate(() =>
  document.body.innerText.includes("INC-2024-1014")
);
console.log("DETAIL_LOADED " + detailOk);
await page.screenshot({ path: `${OUT}/detail.png`, fullPage: true });

// ---- New Alert — run a real analysis ----
await page.goto(`${BASE}/alert`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.click("text=Use sample");
await page.click("text=Analyze");
try {
  await page.waitForSelector("text=Match confidence", { timeout: 45000 });
  console.log("ALERT_ANALYZED true");
} catch {
  console.log("ALERT_ANALYZED false");
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/alert.png`, fullPage: true });

// ---- Incident detail — trigger the memify moment ----
await page.goto(`${BASE}/incidents/INC-2024-1014`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.click("text=Approve Fix");
try {
  await page.waitForSelector("text=Memory reinforced", { timeout: 60000 });
  console.log("MEMIFY_SHOWN true");
} catch {
  console.log("MEMIFY_SHOWN false");
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/memify.png`, fullPage: true });

console.log("CONSOLE_ERRORS " + JSON.stringify(errors.slice(0, 12)));
await browser.close();
