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
const outputDir = path.resolve("output/web-game/camera-browser");

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

const saveSnapshot = async (name, state) => {
  await page.screenshot({
    path: path.join(outputDir, `shot-${name}.png`),
    fullPage: true,
  });
  fs.writeFileSync(
    path.join(outputDir, `state-${name}.json`),
    JSON.stringify(state, null, 2),
  );
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350);

await page.keyboard.press("Enter");
await advance(200);
await page.waitForTimeout(120);

await page.keyboard.down("ArrowUp");
await page.keyboard.down("ArrowLeft");
for (let index = 0; index < 18; index += 1) {
  await advance(120);
}
await page.keyboard.up("ArrowLeft");
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(100);

const turningState = await readState();
if (!turningState || turningState.mode !== "driving") {
  throw new Error("Camera validation could not capture a turning driving state.");
}
await saveSnapshot("turning", turningState);

await page.evaluate(() => {
  window.jumpPathToFixture?.("drop");
});
await page.waitForTimeout(120);

let airborneState = null;
let impactState = null;

await page.keyboard.down("ArrowUp");
for (let index = 0; index < 28; index += 1) {
  await advance(120);
  const state = await readState();
  if (!state) continue;
  if (!airborneState && (state.vehicle?.airborneTimeSeconds ?? 0) > 0.08) {
    airborneState = state;
    await saveSnapshot("airborne", state);
  }
  if (!impactState && (state.debug?.camera?.impact ?? 0) > 0.12) {
    impactState = state;
    await saveSnapshot("impact", state);
  }
  if (airborneState && impactState) break;
}
await page.keyboard.up("ArrowUp");

if (!airborneState) {
  airborneState = await readState();
  if (!airborneState) {
    throw new Error("Camera validation could not capture an airborne state.");
  }
  await saveSnapshot("airborne", airborneState);
}

if (!impactState) {
  for (let index = 0; index < 10; index += 1) {
    await advance(120);
    const state = await readState();
    if (!state) continue;
    if ((state.debug?.camera?.impact ?? 0) > 0.12) {
      impactState = state;
      break;
    }
  }
  impactState ??= await readState();
  if (!impactState) {
    throw new Error("Camera validation could not capture a landing impact state.");
  }
  await saveSnapshot("impact", impactState);
}

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
