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
const outputDir = path.resolve("output/web-game/atmosphere-arrival-browser");

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

const readAudio = async () => {
  return await page.evaluate(() => {
    return window.getPathAudioDebug?.() ?? null;
  });
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);

await page.keyboard.press("Enter");
await page.waitForTimeout(180);

await page.evaluate(() => {
  window.jumpPathToFixture?.("outpost");
  window.advanceTime?.(280);
});
await page.waitForTimeout(120);

const outpostState = await readState();
const outpostAudio = await readAudio();
if (!outpostState || !outpostAudio) {
  throw new Error("Outpost validation could not read game or audio state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-outpost.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-outpost.json"),
  JSON.stringify(outpostState, null, 2),
);
fs.writeFileSync(
  path.join(outputDir, "audio-outpost.json"),
  JSON.stringify(outpostAudio, null, 2),
);

await page.evaluate(() => {
  window.jumpPathToFixture?.("objective");
});
await page.waitForTimeout(40);
await page.evaluate(() => {
  window.advanceTime?.(220);
});
await page.waitForTimeout(420);

const arrivalState = await readState();
const arrivalAudio = await readAudio();
if (!arrivalState || !arrivalAudio) {
  throw new Error("Arrival validation could not read game or audio state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-arrival.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-arrival.json"),
  JSON.stringify(arrivalState, null, 2),
);
fs.writeFileSync(
  path.join(outputDir, "audio-arrival.json"),
  JSON.stringify(arrivalAudio, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
