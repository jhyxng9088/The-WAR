import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xc9d9d5, 0x34352d, 0.7);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffddb0, 3.35);
  sun.position.set(-112, 146, 78);
  sun.target.position.set(24, 0, -34);
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x9bb8c1, 0.36);
  fill.position.set(86, 58, -104);
  fill.target.position.set(-18, 0, 22);
  scene.add(fill, fill.target);
}
