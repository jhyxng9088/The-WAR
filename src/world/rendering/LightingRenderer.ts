import * as THREE from 'three';

export function addWorldLighting(scene: THREE.Scene): void {
  const sky = new THREE.HemisphereLight(0xe8f4f4, 0x71866a, 1.15);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xfff3d7, 2.35);
  sun.position.set(-390, 620, 340);
  sun.target.position.set(40, 0, -55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -560;
  sun.shadow.camera.right = 560;
  sun.shadow.camera.top = 560;
  sun.shadow.camera.bottom = -560;
  sun.shadow.camera.near = 120;
  sun.shadow.camera.far = 1450;
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.055;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xb8d5df, 0.34);
  fill.position.set(420, 260, -470);
  fill.target.position.set(-40, 0, 30);
  scene.add(fill, fill.target);
}
