import { WORLD_DEPTH, WORLD_WIDTH } from "../world/WorldField";
import {
  NATIONS,
  PLAYER_NATION_ID,
  nationById,
  type NationDefinition,
  type NationId,
} from "./NationCatalog";
import {
  RegionIndex,
  type RegionDefinition,
} from "./RegionIndex";

export interface TerritoryCell {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  owner: NationId | null;
}

export interface ExpansionState {
  readonly targetIds: readonly number[];
  readonly regionId: number;
  readonly cost: number;
  elapsed: number;
  readonly duration: number;
}

export interface RegionControlSummary {
  readonly region: RegionDefinition;
  readonly leadingNation: NationId | null;
  readonly leadingShare: number;
  readonly neutralCells: number;
  readonly contested: boolean;
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
const EXPANSION_BASE_DURATION_SECONDS = 1.05;
const EXPANSION_EXTRA_CELL_SECONDS = 0.12;
const CLAIM_OPERATION_CELL_LIMIT = 4;
const FRONTIER_CAPACITY_MAX = 100;
const FRONTIER_CAPACITY_REGEN_PER_SECOND = 8;
const CLAIM_OPERATION_BASE_COST = 24;
const CLAIM_OPERATION_CELL_COST = 3;
const REGION_SECURE_THRESHOLD = 0.82;
const INITIAL_RADIUS = 3.15;
const VISUAL_JITTER = 0.21;
const EDGE_BEND = 0.16;

export class TerritoryState {
  public readonly cells: TerritoryCell[] = [];
  public readonly nations = NATIONS;
  public readonly playerNation: NationId = PLAYER_NATION_ID;
  public readonly capitalCellIds = new Map<NationId, number>();
  public readonly regionIndex = new RegionIndex(
    TERRITORY_COLS,
    TERRITORY_ROWS,
  );

  public selectedCellId: number | null = null;
  public expansion: ExpansionState | null = null;
  public frontierCapacity = FRONTIER_CAPACITY_MAX;
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
        this.aiIntervals.set(nation.id, 2.35 + aiIndex * 0.22);
        aiIndex += 1;
      }
    }

    this.version += 1;
  }

  public update(deltaSeconds: number): boolean {
    const safeDelta = Math.max(0, Math.min(deltaSeconds, 0.1));

    this.frontierCapacity = Math.min(
      FRONTIER_CAPACITY_MAX,
      this.frontierCapacity +
        safeDelta * FRONTIER_CAPACITY_REGEN_PER_SECOND,
    );

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

    const operation = this.buildClaimOperation(cell);
    const cost =
      CLAIM_OPERATION_BASE_COST +
      operation.length * CLAIM_OPERATION_CELL_COST;

    if (this.frontierCapacity + 0.001 < cost) {
      return (
        "Frontier capacity recovering · " +
        Math.round(this.frontierCapacity) +
        "%"
      );
    }

    const region = this.regionForCell(cell);
    this.frontierCapacity -= cost;
    this.expansion = {
      targetIds: operation.map((target) => target.id),
      regionId: region.id,
      cost,
      elapsed: 0,
      duration:
        EXPANSION_BASE_DURATION_SECONDS +
        Math.max(0, operation.length - 1) *
          EXPANSION_EXTRA_CELL_SECONDS,
    };

    return (
      "Claim operation · Region " +
      region.label +
      " · " +
      operation.length +
      " frontier cells"
    );
  }

  public expansionProgress(): number {
    if (!this.expansion) return 0;
    return Math.min(1, this.expansion.elapsed / this.expansion.duration);
  }

  public frontierCapacityPercent(): number {
    return Math.round(
      (this.frontierCapacity / FRONTIER_CAPACITY_MAX) * 100,
    );
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

    let nearest: TerritoryCell | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const candidate = this.cellAt(
          approximateCol + colOffset,
          approximateRow + rowOffset,
        );
        if (!candidate) continue;

        const polygon = this.cellPolygon(candidate);
        if (pointInPolygon(x, z, polygon)) return candidate;

        const center = this.cellCenter(candidate);
        const distance =
          (center.x - x) * (center.x - x) +
          (center.z - z) * (center.z - z);

        if (distance < nearestDistance) {
          nearest = candidate;
          nearestDistance = distance;
        }
      }
    }

    return nearest;
  }

  public cellCenter(cell: TerritoryCell): { x: number; z: number } {
    const polygon = this.cellPolygon(cell);
    let x = 0;
    let z = 0;

    for (const point of polygon) {
      x += point.x;
      z += point.z;
    }

    return {
      x: x / polygon.length,
      z: z / polygon.length,
    };
  }

  public cellPolygon(
    cell: TerritoryCell,
  ): readonly { x: number; z: number }[] {
    const topLeft = gridVertex(cell.col, cell.row);
    const topRight = gridVertex(cell.col + 1, cell.row);
    const bottomRight = gridVertex(cell.col + 1, cell.row + 1);
    const bottomLeft = gridVertex(cell.col, cell.row + 1);

    return [
      topLeft,
      horizontalMidpoint(cell.col, cell.row, topLeft, topRight),
      topRight,
      verticalMidpoint(cell.col + 1, cell.row, topRight, bottomRight),
      bottomRight,
      horizontalMidpoint(
        cell.col,
        cell.row + 1,
        bottomLeft,
        bottomRight,
      ),
      bottomLeft,
      verticalMidpoint(cell.col, cell.row, topLeft, bottomLeft),
    ];
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

  public expansionCells(): TerritoryCell[] {
    if (!this.expansion) return [];

    return this.expansion.targetIds
      .map((id) => this.cells[id])
      .filter((cell): cell is TerritoryCell => cell !== undefined);
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

  public regionForCell(cell: TerritoryCell): RegionDefinition {
    return this.regionIndex.regionForCell(cell);
  }

  public regionControl(regionId: number): RegionControlSummary {
    const region = this.regionIndex.regionById(regionId);
    const counts = new Map<NationId, number>();
    let neutralCells = 0;

    for (const cellId of region.cellIds) {
      const cell = this.cells[cellId];

      if (!cell?.owner) {
        neutralCells += 1;
        continue;
      }

      counts.set(
        cell.owner,
        (counts.get(cell.owner) ?? 0) + 1,
      );
    }

    let leadingNation: NationId | null = null;
    let leadingCount = 0;
    let secondCount = 0;

    for (const [nationId, count] of counts) {
      if (count > leadingCount) {
        secondCount = leadingCount;
        leadingCount = count;
        leadingNation = nationId;
      } else if (count > secondCount) {
        secondCount = count;
      }
    }

    return {
      region,
      leadingNation,
      leadingShare: leadingCount / region.cellIds.length,
      neutralCells,
      contested:
        leadingCount > 0 &&
        secondCount > 0 &&
        leadingCount - secondCount <=
          Math.max(2, region.cellIds.length * 0.12),
    };
  }

  private updatePlayerExpansion(deltaSeconds: number): boolean {
    const expansion = this.expansion;
    if (!expansion) return false;

    expansion.elapsed += deltaSeconds;
    if (expansion.elapsed < expansion.duration) return false;

    let claimedAny = false;

    for (const targetId of expansion.targetIds) {
      const target = this.cells[targetId];

      if (
        target &&
        target.owner === null &&
        this.isFrontierFor(target, this.playerNation)
      ) {
        target.owner = this.playerNation;
        claimedAny = true;
      }
    }

    if (claimedAny) {
      this.secureRegionIfDominant(
        this.playerNation,
        expansion.regionId,
      );
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
      const sameOwnerNeighbors = this.neighbors(cell).filter(
        (neighbor) => neighbor.owner === nation.id,
      ).length;
      const neutralNeighbors = this.neighbors(cell).filter(
        (neighbor) => neighbor.owner === null,
      ).length;
      const centrality =
        1 -
        Math.min(
          1,
          Math.hypot(center.x, center.z) /
            Math.hypot(WORLD_WIDTH / 2, WORLD_DEPTH / 2),
        );
      const noise =
        hash3(
          cell.id,
          this.version,
          nation.capitalCol + nation.capitalRow,
        ) - 0.5;

      // Prefer compact blobs. One-neighbor "tentacles" are possible but
      // strongly disfavored unless no better frontier exists.
      const score =
        sameOwnerNeighbors * 155 +
        neutralNeighbors * 10 -
        distanceFromCapital * 0.072 +
        centrality * 22 +
        noise * 34;

      if (score > bestScore) {
        best = cell;
        bestScore = score;
      }
    }

    if (best && best.owner === null) {
      best.owner = nation.id;
      const region = this.regionForCell(best);
      this.secureRegionIfDominant(nation.id, region.id);
      this.version += 1;
    }
  }

  private buildClaimOperation(
    seed: TerritoryCell,
  ): TerritoryCell[] {
    const regionId = this.regionForCell(seed).id;
    const selected: TerritoryCell[] = [];
    const selectedIds = new Set<number>();
    const queuedIds = new Set<number>([seed.id]);
    const queue: TerritoryCell[] = [seed];

    while (
      queue.length > 0 &&
      selected.length < CLAIM_OPERATION_CELL_LIMIT
    ) {
      const current = queue.shift();
      if (!current || current.owner !== null) continue;
      if (this.regionForCell(current).id !== regionId) continue;

      const connectedToPlayer = this.isFrontierFor(
        current,
        this.playerNation,
      );
      const connectedToOperation = this.neighbors(current).some(
        (neighbor) => selectedIds.has(neighbor.id),
      );

      if (!connectedToPlayer && !connectedToOperation) continue;

      selected.push(current);
      selectedIds.add(current.id);

      const next = this.neighbors(current)
        .filter(
          (neighbor) =>
            neighbor.owner === null &&
            this.regionForCell(neighbor).id === regionId &&
            !queuedIds.has(neighbor.id),
        )
        .sort(
          (a, b) =>
            this.playerNeighborCount(b) -
              this.playerNeighborCount(a) ||
            a.id - b.id,
        );

      for (const neighbor of next) {
        queuedIds.add(neighbor.id);
        queue.push(neighbor);
      }
    }

    return selected.length > 0 ? selected : [seed];
  }

  private playerNeighborCount(cell: TerritoryCell): number {
    return this.neighbors(cell).filter(
      (neighbor) => neighbor.owner === this.playerNation,
    ).length;
  }

  private secureRegionIfDominant(
    nationId: NationId,
    regionId: number,
  ): void {
    const region = this.regionIndex.regionById(regionId);
    let owned = 0;
    let neutral = 0;
    let foreign = 0;

    for (const cellId of region.cellIds) {
      const cell = this.cells[cellId];
      if (!cell) continue;

      if (cell.owner === nationId) {
        owned += 1;
      } else if (cell.owner === null) {
        neutral += 1;
      } else {
        foreign += 1;
      }
    }

    if (foreign > 0 || neutral === 0) return;

    const share = owned / region.cellIds.length;
    if (share < REGION_SECURE_THRESHOLD) return;

    for (const cellId of region.cellIds) {
      const cell = this.cells[cellId];
      if (cell && cell.owner === null) {
        cell.owner = nationId;
      }
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

function gridVertex(
  col: number,
  row: number,
): { x: number; z: number } {
  const offset = visualOffset(col, row);
  const isLeftOrRight = col === 0 || col === TERRITORY_COLS;
  const isTopOrBottom = row === 0 || row === TERRITORY_ROWS;

  return {
    x:
      GRID_MIN_X +
      (col +
        (isLeftOrRight ? 0 : offset.x * VISUAL_JITTER)) *
        TERRITORY_CELL_SIZE,
    z:
      GRID_MIN_Z +
      (row +
        (isTopOrBottom ? 0 : offset.z * VISUAL_JITTER)) *
        TERRITORY_CELL_SIZE,
  };
}

function horizontalMidpoint(
  col: number,
  row: number,
  left: { x: number; z: number },
  right: { x: number; z: number },
): { x: number; z: number } {
  const bend =
    (hash2(col * 13 + 71, row * 17 + 31) * 2 - 1) *
    EDGE_BEND *
    TERRITORY_CELL_SIZE;

  return {
    x: (left.x + right.x) * 0.5,
    z: (left.z + right.z) * 0.5 + bend,
  };
}

function verticalMidpoint(
  col: number,
  row: number,
  top: { x: number; z: number },
  bottom: { x: number; z: number },
): { x: number; z: number } {
  const bend =
    (hash2(col * 19 + 43, row * 23 + 97) * 2 - 1) *
    EDGE_BEND *
    TERRITORY_CELL_SIZE;

  return {
    x: (top.x + bottom.x) * 0.5 + bend,
    z: (top.z + bottom.z) * 0.5,
  };
}

function pointInPolygon(
  x: number,
  z: number,
  polygon: readonly { x: number; z: number }[],
): boolean {
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;

    const intersects =
      currentPoint.z > z !== previousPoint.z > z &&
      x <
        ((previousPoint.x - currentPoint.x) *
          (z - currentPoint.z)) /
          (previousPoint.z - currentPoint.z) +
          currentPoint.x;

    if (intersects) inside = !inside;
  }

  return inside;
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
