/**
 * RadioLog — ambient radio chatter feed.
 *
 * Shows short, atmospheric text transmissions that react to proximity,
 * events, and world state. Feels like intercepted comms from a broken network.
 */

export type RadioPriority = 'ambient' | 'info' | 'alert';

interface QueuedMessage {
  text: string;
  priority: RadioPriority;
  /** Timestamp when this message was queued. */
  queuedAt: number;
}

interface ActiveLine {
  element: HTMLDivElement;
  /** Time remaining before this line starts fading out. */
  holdTime: number;
  /** Whether fade-out has started. */
  exiting: boolean;
}

const MAX_VISIBLE = 3;
const HOLD_SECONDS = 4;
const FADE_IN_MS = 300;
const FADE_OUT_MS = 400;
/** Minimum seconds between any two messages. */
const MIN_INTERVAL = 2.5;
/** Per-category cooldowns in seconds. */
const CATEGORY_COOLDOWNS: Record<string, number> = {
  outpost: 30,
  raider: 20,
  objective: 25,
  water: 15,
  weather: 40,
  speed: 18,
  damage: 8,
  checkpoint: 5,
  discovery: 20,
  idle: 20,
};

export class RadioLog {
  readonly #container: HTMLElement;
  readonly #queue: QueuedMessage[] = [];
  readonly #activeLines: ActiveLine[] = [];
  readonly #categoryCooldowns = new Map<string, number>();
  #timeSinceLastMessage = 0;
  #idleTimer = 0;
  #visible = false;

  constructor(container: HTMLElement) {
    this.#container = container;
  }

  /**
   * Push a message into the queue.
   * @param text - The radio transmission text.
   * @param category - Cooldown category (e.g. 'outpost', 'raider').
   * @param priority - Visual priority level.
   */
  push(text: string, category: string, priority: RadioPriority = 'info'): void {
    // Check category cooldown
    const cooldown = this.#categoryCooldowns.get(category) ?? 0;
    if (cooldown > 0) return;

    // Don't queue duplicates
    if (this.#queue.some((m) => m.text === text)) return;

    this.#queue.push({ text, priority, queuedAt: performance.now() });
    this.#categoryCooldowns.set(category, CATEGORY_COOLDOWNS[category] ?? 10);
    this.#idleTimer = 0;
  }

  /** Per-frame update. */
  update(dt: number): void {
    // Tick cooldowns
    for (const [cat, remaining] of this.#categoryCooldowns) {
      const next = remaining - dt;
      if (next <= 0) {
        this.#categoryCooldowns.delete(cat);
      } else {
        this.#categoryCooldowns.set(cat, next);
      }
    }

    this.#timeSinceLastMessage += dt;
    this.#idleTimer += dt;

    // Update active lines
    for (let i = this.#activeLines.length - 1; i >= 0; i -= 1) {
      const line = this.#activeLines[i];
      if (!line) continue;

      if (!line.exiting) {
        line.holdTime -= dt;
        if (line.holdTime <= 0) {
          line.exiting = true;
          line.element.classList.add('radio-line--exit');
          // Remove from DOM after fade
          setTimeout(() => {
            line.element.remove();
            const idx = this.#activeLines.indexOf(line);
            if (idx !== -1) this.#activeLines.splice(idx, 1);
          }, FADE_OUT_MS);
        }
      }
    }

    // Pop from queue if ready
    if (
      this.#queue.length > 0
      && this.#timeSinceLastMessage >= MIN_INTERVAL
      && this.#activeLines.filter((l) => !l.exiting).length < MAX_VISIBLE
    ) {
      const msg = this.#queue.shift();
      if (msg) {
        this.#spawnLine(msg);
        this.#timeSinceLastMessage = 0;
      }
    }
  }

  /** Show/hide the log container. */
  setVisible(visible: boolean): void {
    if (this.#visible === visible) return;
    this.#visible = visible;
    this.#container.style.opacity = visible ? '1' : '0';
  }

  /** How long since any message was shown — useful for idle triggers. */
  get idleTime(): number {
    return this.#idleTimer;
  }

  /** Clear all messages and reset state. */
  clear(): void {
    this.#queue.length = 0;
    for (const line of this.#activeLines) {
      line.element.remove();
    }
    this.#activeLines.length = 0;
    this.#categoryCooldowns.clear();
    this.#timeSinceLastMessage = 0;
    this.#idleTimer = 0;
  }

  #spawnLine(msg: QueuedMessage): void {
    // If at max, force-exit the oldest
    const nonExiting = this.#activeLines.filter((l) => !l.exiting);
    if (nonExiting.length >= MAX_VISIBLE && nonExiting[0]) {
      const oldest = nonExiting[0];
      oldest.exiting = true;
      oldest.element.classList.add('radio-line--exit');
      setTimeout(() => {
        oldest.element.remove();
        const idx = this.#activeLines.indexOf(oldest);
        if (idx !== -1) this.#activeLines.splice(idx, 1);
      }, FADE_OUT_MS);
    }

    const el = document.createElement('div');
    el.className = `radio-line radio-line--${msg.priority}`;
    el.textContent = msg.text;

    this.#container.appendChild(el);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
      el.classList.add('radio-line--visible');
    });

    this.#activeLines.push({
      element: el,
      holdTime: HOLD_SECONDS,
      exiting: false,
    });
  }
}
