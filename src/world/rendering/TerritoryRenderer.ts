import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { isLandAt, terrainHeight, type XZ } from '../WorldField';
import type { StrategicTerritory } from '../StrategicWorld';

const TINT_GRID = 3.4;

export function addTerritory(scene: THREE.Scene, territory: StrategicTerritory): void {
  if (territory.polygon.length < 3) return;
  addTerrainTint(scene, territory);
  addBorder(scene, territory.color, sampleSmoothBorder(territory.polygon));
}

function addTerrainTint(scene: THREE.Scene, territory: StrategicTerritory): void {
  const geometry = createTerrainConformingFill(territory.polygon);
  const tint = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: territory.color,
      transparent: true,
      opacity: 0.105,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  tint.renderOrder = 3.2;
  scene.add(tint);
}

function createTerrainConformingFill(polygon: readonly XZ[]): THREE.BufferGeometry {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const [x, z] of polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const positions: number[] = [];
  const indices: number[] = [];

  for (let x = minX; x < maxX; x += TINT_GRID) {
    for (let z = minZ; z < maxZ; z += TINT_GRID) {
      const cx = x + TINT_GRID * 0.5;
      const cz = z + TINT_GRID * 0.5;
      if (!pointInPolygon(cx, cz, polygon) || !isLandAt(cx, cz)) continue;

      const x1 = Math.min(x + TINT_GRID, maxX);
      const z1 = Math.min(z + TINT_GRID, maxZ);
      const base = positions.length / 3;
      positions.push(
        x, terrainHeight(x, z) + 0.052, z,
        x1, terrainHeight(x1, z) + 0.052, z,
        x1, terrainHeight(x1, z1) + 0.052, z1,
        x, terrainHeight(x, z1) + 0.052, z1,
      );
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function sampleSmoothBorder(polygon: readonly XZ[]): XZ[] {
  const curve = new THREE.CatmullRomCurve3(
    polygon.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.32,
  );
  const count = Math.max(96, polygon.length * 18);
  const samples: XZ[] = [];
  for (let i = 0; i < count; i += 1) {
    const point = curve.getPoint(i / count);
    samples.push([point.x, point.z]);
  }
  return samples;
}

function addBorder(scene: THREE.Scene, color: number, borderPoints: readonly XZ[]): void {
  const samples: RibbonSample[] = borderPoints.map(([x, z]) => ({
    position: new THREE.Vector3(x, terrainHeight(x, z) + 0.095, z),
    width: 0.18,
  }));
  const first = samples[0];
  if (!first) return;
  samples.push({ position: first.position.clone(), width: first.width });

  const border = new THREE.Mesh(
    createRibbonGeometry(samples),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    }),
  );
  border.renderOrder = 4.6;
  scene.add(border);
}

function pointInPolygon(x: number, z: number, polygon: readonly XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const [xi, zi] = a;
    const [xj, zj] = b;
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
