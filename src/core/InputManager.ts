export type InputSource = 'keyboard' | 'gamepad';

export interface InputDebugState {
  activeSource: InputSource;
  gamepadConnected: boolean;
  gamepadLabel: string | null;
  throttle: number;
  steering: number;
  brake: boolean;
  boost: boolean;
}

interface GamepadStateSnapshot {
  throttle: number;
  steering: number;
  brake: boolean;
  boost: boolean;
  activity: number;
  connected: boolean;
  label: string | null;
}

const GAMEPAD_AXIS_DEADZONE = 0.16;
const GAMEPAD_TRIGGER_DEADZONE = 0.08;

export class InputManager {
  readonly #keys = new Set<string>();
  readonly #pressedThisFrame = new Set<string>();
  readonly #queuedPresses = new Set<string>();
  readonly #preventedKeys = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Enter',
    'Escape',
    'Space',
    'KeyF',
    'KeyM',
    'Backquote',
    'BracketLeft',
    'BracketRight',
  ]);
  readonly #gamepadButtonStates = new Map<string, boolean>();
  #throttle = 0;
  #steering = 0;
  #brake = false;
  #boost = false;
  #lastSource: InputSource = 'keyboard';
  #gamepadConnected = false;
  #gamepadLabel: string | null = null;

  constructor(_interactiveElement: HTMLElement) {
    window.addEventListener('keydown', this.#handleKeydown, { passive: false });
    window.addEventListener('keyup', this.#handleKeyup, { passive: false });
    window.addEventListener('blur', this.#clearState);
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#handleKeydown);
    window.removeEventListener('keyup', this.#handleKeyup);
    window.removeEventListener('blur', this.#clearState);
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    this.#clearState();
  }

  update(): void {
    this.#pressedThisFrame.clear();
    for (const code of this.#queuedPresses) {
      this.#pressedThisFrame.add(code);
    }
    this.#queuedPresses.clear();

    const keyboardThrottle = this.#readKeyboardThrottle();
    const keyboardSteering = this.#readKeyboardSteering();
    const keyboardBrake =
      this.isDown('ShiftLeft') || this.isDown('ShiftRight');
    const keyboardBoost = this.isDown('Space');
    const keyboardActivity = Math.max(
      Math.abs(keyboardThrottle),
      Math.abs(keyboardSteering),
      keyboardBrake ? 1 : 0,
      keyboardBoost ? 1 : 0,
    );

    const gamepad = this.#readGamepadState();
    this.#gamepadConnected = gamepad.connected;
    this.#gamepadLabel = gamepad.label;

    this.#throttle =
      Math.abs(keyboardThrottle) >= Math.abs(gamepad.throttle)
        ? keyboardThrottle
        : gamepad.throttle;
    this.#steering =
      Math.abs(keyboardSteering) >= Math.abs(gamepad.steering)
        ? keyboardSteering
        : gamepad.steering;
    this.#brake = keyboardBrake || gamepad.brake;
    this.#boost = keyboardBoost || gamepad.boost;

    if (keyboardActivity > 0.08) {
      this.#lastSource = 'keyboard';
    } else if (gamepad.activity > 0.08) {
      this.#lastSource = 'gamepad';
    }
  }

  get throttle(): number {
    return this.#throttle;
  }

  get steering(): number {
    return this.#steering;
  }

  get brake(): boolean {
    return this.#brake;
  }

  get boost(): boolean {
    return this.#boost;
  }

  get activeSource(): InputSource {
    return this.#gamepadConnected && this.#lastSource === 'gamepad'
      ? 'gamepad'
      : 'keyboard';
  }

  get activeSourceLabel(): string {
    return this.activeSource === 'gamepad' ? 'Gamepad' : 'Keyboard';
  }

  getDebugState(): InputDebugState {
    return {
      activeSource: this.activeSource,
      gamepadConnected: this.#gamepadConnected,
      gamepadLabel: this.#gamepadLabel,
      throttle: Number(this.#throttle.toFixed(2)),
      steering: Number(this.#steering.toFixed(2)),
      brake: this.#brake,
      boost: this.#boost,
    };
  }

  consumeStartAction(): boolean {
    return this.#consumePressed('Enter') || this.#consumePressed('GamepadStart');
  }

  consumeReset(): boolean {
    return this.#consumePressed('KeyR');
  }

  consumePauseToggle(): boolean {
    return this.#consumePressed('Escape') || this.#consumePressed('GamepadPause');
  }

  consumeFullscreenToggle(): boolean {
    return this.#consumePressed('KeyF');
  }

  consumeMapToggle(): boolean {
    return this.#consumePressed('KeyM');
  }

  consumeDebugToggle(): boolean {
    return this.#consumePressed('Backquote');
  }

  consumeRenderDebugPrevious(): boolean {
    return this.#consumePressed('BracketLeft');
  }

  consumeRenderDebugNext(): boolean {
    return this.#consumePressed('BracketRight');
  }

  isDown(code: string): boolean {
    return this.#keys.has(code);
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    if (!event.repeat && !this.#keys.has(event.code)) {
      this.#queuedPresses.add(event.code);
    }
    this.#keys.add(event.code);

    if (!event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
      this.#lastSource = 'keyboard';
    }

    if (this.#preventedKeys.has(event.code)) {
      event.preventDefault();
    }
  };

  #handleKeyup = (event: KeyboardEvent): void => {
    this.#keys.delete(event.code);
    if (this.#preventedKeys.has(event.code)) {
      event.preventDefault();
    }
  };

  #handleVisibilityChange = (): void => {
    if (!document.hidden) return;
    this.#clearState();
  };

  #clearState = (): void => {
    this.#keys.clear();
    this.#pressedThisFrame.clear();
    this.#queuedPresses.clear();
    this.#gamepadButtonStates.clear();
    this.#throttle = 0;
    this.#steering = 0;
    this.#brake = false;
    this.#boost = false;
  };

  #readKeyboardThrottle(): number {
    const accelerating = this.isDown('KeyW') || this.isDown('ArrowUp');
    const reversing = this.isDown('KeyS') || this.isDown('ArrowDown');
    if (accelerating === reversing) return 0;
    return accelerating ? 1 : -1;
  }

  #readKeyboardSteering(): number {
    const steeringLeft = this.isDown('KeyA') || this.isDown('ArrowLeft');
    const steeringRight = this.isDown('KeyD') || this.isDown('ArrowRight');
    if (steeringLeft === steeringRight) return 0;
    return steeringLeft ? -1 : 1;
  }

  #readGamepadState(): GamepadStateSnapshot {
    const pads = navigator.getGamepads?.() ?? [];
    const gamepad = Array.from(pads).find(
      (pad): pad is Gamepad => Boolean(pad && pad.connected),
    );

    if (!gamepad) {
      this.#resetGamepadButtons();
      return {
        throttle: 0,
        steering: 0,
        brake: false,
        boost: false,
        activity: 0,
        connected: false,
        label: null,
      };
    }

    const stickX = this.#withDeadzone(gamepad.axes[0] ?? 0, GAMEPAD_AXIS_DEADZONE);
    const stickY = this.#withDeadzone(-(gamepad.axes[1] ?? 0), GAMEPAD_AXIS_DEADZONE);
    const dpadLeft = this.#buttonPressed(gamepad.buttons[14]) ? 1 : 0;
    const dpadRight = this.#buttonPressed(gamepad.buttons[15]) ? 1 : 0;
    const dpadUp = this.#buttonPressed(gamepad.buttons[12]) ? 1 : 0;
    const dpadDown = this.#buttonPressed(gamepad.buttons[13]) ? 1 : 0;
    const triggerRight = this.#triggerValue(gamepad.buttons[7]);
    const triggerLeft = this.#triggerValue(gamepad.buttons[6]);
    const boostButton = this.#buttonPressed(gamepad.buttons[0])
      || this.#buttonPressed(gamepad.buttons[5]);
    const handbrakeButton = this.#buttonPressed(gamepad.buttons[1]);

    const accelerate = Math.max(triggerRight, Math.max(stickY, 0), dpadUp);
    const reverse = Math.max(triggerLeft, Math.max(-stickY, 0), dpadDown);
    const throttle =
      Math.abs(accelerate - reverse) < 0.02
        ? 0
        : accelerate > reverse
          ? accelerate
          : -reverse;
    const steering = Math.max(
      -1,
      Math.min(1, stickX + dpadRight - dpadLeft),
    );
    const brake = triggerLeft > 0.22 || handbrakeButton;
    const boost = boostButton;

    this.#registerGamepadPress(
      'GamepadStart',
      this.#buttonPressed(gamepad.buttons[9]) || this.#buttonPressed(gamepad.buttons[0]),
    );
    this.#registerGamepadPress(
      'GamepadPause',
      this.#buttonPressed(gamepad.buttons[9]),
    );
    this.#registerGamepadPress('KeyM', this.#buttonPressed(gamepad.buttons[3]));
    this.#registerGamepadPress('KeyR', this.#buttonPressed(gamepad.buttons[2]));

    const activity = Math.max(
      Math.abs(throttle),
      Math.abs(steering),
      brake ? 1 : 0,
      boost ? 1 : 0,
      this.#buttonPressed(gamepad.buttons[2]) ? 1 : 0,
      this.#buttonPressed(gamepad.buttons[3]) ? 1 : 0,
      this.#buttonPressed(gamepad.buttons[9]) ? 1 : 0,
    );

    return {
      throttle,
      steering,
      brake,
      boost,
      activity,
      connected: true,
      label: gamepad.id || 'Gamepad',
    };
  }

  #registerGamepadPress(code: string, pressed: boolean): void {
    const wasPressed = this.#gamepadButtonStates.get(code) ?? false;
    if (pressed && !wasPressed) {
      this.#pressedThisFrame.add(code);
    }
    this.#gamepadButtonStates.set(code, pressed);
  }

  #resetGamepadButtons(): void {
    for (const code of this.#gamepadButtonStates.keys()) {
      this.#gamepadButtonStates.set(code, false);
    }
  }

  #buttonPressed(button: GamepadButton | undefined): boolean {
    return Boolean(button?.pressed || (button?.value ?? 0) > 0.5);
  }

  #triggerValue(button: GamepadButton | undefined): number {
    const value = button?.value ?? 0;
    return value > GAMEPAD_TRIGGER_DEADZONE ? Number(value.toFixed(3)) : 0;
  }

  #withDeadzone(value: number, deadzone: number): number {
    const magnitude = Math.abs(value);
    if (magnitude <= deadzone) return 0;
    const normalized = (magnitude - deadzone) / (1 - deadzone);
    return Number((Math.sign(value) * normalized).toFixed(3));
  }

  #consumePressed(code: string): boolean {
    if (!this.#pressedThisFrame.has(code)) return false;
    this.#pressedThisFrame.delete(code);
    return true;
  }
}
