import * as THREE from 'three';
import { addVerticalSlicePopulation } from './VerticalSlicePopulation';
import { addVerticalSliceTerrain } from './VerticalSliceTerrain';

export async function createVerticalSliceWorld(scene: THREE.Scene): Promise<void> {
  addLighting(scene);
  addVerticalSliceTerrain(scene);
  await addVerticalSlicePopulation(scene);
}

function addLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xbac7c8, 0x5c553e, 1.55);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xfff0d3, 2.3);
  sun.position.set(-52, 88, 46);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x9eb4ba, 0.42);
  fill.position.set(58, 38, -62);
  scene.add(fill);
}
