import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/hunterbastian/.npm-global/lib/node_modules/playwright/index.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4175";
const outDir = process.argv[3] ?? "output/web-game/debris-traffic-browser";

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

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => typeof window.render_game_to_text === "function",
);

await page.evaluate(() => {
  window.startPathGame?.();
  window.forcePathWeather?.("rainy");
});
await advance(320);

await page.evaluate(() => {
  window.jumpPathToFixture?.("slope");
});
await advance(2400);
const slopeState = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-slope-debris.png"),
  type: "png",
});
writeJson("state-slope-debris.json", slopeState);

await page.evaluate(() => {
  window.jumpPathToTraffic?.();
});
await advance(120);

await page.keyboard.down("ArrowUp");
let trafficState = await readState();
for (let attempt = 0; attempt < 6; attempt += 1) {
  if (trafficState.world?.trafficInteraction?.collision) break;
  await advance(360);
  trafficState = await readState();
}
await page.keyboard.up("ArrowUp");
await page.screenshot({
  path: path.join(outDir, "shot-traffic-impact.png"),
  type: "png",
});
writeJson("state-traffic-impact.json", trafficState);

const summary = {
  slopeDebris: {
    surface: slopeState.vehicle?.surface ?? null,
    speedKmh: slopeState.vehicle?.speedKmh ?? null,
    debrisParticles: slopeState.world?.surfaceFx?.debrisParticles ?? null,
    skitteringDebrisStrength:
      slopeState.world?.surfaceFx?.skitteringDebrisStrength ?? null,
  },
  trafficImpact: {
    collision: trafficState.world?.trafficInteraction?.collision ?? null,
    sourceId: trafficState.world?.trafficInteraction?.sourceId ?? null,
    debrisParticles: trafficState.world?.surfaceFx?.debrisParticles ?? null,
    trafficImpactDebris:
      trafficState.world?.surfaceFx?.trafficImpactDebris ?? null,
    driveLabel: trafficState.world?.trafficInteraction?.collision
      ? "Traffic Impact"
      : null,
  },
  errors,
};

writeJson("summary.json", summary);

if (errors.length > 0) {
  writeJson("errors.json", errors);
}

await browser.close();

console.log(JSON.stringify(summary, null, 2));
