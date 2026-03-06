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
const outputDir = path.resolve("output/web-game/drag-camera-browser");

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

const readState = async () =>
  page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });

const advance = async (milliseconds) => {
  await page.evaluate((ms) => {
    window.advanceTime?.(ms);
  }, milliseconds);
};

const saveState = (name, state) => {
  fs.writeFileSync(
    path.join(outputDir, `state-${name}.json`),
    JSON.stringify(state, null, 2),
  );
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350);
await page.keyboard.press("Enter");
await advance(220);
await page.waitForTimeout(120);

const canvas = await page.locator("canvas").first().boundingBox();
if (!canvas) {
  throw new Error("Could not find canvas bounds for drag-camera validation.");
}

const startX = canvas.x + canvas.width * 0.68;
const startY = canvas.y + canvas.height * 0.58;

await page.mouse.move(startX, startY);
await page.mouse.down();

const dragPath = [
  { x: startX - 60, y: startY - 14 },
  { x: startX - 118, y: startY - 26 },
  { x: startX - 176, y: startY - 34 },
  { x: startX - 228, y: startY - 40 },
];

for (const point of dragPath) {
  await page.mouse.move(point.x, point.y, { steps: 5 });
  await advance(70);
}

const draggingState = await readState();
if (!draggingState || draggingState.mode !== "driving") {
  throw new Error("Drag-camera validation could not capture a driving drag state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-dragging.png"),
  fullPage: true,
});
saveState("dragging", draggingState);

await page.mouse.up();
await advance(180);
await page.waitForTimeout(60);

const releaseState = await readState();
if (!releaseState) {
  throw new Error("Drag-camera validation could not capture the release state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-release.png"),
  fullPage: true,
});
saveState("release", releaseState);

await advance(520);
await page.waitForTimeout(60);

const settleState = await readState();
if (!settleState) {
  throw new Error("Drag-camera validation could not capture the settle state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-settle.png"),
  fullPage: true,
});
saveState("settle", settleState);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
