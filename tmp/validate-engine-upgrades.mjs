import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  path.resolve(
    process.env.HOME ?? "/Users/hunterbastian",
    ".codex/skills/develop-web-game/node_modules/playwright/package.json",
  ),
);
const { chromium } = require("playwright");

const url = process.argv[2] ?? "http://127.0.0.1:4175";
const outputDir = path.resolve("output/web-game/engine-upgrades-browser");

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
    errors.push({ type: "console.error", text: msg.text() });
  }
});

page.on("pageerror", (error) => {
  errors.push({ type: "pageerror", text: String(error) });
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(400);

await page.keyboard.press("Enter");
await page.waitForTimeout(150);
await page.keyboard.press("`");
await page.waitForTimeout(100);

await page.locator('input[data-debug-range="speed-scale"]').evaluate((input) => {
  input.value = "1.18";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.locator('input[data-debug-range="grip-scale"]').evaluate((input) => {
  input.value = "1.08";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.locator('input[data-debug-range="rain-scale"]').evaluate((input) => {
  input.value = "1.12";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

await page.getByRole("button", { name: "Water Crossing" }).click();
await page.waitForTimeout(100);

await page.keyboard.down("ArrowUp");
await page.keyboard.down("Space");
await page.evaluate(() => {
  window.advanceTime?.(1800);
});
await page.keyboard.up("Space");
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(100);

const tuning = await page.evaluate(() => window.getPathTuningDebug?.() ?? null);
const state = await page.evaluate(() => window.render_game_to_text?.() ?? null);

await page.screenshot({
  path: path.join(outputDir, "shot-debug-water.png"),
  fullPage: true,
});

if (state) {
  fs.writeFileSync(path.join(outputDir, "state-debug-water.json"), state);
}

if (tuning) {
  fs.writeFileSync(
    path.join(outputDir, "tuning-debug-water.json"),
    JSON.stringify(tuning, null, 2),
  );
}

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
