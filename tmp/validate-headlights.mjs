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
const outputDir = path.resolve("output/web-game/headlights-browser");

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

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350);
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
await page.click("#start-button");
await advance(260);
await page.waitForTimeout(100);

await page.evaluate(() => {
  window.jumpPathToTraffic?.();
});
await advance(320);
await page.waitForTimeout(120);

const canvas = await page.locator("canvas").first().boundingBox();
if (!canvas) {
  throw new Error("Could not find canvas bounds for headlight validation.");
}

const startX = canvas.x + canvas.width * 0.66;
const startY = canvas.y + canvas.height * 0.56;
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(startX - 210, startY - 36, { steps: 10 });
await advance(180);
await page.mouse.up();
await advance(240);
await page.waitForTimeout(80);

const state = await readState();
if (!state) {
  throw new Error("Could not read headlight validation state.");
}

fs.writeFileSync(
  path.join(outputDir, "state-headlights.json"),
  JSON.stringify(state, null, 2),
);

const summary = {
  weather: state.world?.weather ?? null,
  headlightsOn: state.vehicle?.headlightsOn ?? null,
  ambientTrafficCount: state.world?.ambientTrafficCount ?? null,
  ambientTrafficHeadlights: state.world?.ambientTrafficHeadlights ?? null,
  cameraYawDegrees: state.debug?.camera?.yawDegrees ?? null,
  trafficLeadDistanceMeters: state.world?.trafficInteraction?.nearestDistanceMeters ?? null,
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
