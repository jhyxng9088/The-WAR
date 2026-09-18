import { WORLD_DEPTH, WORLD_WIDTH } from "../world/WorldField";

export type NationId = "player";

export interface TerritoryCell {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  owner: NationId | null;
}

export interface ExpansionState {
  readonly targetId: number;
  elapsed: number;
  readonly duration: number;
}

export const TERRITORY_COLS = 40;
export const TERRITORY_ROWS = 28;
export const TERRITORY_CELL_SIZE = 130;

const GRID_WIDTH = TERRITORY_COLS * TERRITORY_CELL_SIZE;
const GRID_DEPTH = TERRITORY_ROWS * TERRITORY_CELL_SIZE;
const GRID_MIN_X = -GRID_WIDTH / 2;
const GRID_MIN_Z = -GRID_DEPTH / 2;
const EXPANSION_DURATION_SECONDS = 1.15;

export class TerritoryState {
  public readonly cells: TerritoryCell[] = [];
  public readonly playerNation: NationId = "player";
  public readonly capitalCellId: number;

  public selectedCellId: number | null = null;
  public expansion: ExpansionState | null = null;
  public version = 0;

  public constructor() {
    for (let row = 0; row < TERRITORY_ROWS; row += 1) {
      for (let col = 0; col < TERRITORY_COLS; col += 1) {
        this.cells.push({
          id: row * TERRITORY_COLS + col,
          col,
          row,
          owner: null,
        });
      }
    }

    const capital = this.cellAt(10, Math.floor(TERRITORY_ROWS / 2));
    if (!capital) {
      throw new Error("Failed to create Stage 2 capital cell.");
    }

    this.capitalCellId = capital.id;
    this.claimInitialArea(capital.col, capital.row);
  }

  public update(deltaSeconds: number): boolean {
    const expansion = this.expansion;
    if (!expansion) return false;

    expansion.elapsed += Math.max(0, deltaSeconds);
    if (expansion.elapsed < expansion.duration) return false;

    const target = this.cells[expansion.targetId];
    if (target && target.owner === null && this.isAdjacentToPlayer(target)) {
      target.owner = this.playerNation;
      this.version += 1;
    }

    this.expansion = null;
    return true;
  }

  public tapWorld(x: number, z: number): string {
    const cell = this.cellFromWorld(x, z);

    if (!cell) {
      this.selectedCellId = null;
      return "Outside playable territory";
    }

    this.selectedCellId = cell.id;

    if (cell.owner === this.playerNation) {
      return cell.id === this.capitalCellId
        ? "Capital · owned territory"
        : "Owned territory";
    }

    if (this.expansion) {
      return "Expansion already in progress";
    }

    if (!this.isAdjacentToPlayer(cell)) {
      return "Neutral land · expand from an adjacent border";
    }

    this.expansion = {
      targetId: cell.id,
      elapsed: 0,
      duration: EXPANSION_DURATION_SECONDS,
    };
    return "Expanding into neutral territory…";
  }

  public expansionProgress(): number {
    if (!this.expansion) return 0;
    return Math.min(1, this.expansion.elapsed / this.expansion.duration);
  }

  public cellFromWorld(x: number, z: number): TerritoryCell | null {
    if (
      x < -WORLD_WIDTH / 2 ||
      x > WORLD_WIDTH / 2 ||
      z < -WORLD_DEPTH / 2 ||
      z > WORLD_DEPTH / 2
    ) {
      return null;
    }

    const col = Math.floor((x - GRID_MIN_X) / TERRITORY_CELL_SIZE);
    const row = Math.floor((z - GRID_MIN_Z) / TERRITORY_CELL_SIZE);
    return this.cellAt(col, row);
  }

  public cellCenter(cell: TerritoryCell): { x: number; z: number } {
    return {
      x: GRID_MIN_X + (cell.col + 0.5) * TERRITORY_CELL_SIZE,
      z: GRID_MIN_Z + (cell.row + 0.5) * TERRITORY_CELL_SIZE,
    };
  }

  public selectedCell(): TerritoryCell | null {
    if (this.selectedCellId === null) return null;
    return this.cells[this.selectedCellId] ?? null;
  }

  public expansionCell(): TerritoryCell | null {
    if (!this.expansion) return null;
    return this.cells[this.expansion.targetId] ?? null;
  }

  public neighbors(cell: TerritoryCell): TerritoryCell[] {
    return [
      this.cellAt(cell.col - 1, cell.row),
      this.cellAt(cell.col + 1, cell.row),
      this.cellAt(cell.col, cell.row - 1),
      this.cellAt(cell.col, cell.row + 1),
    ].filter((candidate): candidate is TerritoryCell => candidate !== null);
  }

  private cellAt(col: number, row: number): TerritoryCell | null {
    if (
      col < 0 ||
      col >= TERRITORY_COLS ||
      row < 0 ||
      row >= TERRITORY_ROWS
    ) {
      return null;
    }

    return this.cells[row * TERRITORY_COLS + col] ?? null;
  }

  private isAdjacentToPlayer(cell: TerritoryCell): boolean {
    return this.neighbors(cell).some(
      (neighbor) => neighbor.owner === this.playerNation,
    );
  }

  private claimInitialArea(capitalCol: number, capitalRow: number): void {
    const offsets = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const;

    for (const [colOffset, rowOffset] of offsets) {
      const cell = this.cellAt(
        capitalCol + colOffset,
        capitalRow + rowOffset,
      );
      if (cell) cell.owner = this.playerNation;
    }

    this.version += 1;
  }
}
