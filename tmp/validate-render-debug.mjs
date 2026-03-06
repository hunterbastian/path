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

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const outputDir = path.resolve("output/web-game/render-debug-browser");

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
await page.waitForTimeout(450);

await page.keyboard.press("Enter");
await page.waitForTimeout(180);
await page.keyboard.press("`");
await page.waitForTimeout(120);

await page.getByRole("button", { name: "Water Crossing" }).click();
await page.waitForTimeout(120);
await page.getByRole("button", { name: "Water Depth" }).click();
await page.waitForTimeout(160);

const waterRenderDebug = await page.evaluate(
  () => window.getPathRenderDebug?.() ?? null,
);
const waterState = await page.evaluate(() => window.render_game_to_text?.() ?? null);

await page.screenshot({
  path: path.join(outputDir, "shot-water-depth.png"),
  fullPage: true,
});

if (waterRenderDebug) {
  fs.writeFileSync(
    path.join(outputDir, "render-water-depth.json"),
    JSON.stringify(waterRenderDebug, null, 2),
  );
}

if (waterState) {
  fs.writeFileSync(path.join(outputDir, "state-water-depth.json"), waterState);
}

await page.getByRole("button", { name: "Fog Factor" }).click();
await page.waitForTimeout(160);

const fogRenderDebug = await page.evaluate(
  () => window.getPathRenderDebug?.() ?? null,
);
const fogState = await page.evaluate(() => window.render_game_to_text?.() ?? null);

await page.screenshot({
  path: path.join(outputDir, "shot-fog-factor.png"),
  fullPage: true,
});

if (fogRenderDebug) {
  fs.writeFileSync(
    path.join(outputDir, "render-fog-factor.json"),
    JSON.stringify(fogRenderDebug, null, 2),
  );
}

if (fogState) {
  fs.writeFileSync(path.join(outputDir, "state-fog-factor.json"), fogState);
}

await page.getByRole("button", { name: "Final Grade" }).click();
await page.waitForTimeout(160);

const finalRenderDebug = await page.evaluate(
  () => window.getPathRenderDebug?.() ?? null,
);
const finalState = await page.evaluate(() => window.render_game_to_text?.() ?? null);

await page.screenshot({
  path: path.join(outputDir, "shot-final-grade.png"),
  fullPage: true,
});

if (finalRenderDebug) {
  fs.writeFileSync(
    path.join(outputDir, "render-final-grade.json"),
    JSON.stringify(finalRenderDebug, null, 2),
  );
}

if (finalState) {
  fs.writeFileSync(path.join(outputDir, "state-final-grade.json"), finalState);
}

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
