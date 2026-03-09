import fs from 'node:fs';
import path from 'node:path';
import playwright from '/Users/hunterbastian/.npm-global/lib/node_modules/playwright/index.js';

const { chromium } = playwright;

const outDir = path.resolve('output/web-game/parallax-browser');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
});

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push({ type: 'console.error', text: msg.text() });
  }
});
page.on('pageerror', (error) => {
  errors.push({ type: 'pageerror', text: String(error) });
});

async function advance(ms) {
  await page.evaluate(async (duration) => {
    if (typeof window.advanceTime === 'function') {
      await window.advanceTime(duration);
    }
  }, ms);
}

async function readState(fileName) {
  const text = await page.evaluate(() =>
    typeof window.render_game_to_text === 'function'
      ? window.render_game_to_text()
      : null,
  );
  if (!text) {
    throw new Error('render_game_to_text returned no state.');
  }
  fs.writeFileSync(path.join(outDir, fileName), text);
  return JSON.parse(text);
}

async function orbit(deltaX, deltaY = 0) {
  await page.mouse.move(720, 540);
  await page.mouse.down();
  await page.mouse.move(720 + deltaX, 540 + deltaY, { steps: 16 });
  await page.mouse.up();
  await advance(180);
}

await page.goto('http://127.0.0.1:4177/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Enter Route' }).click();
await page.waitForTimeout(250);
await advance(150);

await page.evaluate(() => {
  window.jumpPathToCityCenter?.();
});
await page.waitForTimeout(100);
await orbit(220, -20);
await page.screenshot({ path: path.join(outDir, 'shot-city-center.png'), type: 'png' });
const cityState = await readState('state-city-center.json');

await page.evaluate(() => {
  window.jumpPathToObjective?.();
});
await page.waitForTimeout(100);
await orbit(180, 10);
await page.screenshot({ path: path.join(outDir, 'shot-outpost.png'), type: 'png' });
const outpostState = await readState('state-outpost.json');

const summary = {
  cityCenterDistanceMeters: cityState.world?.cityCenter?.distanceMeters ?? null,
  objectiveDistanceMeters: outpostState.world?.objective?.distanceMeters ?? null,
  roadPathsCount: cityState.world?.roadPathsCount ?? null,
  weather: cityState.world?.weather ?? null,
  errors,
};

fs.writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify(summary, null, 2),
);

if (errors.length > 0) {
  fs.writeFileSync(
    path.join(outDir, 'errors.json'),
    JSON.stringify(errors, null, 2),
  );
  process.exitCode = 1;
}

await browser.close();
