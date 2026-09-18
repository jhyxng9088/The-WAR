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
const CORE_Y = 0.13;
const BORDER_Y = 0.23;
const SELECTION_Y = 0.27;
const EXPANSION_Y = 0.32;

const WHITE = new Color(0xffffff);
const MAP_INK = new Color(0x334139);
const SHARED_BORDER = new Color(0x455149);

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
    opacity: 0.34,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const coreMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  let tintGeometry = new BufferGeometry();
  let tintMesh = new Mesh(tintGeometry, tintMaterial);
  tintMesh.name = "territory-fill";
  tintMesh.renderOrder = 10;
  scene.add(tintMesh);

  let coreGeometry = new BufferGeometry();
  let coreMesh = new Mesh(coreGeometry, coreMaterial);
  coreMesh.name = "territory-core-fill";
  coreMesh.renderOrder = 11;
  scene.add(coreMesh);

  const borderMaterial = new LineMaterial({
    linewidth: 1.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.66,
    worldUnits: false,
  });
  borderMaterial.depthTest = false;
  borderMaterial.depthWrite = false;

  let borderGeometry = new LineSegmentsGeometry();
  let borderLines = new LineSegments2(borderGeometry, borderMaterial);
  borderLines.name = "territory-borders";
  borderLines.frustumCulled = false;
  borderLines.renderOrder = 30;
  scene.add(borderLines);

  const selectionMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  selectionMaterial.depthTest = false;

  let selectionGeometry = new BufferGeometry();
  let selectionMesh = new Mesh(selectionGeometry, selectionMaterial);
  selectionMesh.name = "territory-nation-selection";
  selectionMesh.renderOrder = 40;
  selectionMesh.visible = false;
  scene.add(selectionMesh);

  const expansionMaterial = new MeshBasicMaterial({
    color: 0xffefae,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  expansionMaterial.depthTest = false;

  let expansionGeometry = new BufferGeometry();
  let expansionMesh = new Mesh(expansionGeometry, expansionMaterial);
  expansionMesh.name = "territory-expansion-fill";
  expansionMesh.renderOrder = 42;
  expansionMesh.visible = false;
  scene.add(expansionMesh);

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
    const corePositions: number[] = [];
    const coreColors: number[] = [];
    const borderPositions: number[] = [];
    const borderColors: number[] = [];

    for (const cell of state.cells) {
      if (!cell.owner) continue;

      const polygon = state.cellPolygon(cell);
      const nationColor = new Color(state.nation(cell.owner).color);

      pushPolygonFill(
        tintPositions,
        tintColors,
        polygon,
        TINT_Y,
        nationColor,
      );

      const sameOwnerNeighbors = state.neighbors(cell).filter(
        (neighbor) => neighbor.owner === cell.owner,
      ).length;

      if (sameOwnerNeighbors >= 3) {
        const coreColor = nationColor
          .clone()
          .lerp(MAP_INK, 0.08);

        pushPolygonFill(
          corePositions,
          coreColors,
          polygon,
          CORE_Y,
          coreColor,
        );
      }

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
          : nationColor.clone().lerp(MAP_INK, 0.46);

        pushPolylineSegments(
          borderPositions,
          borderColors,
          compactPoints(edge.points),
          BORDER_Y,
          borderColor,
        );
      }
    }

    const nextTintGeometry = buildColoredGeometry(
      tintPositions,
      tintColors,
    );
    const nextCoreGeometry = buildColoredGeometry(
      corePositions,
      coreColors,
    );

    const nextBorderGeometry = new LineSegmentsGeometry();
    if (borderPositions.length > 0) {
      nextBorderGeometry.setPositions(borderPositions);
      nextBorderGeometry.setColors(borderColors);
    }

    scene.remove(tintMesh, coreMesh, borderLines);
    tintGeometry.dispose();
    coreGeometry.dispose();
    borderGeometry.dispose();

    tintGeometry = nextTintGeometry;
    tintMesh = new Mesh(tintGeometry, tintMaterial);
    tintMesh.name = "territory-fill";
    tintMesh.renderOrder = 10;

    coreGeometry = nextCoreGeometry;
    coreMesh = new Mesh(coreGeometry, coreMaterial);
    coreMesh.name = "territory-core-fill";
    coreMesh.renderOrder = 11;

    borderGeometry = nextBorderGeometry;
    borderLines = new LineSegments2(
      borderGeometry,
      borderMaterial,
    );
    borderLines.name = "territory-borders";
    borderLines.frustumCulled = false;
    borderLines.renderOrder = 30;

    scene.add(tintMesh, coreMesh, borderLines);
  };

  const rebuildSelection = (cell: TerritoryCell | null): void => {
    scene.remove(selectionMesh);
    selectionGeometry.dispose();
    selectionGeometry = new BufferGeometry();

    // Avoid exposing the hidden internal grid. Owned/foreign selection
    // highlights the whole nation. Neutral selection is communicated by
    // the HUD, while an active claim uses the expansion target fill.
    if (!cell?.owner) {
      selectionMesh = new Mesh(
        selectionGeometry,
        selectionMaterial,
      );
      selectionMesh.visible = false;
      scene.add(selectionMesh);
      return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const selectedColor = new Color(
      state.nation(cell.owner).color,
    ).lerp(WHITE, 0.15);

    for (const ownedCell of state.cells) {
      if (ownedCell.owner !== cell.owner) continue;

      pushPolygonFill(
        positions,
        colors,
        state.cellPolygon(ownedCell),
        SELECTION_Y,
        selectedColor,
      );
    }

    selectionGeometry = buildColoredGeometry(
      positions,
      colors,
    );
    selectionMesh = new Mesh(
      selectionGeometry,
      selectionMaterial,
    );
    selectionMesh.name = "territory-nation-selection";
    selectionMesh.renderOrder = 40;
    scene.add(selectionMesh);
  };

  const rebuildExpansion = (cell: TerritoryCell | null): void => {
    scene.remove(expansionMesh);
    expansionGeometry.dispose();
    expansionGeometry = new BufferGeometry();

    if (!cell) {
      expansionMesh = new Mesh(
        expansionGeometry,
        expansionMaterial,
      );
      expansionMesh.visible = false;
      scene.add(expansionMesh);
      return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const color = new Color(0xffefae);

    pushPolygonFill(
      positions,
      colors,
      state.cellPolygon(cell),
      EXPANSION_Y,
      color,
    );

    expansionGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );

    expansionMesh = new Mesh(
      expansionGeometry,
      expansionMaterial,
    );
    expansionMesh.name = "territory-expansion-fill";
    expansionMesh.renderOrder = 42;
    scene.add(expansionMesh);
  };

  const sync = (current: TerritoryState): void => {
    const versionChanged = lastVersion !== current.version;

    if (versionChanged) {
      lastVersion = current.version;
      rebuildOwnership();
    }

    if (
      lastSelectedId !== current.selectedCellId ||
      (versionChanged && current.selectedCell()?.owner)
    ) {
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
      expansionMaterial.opacity =
        0.16 + Math.sin(progress * Math.PI) * 0.22;
      expansionMesh.visible = true;
    } else {
      expansionMesh.visible = false;
    }
  };

  sync(state);

  return {
    resize(width: number, height: number): void {
      borderMaterial.resolution.set(
        Math.max(1, width),
        Math.max(1, height),
      );
    },
    sync,
    dispose(): void {
      scene.remove(
        tintMesh,
        coreMesh,
        borderLines,
        selectionMesh,
        expansionMesh,
        ...capitals,
      );

      tintGeometry.dispose();
      coreGeometry.dispose();
      borderGeometry.dispose();
      selectionGeometry.dispose();
      expansionGeometry.dispose();

      tintMaterial.dispose();
      coreMaterial.dispose();
      borderMaterial.dispose();
      selectionMaterial.dispose();
      expansionMaterial.dispose();

      capitalGeometry.dispose();
      for (const material of capitalMaterials) material.dispose();
    },
  };
}

function buildColoredGeometry(
  positions: number[],
  colors: number[],
): BufferGeometry {
  const geometry = new BufferGeometry();

  if (positions.length > 0) {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "color",
      new Float32BufferAttribute(colors, 3),
    );
  }

  return geometry;
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

    // The map is viewed from +Y. Use +Y-facing winding so the
    // transparent territory surface is not backface-culled.
    positions.push(
      center.x, y, center.z,
      next.x, y, next.z,
      current.x, y, current.z,
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

function nationIndex(id: NationId): number {
  return nationOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
}
