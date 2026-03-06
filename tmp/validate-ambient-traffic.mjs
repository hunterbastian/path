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
const outputDir = path.resolve("output/web-game/ambient-traffic-browser");

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
await advance(220);
await page.waitForTimeout(100);

await page.evaluate(() => {
  window.jumpPathToFixture?.("outpost");
});
await advance(200);
await page.waitForTimeout(80);

const startState = await readState();
if (!startState) {
  throw new Error("Ambient-traffic validation could not read the initial state.");
}
await saveSnapshot("outpost-start", startState);

for (let index = 0; index < 18; index += 1) {
  await advance(140);
}
await page.waitForTimeout(80);

const afterState = await readState();
if (!afterState) {
  throw new Error("Ambient-traffic validation could not read the later state.");
}
await saveSnapshot("outpost-after", afterState);

const movement = (afterState.world?.ambientTraffic ?? []).map((car) => {
  const before = (startState.world?.ambientTraffic ?? []).find(
    (candidate) => candidate.id === car.id,
  );
  return {
    id: car.id,
    movedMeters: before
      ? Number(
          Math.hypot(
            car.position.x - before.position.x,
            car.position.z - before.position.z,
          ).toFixed(2),
        )
      : null,
  };
});

fs.writeFileSync(
  path.join(outputDir, "movement.json"),
  JSON.stringify(movement, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
