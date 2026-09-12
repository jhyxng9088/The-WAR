import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xcbd5d1, 0x3f3b33, 0.78);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffe3bc, 2.65);
  sun.position.set(-124, 172, 96);
  sun.target.position.set(18, 0, -26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -235;
  sun.shadow.camera.right = 235;
  sun.shadow.camera.top = 235;
  sun.shadow.camera.bottom = -235;
  sun.shadow.camera.near = 18;
  sun.shadow.camera.far = 430;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x9fb5bb, 0.24);
  fill.position.set(98, 72, -122);
  fill.target.position.set(-20, 0, 18);
  scene.add(fill, fill.target);
}
