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

const url = process.argv[2] ?? "http://127.0.0.1:4176";
const outputDir = path.resolve("output/web-game/god-mode-browser");

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
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
await page.click("#start-button");
await advance(260);
await page.waitForTimeout(100);

const driveState = await readState();
if (!driveState || driveState.mode !== "driving") {
  throw new Error("Could not reach driving state before god-mode validation.");
}
saveState("drive", driveState);

await page.keyboard.press("Escape");
await advance(120);
await page.waitForTimeout(100);

const menuState = await readState();
if (!menuState?.pauseVisible) {
  throw new Error("Pause menu did not open for god-mode validation.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-menu.png"),
  fullPage: true,
});
saveState("menu", menuState);

await page.click("#pause-god-mode-button");
await advance(140);
await page.waitForTimeout(120);

const godEntryState = await readState();
if (!godEntryState || godEntryState.mode !== "god" || !godEntryState.godModeActive) {
  throw new Error("Could not enter god mode.");
}
saveState("god-entry", godEntryState);

const canvas = await page.locator("canvas").first().boundingBox();
if (!canvas) {
  throw new Error("Could not find canvas bounds for god-mode validation.");
}

const centerX = canvas.x + canvas.width * 0.6;
const centerY = canvas.y + canvas.height * 0.52;

await page.mouse.move(centerX, centerY);
await page.mouse.down();
await page.mouse.move(centerX - 140, centerY - 24, { steps: 8 });
await advance(200);
await page.mouse.up();
await page.keyboard.down("KeyW");
await page.keyboard.down("Space");
await advance(1200);
await page.waitForTimeout(80);
await page.keyboard.up("Space");
await page.keyboard.up("KeyW");

const godMovedState = await readState();
if (!godMovedState || godMovedState.mode !== "god") {
  throw new Error("Could not capture moved god-mode state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-god-mode.png"),
  fullPage: true,
});
saveState("god-moved", godMovedState);

await page.keyboard.press("Escape");
await advance(180);
await page.waitForTimeout(100);

const returnedState = await readState();
if (!returnedState || returnedState.mode !== "driving" || returnedState.godModeActive) {
  throw new Error("Could not return from god mode to driving.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-returned.png"),
  fullPage: true,
});
saveState("returned", returnedState);

const entryCamera = godEntryState.debug?.camera?.godPosition;
const movedCamera = godMovedState.debug?.camera?.godPosition;
const movedDistance =
  entryCamera && movedCamera
    ? Math.hypot(
        movedCamera.x - entryCamera.x,
        movedCamera.y - entryCamera.y,
        movedCamera.z - entryCamera.z,
      )
    : 0;

fs.writeFileSync(
  path.join(outputDir, "summary.json"),
  JSON.stringify(
    {
      menuVisible: Boolean(menuState?.pauseVisible),
      godModeEntered: Boolean(godEntryState?.godModeActive),
      godModeExited: !returnedState?.godModeActive && returnedState?.mode === "driving",
      driveElapsedSeconds: driveState?.run?.elapsedSeconds ?? null,
      godEntryElapsedSeconds: godEntryState?.run?.elapsedSeconds ?? null,
      godMovedElapsedSeconds: godMovedState?.run?.elapsedSeconds ?? null,
      elapsedPausedInGodModeSeconds:
        godMovedState?.run?.elapsedSeconds - godEntryState?.run?.elapsedSeconds,
      cameraModeDuringGod: godMovedState?.debug?.camera?.mode ?? null,
      cameraMovedMeters: Number(movedDistance.toFixed(2)),
      returnCameraMode: returnedState?.debug?.camera?.mode ?? null,
      returnYawDegrees: returnedState?.debug?.camera?.yawDegrees ?? null,
      errors,
    },
    null,
    2,
  ),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
