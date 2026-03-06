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
const outputDir = path.resolve("output/web-game/gravity-browser");

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

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);

await page.keyboard.press("Enter");
await page.waitForTimeout(140);
await page.evaluate(() => {
  window.jumpPathToFixture?.("drop");
});
await page.waitForTimeout(120);

await page.keyboard.down("ArrowUp");
await page.keyboard.down("Space");

let airborneState = null;
let landingState = null;

for (let index = 0; index < 36; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(140);
  });

  const parsed = await page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });

  if (!parsed) {
    continue;
  }

  if (!airborneState && parsed.vehicle?.grounded === false) {
    airborneState = parsed;
    await page.screenshot({
      path: path.join(outputDir, "shot-airborne.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(outputDir, "state-airborne.json"),
      JSON.stringify(parsed, null, 2),
    );
  }

  if (
    airborneState &&
    parsed.vehicle?.grounded === true &&
    Number(parsed.vehicle?.airborneTimeSeconds ?? 0) === 0
  ) {
    landingState = parsed;
    await page.screenshot({
      path: path.join(outputDir, "shot-landing.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(outputDir, "state-landing.json"),
      JSON.stringify(parsed, null, 2),
    );
    break;
  }
}

await page.keyboard.up("Space");
await page.keyboard.up("ArrowUp");

if (!airborneState || !landingState) {
  const finalState = await page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });
  if (finalState) {
    fs.writeFileSync(
      path.join(outputDir, "state-final.json"),
      JSON.stringify(finalState, null, 2),
    );
  }
  throw new Error("Gravity validation did not observe a full airborne and landing cycle.");
}

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
