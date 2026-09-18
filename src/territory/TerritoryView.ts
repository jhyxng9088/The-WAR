import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  ShapeUtils,
  Vector2,
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
const BORDER_CORNER_CUT = 0.18;

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

  const borderHaloMaterial = new LineMaterial({
    linewidth: 2.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    worldUnits: false,
  });
  borderHaloMaterial.depthTest = false;
  borderHaloMaterial.depthWrite = false;

  const borderMaterial = new LineMaterial({
    linewidth: 1.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    worldUnits: false,
  });
  borderMaterial.depthTest = false;
  borderMaterial.depthWrite = false;

  let borderGeometry = new LineSegmentsGeometry();
  let borderHaloLines = new LineSegments2(
    borderGeometry,
    borderHaloMaterial,
  );
  borderHaloLines.name = "territory-border-halo";
  borderHaloLines.frustumCulled = false;
  borderHaloLines.renderOrder = 29;

  let borderLines = new LineSegments2(borderGeometry, borderMaterial);
  borderLines.name = "territory-borders";
  borderLines.frustumCulled = false;
  borderLines.renderOrder = 30;
  scene.add(borderHaloLines, borderLines);

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
  const nationLoops = new Map<NationId, Point2[][]>();

  const rebuildOwnership = (): void => {
    const tintPositions: number[] = [];
    const tintColors: number[] = [];
    const corePositions: number[] = [];
    const coreColors: number[] = [];
    const borderPositions: number[] = [];
    const borderColors: number[] = [];

    nationLoops.clear();

    for (const nation of state.nations) {
      const rawLoops = collectNationBoundaryLoops(state, nation.id);
      const softenedLoops = rawLoops.map((loop) =>
        createDisplayLoop(loop),
      );
      nationLoops.set(nation.id, softenedLoops);

      const nationColor = new Color(nation.color);

      for (const loop of softenedLoops) {
        pushTriangulatedLoopFill(
          tintPositions,
          tintColors,
          loop,
          TINT_Y,
          nationColor,
        );

        pushClosedLoopSegments(
          borderPositions,
          borderColors,
          loop,
          BORDER_Y,
          nationColor.clone().lerp(MAP_INK, 0.46),
        );
      }
    }

    // Keep the subtle core shading cell-derived. It is an internal color
    // modulation only and never becomes a second ownership source.
    for (const cell of state.cells) {
      if (!cell.owner) continue;

      const sameOwnerNeighbors = state.neighbors(cell).filter(
        (neighbor) => neighbor.owner === cell.owner,
      ).length;

      if (sameOwnerNeighbors < 3) continue;

      const coreColor = new Color(
        state.nation(cell.owner).color,
      ).lerp(MAP_INK, 0.08);

      pushPolygonFill(
        corePositions,
        coreColors,
        state.cellPolygon(cell),
        CORE_Y,
        coreColor,
      );
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

    scene.remove(tintMesh, coreMesh, borderHaloLines, borderLines);
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

    borderHaloLines = new LineSegments2(
      borderGeometry,
      borderHaloMaterial,
    );
    borderHaloLines.name = "territory-border-halo";
    borderHaloLines.frustumCulled = false;
    borderHaloLines.renderOrder = 29;

    borderLines = new LineSegments2(
      borderGeometry,
      borderMaterial,
    );
    borderLines.name = "territory-borders";
    borderLines.frustumCulled = false;
    borderLines.renderOrder = 30;

    scene.add(
      tintMesh,
      coreMesh,
      borderHaloLines,
      borderLines,
    );
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

    const loops = nationLoops.get(cell.owner) ?? [];

    for (const loop of loops) {
      pushTriangulatedLoopFill(
        positions,
        colors,
        loop,
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
      borderHaloMaterial.resolution.set(
        Math.max(1, width),
        Math.max(1, height),
      );
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
        borderHaloLines,
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
      borderHaloMaterial.dispose();
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

interface BoundarySegment {
  readonly startKey: string;
  readonly endKey: string;
  readonly points: readonly Point2[];
}

function collectNationBoundaryLoops(
  state: TerritoryState,
  nationId: NationId,
): Point2[][] {
  const segments: BoundarySegment[] = [];

  for (const cell of state.cells) {
    if (cell.owner !== nationId) continue;

    const polygon = state.cellPolygon(cell);
    const edges = [
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

    for (const edge of edges) {
      if (edge.neighbor?.owner === nationId) continue;

      const points = compactPoints(edge.points);
      const first = points[0];
      const last = points[points.length - 1];
      if (!first || !last) continue;

      segments.push({
        startKey: pointKey(first),
        endKey: pointKey(last),
        points,
      });
    }
  }

  const starts = new Map<string, number[]>();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;

    const bucket = starts.get(segment.startKey) ?? [];
    bucket.push(index);
    starts.set(segment.startKey, bucket);
  }

  const used = new Set<number>();
  const loops: Point2[][] = [];

  for (let seedIndex = 0; seedIndex < segments.length; seedIndex += 1) {
    if (used.has(seedIndex)) continue;

    const seed = segments[seedIndex];
    if (!seed) continue;

    used.add(seedIndex);
    const loop = [...seed.points];
    const startKey = seed.startKey;
    let endKey = seed.endKey;
    let guard = 0;

    while (endKey !== startKey && guard < segments.length + 4) {
      const candidates = starts.get(endKey) ?? [];
      const nextIndex = candidates.find((index) => !used.has(index));

      if (nextIndex === undefined) break;

      const next = segments[nextIndex];
      if (!next) break;

      used.add(nextIndex);
      loop.push(...next.points.slice(1));
      endKey = next.endKey;
      guard += 1;
    }

    if (endKey === startKey && loop.length >= 6) {
      if (samePoint(loop[0], loop[loop.length - 1])) {
        loop.pop();
      }
      loops.push(removeNearDuplicates(loop));
    }
  }

  return loops;
}

function createDisplayLoop(
  points: readonly Point2[],
): Point2[] {
  const cleaned = removeNearDuplicates(points);
  if (cleaned.length < 5) return [...cleaned];

  const rounded = cornerCutClosedLoop(
    cleaned,
    BORDER_CORNER_CUT,
  );

  return preserveLoopArea(cleaned, rounded);
}

function cornerCutClosedLoop(
  points: readonly Point2[],
  cut: number,
): Point2[] {
  const result: Point2[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;

    result.push(
      {
        x: current.x + (next.x - current.x) * cut,
        z: current.z + (next.z - current.z) * cut,
      },
      {
        x: current.x + (next.x - current.x) * (1 - cut),
        z: current.z + (next.z - current.z) * (1 - cut),
      },
    );
  }

  return result;
}

function preserveLoopArea(
  source: readonly Point2[],
  rounded: readonly Point2[],
): Point2[] {
  const sourceArea = Math.abs(signedArea(source));
  const roundedArea = Math.abs(signedArea(rounded));

  if (sourceArea < 0.001 || roundedArea < 0.001) {
    return [...rounded];
  }

  const center = polygonCenter(rounded);
  const rawScale = Math.sqrt(sourceArea / roundedArea);
  const scale = Math.max(0.96, Math.min(1.04, rawScale));

  return rounded.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    z: center.z + (point.z - center.z) * scale,
  }));
}

function polygonCenter(points: readonly Point2[]): Point2 {
  let x = 0;
  let z = 0;

  for (const point of points) {
    x += point.x;
    z += point.z;
  }

  return {
    x: x / points.length,
    z: z / points.length,
  };
}

function signedArea(points: readonly Point2[]): number {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;

    area += current.x * next.z - next.x * current.z;
  }

  return area * 0.5;
}

function pushTriangulatedLoopFill(
  positions: number[],
  colors: number[],
  loop: readonly Point2[],
  y: number,
  color: Color,
): void {
  if (loop.length < 3) return;

  const contour = loop.map(
    (point) => new Vector2(point.x, point.z),
  );
  const triangles = ShapeUtils.triangulateShape(contour, []);

  for (const triangle of triangles) {
    const aIndex = triangle[0];
    const bIndex = triangle[1];
    const cIndex = triangle[2];

    if (
      aIndex === undefined ||
      bIndex === undefined ||
      cIndex === undefined
    ) {
      continue;
    }

    const a = loop[aIndex];
    const b = loop[bIndex];
    const c = loop[cIndex];
    if (!a || !b || !c) continue;

    pushUpFacingTriangle(
      positions,
      colors,
      a,
      b,
      c,
      y,
      color,
    );
  }
}

function pushUpFacingTriangle(
  positions: number[],
  colors: number[],
  a: Point2,
  b: Point2,
  c: Point2,
  y: number,
  color: Color,
): void {
  const normalY =
    (b.z - a.z) * (c.x - a.x) -
    (b.x - a.x) * (c.z - a.z);

  const second = normalY >= 0 ? b : c;
  const third = normalY >= 0 ? c : b;

  positions.push(
    a.x, y, a.z,
    second.x, y, second.z,
    third.x, y, third.z,
  );

  for (let vertex = 0; vertex < 3; vertex += 1) {
    colors.push(color.r, color.g, color.b);
  }
}

function pushClosedLoopSegments(
  positions: number[],
  colors: number[],
  loop: readonly Point2[],
  y: number,
  color: Color,
): void {
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
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

function removeNearDuplicates(points: readonly Point2[]): Point2[] {
  const result: Point2[] = [];

  for (const point of points) {
    const previous = result[result.length - 1];

    if (!previous || !samePoint(previous, point)) {
      result.push(point);
    }
  }

  return result;
}

function pointKey(point: Point2): string {
  return point.x.toFixed(4) + ":" + point.z.toFixed(4);
}

function samePoint(
  a: Point2 | undefined,
  b: Point2 | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.0001 &&
    Math.abs(a.z - b.z) < 0.0001
  );
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
