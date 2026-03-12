import type { VehicleDamage } from '../vehicle/VehicleDamage';

/**
 * Canvas-based damage diagram — top-down vehicle silhouette showing part health.
 * Green = intact, yellow = damaged, red = critical, dark = detached.
 */

/** Part layout: name, path rectangle [x, y, w, h] in normalized coords (0–1). */
const PART_RECTS: Array<{ name: string; rect: [number, number, number, number] }> = [
  // Core body (always drawn, not tracked)
  // Hood (front center)
  { name: 'hood',        rect: [0.25, 0.05, 0.50, 0.14] },
  // Windshield
  { name: 'windshield',  rect: [0.28, 0.20, 0.44, 0.06] },
  // Front bumper
  { name: 'bumperFront', rect: [0.18, 0.00, 0.64, 0.05] },
  // Rear bumper
  { name: 'bumperRear',  rect: [0.18, 0.95, 0.64, 0.05] },
  // Brush guard (front, narrow bar)
  { name: 'brushGuard',  rect: [0.22, 0.05, 0.56, 0.03] },
  // Doors
  { name: 'doorLeft',    rect: [0.08, 0.30, 0.12, 0.30] },
  { name: 'doorRight',   rect: [0.80, 0.30, 0.12, 0.30] },
  // Fenders
  { name: 'fenderFL',    rect: [0.08, 0.10, 0.14, 0.16] },
  { name: 'fenderFR',    rect: [0.78, 0.10, 0.14, 0.16] },
  { name: 'fenderRL',    rect: [0.08, 0.64, 0.14, 0.16] },
  { name: 'fenderRR',    rect: [0.78, 0.64, 0.14, 0.16] },
  // Side sliders
  { name: 'sliderLeft',  rect: [0.05, 0.28, 0.04, 0.44] },
  { name: 'sliderRight', rect: [0.91, 0.28, 0.04, 0.44] },
  // Roof rack (center top area)
  { name: 'roofRack',    rect: [0.30, 0.30, 0.40, 0.24] },
  // Spare tire (rear center)
  { name: 'spareTire',   rect: [0.38, 0.88, 0.24, 0.07] },
  // Antenna (small dot)
  { name: 'antenna',     rect: [0.22, 0.55, 0.04, 0.08] },
  // Wheels
  { name: 'wheelFL',     rect: [0.02, 0.12, 0.08, 0.12] },
  { name: 'wheelFR',     rect: [0.90, 0.12, 0.08, 0.12] },
  { name: 'wheelRL',     rect: [0.02, 0.68, 0.08, 0.12] },
  { name: 'wheelRR',     rect: [0.90, 0.68, 0.08, 0.12] },
];

const COLOR_INTACT   = '#5a8a5a';
const COLOR_DAMAGED  = '#b89a3e';
const COLOR_CRITICAL = '#a84232';
const COLOR_GONE     = '#d0ccc4';
const COLOR_CHASSIS  = '#c8c0b0';
const COLOR_BORDER   = 'rgba(86, 98, 123, 0.3)';

function healthColor(health: number): string {
  if (health <= 0) return COLOR_GONE;
  if (health < 0.35) return COLOR_CRITICAL;
  if (health < 0.7) return COLOR_DAMAGED;
  return COLOR_INTACT;
}

export class DamageHud {
  readonly element: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #w: number;
  readonly #h: number;
  #visible = false;

  constructor() {
    // Small canvas — 60×90 logical pixels, rendered at 2x
    this.#w = 60;
    this.#h = 90;

    const canvas = document.createElement('canvas');
    canvas.width = this.#w * 2;
    canvas.height = this.#h * 2;
    canvas.className = 'damage-hud';
    canvas.style.cssText = [
      `width: ${this.#w}px`,
      `height: ${this.#h}px`,
      'position: absolute',
      'right: -72px',
      'top: 50%',
      'transform: translateY(-50%)',
      'border-radius: 8px',
      'border: 1px solid rgba(86, 98, 123, 0.25)',
      'background: rgba(247, 244, 235, 0.85)',
      'opacity: 0',
      'transition: opacity 300ms ease',
      'pointer-events: none',
    ].join(';');

    this.element = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create damage HUD canvas context.');
    this.#ctx = ctx;
    this.#ctx.scale(2, 2);
  }

  update(damage: VehicleDamage): void {
    const ctx = this.#ctx;
    const w = this.#w;
    const h = this.#h;

    ctx.clearRect(0, 0, w, h);

    // Draw chassis outline
    const cx = w * 0.18;
    const cy = h * 0.06;
    const cw = w * 0.64;
    const ch = h * 0.88;
    ctx.fillStyle = COLOR_CHASSIS;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, ch, 4);
    ctx.fill();
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Draw each part
    for (const part of PART_RECTS) {
      const health = damage.getPartHealth(part.name);
      const [rx, ry, rw, rh] = part.rect;

      ctx.fillStyle = healthColor(health);
      ctx.beginPath();
      ctx.roundRect(
        rx * w + 0.5,
        ry * h + 0.5,
        rw * w - 1,
        rh * h - 1,
        2,
      );
      ctx.fill();
    }

    // Show/hide based on whether any damage exists
    const hasDamage = damage.totalHealth < 0.99;
    if (hasDamage && !this.#visible) {
      this.element.style.opacity = '1';
      this.#visible = true;
    } else if (!hasDamage && this.#visible) {
      this.element.style.opacity = '0';
      this.#visible = false;
    }
  }
}
