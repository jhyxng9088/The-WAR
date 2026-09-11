import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { RIVERS, terrainHeight, type RiverDefinition } from '../WorldField';

const RIVER_SEGMENTS = 320;

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
  const deepChannel: RibbonSample[] = [];

  for (let i = 0; i <= RIVER_SEGMENTS; i += 1) {
    const t = i / RIVER_SEGMENTS;
    const point = path.getPoint(t);
    const flow = Math.pow(t, 0.72);
    const broadPulse = Math.sin(t * 10.6 + riverIndex * 1.37) * 0.024;
    const finePulse = Math.sin(t * 25.4 + riverIndex * 2.11) * 0.01;
    const width = THREE.MathUtils.lerp(river.sourceWidth, river.mouthWidth, flow) * (1 + broadPulse + finePulse);
    const y = terrainHeight(point.x, point.z);

    banks.push({
      position: new THREE.Vector3(point.x, y + 0.005, point.z),
      width: width + THREE.MathUtils.lerp(0.085, 0.17, flow),
    });
    water.push({
      position: new THREE.Vector3(point.x, y + 0.017, point.z),
      width,
    });
    deepChannel.push({
      position: new THREE.Vector3(point.x, y + 0.021, point.z),
      width: width * THREE.MathUtils.lerp(0.36, 0.52, flow),
    });
  }

  const bankMesh = new THREE.Mesh(
    createRibbonGeometry(banks),
    new THREE.MeshStandardMaterial({
      color: 0x59634f,
      roughness: 1,
      metalness: 0,
    }),
  );
  bankMesh.renderOrder = 1;
  scene.add(bankMesh);

  const waterMesh = new THREE.Mesh(
    createRibbonGeometry(water),
    new THREE.MeshStandardMaterial({
      color: 0x4a7b88,
      roughness: 0.5,
      metalness: 0.006,
    }),
  );
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  const channelMesh = new THREE.Mesh(
    createRibbonGeometry(deepChannel),
    new THREE.MeshStandardMaterial({
      color: 0x315f70,
      roughness: 0.38,
      metalness: 0.012,
    }),
  );
  channelMesh.renderOrder = 3;
  scene.add(channelMesh);
}
