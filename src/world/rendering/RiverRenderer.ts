import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { RIVER_PATHS, terrainHeight } from '../WorldField';

const RIVER_SEGMENTS = 192;
const WIDTH_SCALES = [1.18, 0.62, 0.76, 0.72, 0.72, 0.66] as const;

export function addRiver(scene: THREE.Scene): void {
  RIVER_PATHS.forEach((points, index) => addRiverPath(scene, points, WIDTH_SCALES[index] ?? 0.7));
}

function addRiverPath(scene: THREE.Scene, points: readonly (readonly [number, number])[], widthScale: number): void {
  const path = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.5,
  );

  const banks: RibbonSample[] = [];
  const water: RibbonSample[] = [];
  const glint: RibbonSample[] = [];

  for (let i = 0; i <= RIVER_SEGMENTS; i += 1) {
    const t = i / RIVER_SEGMENTS;
    const point = path.getPoint(t);
    const width = THREE.MathUtils.lerp(0.26, 0.82, Math.pow(t, 0.72)) * widthScale;
    const y = terrainHeight(point.x, point.z);

    banks.push({
      position: new THREE.Vector3(point.x, y + 0.012, point.z),
      width: width + 0.12 * widthScale,
    });
    water.push({
      position: new THREE.Vector3(point.x, y + 0.026, point.z),
      width,
    });
    glint.push({
      position: new THREE.Vector3(point.x, y + 0.031, point.z),
      width: width * 0.1,
    });
  }

  const bankMesh = new THREE.Mesh(
    createRibbonGeometry(banks),
    new THREE.MeshStandardMaterial({
      color: 0x59624f,
      roughness: 1,
      metalness: 0,
    }),
  );
  bankMesh.renderOrder = 1;
  scene.add(bankMesh);

  const waterMesh = new THREE.Mesh(
    createRibbonGeometry(water),
    new THREE.MeshStandardMaterial({
      color: 0x417f92,
      roughness: 0.34,
      metalness: 0.015,
    }),
  );
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  const highlight = new THREE.Mesh(
    createRibbonGeometry(glint),
    new THREE.MeshBasicMaterial({
      color: 0xc0dde0,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  );
  highlight.renderOrder = 3;
  scene.add(highlight);
}
