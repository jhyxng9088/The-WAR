import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import {
  TerritoryState,
  type TerritoryCell,
} from "./TerritoryState";
import { NATIONS, type NationId } from "./NationCatalog";

export interface TerritoryView {
  resize(width: number, height: number): void;
  sync(state: TerritoryState): void;
  dispose(): void;
}

interface Point2 {
  readonly x: number;
  readonly z: number;
}

const TINT_Y = 0.1;
const BORDER_Y = 0.22;
const SELECTION_Y = 0.31;
const EXPANSION_Y = 0.34;
const WHITE = new Color(0xffffff);
const SHARED_BORDER = new Color(0xf0eadc);
const nationOrder = new Map<NationId, number>(
  NATIONS.map((nation, index) => [nation.id, index]),
);

export function createTerritoryView(
  scene: Scene,
  state: TerritoryState,
): TerritoryView {
  const tintMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  let tintGeometry = new BufferGeometry();
  let tintMesh = new Mesh(tintGeometry, tintMaterial);
  tintMesh.name = "territory-vector-fill";
  tintMesh.renderOrder = 10;
  scene.add(tintMesh);

  const borderMaterial = new LineMaterial({
    linewidth: 2.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    worldUnits: false,
  });
  borderMaterial.depthTest = false;
  borderMaterial.depthWrite = false;

  let borderGeometry = new LineSegmentsGeometry();
  let borderLines = new LineSegments2(borderGeometry, borderMaterial);
  borderLines.name = "territory-vector-borders";
  borderLines.frustumCulled = false;
  borderLines.renderOrder = 30;
  scene.add(borderLines);

  const selectionFillMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  selectionFillMaterial.depthTest = false;

  let selectionFillGeometry = new BufferGeometry();
  let selectionFill = new Mesh(
    selectionFillGeometry,
    selectionFillMaterial,
  );
  selectionFill.name = "territory-selection-fill";
  selectionFill.renderOrder = 40;
  selectionFill.visible = false;
  scene.add(selectionFill);

  const selectionBorderMaterial = new LineMaterial({
    color: 0xffffff,
    linewidth: 3.2,
    transparent: true,
    opacity: 0.98,
    worldUnits: false,
  });
  selectionBorderMaterial.depthTest = false;
  selectionBorderMaterial.depthWrite = false;

  let selectionBorderGeometry = new LineSegmentsGeometry();
  let selectionBorder = new LineSegments2(
    selectionBorderGeometry,
    selectionBorderMaterial,
  );
  selectionBorder.name = "territory-selection-border";
  selectionBorder.frustumCulled = false;
  selectionBorder.renderOrder = 41;
  selectionBorder.visible = false;
  scene.add(selectionBorder);

  const expansionFillMaterial = new MeshBasicMaterial({
    color: 0xffefae,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  expansionFillMaterial.depthTest = false;

  let expansionFillGeometry = new BufferGeometry();
  let expansionFill = new Mesh(
    expansionFillGeometry,
    expansionFillMaterial,
  );
  expansionFill.name = "territory-expansion-fill";
  expansionFill.renderOrder = 42;
  expansionFill.visible = false;
  scene.add(expansionFill);

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
    scene.add(capital);
  }

  let lastVersion = -1;
  let lastSelectedId: number | null = null;
  let lastExpansionId: number | null = null;

  const rebuildOwnership = (): void => {
    const tintPositions: number[] = [];
    const tintColors: number[] = [];
    const borderPositions: number[] = [];
    const borderColors: number[] = [];

    for (const cell of state.cells) {
      if (!cell.owner) continue;

      const polygon = state.cellPolygon(cell);
      const color = new Color(state.nation(cell.owner).color);

      pushPolygonFill(
        tintPositions,
        tintColors,
        polygon,
        TINT_Y,
        color,
      );

      const neighbors = [
        {
          neighbor: state.cellAt(cell.col, cell.row - 1),
          points: polygon.slice(0, 3),
        },
        {
          neighbor: state.cellAt(cell.col + 1, cell.row),
          points: polygon.slice(2, 5),
        },
        {
          neighbor: state.cellAt(cell.col, cell.row + 1),
          points: polygon.slice(4, 7),
        },
        {
          neighbor: state.cellAt(cell.col - 1, cell.row),
          points: [polygon[6], polygon[7], polygon[0]],
        },
      ] as const;

      for (const edge of neighbors) {
        if (edge.neighbor?.owner === cell.owner) continue;

        if (
          edge.neighbor?.owner &&
          nationIndex(cell.owner) >
            nationIndex(edge.neighbor.owner)
        ) {
          continue;
        }

        const borderColor = edge.neighbor?.owner
          ? SHARED_BORDER
          : color.clone().lerp(WHITE, 0.52);

        pushPolylineSegments(
          borderPositions,
          borderColors,
          compactPoints(edge.points),
          BORDER_Y,
          borderColor,
        );
      }
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

    const nextBorderGeometry = new LineSegmentsGeometry();
    if (borderPositions.length > 0) {
      nextBorderGeometry.setPositions(borderPositions);
      nextBorderGeometry.setColors(borderColors);
    }

    scene.remove(tintMesh, borderLines);
    tintGeometry.dispose();
    borderGeometry.dispose();

    tintGeometry = nextTintGeometry;
    tintMesh = new Mesh(tintGeometry, tintMaterial);
    tintMesh.name = "territory-vector-fill";
    tintMesh.renderOrder = 10;

    borderGeometry = nextBorderGeometry;
    borderLines = new LineSegments2(borderGeometry, borderMaterial);
    borderLines.name = "territory-vector-borders";
    borderLines.frustumCulled = false;
    borderLines.renderOrder = 30;

    scene.add(tintMesh, borderLines);
  };

  const rebuildSelection = (cell: TerritoryCell | null): void => {
    scene.remove(selectionFill, selectionBorder);
    selectionFillGeometry.dispose();
    selectionBorderGeometry.dispose();

    selectionFillGeometry = new BufferGeometry();
    selectionBorderGeometry = new LineSegmentsGeometry();

    if (!cell) {
      selectionFill = new Mesh(
        selectionFillGeometry,
        selectionFillMaterial,
      );
      selectionBorder = new LineSegments2(
        selectionBorderGeometry,
        selectionBorderMaterial,
      );
      selectionFill.visible = false;
      selectionBorder.visible = false;
      scene.add(selectionFill, selectionBorder);
      return;
    }

    const polygon = state.cellPolygon(cell);
    const positions: number[] = [];
    const colors: number[] = [];
    const baseColor = selectionColor(state, cell);

    pushPolygonFill(
      positions,
      colors,
      polygon,
      SELECTION_Y,
      baseColor,
    );
    selectionFillGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );

    const selectionSegments: number[] = [];
    const selectionColors: number[] = [];
    pushClosedPolylineSegments(
      selectionSegments,
      selectionColors,
      polygon,
      SELECTION_Y + 0.01,
      baseColor.clone().lerp(WHITE, 0.35),
    );
    selectionBorderGeometry.setPositions(selectionSegments);
    selectionBorderGeometry.setColors(selectionColors);

    selectionFillMaterial.color.copy(baseColor);
    selectionBorderMaterial.color.copy(
      baseColor.clone().lerp(WHITE, 0.35),
    );

    selectionFill = new Mesh(
      selectionFillGeometry,
      selectionFillMaterial,
    );
    selectionFill.name = "territory-selection-fill";
    selectionFill.renderOrder = 40;

    selectionBorder = new LineSegments2(
      selectionBorderGeometry,
      selectionBorderMaterial,
    );
    selectionBorder.name = "territory-selection-border";
    selectionBorder.frustumCulled = false;
    selectionBorder.renderOrder = 41;

    scene.add(selectionFill, selectionBorder);
  };

  const rebuildExpansion = (cell: TerritoryCell | null): void => {
    scene.remove(expansionFill);
    expansionFillGeometry.dispose();
    expansionFillGeometry = new BufferGeometry();

    if (!cell) {
      expansionFill = new Mesh(
        expansionFillGeometry,
        expansionFillMaterial,
      );
      expansionFill.visible = false;
      scene.add(expansionFill);
      return;
    }

    const polygon = state.cellPolygon(cell);
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new Color(0xffefae);

    pushPolygonFill(
      positions,
      colors,
      polygon,
      EXPANSION_Y,
      color,
    );
    expansionFillGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );

    expansionFill = new Mesh(
      expansionFillGeometry,
      expansionFillMaterial,
    );
    expansionFill.name = "territory-expansion-fill";
    expansionFill.renderOrder = 42;
    scene.add(expansionFill);
  };

  const sync = (current: TerritoryState): void => {
    if (lastVersion !== current.version) {
      lastVersion = current.version;
      rebuildOwnership();
    }

    if (lastSelectedId !== current.selectedCellId) {
      lastSelectedId = current.selectedCellId;
      rebuildSelection(current.selectedCell());
    }

    const expansionId = current.expansion?.targetId ?? null;
    if (lastExpansionId !== expansionId) {
      lastExpansionId = expansionId;
      rebuildExpansion(current.expansionCell());
    }

    if (current.expansion) {
      const progress = current.expansionProgress();
      expansionFillMaterial.opacity =
        0.12 + Math.sin(progress * Math.PI) * 0.28;
      expansionFill.visible = true;
    } else {
      expansionFill.visible = false;
    }
  };

  sync(state);

  return {
    resize(width: number, height: number): void {
      borderMaterial.resolution.set(
        Math.max(1, width),
        Math.max(1, height),
      );
      selectionBorderMaterial.resolution.set(
        Math.max(1, width),
        Math.max(1, height),
      );
    },
    sync,
    dispose(): void {
      scene.remove(
        tintMesh,
        borderLines,
        selectionFill,
        selectionBorder,
        expansionFill,
        ...capitals,
      );

      tintGeometry.dispose();
      borderGeometry.dispose();
      selectionFillGeometry.dispose();
      selectionBorderGeometry.dispose();
      expansionFillGeometry.dispose();

      tintMaterial.dispose();
      borderMaterial.dispose();
      selectionFillMaterial.dispose();
      selectionBorderMaterial.dispose();
      expansionFillMaterial.dispose();

      capitalGeometry.dispose();
      for (const material of capitalMaterials) material.dispose();
    },
  };
}

function pushPolygonFill(
  positions: number[],
  colors: number[],
  polygon: readonly Point2[],
  y: number,
  color: Color,
): void {
  if (polygon.length < 3) return;

  const center = polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x / polygon.length,
      z: sum.z + point.z / polygon.length,
    }),
    { x: 0, z: 0 },
  );

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (!current || !next) continue;

    positions.push(
      center.x, y, center.z,
      current.x, y, current.z,
      next.x, y, next.z,
    );

    for (let vertex = 0; vertex < 3; vertex += 1) {
      colors.push(color.r, color.g, color.b);
    }
  }
}

function compactPoints(
  points: readonly (Point2 | undefined)[],
): Point2[] {
  const result: Point2[] = [];

  for (const point of points) {
    if (point) result.push(point);
  }

  return result;
}

function pushPolylineSegments(
  positions: number[],
  colors: number[],
  points: readonly Point2[],
  y: number,
  color: Color,
): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;

    positions.push(
      a.x, y, a.z,
      b.x, y, b.z,
    );
    colors.push(
      color.r, color.g, color.b,
      color.r, color.g, color.b,
    );
  }
}

function pushClosedPolylineSegments(
  positions: number[],
  colors: number[],
  polygon: readonly Point2[],
  y: number,
  color: Color,
): void {
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (!a || !b) continue;

    positions.push(
      a.x, y, a.z,
      b.x, y, b.z,
    );
    colors.push(
      color.r, color.g, color.b,
      color.r, color.g, color.b,
    );
  }
}

function selectionColor(
  state: TerritoryState,
  cell: TerritoryCell,
): Color {
  if (cell.owner) {
    return new Color(state.nation(cell.owner).color);
  }

  return new Color(
    state.isPlayerFrontier(cell) ? 0xf0d98a : 0xd5d6cc,
  );
}

function nationIndex(id: NationId): number {
  return nationOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
}
