import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/hunterbastian/.npm-global/lib/node_modules/playwright/index.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const outDir =
  process.argv[3] ?? "output/web-game/props-icons-paths-browser";

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
    typeof window.render_game_to_text === "function"
    && document.querySelector("#title-screen"),
);

await page.evaluate(() => {
  window.jumpPathToCityCenter?.();
});
await page.waitForFunction(
  () => {
    const state = JSON.parse(window.render_game_to_text?.() ?? "{}");
    const title = document.querySelector("#title-screen");
    return (
      state.mode === "driving"
      && state.titleVisible === false
      && title?.getAttribute("aria-hidden") === "true"
    );
  },
);
await page.waitForTimeout(420);

const cityRoad = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-city-road.png"),
  type: "png",
});
writeJson("state-city-road.json", cityRoad);

await page.keyboard.press("m");
await advance(120);
const mapOpen = await readState();
await page.locator("#map-device").screenshot({
  path: path.join(outDir, "shot-map-icons.png"),
  type: "png",
});
writeJson("state-map-icons.json", mapOpen);
await page.keyboard.press("m");
await advance(90);

await page.evaluate(() => {
  window.jumpPathToProps?.();
});
await page.waitForFunction(
  () => {
    const state = JSON.parse(window.render_game_to_text?.() ?? "{}");
    return state.mode === "driving" && state.titleVisible === false;
  },
);
await page.waitForTimeout(200);

const propBefore = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-props-before.png"),
  type: "png",
});
writeJson("state-props-before.json", propBefore);

await page.keyboard.down("ArrowUp");
await advance(900);
const propImpact = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-props-impact.png"),
  type: "png",
});
writeJson("state-props-impact.json", propImpact);
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(120);

const propAfter = await readState();
await page.screenshot({
  path: path.join(outDir, "shot-props-after.png"),
  type: "png",
});
writeJson("state-props-after.json", propAfter);

const summary = {
  weather: mapOpen.world.weatherCondition,
  roadPathsCount: cityRoad.world.roadPathsCount,
  reactivePropsBefore: propBefore.world.reactiveProps,
  reactivePropsImpact: propImpact.world.reactiveProps,
  reactivePropsAfter: propAfter.world.reactiveProps,
  propCollision: propImpact.world.propInteraction,
  mapVisible: mapOpen.mapVisible,
  errors,
};

writeJson("summary.json", summary);
if (errors.length > 0) {
  writeJson("errors.json", errors);
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
