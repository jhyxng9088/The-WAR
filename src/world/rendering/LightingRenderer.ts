import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xc6d3cf, 0x3a3a31, 0.82);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xf4d4a9, 2.55);
  sun.position.set(-124, 172, 96);
  sun.target.position.set(18, 0, -26);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x9fb5bb, 0.28);
  fill.position.set(98, 72, -122);
  fill.target.position.set(-20, 0, 18);
  scene.add(fill, fill.target);
}
