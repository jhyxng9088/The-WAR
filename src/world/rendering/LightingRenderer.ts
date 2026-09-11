import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xdce9e7, 0x3d4538, 1.05);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffe2b7, 2.55);
  sun.position.set(-46, 54, 30);
  sun.target.position.set(7, 0, 3);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x92b5c1, 0.32);
  fill.position.set(38, 22, -42);
  scene.add(fill);
}
