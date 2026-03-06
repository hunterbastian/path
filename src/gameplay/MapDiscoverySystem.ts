export interface MapDiscoveryConfig {
  worldSize: number;
  columns: number;
  rows: number;
  revealRadius: number;
  startRevealRadius: number;
}

export class MapDiscoverySystem {
  readonly #worldSize: number;
  readonly #columns: number;
  readonly #rows: number;
  readonly #revealRadius: number;
  readonly #startRevealRadius: number;
  readonly #cells: Uint8Array;

  constructor(config: MapDiscoveryConfig) {
    this.#worldSize = config.worldSize;
    this.#columns = config.columns;
    this.#rows = config.rows;
    this.#revealRadius = config.revealRadius;
    this.#startRevealRadius = config.startRevealRadius;
    this.#cells = new Uint8Array(this.#columns * this.#rows);
  }

  get columns(): number {
    return this.#columns;
  }

  get rows(): number {
    return this.#rows;
  }

  get cells(): Uint8Array {
    return this.#cells;
  }

  reset(x: number, z: number): void {
    this.#cells.fill(0);
    this.reveal(x, z, this.#startRevealRadius);
  }

  reveal(x: number, z: number, radius = this.#revealRadius): void {
    const halfWorld = this.#worldSize * 0.5;
    const cellWidth = this.#worldSize / this.#columns;
    const cellHeight = this.#worldSize / this.#rows;
    const minColumn = Math.max(
      0,
      Math.floor(((x - radius) + halfWorld) / cellWidth),
    );
    const maxColumn = Math.min(
      this.#columns - 1,
      Math.ceil(((x + radius) + halfWorld) / cellWidth),
    );
    const minRow = Math.max(
      0,
      Math.floor(((z - radius) + halfWorld) / cellHeight),
    );
    const maxRow = Math.min(
      this.#rows - 1,
      Math.ceil(((z + radius) + halfWorld) / cellHeight),
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const cellCenterX = -halfWorld + (column + 0.5) * cellWidth;
        const cellCenterZ = -halfWorld + (row + 0.5) * cellHeight;
        if (Math.hypot(cellCenterX - x, cellCenterZ - z) <= radius) {
          this.#cells[row * this.#columns + column] = 1;
        }
      }
    }
  }

  getRatio(): number {
    let discovered = 0;
    for (const value of this.#cells) {
      discovered += value;
    }
    return discovered / this.#cells.length;
  }

  getPercent(): number {
    return Number((this.getRatio() * 100).toFixed(1));
  }
}
