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

const url = process.argv[2] ?? "http://127.0.0.1:4174";
const outputDir = path.resolve("output/web-game/brutalist-outpost-browser");

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

const readState = async () => {
  return await page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);

await page.keyboard.press("Enter");
await page.waitForTimeout(160);
await page.evaluate(() => {
  window.jumpPathToFixture?.("outpost");
});
await page.evaluate(() => {
  window.advanceTime?.(320);
});
await page.waitForTimeout(120);

const outpostState = await readState();
if (!outpostState) {
  throw new Error("Outpost validation could not read render_game_to_text state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-outpost.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-outpost.json"),
  JSON.stringify(outpostState, null, 2),
);

await page.keyboard.down("ArrowUp");
for (let index = 0; index < 10; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
}
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(100);

const routeState = await readState();
if (!routeState) {
  throw new Error("Route validation could not read post-drive state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-route.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-route.json"),
  JSON.stringify(routeState, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
