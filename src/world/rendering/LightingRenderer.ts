import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xd8e5e1, 0x273127, 0.46);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffdfad, 4.6);
  sun.position.set(-58, 64, 28);
  sun.target.position.set(8, 0, -4);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x8eaeba, 0.12);
  fill.position.set(42, 24, -46);
  scene.add(fill);
}
