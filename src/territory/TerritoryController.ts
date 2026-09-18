import { NATIONS, type NationDefinition } from '../world/StrategicWorld';
import {
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  forestDensityAt,
  isLandAt,
  terrainSampleAt,
  type TerrainBiome,
} from '../world/WorldField';
import {
  AXIAL_DIRECTIONS,
  TERRITORY_HEX_SIZE,
  axialKey,
  axialToWorld,
  hexDistance,
  worldToAxial,
  type AxialCoord,
} from './TerritoryGrid';

export type TerritoryOwnerId = string | null;

export interface TerritoryCellView {
  readonly id: string;
  readonly q: number;
  readonly r: number;
  readonly x: number;
  readonly z: number;
  readonly ownerId: TerritoryOwnerId;
}

export interface ExpansionOrderView {
  readonly nationId: string;
  readonly cellId: string;
  readonly progress: number;
  readonly durationSeconds: number;
}

export interface TerritorySelectionView {
  readonly cell: TerritoryCellView;
  readonly owner: NationDefinition | null;
  readonly biome: TerrainBiome;
  readonly canExpand: boolean;
  readonly reason: string | null;
  readonly expansion: ExpansionOrderView | null;
}

interface TerritoryCellState {
  readonly id: string;
  readonly q: number;
  readonly r: number;
  readonly x: number;
  readonly z: number;
  ownerId: TerritoryOwnerId;
}

interface ExpansionOrder {
  readonly nationId: string;
  readonly cellId: string;
  readonly durationSeconds: number;
  elapsedSeconds: number;
}

const STARTING_RADIUS = 1;
const MAX_FRAME_STEP = 0.1;

export class TerritoryController {
  private readonly cells: TerritoryCellState[] = [];
  private readonly cellById = new Map<string, TerritoryCellState>();
  private readonly nationById = new Map(NATIONS.map((nation) => [nation.id, nation]));
  private readonly expansionByNation = new Map<string, ExpansionOrder>();

  private selectedCellId: string | null = null;
  private stateRevision = 1;
  private selectionRevision = 1;

  readonly activeNationId: string;

  constructor() {
    this.activeNationId = NATIONS[0]?.id ?? '';
    this.buildGrid();
    this.seedStartingTerritories();
  }

  update(deltaSeconds: number): void {
    const dt = Math.max(0, Math.min(MAX_FRAME_STEP, deltaSeconds));
    if (dt <= 0 || this.expansionByNation.size === 0) return;

    let selectionChanged = false;
    for (const [nationId, order] of [...this.expansionByNation]) {
      order.elapsedSeconds += dt;
      selectionChanged = selectionChanged || order.cellId === this.selectedCellId;

      if (order.elapsedSeconds < order.durationSeconds) continue;

      const cell = this.cellById.get(order.cellId);
      if (cell && cell.ownerId === null && this.hasOwnedNeighbor(cell, nationId)) {
        cell.ownerId = nationId;
        this.stateRevision += 1;
      }
      this.expansionByNation.delete(nationId);
      selectionChanged = selectionChanged || order.cellId === this.selectedCellId;
    }

    if (selectionChanged) this.selectionRevision += 1;
  }

  getCells(): readonly TerritoryCellView[] {
    return this.cells;
  }

  getCell(q: number, r: number): TerritoryCellView | null {
    return this.cellById.get(axialKey(q, r)) ?? null;
  }

  getNation(id: TerritoryOwnerId): NationDefinition | null {
    return id ? this.nationById.get(id) ?? null : null;
  }

  getActiveNation(): NationDefinition | null {
    return this.getNation(this.activeNationId);
  }

  getStateRevision(): number {
    return this.stateRevision;
  }

  getSelectionRevision(): number {
    return this.selectionRevision;
  }

  getSelectedCellId(): string | null {
    return this.selectedCellId;
  }

  getExpansionOrders(): readonly ExpansionOrderView[] {
    return [...this.expansionByNation.values()].map((order) => ({
      nationId: order.nationId,
      cellId: order.cellId,
      progress: Math.min(1, order.elapsedSeconds / order.durationSeconds),
      durationSeconds: order.durationSeconds,
    }));
  }

  selectWorldPosition(x: number, z: number): TerritorySelectionView | null {
    const coord = worldToAxial(x, z);
    const cell = this.cellById.get(axialKey(coord.q, coord.r)) ?? null;
    const nextId = cell?.id ?? null;
    if (nextId !== this.selectedCellId) {
      this.selectedCellId = nextId;
      this.selectionRevision += 1;
    }
    return cell ? this.selectionFor(cell) : null;
  }

  clearSelection(): void {
    if (this.selectedCellId === null) return;
    this.selectedCellId = null;
    this.selectionRevision += 1;
  }

  getSelection(): TerritorySelectionView | null {
    if (!this.selectedCellId) return null;
    const cell = this.cellById.get(this.selectedCellId);
    return cell ? this.selectionFor(cell) : null;
  }

  requestSelectedExpansion(): boolean {
    if (!this.selectedCellId) return false;
    return this.requestExpansion(this.selectedCellId, this.activeNationId);
  }

  requestExpansion(cellId: string, nationId: string): boolean {
    const cell = this.cellById.get(cellId);
    if (!cell || cell.ownerId !== null) return false;
    if (!this.nationById.has(nationId)) return false;
    if (this.expansionByNation.has(nationId)) return false;
    if (!this.hasOwnedNeighbor(cell, nationId)) return false;

    const sample = terrainSampleAt(cell.x, cell.z);
    const forest = forestDensityAt(cell.x, cell.z);
    const durationSeconds =
      1.9
      + sample.roughness * 1.45
      + forest * 0.55
      + (sample.biome === 'highland' ? 0.5 : 0)
      + (sample.biome === 'rocky' ? 1.05 : 0)
      + sample.fertility * 0.22;

    this.expansionByNation.set(nationId, {
      nationId,
      cellId,
      durationSeconds,
      elapsedSeconds: 0,
    });
    this.selectionRevision += 1;
    return true;
  }

  private buildGrid(): void {
    const qLimit = Math.ceil(WORLD_HALF_WIDTH / (Math.sqrt(3) * TERRITORY_HEX_SIZE)) + 8;
    const rLimit = Math.ceil(WORLD_HALF_DEPTH / (1.5 * TERRITORY_HEX_SIZE)) + 4;

    for (let r = -rLimit; r <= rLimit; r += 1) {
      for (let q = -qLimit; q <= qLimit; q += 1) {
        const [x, z] = axialToWorld(q, r);
        if (Math.abs(x) > WORLD_HALF_WIDTH - TERRITORY_HEX_SIZE * 0.45) continue;
        if (Math.abs(z) > WORLD_HALF_DEPTH - TERRITORY_HEX_SIZE * 0.45) continue;
        if (!isLandAt(x, z)) continue;

        const id = axialKey(q, r);
        const cell: TerritoryCellState = { id, q, r, x, z, ownerId: null };
        this.cells.push(cell);
        this.cellById.set(id, cell);
      }
    }
  }

  private seedStartingTerritories(): void {
    for (const nation of NATIONS) {
      const capitalCell = this.nearestCell(nation.capital.position[0], nation.capital.position[1]);
      if (!capitalCell) continue;

      const origin: AxialCoord = { q: capitalCell.q, r: capitalCell.r };
      for (const cell of this.cells) {
        if (cell.ownerId !== null) continue;
        if (hexDistance(origin, cell) > STARTING_RADIUS) continue;
        cell.ownerId = nation.id;
      }
    }
    this.stateRevision += 1;
  }

  private nearestCell(x: number, z: number): TerritoryCellState | null {
    const guess = worldToAxial(x, z);
    const direct = this.cellById.get(axialKey(guess.q, guess.r));
    if (direct) return direct;

    let best: TerritoryCellState | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const cell of this.cells) {
      const dx = cell.x - x;
      const dz = cell.z - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= bestDistanceSq) continue;
      best = cell;
      bestDistanceSq = distanceSq;
    }
    return best;
  }

  private selectionFor(cell: TerritoryCellState): TerritorySelectionView {
    const expansion = this.expansionForCell(cell.id);
    const activeOrder = this.expansionByNation.get(this.activeNationId);
    const canExpand =
      cell.ownerId === null
      && activeOrder === undefined
      && this.hasOwnedNeighbor(cell, this.activeNationId);

    let reason: string | null = null;
    if (cell.ownerId === this.activeNationId) reason = '이미 내 영토야';
    else if (cell.ownerId !== null) reason = '다른 국가 영토는 전쟁 단계에서 공격할 수 있어';
    else if (activeOrder) reason = '현재 다른 영토를 확장 중이야';
    else if (!this.hasOwnedNeighbor(cell, this.activeNationId)) reason = '내 국경과 연결된 지역만 확장할 수 있어';

    return {
      cell,
      owner: this.getNation(cell.ownerId),
      biome: terrainSampleAt(cell.x, cell.z).biome,
      canExpand,
      reason,
      expansion,
    };
  }

  private expansionForCell(cellId: string): ExpansionOrderView | null {
    for (const order of this.expansionByNation.values()) {
      if (order.cellId !== cellId) continue;
      return {
        nationId: order.nationId,
        cellId: order.cellId,
        progress: Math.min(1, order.elapsedSeconds / order.durationSeconds),
        durationSeconds: order.durationSeconds,
      };
    }
    return null;
  }

  private hasOwnedNeighbor(cell: TerritoryCellState, nationId: string): boolean {
    return AXIAL_DIRECTIONS.some(([dq, dr]) => {
      const neighbor = this.cellById.get(axialKey(cell.q + dq, cell.r + dr));
      return neighbor?.ownerId === nationId;
    });
  }
}
