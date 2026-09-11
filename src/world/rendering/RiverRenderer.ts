import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { RIVERS, terrainHeight, type RiverDefinition } from '../WorldField';

const RIVER_SEGMENTS = 224;

export function addRiver(scene: THREE.Scene): void {
  RIVERS.forEach((river, index) => addRiverPath(scene, river, index));
}

function addRiverPath(scene: THREE.Scene, river: RiverDefinition, riverIndex: number): void {
  const path = new THREE.CatmullRomCurve3(
    river.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.5,
  );

  const banks: RibbonSample[] = [];
  const water: RibbonSample[] = [];

  for (let i = 0; i <= RIVER_SEGMENTS; i += 1) {
    const t = i / RIVER_SEGMENTS;
    const point = path.getPoint(t);
    const flow = Math.pow(t, 0.7);
    const widthPulse = 0.97 + Math.sin(t * 18.7 + riverIndex * 1.91) * 0.03;
    const width = THREE.MathUtils.lerp(river.sourceWidth, river.mouthWidth, flow) * widthPulse;
    const y = terrainHeight(point.x, point.z);

    banks.push({
      position: new THREE.Vector3(point.x, y + 0.006, point.z),
      width: width + THREE.MathUtils.lerp(0.07, 0.13, flow),
    });
    water.push({
      position: new THREE.Vector3(point.x, y + 0.018, point.z),
      width,
    });
  }

  const bankMesh = new THREE.Mesh(
    createRibbonGeometry(banks),
    new THREE.MeshStandardMaterial({
      color: 0x56604e,
      roughness: 1,
      metalness: 0,
    }),
  );
  bankMesh.renderOrder = 1;
  scene.add(bankMesh);

  const waterMesh = new THREE.Mesh(
    createRibbonGeometry(water),
    new THREE.MeshStandardMaterial({
      color: 0x3e7483,
      roughness: 0.46,
      metalness: 0.01,
    }),
  );
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);
}
