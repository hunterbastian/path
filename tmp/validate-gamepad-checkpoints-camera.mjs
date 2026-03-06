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
const outputDir = path.resolve("output/web-game/gamepad-checkpoints-browser");

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

await page.addInitScript(() => {
  const buttons = Array.from({ length: 17 }, () => ({
    pressed: false,
    value: 0,
  }));
  const state = {
    connected: false,
    axes: [0, 0, 0, 0],
    buttons,
  };

  const toButtons = () =>
    state.buttons.map((button) => ({
      pressed: button.pressed,
      touched: button.pressed || button.value > 0,
      value: button.value,
    }));

  const buildPad = () => ({
    id: "Codex Virtual Gamepad",
    index: 0,
    connected: state.connected,
    mapping: "standard",
    axes: [...state.axes],
    buttons: toButtons(),
    timestamp: Date.now(),
  });

  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => (state.connected ? [buildPad(), null, null, null] : [null, null, null, null]),
  });

  window.__fakeGamepad = {
    connect() {
      state.connected = true;
    },
    disconnect() {
      state.connected = false;
      state.axes = [0, 0, 0, 0];
      for (const button of state.buttons) {
        button.pressed = false;
        button.value = 0;
      }
    },
    setAxes(nextAxes) {
      state.axes = [0, 0, 0, 0];
      nextAxes.forEach((value, index) => {
        state.axes[index] = value;
      });
    },
    setButton(index, pressed, value = pressed ? 1 : 0) {
      if (!state.buttons[index]) return;
      state.buttons[index].pressed = pressed;
      state.buttons[index].value = value;
    },
    resetButtons() {
      for (const button of state.buttons) {
        button.pressed = false;
        button.value = 0;
      }
    },
  };
});

const readState = async () => {
  return await page.evaluate(() => {
    const raw = window.render_game_to_text?.();
    return raw ? JSON.parse(raw) : null;
  });
};

const setPad = async ({ axes = [0, 0, 0, 0], buttons = [] } = {}) => {
  await page.evaluate(
    ({ axes, buttons }) => {
      window.__fakeGamepad.connect();
      window.__fakeGamepad.setAxes(axes);
      window.__fakeGamepad.resetButtons();
      buttons.forEach(({ index, pressed, value }) => {
        window.__fakeGamepad.setButton(index, pressed, value);
      });
    },
    { axes, buttons },
  );
};

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(450);

await setPad({
  buttons: [
    { index: 0, pressed: true, value: 1 },
    { index: 9, pressed: true, value: 1 },
  ],
});
for (let index = 0; index < 6; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
}
await setPad();
await page.waitForTimeout(120);

await setPad({
  axes: [0.62, -0.84, 0, 0],
  buttons: [{ index: 7, pressed: true, value: 1 }],
});
for (let index = 0; index < 16; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
}
await setPad();
await page.waitForTimeout(120);

const gamepadDriveState = await readState();
if (!gamepadDriveState) {
  throw new Error("Gamepad validation could not read drive state.");
}
if (gamepadDriveState.mode !== "driving") {
  throw new Error(`Expected driving mode after gamepad start, received ${gamepadDriveState.mode}.`);
}

await page.screenshot({
  path: path.join(outputDir, "shot-gamepad-drive.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-gamepad-drive.json"),
  JSON.stringify(gamepadDriveState, null, 2),
);

await page.evaluate(() => {
  window.jumpPathToFixture?.("outpost");
});
await page.waitForTimeout(100);

let checkpointState = null;
await setPad({
  axes: [0.12, -0.9, 0, 0],
  buttons: [{ index: 7, pressed: true, value: 1 }],
});
for (let index = 0; index < 18; index += 1) {
  await page.evaluate(() => {
    window.advanceTime?.(120);
  });
  const parsed = await readState();
  if (!parsed) continue;
  if ((parsed.run?.checkpointsReached ?? 0) > 0) {
    checkpointState = parsed;
    break;
  }
}
await setPad();
await page.waitForTimeout(100);

if (!checkpointState) {
  checkpointState = await readState();
}
if (!checkpointState) {
  throw new Error("Checkpoint validation could not read checkpoint state.");
}

await page.screenshot({
  path: path.join(outputDir, "shot-checkpoint.png"),
  fullPage: true,
});
fs.writeFileSync(
  path.join(outputDir, "state-checkpoint.json"),
  JSON.stringify(checkpointState, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

await browser.close();
