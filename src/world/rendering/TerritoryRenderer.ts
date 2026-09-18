import * as THREE from 'three';
import {
  AXIAL_DIRECTIONS,
  TERRITORY_HEX_SIZE,
  axialToWorld,
  hexCorners,
} from '../../territory/TerritoryGrid';
import {
  TerritoryController,
  type TerritoryCellView,
} from '../../territory/TerritoryController';
import { terrainHeight } from '../WorldField';

export interface TerritoryRenderController {
  update(): void;
  dispose(): void;
}

export function createTerritoryRenderer(
  scene: THREE.Scene,
  territory: TerritoryController,
): TerritoryRenderController {
  const root = new THREE.Group();
  root.name = 'dynamic-territory';

  const fillMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMaterial);
  fill.name = 'territory-fill';
  fill.renderOrder = 3.2;

  const borderMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const border = new THREE.Mesh(new THREE.BufferGeometry(), borderMaterial);
  border.name = 'territory-border';
  border.renderOrder = 4.6;

  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const selection = new THREE.Mesh(new THREE.BufferGeometry(), selectionMaterial);
  selection.name = 'territory-selection';
  selection.renderOrder = 5.1;
  selection.visible = false;

  const progressMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const progressGeometry = new THREE.RingGeometry(4.7, 6.1, 24);
  progressGeometry.rotateX(-Math.PI / 2);
  const progress = new THREE.Mesh(progressGeometry, progressMaterial);
  progress.name = 'territory-expansion-progress';
  progress.renderOrder = 5.2;
  progress.visible = false;

  root.add(fill, border, selection, progress);
  scene.add(root);

  let lastStateRevision = -1;
  let lastSelectionRevision = -1;

  const update = (): void => {
    const stateRevision = territory.getStateRevision();
    if (stateRevision !== lastStateRevision) {
      lastStateRevision = stateRevision;
      replaceGeometry(fill, buildFillGeometry(territory));
      replaceGeometry(border, buildBorderGeometry(territory));
    }

    const selectionRevision = territory.getSelectionRevision();
    if (selectionRevision !== lastSelectionRevision) {
      lastSelectionRevision = selectionRevision;
      const selected = territory.getSelection();
      selection.visible = Boolean(selected);
      replaceGeometry(
        selection,
        selected ? buildSelectionGeometry(selected.cell) : new THREE.BufferGeometry(),
      );
    }

    const activeExpansion = territory
      .getExpansionOrders()
      .find((order) => order.nationId === territory.activeNationId);
    if (!activeExpansion) {
      progress.visible = false;
      return;
    }

    const cell = territory.getCells().find((item) => item.id === activeExpansion.cellId);
    const nation = territory.getNation(activeExpansion.nationId);
    if (!cell || !nation) {
      progress.visible = false;
      return;
    }

    progress.visible = true;
    progress.position.set(cell.x, terrainHeight(cell.x, cell.z) + 0.58, cell.z);
    const pulse = 0.72 + activeExpansion.progress * 0.82;
    progress.scale.setScalar(pulse);
    progress.rotation.z = activeExpansion.progress * Math.PI * 1.8;
    progressMaterial.color.setHex(nation.color);
  };

  return {
    update,
    dispose: () => {
      scene.remove(root);
      fill.geometry.dispose();
      border.geometry.dispose();
      selection.geometry.dispose();
      progressGeometry.dispose();
      fillMaterial.dispose();
      borderMaterial.dispose();
      selectionMaterial.dispose();
      progressMaterial.dispose();
    },
  };
}

function buildFillGeometry(territory: TerritoryController): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();

  for (const cell of territory.getCells()) {
    if (!cell.ownerId) continue;
    const nation = territory.getNation(cell.ownerId);
    if (!nation) continue;

    color.setHex(nation.color);
    const base = positions.length / 3;
    positions.push(cell.x, terrainHeight(cell.x, cell.z) + 0.16, cell.z);
    colors.push(color.r, color.g, color.b);

    const corners = hexCorners(cell.x, cell.z, TERRITORY_HEX_SIZE * 1.012);
    for (const [x, z] of corners) {
      positions.push(x, terrainHeight(x, z) + 0.16, z);
      colors.push(color.r, color.g, color.b);
    }

    for (let i = 0; i < 6; i += 1) {
      indices.push(base, base + 1 + i, base + 1 + ((i + 1) % 6));
    }
  }

  return geometryFrom(positions, colors, indices);
}

function buildBorderGeometry(territory: TerritoryController): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();

  for (const cell of territory.getCells()) {
    if (!cell.ownerId) continue;
    const nation = territory.getNation(cell.ownerId);
    if (!nation) continue;
    color.setHex(nation.color);

    AXIAL_DIRECTIONS.forEach(([dq, dr]) => {
      const neighbor = territory.getCell(cell.q + dq, cell.r + dr);
      if (!neighbor || neighbor.ownerId === cell.ownerId) return;

      const [nx, nz] = axialToWorld(cell.q + dq, cell.r + dr);
      appendSharedEdge(
        positions,
        colors,
        indices,
        cell.x,
        cell.z,
        nx,
        nz,
        color,
        0.78,
      );
    });
  }

  return geometryFrom(positions, colors, indices);
}

function buildSelectionGeometry(cell: TerritoryCellView): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const corners = hexCorners(cell.x, cell.z, TERRITORY_HEX_SIZE * 0.97);

  for (let i = 0; i < 6; i += 1) {
    const start = corners[i];
    const end = corners[(i + 1) % 6];
    if (!start || !end) continue;
    appendSegmentQuad(
      positions,
      indices,
      start[0],
      start[1],
      end[0],
      end[1],
      0.9,
      0.31,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function appendSharedEdge(
  positions: number[],
  colors: number[],
  indices: number[],
  x: number,
  z: number,
  neighborX: number,
  neighborZ: number,
  color: THREE.Color,
  width: number,
): void {
  const dx = neighborX - x;
  const dz = neighborZ - z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  const px = -dz / distance;
  const pz = dx / distance;
  const mx = (x + neighborX) * 0.5;
  const mz = (z + neighborZ) * 0.5;
  const halfEdge = TERRITORY_HEX_SIZE * 0.5;

  const ax = mx + px * halfEdge;
  const az = mz + pz * halfEdge;
  const bx = mx - px * halfEdge;
  const bz = mz - pz * halfEdge;

  appendColoredSegmentQuad(
    positions,
    colors,
    indices,
    ax,
    az,
    bx,
    bz,
    width,
    0.27,
    color,
  );
}

function appendColoredSegmentQuad(
  positions: number[],
  colors: number[],
  indices: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
  heightOffset: number,
  color: THREE.Color,
): void {
  const start = positions.length / 3;
  const quad = segmentQuad(ax, az, bx, bz, width, heightOffset);
  for (const [x, y, z] of quad) {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  }
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function appendSegmentQuad(
  positions: number[],
  indices: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
  heightOffset: number,
): void {
  const start = positions.length / 3;
  const quad = segmentQuad(ax, az, bx, bz, width, heightOffset);
  for (const [x, y, z] of quad) positions.push(x, y, z);
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function segmentQuad(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
  heightOffset: number,
): readonly [number, number, number][] {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const px = (-dz / length) * width * 0.5;
  const pz = (dx / length) * width * 0.5;

  const p0: [number, number, number] = [
    ax + px,
    terrainHeight(ax + px, az + pz) + heightOffset,
    az + pz,
  ];
  const p1: [number, number, number] = [
    bx + px,
    terrainHeight(bx + px, bz + pz) + heightOffset,
    bz + pz,
  ];
  const p2: [number, number, number] = [
    bx - px,
    terrainHeight(bx - px, bz - pz) + heightOffset,
    bz - pz,
  ];
  const p3: [number, number, number] = [
    ax - px,
    terrainHeight(ax - px, az - pz) + heightOffset,
    az - pz,
  ];
  return [p0, p1, p2, p3];
}

function geometryFrom(
  positions: number[],
  colors: number[],
  indices: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function replaceGeometry(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): void {
  const previous = mesh.geometry;
  mesh.geometry = geometry;
  previous.dispose();
}
