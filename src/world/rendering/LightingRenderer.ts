import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xbfd1d5, 0x2b3028, 0.62);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffddb2, 3.05);
  sun.position.set(-132, 190, 92);
  sun.target.position.set(12, 0, -20);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x90abb5, 0.16);
  fill.position.set(104, 88, -132);
  fill.target.position.set(-18, 0, 16);
  scene.add(fill, fill.target);
}
