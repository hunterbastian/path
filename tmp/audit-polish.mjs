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
const outputDir = path.resolve("output/web-game/polish-audit");
const errorsPath = path.join(outputDir, "errors.json");

fs.mkdirSync(outputDir, { recursive: true });
if (fs.existsSync(errorsPath)) {
  fs.unlinkSync(errorsPath);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

const shouldIgnoreConsoleMessage = (text) => {
  return text.includes("GPU stall due to ReadPixels");
};

const readState = async (activePage) => {
  return await activePage.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : {};
  });
};

const waitFor = async (activePage, predicate, label) => {
  const started = Date.now();
  while (Date.now() - started < 2500) {
    const state = await readState(activePage);
    if (predicate(state)) {
      return state;
    }
    await activePage.waitForTimeout(60);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

page.on("console", (msg) => {
  if ((msg.type() === "error" || msg.type() === "warning") && !shouldIgnoreConsoleMessage(msg.text())) {
    errors.push({ type: `console.${msg.type()}`, text: msg.text() });
  }
});

page.on("pageerror", (error) => {
  errors.push({ type: "pageerror", text: String(error) });
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);

await page.screenshot({
  path: path.join(outputDir, "title-desktop.png"),
  fullPage: true,
});

await page.keyboard.press("Enter");
await page.waitForTimeout(140);
await page.evaluate(() => {
  window.jumpPathToFixture?.("spawn");
});
await page.keyboard.down("ArrowUp");
await page.evaluate(() => {
  window.advanceTime?.(2200);
});
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(120);

const driveState = await readState(page);

fs.writeFileSync(
  path.join(outputDir, "drive-state.json"),
  JSON.stringify(driveState, null, 2),
);

await page.screenshot({
  path: path.join(outputDir, "drive-desktop.png"),
  fullPage: true,
});

await page.keyboard.press("m");
await waitFor(page, (state) => state.mapVisible === true, "desktop map open");
await page.waitForTimeout(180);
await page.screenshot({
  path: path.join(outputDir, "map-desktop.png"),
  fullPage: true,
});

await page.evaluate(() => {
  window.jumpPathToObjective?.();
});
await page.evaluate(() => {
  window.advanceTime?.(300);
});
const arrivalState = await waitFor(page, (state) => state.arrivalVisible === true, "arrival overlay");
fs.writeFileSync(
  path.join(outputDir, "arrival-state.json"),
  JSON.stringify(arrivalState, null, 2),
);
await page.waitForTimeout(220);
await page.screenshot({
  path: path.join(outputDir, "arrival-desktop.png"),
  fullPage: true,
});

await page.setViewportSize({ width: 393, height: 852 });
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);
await page.screenshot({
  path: path.join(outputDir, "title-mobile.png"),
  fullPage: true,
});

await page.keyboard.press("Enter");
await page.waitForTimeout(140);
await page.evaluate(() => {
  window.jumpPathToFixture?.("spawn");
});
await page.keyboard.press("m");
await waitFor(page, (state) => state.mapVisible === true, "mobile map open");
await page.waitForTimeout(180);
await page.screenshot({
  path: path.join(outputDir, "map-mobile.png"),
  fullPage: true,
});

if (errors.length > 0) {
  fs.writeFileSync(
    errorsPath,
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
