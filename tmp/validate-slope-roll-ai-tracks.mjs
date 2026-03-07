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
const outputDir = path.resolve("output/web-game/slope-roll-ai-tracks-browser");
let canWriteArtifacts = true;

try {
  fs.mkdirSync(outputDir, { recursive: true });
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOSPC") {
    canWriteArtifacts = false;
  } else {
    throw error;
  }
}

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
  if (!canWriteArtifacts) return;
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

await page.evaluate(() => {
  window.jumpPathToFixture?.("slope");
});
await advance(140);
await page.waitForTimeout(60);

const slopeStartState = await readState();
if (!slopeStartState || slopeStartState.mode !== "driving") {
  throw new Error("Slope validation could not enter the slope-roll fixture.");
}
saveState("slope-start", slopeStartState);

await advance(2400);
await page.waitForTimeout(80);

const slopeRollState = await readState();
if (!slopeRollState) {
  throw new Error("Slope validation could not read the rolled state.");
}
saveState("slope-roll", slopeRollState);
await page.screenshot({
  path: path.join(outputDir, "shot-slope-roll.png"),
  fullPage: true,
}).catch(() => {});

const slopeRollDistance = Math.hypot(
  Number(slopeRollState.vehicle.position.x) - Number(slopeStartState.vehicle.position.x),
  Number(slopeRollState.vehicle.position.z) - Number(slopeStartState.vehicle.position.z),
);

if (
  slopeRollDistance < 2.4 ||
  Number(slopeRollState.vehicle.speedKmh ?? 0) < 5 ||
  Number(slopeStartState.vehicle.groundSlopeDegrees ?? 0) < 10
) {
  throw new Error(
    `Slope validation did not show a convincing roll-down. Distance ${slopeRollDistance.toFixed(2)}m, speed ${slopeRollState.vehicle.speedKmh} km/h, slope ${slopeStartState.vehicle.groundSlopeDegrees}deg.`,
  );
}

await page.evaluate(() => {
  window.jumpPathToFixture?.("spawn");
});
await advance(140);
await page.waitForTimeout(70);

const aiStartState = await readState();
if (!aiStartState || aiStartState.mode !== "driving") {
  throw new Error("AI track validation could not return to the spawn fixture.");
}
saveState("ai-start", aiStartState);

await advance(3200);
await page.waitForTimeout(80);

const aiTrackState = await readState();
if (!aiTrackState) {
  throw new Error("AI track validation could not read the traffic-track state.");
}
saveState("ai-tracks", aiTrackState);
await page.screenshot({
  path: path.join(outputDir, "shot-ai-tracks.png"),
  fullPage: true,
}).catch(() => {});

if (
  Number(aiTrackState.vehicle.speedKmh ?? 0) > 2 ||
  Number(aiTrackState.world?.tireTracksActive ?? 0) < 6
) {
  throw new Error(
    `AI track validation expected a parked player and visible tracks. Player speed ${aiTrackState.vehicle.speedKmh} km/h, tracks ${aiTrackState.world?.tireTracksActive}.`,
  );
}

if (canWriteArtifacts && errors.length > 0) {
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(errors, null, 2),
  );
}

console.log(
  JSON.stringify(
    {
      canWriteArtifacts,
      slope: {
        start: slopeStartState.vehicle,
        end: slopeRollState.vehicle,
        movedMeters: Number(slopeRollDistance.toFixed(2)),
      },
      aiTracks: {
        playerSpeedKmh: aiTrackState.vehicle.speedKmh,
        tireTracksActive: aiTrackState.world?.tireTracksActive,
        ambientTraffic: aiTrackState.world?.ambientTraffic,
      },
      errors,
    },
    null,
    2,
  ),
);

await browser.close();
