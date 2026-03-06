export class InputManager {
  readonly #keys = new Set<string>();
  readonly #pressedThisFrame = new Set<string>();
  readonly #preventedKeys = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'KeyF',
    'KeyM',
  ]);

  constructor(_interactiveElement: HTMLElement) {
    window.addEventListener('keydown', this.#handleKeydown, { passive: false });
    window.addEventListener('keyup', this.#handleKeyup, { passive: false });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#handleKeydown);
    window.removeEventListener('keyup', this.#handleKeyup);
    this.#keys.clear();
    this.#pressedThisFrame.clear();
  }

  get throttle(): number {
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) return 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) return -1;
    return 0;
  }

  get steering(): number {
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) return 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) return -1;
    return 0;
  }

  get brake(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  get boost(): boolean {
    return this.isDown('Space');
  }

  consumeReset(): boolean {
    return this.#consumePressed('KeyR');
  }

  consumeFullscreenToggle(): boolean {
    return this.#consumePressed('KeyF');
  }

  consumeMapToggle(): boolean {
    return this.#consumePressed('KeyM');
  }

  isDown(code: string): boolean {
    return this.#keys.has(code);
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    if (!event.repeat && !this.#keys.has(event.code)) {
      this.#pressedThisFrame.add(event.code);
    }
    this.#keys.add(event.code);

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

  #consumePressed(code: string): boolean {
    if (!this.#pressedThisFrame.has(code)) return false;
    this.#pressedThisFrame.delete(code);
    return true;
  }
}
