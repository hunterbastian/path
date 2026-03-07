import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/hunterbastian/.npm-global/lib/node_modules/playwright/index.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const outDir =
  process.argv[3] ?? "output/web-game/weather-traffic-browser";

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

await page.keyboard.press("Enter");
await page.waitForFunction(
  () => JSON.parse(window.render_game_to_text?.() ?? "{}").mode === "driving",
);

const captureWeather = async (name) => {
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

const cloudy = await captureWeather("cloudy");
await advance(90000);
const rainy = await captureWeather("rainy");
await advance(90000);
const sunny = await captureWeather("sunny");

const weatherSummary = {
  sequence: [
    cloudy.state.world.weatherCondition,
    rainy.state.world.weatherCondition,
    sunny.state.world.weatherCondition,
  ],
  gripMultipliers: [
    cloudy.state.world.weatherGripMultiplier,
    rainy.state.world.weatherGripMultiplier,
    sunny.state.world.weatherGripMultiplier,
  ],
  visibilityScale: [
    cloudy.state.world.visibilityScale,
    rainy.state.world.visibilityScale,
    sunny.state.world.visibilityScale,
  ],
  waterLevelOffsetMeters: [
    cloudy.state.world.waterLevelOffsetMeters,
    rainy.state.world.waterLevelOffsetMeters,
    sunny.state.world.waterLevelOffsetMeters,
  ],
  averageTrafficSpeedKmh: [
    Math.round(
      cloudy.state.world.ambientTraffic.reduce((sum, agent) => sum + agent.speedKmh, 0)
        / cloudy.state.world.ambientTraffic.length,
    ),
    Math.round(
      rainy.state.world.ambientTraffic.reduce((sum, agent) => sum + agent.speedKmh, 0)
        / rainy.state.world.ambientTraffic.length,
    ),
    Math.round(
      sunny.state.world.ambientTraffic.reduce((sum, agent) => sum + agent.speedKmh, 0)
        / sunny.state.world.ambientTraffic.length,
    ),
  ],
};
writeJson("weather-summary.json", weatherSummary);

await page.evaluate(() => {
  window.jumpPathToTraffic?.();
});
await advance(200);
const trafficStart = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-traffic-start.png"),
  type: "png",
});
writeJson("state-traffic-start.json", trafficStart);

await page.keyboard.down("ArrowUp");
await advance(1800);
await page.keyboard.up("ArrowUp");
const trafficContact = await readState();
const trafficDriveLabel =
  (await page.locator("#status-drive").textContent())?.trim() ?? null;
await page.screenshot({
  path: path.join(outDir, "shot-traffic-contact.png"),
  type: "png",
});
writeJson("state-traffic-contact.json", {
  driveLabel: trafficDriveLabel,
  state: trafficContact,
});

await advance(1400);
const trafficRecovery = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-traffic-recovery.png"),
  type: "png",
});
writeJson("state-traffic-recovery.json", trafficRecovery);

const summary = {
  weather: weatherSummary,
  traffic: {
    start: trafficStart.world.trafficInteraction,
    contact: trafficContact.world.trafficInteraction,
    recovery: trafficRecovery.world.trafficInteraction,
    driveLabel: trafficDriveLabel,
    contactBehaviors: trafficContact.world.ambientTraffic.map((agent) => ({
      id: agent.id,
      behavior: agent.behavior,
      speedKmh: agent.speedKmh,
    })),
  },
  errors,
};

writeJson("summary.json", summary);

if (errors.length > 0) {
  writeJson("errors.json", errors);
}

await browser.close();

console.log(JSON.stringify(summary, null, 2));
