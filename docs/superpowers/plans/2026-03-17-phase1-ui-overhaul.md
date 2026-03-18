# Phase 1: UI Overhaul — Amber Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cartographic paper-and-ink UI with a retro-futuristic Amber Terminal aesthetic, wire settings to actual systems, and add compass + minimap HUD elements.

**Architecture:** All UI is vanilla DOM (no framework). AppShell.ts owns the HTML template and element references. CSS is in `src/styles/app.css`. HUD data flows from PathGame → AppShell via snapshot objects. New HUD elements (compass, minimap) need new data in the snapshot interface + new DOM elements + new CSS.

**Tech Stack:** Three.js, TypeScript, Vite, vanilla DOM, CSS

**Spec:** `docs/superpowers/specs/2026-03-17-ui-overhaul-and-biome-progression-design.md` — Section 1-4 only.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/styles/app.css` | Rewrite | Amber terminal palette, all screen styles, HUD styles |
| `src/core/AppShell.ts` | Major modify | New HTML template (title, pause, HUD), new element refs, settings event wiring, minimap canvas, compass |
| `src/app/PathGame.ts` | Modify | Read+apply settings on pause close, pass heading/boost/surface to new HUD methods, Tab key for expanded grid |
| `src/camera/ThirdPersonCamera.ts` | Modify | Add public `shakeScale` property |
| `src/core/InputManager.ts` | Modify | Refactor deadzone from const to mutable instance property |
| `src/core/Engine.ts` | Modify | Add `setQualityPreset()` method for graphics toggle |
| `src/vehicle/DrivingState.ts` | Check | Confirm `boostLevel` is on the state interface |

---

## Task 1: CSS Palette — Amber Terminal Variables

**Files:**
- Modify: `src/styles/app.css:19-49` (`:root` block)

- [ ] **Step 1: Replace the `:root` CSS variables**

Replace the existing palette block with amber terminal tokens:

```css
:root {
  color-scheme: dark;
  font-family: "Geist Mono", "SFMono-Regular", "Consolas", monospace;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);

  /* Amber Terminal palette */
  --surround: #0e1420;
  --chassis: #1c1e24;
  --amber: #d4a74a;
  --amber-bright: rgba(212, 167, 74, 0.75);
  --amber-muted: rgba(212, 167, 74, 0.35);
  --amber-dim: rgba(212, 167, 74, 0.15);
  --amber-glow: 0 0 8px rgba(212, 167, 74, 0.4);
  --te-orange: #e8622c;

  --text-2xs: 9px;
  --text-xs: 10px;
  --text-sm: 11px;
  --text-md: 12px;
}
```

- [ ] **Step 2: Update body styles**

Replace body background and color to use surround:

```css
body {
  position: relative;
  overflow: hidden;
  font-size: var(--text-md);
  line-height: 1.45;
  background: var(--surround);
  color: var(--amber-bright);
}
```

Remove `body::before` and `body::after` pseudo-elements (paper texture).

- [ ] **Step 3: Add CRT scanline overlay class**

```css
.crt-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 1px,
    rgba(0, 0, 0, 0.06) 1px,
    rgba(0, 0, 0, 0.06) 3px
  );
  pointer-events: none;
  z-index: 1;
}
```

- [ ] **Step 4: Run `npx tsc --noEmit` to verify no type errors**

- [ ] **Step 5: Commit**

```bash
git add src/styles/app.css
git commit -m "feat(ui): replace paper palette with amber terminal CSS variables"
```

---

## Task 2: Settings Wiring — Camera Shake + Deadzone + Engine Quality

**Files:**
- Modify: `src/camera/ThirdPersonCamera.ts:68-76` (add shakeScale)
- Modify: `src/core/InputManager.ts:25` (refactor deadzone)
- Modify: `src/core/Engine.ts` (add setQualityPreset)

- [ ] **Step 1: Add `shakeScale` to ThirdPersonCamera**

After line 76 (`#shakeDirectionZ = 0;`), add:

```typescript
/** Multiplier for all shake effects. 0 = disabled, 1 = normal. */
shakeScale = 1;
```

Then multiply all shake outputs at line 380-385. Replace:

```typescript
this.#shakeOffsetX = this.#shakeAmplitude * (shakeWave * 0.10 + this.#shakeDirectionX * 0.18);
this.#shakeOffsetY = this.#shakeAmplitude * shakeWave2 * 0.14;
this.#shakeOffsetZ = this.#shakeAmplitude * (shakeWave2 * 0.07 + this.#shakeDirectionZ * 0.14);
// Angular shake (reduced)
this.#shakeRollOffset = this.#shakeAmplitude * shakeWave * 0.010;
this.#shakePitchOffset = this.#shakeAmplitude * shakeWave2 * 0.007;
```

With:

```typescript
const s = this.shakeScale;
this.#shakeOffsetX = s * this.#shakeAmplitude * (shakeWave * 0.10 + this.#shakeDirectionX * 0.18);
this.#shakeOffsetY = s * this.#shakeAmplitude * shakeWave2 * 0.14;
this.#shakeOffsetZ = s * this.#shakeAmplitude * (shakeWave2 * 0.07 + this.#shakeDirectionZ * 0.14);
// Angular shake (reduced)
this.#shakeRollOffset = s * this.#shakeAmplitude * shakeWave * 0.010;
this.#shakePitchOffset = s * this.#shakeAmplitude * shakeWave2 * 0.007;
```

- [ ] **Step 2: Refactor deadzone in InputManager**

At line 25, change:

```typescript
const GAMEPAD_AXIS_DEADZONE = 0.16;
```

To a default constant + instance property:

```typescript
const DEFAULT_GAMEPAD_AXIS_DEADZONE = 0.16;
```

Add a public property in the class body:

```typescript
gamepadDeadzone = DEFAULT_GAMEPAD_AXIS_DEADZONE;
```

At lines 269-270, change `GAMEPAD_AXIS_DEADZONE` to `this.gamepadDeadzone`.

- [ ] **Step 3: Add `setQualityPreset()` to Engine**

Add after the `render()` method:

```typescript
setQualityPreset(preset: 'low' | 'medium' | 'high'): void {
  switch (preset) {
    case 'low':
      this.#maxPixelRatio = 0.8;
      this.#minPixelRatio = 0.5;
      this.renderer.shadowMap.enabled = false;
      break;
    case 'medium':
      this.#maxPixelRatio = MAX_RENDER_PIXEL_RATIO;
      this.#minPixelRatio = MIN_RENDER_PIXEL_RATIO;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      break;
    case 'high':
      this.#maxPixelRatio = Math.min(window.devicePixelRatio, 2);
      this.#minPixelRatio = 1;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      break;
  }
  this.#syncPixelRatioBounds();
}
```

- [ ] **Step 4: Run `npx tsc --noEmit`**

- [ ] **Step 5: Commit**

```bash
git add src/camera/ThirdPersonCamera.ts src/core/InputManager.ts src/core/Engine.ts
git commit -m "feat(settings): add shakeScale, mutable deadzone, quality presets"
```

---

## Task 3: Apply Settings on Pause Close

**Files:**
- Modify: `src/app/PathGame.ts:1221-1236` (`#setPauseVisible`)

- [ ] **Step 1: Read and apply settings when pause closes**

In `#setPauseVisible`, after the existing `this.#shell.setPauseVisible(shouldPause);` line, add settings application when closing:

```typescript
if (!visible && this.#pauseVisible) {
  // Apply settings on pause close
  const settings = this.#shell.getSettingsValues();
  this.#sampleAudio.setMasterVolume(settings.volume);
  this.#engine.setQualityPreset(settings.quality as 'low' | 'medium' | 'high');
  this.#camera.shakeScale = settings.cameraShake ? 1 : 0;
  this.#input.gamepadDeadzone = settings.deadzone;

  // Persist to localStorage
  localStorage.setItem('path-settings', JSON.stringify(settings));
}
```

- [ ] **Step 2: Load saved settings on game start**

In the constructor or `init()` method, after systems are created, add:

```typescript
const saved = localStorage.getItem('path-settings');
if (saved) {
  try {
    const settings = JSON.parse(saved);
    if (settings.volume !== undefined) this.#sampleAudio.setMasterVolume(settings.volume);
    if (settings.quality) this.#engine.setQualityPreset(settings.quality);
    if (settings.cameraShake !== undefined) this.#camera.shakeScale = settings.cameraShake ? 1 : 0;
    if (settings.deadzone !== undefined) this.#input.gamepadDeadzone = settings.deadzone;
  } catch { /* ignore corrupt data */ }
}
```

- [ ] **Step 3: Run `npx tsc --noEmit`**

- [ ] **Step 4: Commit**

```bash
git add src/app/PathGame.ts
git commit -m "feat(settings): wire pause menu settings to audio, engine, camera, input"
```

---

## Task 4: Title Screen — Amber Terminal Device

**Files:**
- Modify: `src/core/AppShell.ts` (title screen HTML template)
- Modify: `src/styles/app.css` (title screen styles)

- [ ] **Step 1: Replace title screen HTML in AppShell.ts**

Find the `<div class="title-screen screen" ...>` block and replace it with the Amber Terminal device layout:

- Header bar: amber LED + "PATH · Navigator Terminal" + version
- Screen area: `<div class="title-preview-frame">` for live 3D preview
- Data row: 4 cells (Region/Grid/Conditions/Relay)
- Title: "PATH" in large amber text
- Bottom bar: callsign input + "Initialize" button

Preserve existing element IDs for `startButton`, `playerNameInput`, and preview mount point.

- [ ] **Step 2: Replace title screen CSS**

Remove `.title-card`, `.title-topline`, `.title-hero`, `.title-name`, etc. Replace with amber terminal styles:

- `.title-device` — main panel (`background: var(--chassis); border: 1px solid var(--amber-dim)`)
- `.device-header` — dark header bar
- `.device-screen` — preview area with phosphor glow
- `.device-data-row` — 4-cell grid
- `.device-title` — large amber text
- `.device-footer` — bottom bar with input + button
- `.amber-led` — 5×5px square with `box-shadow: var(--amber-glow)`

- [ ] **Step 3: Add CRT scanline div to the screen area**

```html
<div class="crt-scanlines"></div>
```

- [ ] **Step 4: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 5: Commit**

```bash
git add src/core/AppShell.ts src/styles/app.css
git commit -m "feat(ui): rebuild title screen as amber terminal device"
```

---

## Task 5: Pause Screen — Compact Console

**Files:**
- Modify: `src/core/AppShell.ts` (pause screen HTML)
- Modify: `src/styles/app.css` (pause screen styles)

- [ ] **Step 1: Replace pause screen HTML**

Replace the `<div class="pause-screen screen" ...>` block with compact console layout:

- Header bar: amber LED + "System" + "Esc · close"
- Settings: volume slider, graphics segmented toggle (Low/Med/High), cam shake square toggle, deadzone slider
- Actions: Resume (▸ bright), Restart (muted), Free camera (muted)

Use square controls — no border-radius. Slider knobs as 8×8px amber squares. Toggle as 24×12px housing with 10×10px indicator.

- [ ] **Step 2: Replace pause screen CSS**

Remove `.pause-card`, `.pause-title`, `.pause-copy`, `.pause-actions`. Replace with:

- `.pause-device` — same chassis/border pattern
- `.device-settings` — grid of control rows
- `.device-slider` — custom range input (amber track + square knob)
- `.device-toggle` — square toggle switch
- `.device-segmented` — segmented button group
- `.device-actions` — stacked action list

- [ ] **Step 3: Update settings element references in AppShell constructor**

Ensure all `#query()` calls for settings elements match the new IDs.

- [ ] **Step 4: Replace `getSettingsValues()` to read from new controls**

The segmented graphics toggle needs a different read method (check which segment has `.is-active` class) vs the old `<select>`.

- [ ] **Step 5: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 6: Commit**

```bash
git add src/core/AppShell.ts src/styles/app.css
git commit -m "feat(ui): rebuild pause screen as compact amber console"
```

---

## Task 6: HUD — Floating Amber Elements

**Files:**
- Modify: `src/core/AppShell.ts` (HUD HTML + methods)
- Modify: `src/styles/app.css` (HUD styles)
- Modify: `src/app/PathGame.ts` (pass heading + new data to HUD)

- [ ] **Step 1: Replace HUD HTML template**

Remove the paper-style `.hud-panel` and `.hud-grid`. Replace with floating amber elements:

- `.hud-compass` — top center, heading strip
- `.hud-boost` — small bar + percentage
- `.hud-drift` — running drift total
- `.hud-surface` — terrain type label
- `.hud-weather` — icon + condition text
- `.hud-minimap` — 96×96px canvas in corner
- `.hud-expanded` — full stat grid (hidden by default, shown on Tab)

Keep the existing speedometer (`.speedo`) but restyle to amber palette.

- [ ] **Step 2: Add compass heading calculation**

In PathGame.ts, calculate heading from vehicle quaternion:

```typescript
const heading = Math.atan2(
  2 * (q.w * q.y + q.x * q.z),
  1 - 2 * (q.y * q.y + q.z * q.z),
) * (180 / Math.PI);
```

Add `heading: number` to the HudSnapshot interface. Pass to AppShell.

- [ ] **Step 3: Implement compass rendering in AppShell**

`updateCompass(heading: number)` — sets the cardinal direction text and rotates the marker. Cardinal labels: N, NE, E, SE, S, SW, W, NW.

- [ ] **Step 4: Add HUD CSS**

All floating elements: `position: fixed`, amber text with `text-shadow: 0 1px 4px rgba(0,0,0,0.5)` for readability over 3D. No panel backgrounds — just text on the scene.

- [ ] **Step 5: Restyle speedometer to amber**

Update `.speedo-value` color to `var(--amber-bright)`, unit to `var(--amber-muted)`, bar gradient to amber. Remove paper-panel styling.

- [ ] **Step 6: Add Tab key toggle for expanded grid**

In PathGame.ts, listen for Tab key (add to InputManager or directly via keydown). Toggle `.hud-expanded` visibility.

- [ ] **Step 7: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 8: Commit**

```bash
git add src/core/AppShell.ts src/styles/app.css src/app/PathGame.ts
git commit -m "feat(ui): floating amber HUD with compass, weather indicator, tab-expanded grid"
```

---

## Task 7: Corner Minimap

**Files:**
- Modify: `src/core/AppShell.ts` (minimap canvas + render method)
- Modify: `src/app/PathGame.ts` (pass minimap data each frame)
- Read: `src/gameplay/MapDiscoverySystem.ts` (cells, columns, rows getters)

- [ ] **Step 1: Add minimap canvas to HUD HTML**

```html
<div class="hud-minimap">
  <canvas id="minimap-canvas" width="96" height="96"></canvas>
</div>
```

- [ ] **Step 2: Add minimap CSS**

```css
.hud-minimap {
  position: fixed;
  bottom: calc(24px + var(--safe-bottom));
  left: calc(16px + var(--safe-left));
  width: 96px;
  height: 96px;
  border: 1px solid var(--amber-dim);
  z-index: 12;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

body.game-started .hud-minimap { opacity: 1; }
body.game-arrived .hud-minimap,
body.map-open .hud-minimap,
body.pause-menu-open .hud-minimap { opacity: 0; }
```

- [ ] **Step 3: Implement minimap render method in AppShell**

```typescript
updateMinimap(
  cells: Uint8Array,
  columns: number,
  rows: number,
  playerX: number,
  playerZ: number,
  worldSize: number,
): void {
  const ctx = this.#minimapContext;
  const w = 96, h = 96;
  ctx.clearRect(0, 0, w, h);

  // Draw fog grid
  const cellW = w / columns;
  const cellH = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const discovered = cells[r * columns + c] > 0;
      ctx.fillStyle = discovered
        ? 'rgba(212, 167, 74, 0.08)'
        : 'rgba(10, 12, 16, 0.6)';
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

  // Player dot
  const half = worldSize * 0.5;
  const px = ((playerX + half) / worldSize) * w;
  const pz = ((playerZ + half) / worldSize) * h;
  ctx.fillStyle = 'rgba(212, 167, 74, 0.9)';
  ctx.shadowColor = 'rgba(212, 167, 74, 0.4)';
  ctx.shadowBlur = 6;
  ctx.fillRect(px - 2, pz - 2, 4, 4);
  ctx.shadowBlur = 0;
}
```

- [ ] **Step 4: Call updateMinimap from PathGame's sync loop**

In `#syncShell()`, add:

```typescript
this.#shell.updateMinimap(
  this.#mapDiscovery.cells,
  this.#mapDiscovery.columns,
  this.#mapDiscovery.rows,
  this.#controller.pose.position.x,
  this.#controller.pose.position.z,
  920, // worldSize
);
```

- [ ] **Step 5: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 6: Commit**

```bash
git add src/core/AppShell.ts src/styles/app.css src/app/PathGame.ts
git commit -m "feat(ui): add amber corner minimap with fog-of-war grid"
```

---

## Task 8: Clean Up Legacy Styles + Final Polish

**Files:**
- Modify: `src/styles/app.css` (remove dead CSS)
- Modify: `src/core/AppShell.ts` (remove dead HTML/refs)

- [ ] **Step 1: Remove all unused CSS classes**

Delete styles for: `.title-card`, `.title-topline`, `.title-hero`, `.title-name`, `.title-rule`, `.title-facts`, `.title-fact`, `.title-actions`, `.title-preview-shell`, `.title-preview-topline`, `.title-preview-frame` (old version), `.pause-card`, `.pause-title`, `.pause-copy`, `.pause-actions`, `.hud-panel`, `.hud-grid`, `.hud-stack`, `.hud-main`, `.speed-readout`, `.hud-glyph--relay`, `.hud-glyph--weather` (old versions), `.settings-panel` (old), `.settings-heading`, `.settings-grid`, `.settings-row`, `.settings-range`, `.settings-select`, `.settings-toggle`, `.settings-value`.

Keep: `.achievement-toast` styles, `.drift-score-popup`, `.discovery-toast`, `.radio-log`, `.map-device`, `.debug-panel`, `.error-banner`, `.crosshair`, reduced motion media query.

- [ ] **Step 2: Remove dead element references from AppShell**

Clean up any `#query()` calls that reference elements no longer in the template.

- [ ] **Step 3: Update responsive breakpoints**

Review `@media` queries — the amber terminal layout may need different breakpoints. The device panel should scale down gracefully on narrow screens.

- [ ] **Step 4: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 5: Visually verify in browser** — start dev server, check title → pause → HUD flow

- [ ] **Step 6: Commit**

```bash
git add src/styles/app.css src/core/AppShell.ts
git commit -m "feat(ui): clean up legacy paper styles, finalize amber terminal polish"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update HUD description**

Replace "Cartographic visual language: paper textures, ink colors, gold accents" with "Amber Terminal: retro-futuristic device aesthetic, amber-on-dark palette, CRT scanlines, Geist Mono, square elements".

- [ ] **Step 2: Update HUD grid stats list**

Replace the grid stats list with: "Always visible: Speedometer, Compass, Boost, Drift total, Surface type, Weather indicator, Corner minimap. Tab expands full stat grid."

- [ ] **Step 3: Note settings wiring**

Add: "Settings panel (pause menu) wired to: SampleAudio (volume), Engine (quality preset), ThirdPersonCamera (shakeScale), InputManager (gamepadDeadzone). Values persist to localStorage."

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for amber terminal UI overhaul"
```
