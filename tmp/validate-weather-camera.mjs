import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/hunterbastian/.npm-global/lib/node_modules/playwright/index.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const outDir =
  process.argv[3] ?? "output/web-game/weather-camera-browser";

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

const titleWeather = (await page.locator("#title-weather").textContent())?.trim();
const titleState = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-title.png"),
  type: "png",
});
writeJson("state-title.json", {
  titleWeather,
  state: titleState,
});

await page.keyboard.press("Enter");
await page.waitForFunction(
  () => JSON.parse(window.render_game_to_text?.() ?? "{}").mode === "driving",
);

const captureWeatherState = async (name) => {
  const hudWeather = (await page.locator("#status-weather").textContent())?.trim();
  const state = await readState();
  await page.screenshot({
    path: path.join(outDir, `shot-${name}.png`),
    type: "png",
  });
  writeJson(`state-${name}.json`, {
    hudWeather,
    state,
  });
  return { hudWeather, state };
};

const cloudy = await captureWeatherState("cloudy");
await advance(90000);
const rainy = await captureWeatherState("rainy");
await advance(90000);
const sunny = await captureWeatherState("sunny");
await advance(90000);
const cloudyLoop = await captureWeatherState("cloudy-loop");

const driveCanvas = page.locator(".game-stage canvas");
const box = await driveCanvas.boundingBox();
if (!box) {
  throw new Error("Unable to locate the game canvas for camera validation.");
}

const startX = box.x + box.width * 0.58;
const startY = box.y + box.height * 0.54;
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(startX + 320, startY - 12, { steps: 20 });
await page.mouse.up();
await advance(100);
const dragged = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-camera-dragged.png"),
  type: "png",
});
writeJson("state-camera-dragged.json", dragged);

await advance(2000);
const held = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-camera-held.png"),
  type: "png",
});
writeJson("state-camera-held.json", held);

await advance(2500);
const returned = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-camera-returning.png"),
  type: "png",
});
writeJson("state-camera-returning.json", returned);

const summary = {
  weatherSequence: [
    cloudy.state.world.weatherCondition,
    rainy.state.world.weatherCondition,
    sunny.state.world.weatherCondition,
    cloudyLoop.state.world.weatherCondition,
  ],
  weatherHudLabels: [
    cloudy.hudWeather,
    rainy.hudWeather,
    sunny.hudWeather,
    cloudyLoop.hudWeather,
  ],
  camera: {
    dragged: dragged.debug.camera,
    held: held.debug.camera,
    returned: returned.debug.camera,
  },
  errors,
};

writeJson("summary.json", summary);

if (errors.length > 0) {
  writeJson("errors.json", errors);
}

await browser.close();

console.log(JSON.stringify(summary, null, 2));
