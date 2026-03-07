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
const outputDir = path.resolve("output/web-game/esc-menu-browser");

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

const saveState = (name, state) => {
  fs.writeFileSync(
    path.join(outputDir, `state-${name}.json`),
    JSON.stringify(state, null, 2),
  );
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350);
await page.keyboard.press("Enter");
await advance(220);
await page.waitForTimeout(120);

await page.keyboard.down("ArrowUp");
for (let index = 0; index < 12; index += 1) {
  await advance(120);
}
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(80);

const beforeMenuState = await readState();
if (!beforeMenuState || beforeMenuState.mode !== "driving") {
  throw new Error("ESC menu validation could not reach a driving state before opening the menu.");
}
saveState("before-menu", beforeMenuState);

await page.keyboard.press("Escape");
await advance(120);
await page.waitForTimeout(80);

const menuOpenState = await readState();
if (!menuOpenState?.pauseVisible) {
  throw new Error("ESC menu validation did not open the pause menu.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-menu-open.png"),
  fullPage: true,
});
saveState("menu-open", menuOpenState);

await advance(420);
await page.waitForTimeout(60);

const menuStillOpenState = await readState();
if (!menuStillOpenState?.pauseVisible) {
  throw new Error("ESC menu validation lost the pause menu during the paused hold.");
}
saveState("menu-hold", menuStillOpenState);

await page.keyboard.press("Escape");
await advance(120);
await page.waitForTimeout(70);

const menuClosedState = await readState();
if (!menuClosedState || menuClosedState.pauseVisible || menuClosedState.mode !== "driving") {
  throw new Error("ESC menu validation could not close the pause menu back into driving.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-menu-closed.png"),
  fullPage: true,
});
saveState("menu-closed", menuClosedState);

await page.keyboard.press("Escape");
await advance(120);
await page.waitForTimeout(70);
await page.locator("#pause-restart-button").click();
await advance(160);
await page.waitForTimeout(80);

const afterRestartState = await readState();
if (!afterRestartState || afterRestartState.pauseVisible || afterRestartState.mode !== "driving") {
  throw new Error("ESC menu validation could not restart the run from the pause menu.");
}
await page.screenshot({
  path: path.join(outputDir, "shot-after-restart.png"),
  fullPage: true,
});
saveState("after-restart", afterRestartState);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
