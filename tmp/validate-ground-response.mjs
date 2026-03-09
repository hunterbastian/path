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
const outputDir = path.resolve("output/web-game/ground-response-browser");

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
let fatalError = null;

page.on("console", (msg) => {
  if (msg.type() === "error") {
    errors.push({ type: "console.error", text: msg.text() });
  }
});

page.on("pageerror", (error) => {
  errors.push({ type: "pageerror", text: String(error) });
});

const readState = async () =>
  await page.evaluate(() => {
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

const driveFor = async (milliseconds, keys) => {
  await page.evaluate((codes) => {
    for (const code of codes) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }, keys);
  await advance(milliseconds);
  await page.waitForTimeout(60);
  await page.evaluate((codes) => {
    for (const code of [...codes].reverse()) {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }, keys);
  await advance(180);
  await page.waitForTimeout(60);
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(350);
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.evaluate(() => {
    window.startPathGame?.();
  });
  await advance(260);
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    window.forcePathWeather?.("rainy");
    window.jumpPathToFixture?.("water");
  });
  await advance(260);
  await page.waitForTimeout(80);
  await driveFor(780, ["KeyW"]);
  const dirtPathState = await readState();
  if (!dirtPathState) {
    throw new Error("Could not capture rainy dirt-path state.");
  }
  saveState("dirt-path", dirtPathState);

  await driveFor(920, ["KeyW"]);
  const waterCrossingState = await readState();
  if (!waterCrossingState) {
    throw new Error("Could not capture water-crossing state.");
  }
  saveState("water-crossing", waterCrossingState);

  await page.evaluate(() => {
    window.jumpPathToTraffic?.();
  });
  await advance(260);
  await page.waitForTimeout(80);
  await driveFor(1600, ["KeyW"]);
  const snowState = await readState();
  if (!snowState) {
    throw new Error("Could not capture snow fixture state.");
  }
  saveState("snow", snowState);

  const summary = {
    dirtPath: {
      weather: dirtPathState.world?.weather ?? null,
      surface: dirtPathState.vehicle?.surface ?? null,
      roadInfluence: dirtPathState.world?.surfaceFx?.roadInfluence ?? null,
      rutPullStrength: dirtPathState.world?.surfaceFx?.rutPullStrength ?? null,
      wetTrackStrength: dirtPathState.world?.surfaceFx?.wetTrackStrength ?? null,
      dustParticles: dirtPathState.world?.surfaceFx?.dustParticles ?? null,
      debrisParticles: dirtPathState.world?.surfaceFx?.debrisParticles ?? null,
      tireTracksActive: dirtPathState.world?.tireTracksActive ?? null,
    },
    waterCrossing: {
      surface: waterCrossingState.vehicle?.surface ?? null,
      splashParticles: waterCrossingState.world?.surfaceFx?.splashParticles ?? null,
      mudSplashParticles: waterCrossingState.world?.surfaceFx?.mudSplashParticles ?? null,
    },
    snow: {
      surface: snowState.vehicle?.surface ?? null,
      snowSprayParticles: snowState.world?.surfaceFx?.snowSprayParticles ?? null,
      debrisParticles: snowState.world?.surfaceFx?.debrisParticles ?? null,
    },
    errors,
  };

  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
} catch (error) {
  fatalError = error;
  errors.push({
    type: "fatal",
    text: error instanceof Error ? error.message : String(error),
  });
  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify({ errors }, null, 2),
  );
} finally {
  if (errors.length > 0) {
    fs.writeFileSync(
      path.join(outputDir, "errors.json"),
      JSON.stringify(errors, null, 2),
    );
  }

  const exitCode = fatalError ? 1 : 0;
  const forcedExit = setTimeout(() => {
    process.exit(exitCode);
  }, 250);
  forcedExit.unref?.();

  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  if (fatalError) {
    console.error(fatalError);
  }
  process.exit(exitCode);
}
