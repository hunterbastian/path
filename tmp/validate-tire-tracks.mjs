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

const url = process.argv[2] ?? "http://127.0.0.1:4173";
const outputDir = path.resolve("output/web-game/tire-track-browser");

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
await page.waitForTimeout(120);

await page.keyboard.down("ArrowUp");
await page.evaluate(() => {
  window.advanceTime?.(1800);
});
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(100);

const stateAfterDrive = await page.evaluate(() => window.render_game_to_text?.() ?? null);
await page.screenshot({
  path: path.join(outputDir, "shot-tracks-visible.png"),
  fullPage: true,
});

await page.evaluate(() => {
  window.advanceTime?.(13000);
});
await page.waitForTimeout(80);

const stateAfterFade = await page.evaluate(() => window.render_game_to_text?.() ?? null);

if (stateAfterDrive) {
  fs.writeFileSync(path.join(outputDir, "state-after-drive.json"), stateAfterDrive);
}

if (stateAfterFade) {
  fs.writeFileSync(path.join(outputDir, "state-after-fade.json"), stateAfterFade);
}

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
