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
export const TERRITORY_GRID_WIDTH =
  TERRITORY_COLS * TERRITORY_CELL_SIZE;
export const TERRITORY_GRID_DEPTH =
  TERRITORY_ROWS * TERRITORY_CELL_SIZE;

const GRID_MIN_X = -TERRITORY_GRID_WIDTH / 2;
const GRID_MIN_Z = -TERRITORY_GRID_DEPTH / 2;
const EXPANSION_DURATION_SECONDS = 1.0;
const INITIAL_RADIUS = 2.55;
const VISUAL_JITTER = 0.24;

export class TerritoryState {
  public readonly cells: TerritoryCell[] = [];
  public readonly nations = NATIONS;
  public readonly playerNation: NationId = PLAYER_NATION_ID;
  public readonly capitalCellIds = new Map<NationId, number>();

  public selectedCellId: number | null = null;
  public expansion: ExpansionState | null = null;
  public version = 0;

  private readonly aiElapsed = new Map<NationId, number>();
  private readonly aiIntervals = new Map<NationId, number>();

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

    let aiIndex = 0;

    for (const nation of this.nations) {
      const capital = this.cellAt(nation.capitalCol, nation.capitalRow);

      if (!capital) {
        throw new Error(`Failed to place capital for ${nation.name}.`);
      }

      this.capitalCellIds.set(nation.id, capital.id);
      this.claimInitialBlob(nation);

      if (!nation.isPlayer) {
        this.aiElapsed.set(nation.id, aiIndex * 0.42);
        this.aiIntervals.set(nation.id, 1.75 + aiIndex * 0.17);
        aiIndex += 1;
      }
    }

    this.version += 1;
  }

  public update(deltaSeconds: number): boolean {
    const safeDelta = Math.max(0, Math.min(deltaSeconds, 0.1));
    const playerCompleted = this.updatePlayerExpansion(safeDelta);
    this.updateAiExpansion(safeDelta);
    return playerCompleted;
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
      return `${this.nation(cell.owner).name} territory · war unlocks later`;
    }

    if (this.expansion) {
      return "Expansion already in progress";
    }

    if (!this.isFrontierFor(cell, this.playerNation)) {
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
      z > WORLD_DEPTH / 2 ||
      x < GRID_MIN_X ||
      x >= GRID_MIN_X + TERRITORY_GRID_WIDTH ||
      z < GRID_MIN_Z ||
      z >= GRID_MIN_Z + TERRITORY_GRID_DEPTH
    ) {
      return null;
    }

    const approximateCol = Math.floor(
      (x - GRID_MIN_X) / TERRITORY_CELL_SIZE,
    );
    const approximateRow = Math.floor(
      (z - GRID_MIN_Z) / TERRITORY_CELL_SIZE,
    );

    let best: TerritoryCell | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const candidate = this.cellAt(
          approximateCol + colOffset,
          approximateRow + rowOffset,
        );
        if (!candidate) continue;

        const center = this.cellCenter(candidate);
        const distance =
          (center.x - x) * (center.x - x) +
          (center.z - z) * (center.z - z);

        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }

    return best;
  }

  public cellCenter(cell: TerritoryCell): { x: number; z: number } {
    const jitter = visualOffset(cell.col, cell.row);

    return {
      x:
        GRID_MIN_X +
        (cell.col + 0.5 + jitter.x * VISUAL_JITTER) *
          TERRITORY_CELL_SIZE,
      z:
        GRID_MIN_Z +
        (cell.row + 0.5 + jitter.z * VISUAL_JITTER) *
          TERRITORY_CELL_SIZE,
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
    return this.isFrontierFor(cell, this.playerNation);
  }

  public frontierCells(): TerritoryCell[] {
    return this.frontierCellsFor(this.playerNation);
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

  private updatePlayerExpansion(deltaSeconds: number): boolean {
    const expansion = this.expansion;
    if (!expansion) return false;

    expansion.elapsed += deltaSeconds;
    if (expansion.elapsed < expansion.duration) return false;

    const target = this.cells[expansion.targetId];

    if (
      target &&
      target.owner === null &&
      this.isFrontierFor(target, this.playerNation)
    ) {
      target.owner = this.playerNation;
      this.version += 1;
    }

    this.expansion = null;
    return true;
  }

  private updateAiExpansion(deltaSeconds: number): void {
    for (const nation of this.nations) {
      if (nation.isPlayer) continue;

      const interval = this.aiIntervals.get(nation.id) ?? 2;
      const elapsed = (this.aiElapsed.get(nation.id) ?? 0) + deltaSeconds;

      if (elapsed < interval) {
        this.aiElapsed.set(nation.id, elapsed);
        continue;
      }

      this.aiElapsed.set(nation.id, elapsed - interval);
      this.expandAiNation(nation);
    }
  }

  private expandAiNation(nation: NationDefinition): void {
    const frontier = this.frontierCellsFor(nation.id);
    if (frontier.length === 0) return;

    const capital = this.capitalCell(nation.id);
    if (!capital) return;

    const capitalCenter = this.cellCenter(capital);
    let best: TerritoryCell | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const cell of frontier) {
      const center = this.cellCenter(cell);
      const distanceFromCapital = Math.hypot(
        center.x - capitalCenter.x,
        center.z - capitalCenter.z,
      );
      const centrality =
        1 -
        Math.min(
          1,
          Math.hypot(center.x, center.z) /
            Math.hypot(WORLD_WIDTH / 2, WORLD_DEPTH / 2),
        );
      const noise =
        hash3(cell.id, this.version, nation.capitalCol + nation.capitalRow) *
        90;

      const score =
        distanceFromCapital * 0.035 +
        centrality * 85 +
        noise;

      if (score > bestScore) {
        best = cell;
        bestScore = score;
      }
    }

    if (best && best.owner === null) {
      best.owner = nation.id;
      this.version += 1;
    }
  }

  private isFrontierFor(
    cell: TerritoryCell,
    nationId: NationId,
  ): boolean {
    if (cell.owner !== null) return false;

    return this.neighbors(cell).some(
      (neighbor) => neighbor.owner === nationId,
    );
  }

  private frontierCellsFor(nationId: NationId): TerritoryCell[] {
    return this.cells.filter((cell) =>
      this.isFrontierFor(cell, nationId),
    );
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

function visualOffset(
  col: number,
  row: number,
): { x: number; z: number } {
  return {
    x: hash2(col * 3 + 17, row * 5 + 29) * 2 - 1,
    z: hash2(col * 7 + 41, row * 11 + 13) * 2 - 1,
  };
}

function hash2(x: number, y: number): number {
  let value = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2f);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

function hash3(x: number, y: number, z: number): number {
  let value = Math.imul(x ^ 0x85ebca6b, 0xc2b2ae35);
  value ^= Math.imul(y ^ 0x27d4eb2f, 0x165667b1);
  value ^= Math.imul(z ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}
