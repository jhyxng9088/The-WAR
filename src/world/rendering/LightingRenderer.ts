import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xdceff3, 0x4a5545, 1.7);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffefd0, 3.15);
  sun.position.set(-12, 20, 9);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x9fc3d0, 0.55);
  fill.position.set(12, 8, -11);
  scene.add(fill);
}
