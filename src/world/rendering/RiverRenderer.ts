import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { RIVERS, terrainHeight, type RiverDefinition } from '../WorldField';

const RIVER_SEGMENTS = 240;
const WIDTH_SCALE = 1.24;
const FLOODPLAIN_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x486345,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
});
const BANK_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x294449,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});
const WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x3b7480,
  roughness: 0.5,
  metalness: 0,
});

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

  const floodplain: RibbonSample[] = [];
  const bank: RibbonSample[] = [];
  const water: RibbonSample[] = [];

  for (let i = 0; i <= RIVER_SEGMENTS; i += 1) {
    const t = i / RIVER_SEGMENTS;
    const point = path.getPoint(t);
    const flow = Math.pow(t, 0.68);
    const meanderPulse = 1 + Math.sin(t * 9.2 + riverIndex * 1.61) * 0.024;
    const width = THREE.MathUtils.lerp(river.sourceWidth, river.mouthWidth, flow) * meanderPulse * WIDTH_SCALE;
    const y = terrainHeight(point.x, point.z);
    const plainWidth = width * THREE.MathUtils.lerp(3.6, 5.2, flow) + THREE.MathUtils.lerp(0.65, 1.9, flow);

    floodplain.push({
      position: new THREE.Vector3(point.x, y + 0.012, point.z),
      width: plainWidth,
    });
    bank.push({
      position: new THREE.Vector3(point.x, y + 0.025, point.z),
      width: width * 1.34,
    });
    water.push({
      position: new THREE.Vector3(point.x, y + 0.036, point.z),
      width,
    });
  }

  const floodplainMesh = new THREE.Mesh(createRibbonGeometry(floodplain), FLOODPLAIN_MATERIAL);
  floodplainMesh.renderOrder = 0.8;
  scene.add(floodplainMesh);

  const bankMesh = new THREE.Mesh(createRibbonGeometry(bank), BANK_MATERIAL);
  bankMesh.renderOrder = 1.05;
  scene.add(bankMesh);

  const waterMesh = new THREE.Mesh(createRibbonGeometry(water), WATER_MATERIAL);
  waterMesh.renderOrder = 1.2;
  scene.add(waterMesh);
}
