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
const outputDir = path.resolve("output/web-game/audio-layer-browser");

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

const readAudio = async () =>
  await page.evaluate(() => {
    return window.getPathAudioDebug?.() ?? null;
  });

const readTitleAudioLabel = async () =>
  await page.locator("#title-audio").textContent();

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350);

const titleAudioLabel = await readTitleAudioLabel();
await page.screenshot({
  path: path.join(outputDir, "shot-title-audio.png"),
  fullPage: true,
});

await page.click("#start-button");
await page.waitForTimeout(220);
await page.evaluate(() => {
  window.advanceTime?.(420);
});
await page.waitForTimeout(220);

const drivingState = await readState();
const drivingAudio = await readAudio();

if (!drivingState || !drivingAudio) {
  throw new Error("Audio validator could not read game state or audio debug.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-driving-audio.png"),
  fullPage: true,
});

fs.writeFileSync(
  path.join(outputDir, "state-driving.json"),
  JSON.stringify(drivingState, null, 2),
);
fs.writeFileSync(
  path.join(outputDir, "audio-driving.json"),
  JSON.stringify(drivingAudio, null, 2),
);
fs.writeFileSync(
  path.join(outputDir, "summary.json"),
  JSON.stringify({
    titleAudioLabel,
    mode: drivingState.mode,
    weather: drivingState.world?.weather ?? null,
    speedKmh: drivingState.vehicle?.speedKmh ?? null,
    audio: {
      contextState: drivingAudio.contextState,
      unlocked: drivingAudio.unlocked,
      active: drivingAudio.active,
      masterGain: drivingAudio.masterGain,
      engineGain: drivingAudio.engineGain,
      idleGain: drivingAudio.idleGain,
      windGain: drivingAudio.windGain,
      rainGain: drivingAudio.rainGain,
      relayGain: drivingAudio.relayGain,
    },
    errors,
  }, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
