import { WORLD_DEPTH, WORLD_WIDTH } from "../world/WorldField";
import {
  NATIONS,
  PLAYER_NATION_ID,
  nationById,
  type NationDefinition,
  type NationId,
} from "./NationCatalog";

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

export const TERRITORY_COLS = 80;
export const TERRITORY_ROWS = 56;
export const TERRITORY_CELL_SIZE = 65;

const GRID_WIDTH = TERRITORY_COLS * TERRITORY_CELL_SIZE;
const GRID_DEPTH = TERRITORY_ROWS * TERRITORY_CELL_SIZE;
const GRID_MIN_X = -GRID_WIDTH / 2;
const GRID_MIN_Z = -GRID_DEPTH / 2;
const EXPANSION_DURATION_SECONDS = 1.05;
const INITIAL_RADIUS = 2.55;

export class TerritoryState {
  public readonly cells: TerritoryCell[] = [];
  public readonly nations = NATIONS;
  public readonly playerNation: NationId = PLAYER_NATION_ID;
  public readonly capitalCellIds = new Map<NationId, number>();

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

    for (const nation of this.nations) {
      const capital = this.cellAt(nation.capitalCol, nation.capitalRow);

      if (!capital) {
        throw new Error(`Failed to place capital for ${nation.name}.`);
      }

      this.capitalCellIds.set(nation.id, capital.id);
      this.claimInitialBlob(nation);
    }

    this.version += 1;
  }

  public update(deltaSeconds: number): boolean {
    const expansion = this.expansion;
    if (!expansion) return false;

    expansion.elapsed += Math.max(0, deltaSeconds);
    if (expansion.elapsed < expansion.duration) return false;

    const target = this.cells[expansion.targetId];

    if (
      target &&
      target.owner === null &&
      this.isPlayerFrontier(target)
    ) {
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
      return "Outside the playable territory field";
    }

    this.selectedCellId = cell.id;

    if (cell.owner === this.playerNation) {
      return this.isCapital(cell)
        ? "Your capital · Crownland"
        : "Your territory";
    }

    if (cell.owner) {
      const nation = this.nation(cell.owner);
      return `${nation.name} territory · war unlocks later`;
    }

    if (this.expansion) {
      return "Expansion already in progress";
    }

    if (!this.isPlayerFrontier(cell)) {
      return "Neutral land · not connected to your border";
    }

    this.expansion = {
      targetId: cell.id,
      elapsed: 0,
      duration: EXPANSION_DURATION_SECONDS,
    };

    return "Claiming neutral frontier…";
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

    if (
      x < GRID_MIN_X ||
      x >= GRID_MIN_X + GRID_WIDTH ||
      z < GRID_MIN_Z ||
      z >= GRID_MIN_Z + GRID_DEPTH
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

  public cellAt(col: number, row: number): TerritoryCell | null {
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

  public isPlayerFrontier(cell: TerritoryCell): boolean {
    if (cell.owner !== null) return false;

    return this.neighbors(cell).some(
      (neighbor) => neighbor.owner === this.playerNation,
    );
  }

  public frontierCells(): TerritoryCell[] {
    return this.cells.filter((cell) => this.isPlayerFrontier(cell));
  }

  public ownedCount(nationId: NationId): number {
    let count = 0;

    for (const cell of this.cells) {
      if (cell.owner === nationId) count += 1;
    }

    return count;
  }

  public nation(id: NationId): NationDefinition {
    return nationById(id);
  }

  public capitalCell(nationId: NationId): TerritoryCell | null {
    const id = this.capitalCellIds.get(nationId);
    if (id === undefined) return null;
    return this.cells[id] ?? null;
  }

  public isCapital(cell: TerritoryCell): boolean {
    if (!cell.owner) return false;
    return this.capitalCellIds.get(cell.owner) === cell.id;
  }

  private claimInitialBlob(nation: NationDefinition): void {
    const span = 4;

    for (let rowOffset = -span; rowOffset <= span; rowOffset += 1) {
      for (let colOffset = -span; colOffset <= span; colOffset += 1) {
        const distance = Math.hypot(colOffset, rowOffset);
        const jitter =
          (hash2(
            nation.capitalCol + colOffset,
            nation.capitalRow + rowOffset,
          ) -
            0.5) *
          0.72;

        if (distance > INITIAL_RADIUS + jitter) continue;

        const cell = this.cellAt(
          nation.capitalCol + colOffset,
          nation.capitalRow + rowOffset,
        );

        if (cell && cell.owner === null) {
          cell.owner = nation.id;
        }
      }
    }

    const capital = this.cellAt(nation.capitalCol, nation.capitalRow);
    if (capital) capital.owner = nation.id;
  }
}

function hash2(x: number, y: number): number {
  let value = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2f);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}
