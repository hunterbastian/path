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
const outputDir = path.resolve("output/web-game/persistent-camera-browser");

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
await advance(220);
await page.waitForTimeout(120);

const canvas = await page.locator("canvas").first().boundingBox();
if (!canvas) {
  throw new Error("Could not find canvas bounds for persistent-camera validation.");
}

const startX = canvas.x + canvas.width * 0.68;
const startY = canvas.y + canvas.height * 0.58;

await page.mouse.move(startX, startY);
await page.mouse.down();

const dragPath = [
  { x: startX - 62, y: startY - 16 },
  { x: startX - 126, y: startY - 30 },
  { x: startX - 188, y: startY - 38 },
  { x: startX - 246, y: startY - 44 },
];

for (const point of dragPath) {
  await page.mouse.move(point.x, point.y, { steps: 5 });
  await advance(70);
}

const draggingState = await readState();
if (!draggingState || draggingState.mode !== "driving") {
  throw new Error("Could not capture camera dragging state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-dragging.png"),
  fullPage: true,
});
saveState("dragging", draggingState);

await page.mouse.up();
await advance(220);
await page.waitForTimeout(80);

const releasedState = await readState();
if (!releasedState) {
  throw new Error("Could not capture released camera state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-release.png"),
  fullPage: true,
});
saveState("release", releasedState);

await advance(4200);
await page.waitForTimeout(80);

const heldState = await readState();
if (!heldState) {
  throw new Error("Could not capture held camera state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-held.png"),
  fullPage: true,
});
saveState("held", heldState);

await page.mouse.dblclick(startX, startY);
await advance(620);
await page.waitForTimeout(80);

const recenteredState = await readState();
if (!recenteredState) {
  throw new Error("Could not capture recentered camera state.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-recentered.png"),
  fullPage: true,
});
saveState("recentered", recenteredState);

const releasedYaw = releasedState.debug?.camera?.yawDegrees ?? 0;
const heldYaw = heldState.debug?.camera?.yawDegrees ?? 0;
const recenteredYaw = recenteredState.debug?.camera?.yawDegrees ?? 0;

fs.writeFileSync(
  path.join(outputDir, "summary.json"),
  JSON.stringify({
    releasedYawDegrees: releasedYaw,
    heldYawDegrees: heldYaw,
    recenteredYawDegrees: recenteredYaw,
    releasedPitchDegrees: releasedState.debug?.camera?.pitchDegrees ?? 0,
    heldPitchDegrees: heldState.debug?.camera?.pitchDegrees ?? 0,
    recenteredPitchDegrees: recenteredState.debug?.camera?.pitchDegrees ?? 0,
    yawDriftAfterHoldDegrees: Number(Math.abs(heldYaw - releasedYaw).toFixed(2)),
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
