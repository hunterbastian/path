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
const outputDir = path.resolve("output/web-game/controls-browser");

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

const readState = async () => {
  return await page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);

await page.keyboard.press("Enter");
await page.waitForTimeout(180);

await page.keyboard.down("ArrowUp");
await page.keyboard.down("ArrowLeft");
for (let index = 0; index < 14; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
}
await page.keyboard.up("ArrowLeft");
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(120);

const leftTurnState = await readState();
if (!leftTurnState) {
  throw new Error("Control validation could not read left-turn state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-left-turn.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-left-turn.json"),
  JSON.stringify(leftTurnState, null, 2),
);

await page.evaluate(() => {
  window.jumpPathToFixture?.("spawn");
});
await page.waitForTimeout(140);

await page.keyboard.down("ArrowUp");
for (let index = 0; index < 16; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
}
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(80);

const preBrakeState = await readState();
if (!preBrakeState) {
  throw new Error("Control validation could not read pre-brake state.");
}

await page.keyboard.down("ArrowDown");
let brakeState = null;
for (let index = 0; index < 8; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
  const candidate = await readState();
  const forwardSpeed = Number(candidate?.vehicle?.forwardSpeedKmh ?? 0);
  const speed = Number(candidate?.vehicle?.speedKmh ?? 0);
  const preBrakeSpeed = Number(preBrakeState.vehicle?.speedKmh ?? 0);
  if (
    candidate &&
    forwardSpeed > 0 &&
    speed < preBrakeSpeed
  ) {
    brakeState = candidate;
    break;
  }
}
await page.keyboard.up("ArrowDown");
await page.waitForTimeout(100);

if (!brakeState) {
  brakeState = await readState();
}
if (!brakeState) {
  throw new Error("Control validation could not read brake state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-brake.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-pre-brake.json"),
  JSON.stringify(preBrakeState, null, 2),
);
fs.writeFileSync(
  path.join(outputDir, "state-brake.json"),
  JSON.stringify(brakeState, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
