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
const outputDir = path.resolve("output/web-game/slope-atmosphere-browser");

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
  await page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);
await page.waitForFunction(() => typeof window.render_game_to_text === "function");

await page.click("#start-button");
await page.waitForTimeout(220);

await page.evaluate(() => {
  window.jumpPathToFixture?.("slope");
});
await page.waitForTimeout(140);

const slopeStart = await readState();
if (!slopeStart) {
  throw new Error("Could not read initial slope state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-slope-start.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-slope-start.json"),
  JSON.stringify(slopeStart, null, 2),
);

await page.evaluate(() => {
  window.advanceTime?.(2200);
});
await page.waitForTimeout(180);

const slopeAfter = await readState();
if (!slopeAfter) {
  throw new Error("Could not read rolled slope state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-slope-after.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-slope-after.json"),
  JSON.stringify(slopeAfter, null, 2),
);

await page.evaluate(() => {
  window.advanceTime?.(91000);
  window.jumpPathToCityCenter?.();
});
await page.waitForTimeout(180);

const atmosphereState = await readState();
if (!atmosphereState) {
  throw new Error("Could not read atmosphere state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-atmosphere.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-atmosphere.json"),
  JSON.stringify(atmosphereState, null, 2),
);

const dx =
  (slopeAfter.vehicle?.position?.x ?? 0) - (slopeStart.vehicle?.position?.x ?? 0);
const dz =
  (slopeAfter.vehicle?.position?.z ?? 0) - (slopeStart.vehicle?.position?.z ?? 0);
const rolledDistanceMeters = Math.hypot(dx, dz);

const summary = {
  slope: {
    startSpeedKmh: slopeStart.vehicle?.speedKmh ?? null,
    endSpeedKmh: slopeAfter.vehicle?.speedKmh ?? null,
    startForwardSpeedKmh: slopeStart.vehicle?.forwardSpeedKmh ?? null,
    endForwardSpeedKmh: slopeAfter.vehicle?.forwardSpeedKmh ?? null,
    groundSlopeDegrees: slopeAfter.vehicle?.groundSlopeDegrees ?? null,
    rolledDistanceMeters: Number(rolledDistanceMeters.toFixed(2)),
  },
  atmosphere: {
    weather: atmosphereState.world?.weather ?? null,
    weatherCondition: atmosphereState.world?.weatherCondition ?? null,
    cityCenterDistanceMeters: atmosphereState.world?.cityCenter?.distanceMeters ?? null,
  },
  errors,
};

fs.writeFileSync(
  path.join(outputDir, "summary.json"),
  JSON.stringify(summary, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
