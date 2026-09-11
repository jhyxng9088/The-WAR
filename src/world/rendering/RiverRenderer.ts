import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { RIVER_PATH, terrainHeight } from '../WorldField';

const RIVER_SEGMENTS = 128;

export function addRiver(scene: THREE.Scene): void {
  const path = new THREE.CatmullRomCurve3(
    RIVER_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)),
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
    const width = THREE.MathUtils.lerp(0.33, 0.62, t);
    const y = terrainHeight(point.x, point.z);

    banks.push({
      position: new THREE.Vector3(point.x, y + 0.018, point.z),
      width: width + 0.18,
    });
    water.push({
      position: new THREE.Vector3(point.x, y + 0.038, point.z),
      width,
    });
    glint.push({
      position: new THREE.Vector3(point.x, y + 0.044, point.z),
      width: width * 0.22,
    });
  }

  const bankMesh = new THREE.Mesh(
    createRibbonGeometry(banks),
    new THREE.MeshStandardMaterial({
      color: 0x66705a,
      roughness: 1,
      metalness: 0,
    }),
  );
  bankMesh.renderOrder = 1;
  scene.add(bankMesh);

  const waterMesh = new THREE.Mesh(
    createRibbonGeometry(water),
    new THREE.MeshStandardMaterial({
      color: 0x4c9fbd,
      roughness: 0.22,
      metalness: 0.06,
      emissive: 0x0b2630,
      emissiveIntensity: 0.22,
    }),
  );
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  const highlight = new THREE.Mesh(
    createRibbonGeometry(glint),
    new THREE.MeshBasicMaterial({
      color: 0xb4e1e8,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  highlight.renderOrder = 3;
  scene.add(highlight);
}
