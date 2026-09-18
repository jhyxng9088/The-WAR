import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
} from "three";
import {
  TERRITORY_CELL_SIZE,
  TERRITORY_COLS,
  TERRITORY_ROWS,
  TerritoryState,
  type TerritoryCell,
} from "./TerritoryState";

export interface TerritoryView {
  sync(state: TerritoryState): void;
  dispose(): void;
}

const TINT_Y = 0.08;
const BORDER_Y = 0.16;

export function createTerritoryView(
  scene: Scene,
  state: TerritoryState,
): TerritoryView {
  const group = new Group();
  group.name = "territory-view";
  scene.add(group);

  const tintMaterial = new MeshBasicMaterial({
    color: 0x4f78c7,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });

  const borderMaterial = new LineBasicMaterial({
    color: 0xe4edff,
    transparent: true,
    opacity: 0.88,
  });

  let tintGeometry = new BufferGeometry();
  let borderGeometry = new BufferGeometry();
  let tintMesh = new Mesh(tintGeometry, tintMaterial);
  let borderLines = new LineSegments(borderGeometry, borderMaterial);
  group.add(tintMesh, borderLines);

  const selectionGeometry = new PlaneGeometry(
    TERRITORY_CELL_SIZE * 0.9,
    TERRITORY_CELL_SIZE * 0.9,
  );
  const selectionMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const selection = new Mesh(selectionGeometry, selectionMaterial);
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.2;
  selection.visible = false;
  group.add(selection);

  const expansionGeometry = new RingGeometry(
    TERRITORY_CELL_SIZE * 0.26,
    TERRITORY_CELL_SIZE * 0.33,
    48,
  );
  const expansionMaterial = new MeshBasicMaterial({
    color: 0xf4f7ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const expansionRing = new Mesh(expansionGeometry, expansionMaterial);
  expansionRing.rotation.x = -Math.PI / 2;
  expansionRing.position.y = 0.26;
  expansionRing.visible = false;
  group.add(expansionRing);

  const capitalGeometry = new CylinderGeometry(11, 15, 20, 6);
  const capitalMaterial = new MeshStandardMaterial({
    color: 0xf1dd9a,
    roughness: 0.9,
  });
  const capital = new Mesh(capitalGeometry, capitalMaterial);
  const capitalCell = state.cells[state.capitalCellId];
  if (capitalCell) {
    const center = state.cellCenter(capitalCell);
    capital.position.set(center.x, 10, center.z);
  }
  group.add(capital);

  let lastVersion = -1;

  const rebuildOwnership = (): void => {
    const tintPositions: number[] = [];
    const borderPositions: number[] = [];
    const half = TERRITORY_CELL_SIZE / 2;

    for (const cell of state.cells) {
      if (cell.owner !== state.playerNation) continue;
      const { x, z } = state.cellCenter(cell);

      tintPositions.push(
        x - half, TINT_Y, z - half,
        x + half, TINT_Y, z - half,
        x + half, TINT_Y, z + half,
        x - half, TINT_Y, z - half,
        x + half, TINT_Y, z + half,
        x - half, TINT_Y, z + half,
      );

      const left = neighborAt(state, cell.col - 1, cell.row);
      const right = neighborAt(state, cell.col + 1, cell.row);
      const top = neighborAt(state, cell.col, cell.row - 1);
      const bottom = neighborAt(state, cell.col, cell.row + 1);

      if (left?.owner !== state.playerNation) {
        pushSegment(borderPositions, x - half, z - half, x - half, z + half);
      }
      if (right?.owner !== state.playerNation) {
        pushSegment(borderPositions, x + half, z - half, x + half, z + half);
      }
      if (top?.owner !== state.playerNation) {
        pushSegment(borderPositions, x - half, z - half, x + half, z - half);
      }
      if (bottom?.owner !== state.playerNation) {
        pushSegment(borderPositions, x - half, z + half, x + half, z + half);
      }
    }

    const nextTintGeometry = new BufferGeometry();
    nextTintGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(tintPositions, 3),
    );

    const nextBorderGeometry = new BufferGeometry();
    nextBorderGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(borderPositions, 3),
    );

    group.remove(tintMesh, borderLines);
    tintGeometry.dispose();
    borderGeometry.dispose();

    tintGeometry = nextTintGeometry;
    borderGeometry = nextBorderGeometry;
    tintMesh = new Mesh(tintGeometry, tintMaterial);
    borderLines = new LineSegments(borderGeometry, borderMaterial);
    group.add(tintMesh, borderLines);
  };

  const sync = (current: TerritoryState): void => {
    if (lastVersion !== current.version) {
      lastVersion = current.version;
      rebuildOwnership();
    }

    const selected = current.selectedCell();
    if (selected) {
      const center = current.cellCenter(selected);
      selection.position.set(center.x, 0.2, center.z);
      selection.visible = true;
      selectionMaterial.color.set(
        selected.owner === current.playerNation ? 0xffffff : 0xfff1bd,
      );
    } else {
      selection.visible = false;
    }

    const expansionCell = current.expansionCell();
    if (expansionCell) {
      const center = current.cellCenter(expansionCell);
      const progress = current.expansionProgress();
      expansionRing.position.set(center.x, 0.26, center.z);
      expansionRing.scale.setScalar(0.62 + progress * 0.38);
      expansionMaterial.opacity = 0.35 + progress * 0.6;
      expansionRing.visible = true;
    } else {
      expansionRing.visible = false;
    }
  };

  sync(state);

  return {
    sync,
    dispose(): void {
      scene.remove(group);
      tintGeometry.dispose();
      borderGeometry.dispose();
      tintMaterial.dispose();
      borderMaterial.dispose();
      selectionGeometry.dispose();
      selectionMaterial.dispose();
      expansionGeometry.dispose();
      expansionMaterial.dispose();
      capitalGeometry.dispose();
      capitalMaterial.dispose();
    },
  };
}

function neighborAt(
  state: TerritoryState,
  col: number,
  row: number,
): TerritoryCell | null {
  if (
    col < 0 ||
    col >= TERRITORY_COLS ||
    row < 0 ||
    row >= TERRITORY_ROWS
  ) {
    return null;
  }

  return state.cells[row * TERRITORY_COLS + col] ?? null;
}

function pushSegment(
  positions: number[],
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): void {
  positions.push(
    x1, BORDER_Y, z1,
    x2, BORDER_Y, z2,
  );
}
