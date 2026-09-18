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
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
} from "three";
import {
  TERRITORY_CELL_SIZE,
  TerritoryState,
  type TerritoryCell,
} from "./TerritoryState";
import { NATIONS, type NationId } from "./NationCatalog";

export interface TerritoryView {
  sync(state: TerritoryState): void;
  dispose(): void;
}

const TINT_Y = 0.08;
const BORDER_Y = 0.18;
const WHITE = new Color(0xffffff);
const SHARED_BORDER = new Color(0xf1ead8);
const nationOrder = new Map<NationId, number>(
  NATIONS.map((nation, index) => [nation.id, index]),
);

export function createTerritoryView(
  scene: Scene,
  state: TerritoryState,
): TerritoryView {
  const group = new Group();
  group.name = "territory-view";
  scene.add(group);

  const tintMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.33,
    depthWrite: false,
  });

  const borderMaterial = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  });

  const frontierMaterial = new PointsMaterial({
    color: 0xdfeaff,
    size: 6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });

  let tintGeometry = new BufferGeometry();
  let borderGeometry = new BufferGeometry();
  let frontierGeometry = new BufferGeometry();

  let tintMesh = new Mesh(tintGeometry, tintMaterial);
  let borderLines = new LineSegments(borderGeometry, borderMaterial);
  let frontierPoints = new Points(frontierGeometry, frontierMaterial);

  group.add(tintMesh, borderLines, frontierPoints);

  const selectionGeometry = new RingGeometry(17, 25, 36);
  const selectionMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const selection = new Mesh(selectionGeometry, selectionMaterial);
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.28;
  selection.visible = false;
  group.add(selection);

  const expansionGeometry = new RingGeometry(22, 29, 48);
  const expansionMaterial = new MeshBasicMaterial({
    color: 0xf5f8ff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const expansionRing = new Mesh(expansionGeometry, expansionMaterial);
  expansionRing.rotation.x = -Math.PI / 2;
  expansionRing.position.y = 0.32;
  expansionRing.visible = false;
  group.add(expansionRing);

  const capitalGeometry = new CylinderGeometry(7, 10, 22, 6);
  const capitalMaterials: MeshStandardMaterial[] = [];
  const capitals: Mesh[] = [];

  for (const nation of state.nations) {
    const material = new MeshStandardMaterial({
      color: nation.color,
      roughness: 0.88,
      metalness: 0,
    });
    capitalMaterials.push(material);

    const capital = new Mesh(capitalGeometry, material);
    const cell = state.capitalCell(nation.id);

    if (cell) {
      const center = state.cellCenter(cell);
      capital.position.set(center.x, 11, center.z);
      if (nation.isPlayer) capital.scale.setScalar(1.18);
    }

    capitals.push(capital);
    group.add(capital);
  }

  let lastVersion = -1;

  const rebuildOwnership = (): void => {
    const tintPositions: number[] = [];
    const tintColors: number[] = [];
    const borderPositions: number[] = [];
    const borderColors: number[] = [];
    const frontierPositions: number[] = [];
    const half = TERRITORY_CELL_SIZE / 2;

    for (const cell of state.cells) {
      if (!cell.owner) continue;

      const nation = state.nation(cell.owner);
      const color = new Color(nation.color);
      const { x, z } = state.cellCenter(cell);

      pushTint(
        tintPositions,
        tintColors,
        x,
        z,
        half,
        color,
      );

      const neighbors = [
        {
          cell: state.cellAt(cell.col - 1, cell.row),
          x1: x - half,
          z1: z - half,
          x2: x - half,
          z2: z + half,
          normalX: -1,
          normalZ: 0,
          seed: cell.id * 11 + 1,
        },
        {
          cell: state.cellAt(cell.col + 1, cell.row),
          x1: x + half,
          z1: z - half,
          x2: x + half,
          z2: z + half,
          normalX: 1,
          normalZ: 0,
          seed: cell.id * 11 + 2,
        },
        {
          cell: state.cellAt(cell.col, cell.row - 1),
          x1: x - half,
          z1: z - half,
          x2: x + half,
          z2: z - half,
          normalX: 0,
          normalZ: -1,
          seed: cell.id * 11 + 3,
        },
        {
          cell: state.cellAt(cell.col, cell.row + 1),
          x1: x - half,
          z1: z + half,
          x2: x + half,
          z2: z + half,
          normalX: 0,
          normalZ: 1,
          seed: cell.id * 11 + 4,
        },
      ] as const;

      for (const edge of neighbors) {
        if (edge.cell?.owner === cell.owner) continue;

        if (
          edge.cell?.owner &&
          nationIndex(cell.owner) > nationIndex(edge.cell.owner)
        ) {
          continue;
        }

        const borderColor = edge.cell?.owner
          ? SHARED_BORDER
          : color.clone().lerp(WHITE, 0.46);

        pushIrregularBorder(
          borderPositions,
          borderColors,
          edge.x1,
          edge.z1,
          edge.x2,
          edge.z2,
          edge.normalX,
          edge.normalZ,
          edge.seed,
          borderColor,
        );
      }
    }

    for (const cell of state.frontierCells()) {
      const { x, z } = state.cellCenter(cell);
      frontierPositions.push(x, 0.24, z);
    }

    const nextTintGeometry = new BufferGeometry();
    nextTintGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(tintPositions, 3),
    );
    nextTintGeometry.setAttribute(
      "color",
      new Float32BufferAttribute(tintColors, 3),
    );

    const nextBorderGeometry = new BufferGeometry();
    nextBorderGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(borderPositions, 3),
    );
    nextBorderGeometry.setAttribute(
      "color",
      new Float32BufferAttribute(borderColors, 3),
    );

    const nextFrontierGeometry = new BufferGeometry();
    nextFrontierGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(frontierPositions, 3),
    );

    group.remove(tintMesh, borderLines, frontierPoints);
    tintGeometry.dispose();
    borderGeometry.dispose();
    frontierGeometry.dispose();

    tintGeometry = nextTintGeometry;
    borderGeometry = nextBorderGeometry;
    frontierGeometry = nextFrontierGeometry;

    tintMesh = new Mesh(tintGeometry, tintMaterial);
    borderLines = new LineSegments(borderGeometry, borderMaterial);
    frontierPoints = new Points(frontierGeometry, frontierMaterial);

    group.add(tintMesh, borderLines, frontierPoints);
  };

  const sync = (current: TerritoryState): void => {
    if (lastVersion !== current.version) {
      lastVersion = current.version;
      rebuildOwnership();
    }

    const selected = current.selectedCell();

    if (selected) {
      const center = current.cellCenter(selected);
      selection.position.set(center.x, 0.28, center.z);
      selection.visible = true;

      if (selected.owner) {
        selectionMaterial.color.set(
          current.nation(selected.owner).color,
        );
      } else {
        selectionMaterial.color.set(
          current.isPlayerFrontier(selected) ? 0xf7e7a8 : 0xd7d7d0,
        );
      }
    } else {
      selection.visible = false;
    }

    const expansionCell = current.expansionCell();

    if (expansionCell) {
      const center = current.cellCenter(expansionCell);
      const progress = current.expansionProgress();
      expansionRing.position.set(center.x, 0.32, center.z);
      expansionRing.scale.setScalar(0.72 + progress * 0.42);
      expansionRing.rotation.z = progress * Math.PI * 1.5;
      expansionMaterial.opacity = 0.42 + progress * 0.5;
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
      frontierGeometry.dispose();
      tintMaterial.dispose();
      borderMaterial.dispose();
      frontierMaterial.dispose();

      selectionGeometry.dispose();
      selectionMaterial.dispose();
      expansionGeometry.dispose();
      expansionMaterial.dispose();

      capitalGeometry.dispose();
      for (const material of capitalMaterials) material.dispose();

      for (const capital of capitals) capital.removeFromParent();
    },
  };
}

function pushTint(
  positions: number[],
  colors: number[],
  x: number,
  z: number,
  half: number,
  color: Color,
): void {
  positions.push(
    x - half, TINT_Y, z - half,
    x + half, TINT_Y, z - half,
    x + half, TINT_Y, z + half,
    x - half, TINT_Y, z - half,
    x + half, TINT_Y, z + half,
    x - half, TINT_Y, z + half,
  );

  for (let index = 0; index < 6; index += 1) {
    colors.push(color.r, color.g, color.b);
  }
}

function pushIrregularBorder(
  positions: number[],
  colors: number[],
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  normalX: number,
  normalZ: number,
  seed: number,
  color: Color,
): void {
  const jitter = (hash(seed) - 0.5) * 14;
  const midX = (x1 + x2) * 0.5 + normalX * jitter;
  const midZ = (z1 + z2) * 0.5 + normalZ * jitter;

  positions.push(
    x1, BORDER_Y, z1,
    midX, BORDER_Y, midZ,
    midX, BORDER_Y, midZ,
    x2, BORDER_Y, z2,
  );

  for (let index = 0; index < 4; index += 1) {
    colors.push(color.r, color.g, color.b);
  }
}

function nationIndex(id: NationId): number {
  return nationOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
}

function hash(seed: number): number {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}
