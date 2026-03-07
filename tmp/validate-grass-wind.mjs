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
const smokeDir = path.resolve("output/web-game/grass-smoke");
const outputDir = path.resolve("output/web-game/grass-browser");

fs.mkdirSync(smokeDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const progressPath = path.join(outputDir, "progress.log");
const mark = (label) => {
  fs.appendFileSync(progressPath, `${label}\n`);
};
fs.writeFileSync(progressPath, "");

const browser = await chromium.connectOverCDP("http://127.0.0.1:55000");
const context = await browser.newContext({
  viewport: { width: 1440, height: 980 },
});
const page = await context.newPage();
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

const saveCanvasFrame = async (filePath) => {
  const clip = await page.evaluate(() => {
    let canvas = null;
    let bestArea = 0;
    for (const candidate of document.querySelectorAll("canvas")) {
      const area =
        (candidate.width || candidate.clientWidth || 0)
        * (candidate.height || candidate.clientHeight || 0);
      if (area > bestArea) {
        bestArea = area;
        canvas = candidate;
      }
    }

    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });

  if (!clip) {
    throw new Error(`Could not capture canvas frame for ${filePath}.`);
  }
  await page.screenshot({
    path: filePath,
    clip,
  });
};

const dragOrbit = async ({
  startX,
  startY,
  deltaX,
  deltaY,
  steps = 16,
}) => {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps });
  await page.mouse.up();
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
mark("loaded");

await page.click("#start-button");
await page.waitForTimeout(700);
mark("started");

const smokeState = await readState();
if (!smokeState) {
  throw new Error("Could not read smoke state.");
}

await saveCanvasFrame(path.join(smokeDir, "shot-0.png"));
fs.writeFileSync(
  path.join(smokeDir, "state-0.json"),
  JSON.stringify(smokeState, null, 2),
);
mark("smoke-saved");

await page.evaluate(() => {
  window.jumpPathToCityCenter?.();
});
await page.waitForTimeout(500);
mark("city-center-jumped");

await dragOrbit({
  startX: 920,
  startY: 560,
  deltaX: 320,
  deltaY: 96,
});
await page.waitForTimeout(260);
mark("orbit-dragged");

const cityState = await readState();
if (!cityState) {
  throw new Error("Could not read city-center grass state.");
}

await saveCanvasFrame(path.join(outputDir, "shot-city-center.png"));
fs.writeFileSync(
  path.join(outputDir, "state-city-center.json"),
  JSON.stringify(cityState, null, 2),
);
mark("city-state-saved");

await page.keyboard.down("KeyW");
await page.waitForTimeout(1400);
await page.keyboard.up("KeyW");
await page.waitForTimeout(260);
mark("drive-burst-complete");

const driveState = await readState();
if (!driveState) {
  throw new Error("Could not read driving grass state.");
}

await saveCanvasFrame(path.join(outputDir, "shot-driving-grass.png"));
fs.writeFileSync(
  path.join(outputDir, "state-driving-grass.json"),
  JSON.stringify(driveState, null, 2),
);
mark("drive-state-saved");

const grassState = driveState.world?.grass ?? cityState.world?.grass ?? null;
const summary = {
  weatherCondition: driveState.world?.weatherCondition ?? null,
  cityCenterDistanceMeters: cityState.world?.cityCenter?.distanceMeters ?? null,
  speedKmh: driveState.vehicle?.speedKmh ?? null,
  surface: driveState.vehicle?.surface ?? null,
  grass: grassState,
  errors,
};

fs.writeFileSync(
  path.join(outputDir, "summary.json"),
  JSON.stringify(summary, null, 2),
);
mark("summary-saved");

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await context.close();
mark("closed");
