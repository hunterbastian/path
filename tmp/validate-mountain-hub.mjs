import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/hunterbastian/.npm-global/lib/node_modules/playwright/index.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const outDir =
  process.argv[3] ?? "output/web-game/mountain-hub-browser";

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
});

const errors = [];
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  errors.push({ type: "console.error", text: msg.text() });
});
page.on("pageerror", (error) => {
  errors.push({ type: "pageerror", text: String(error) });
});

const writeJson = (fileName, data) => {
  fs.writeFileSync(
    path.join(outDir, fileName),
    JSON.stringify(data, null, 2),
  );
};

const readState = async () =>
  JSON.parse(
    await page.evaluate(() => window.render_game_to_text?.() ?? "{}"),
  );

const advance = async (milliseconds) => {
  await page.evaluate(async (ms) => {
    await window.advanceTime?.(ms);
  }, milliseconds);
};

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(
  () =>
    typeof window.render_game_to_text === "function" &&
    document.querySelector("#title-screen"),
);

await page.screenshot({
  path: path.join(outDir, "shot-title.png"),
  type: "png",
});
writeJson("state-title.json", await readState());

await page.evaluate(() => {
  window.jumpPathToCityCenter?.();
});
await page.waitForFunction(
  () => {
    const state = JSON.parse(window.render_game_to_text?.() ?? "{}");
    const title = document.querySelector("#title-screen");
    return (
      state.mode === "driving"
      && title?.getAttribute("aria-hidden") === "true"
    );
  },
);
await page.waitForTimeout(420);

const start = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-city-start.png"),
  type: "png",
});
writeJson("state-city-start.json", start);

await page.mouse.move(920, 540);
await page.mouse.down();
await page.mouse.move(820, 500, { steps: 18 });
await page.mouse.up();
await advance(320);
const sideView = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-city-side.png"),
  type: "png",
});
writeJson("state-city-side.json", sideView);

await page.keyboard.down("ArrowUp");
await advance(1400);
await page.keyboard.up("ArrowUp");
const driveToward = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-city-drive.png"),
  type: "png",
});
writeJson("state-city-drive.json", driveToward);

const summary = {
  cityCenterDistanceMeters: start.world.cityCenter.distanceMeters,
  landmarkDistanceMeters: start.world.landmark.distanceMeters,
  cityCenterPosition: start.world.cityCenter.position,
  weather: start.world.weatherCondition,
  sideViewYawDegrees: sideView.debug.camera.yawDegrees,
  errors,
};

writeJson("summary.json", summary);
if (errors.length > 0) {
  writeJson("errors.json", errors);
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
