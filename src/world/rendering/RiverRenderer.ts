import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { RIVER_PATHS, terrainHeight } from '../WorldField';

const RIVER_SEGMENTS = 144;

export function addRiver(scene: THREE.Scene): void {
  RIVER_PATHS.forEach((points, index) => addRiverPath(scene, points, index === 0 ? 1 : 0.68));
}

function addRiverPath(scene: THREE.Scene, points: readonly (readonly [number, number])[], widthScale: number): void {
  const path = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.45,
  );

  const banks: RibbonSample[] = [];
  const water: RibbonSample[] = [];
  const glint: RibbonSample[] = [];

  for (let i = 0; i <= RIVER_SEGMENTS; i += 1) {
    const t = i / RIVER_SEGMENTS;
    const point = path.getPoint(t);
    const width = THREE.MathUtils.lerp(0.4, 0.72, t) * widthScale;
    const y = terrainHeight(point.x, point.z);

    banks.push({
      position: new THREE.Vector3(point.x, y + 0.014, point.z),
      width: width + 0.2 * widthScale,
    });
    water.push({
      position: new THREE.Vector3(point.x, y + 0.032, point.z),
      width,
    });
    glint.push({
      position: new THREE.Vector3(point.x, y + 0.038, point.z),
      width: width * 0.18,
    });
  }

  const bankMesh = new THREE.Mesh(
    createRibbonGeometry(banks),
    new THREE.MeshStandardMaterial({
      color: 0x596b55,
      roughness: 1,
      metalness: 0,
    }),
  );
  bankMesh.renderOrder = 1;
  scene.add(bankMesh);

  const waterMesh = new THREE.Mesh(
    createRibbonGeometry(water),
    new THREE.MeshStandardMaterial({
      color: 0x3d91b0,
      roughness: 0.24,
      metalness: 0.04,
      emissive: 0x08212b,
      emissiveIntensity: 0.18,
    }),
  );
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  const highlight = new THREE.Mesh(
    createRibbonGeometry(glint),
    new THREE.MeshBasicMaterial({
      color: 0xb9e4ea,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  highlight.renderOrder = 3;
  scene.add(highlight);
}
