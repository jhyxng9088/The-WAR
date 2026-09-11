import * as THREE from 'three';
import {
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  deterministic01,
  forestDensityAt,
  isLandAt,
  mountainStrengthAt,
  terrainHeight,
} from '../WorldField';

interface InstancePoint {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
}

export function addVegetation(scene: THREE.Scene): void {
  addForestInstances(scene);
  addRockInstances(scene);
}

function addForestInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 0.72;

  for (let x = -WORLD_HALF_WIDTH + 2; x <= WORLD_HALF_WIDTH - 2; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 2; z <= WORLD_HALF_DEPTH - 2; z += spacing) {
      const jitterX = (deterministic01(x, z, 3) - 0.5) * spacing * 0.78;
      const jitterZ = (deterministic01(x, z, 7) - 0.5) * spacing * 0.78;
      const px = x + jitterX;
      const pz = z + jitterZ;

      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const roll = deterministic01(px * 2.1, pz * 2.1, 11);
      if (density < 0.43 || roll > density * 0.86) continue;

      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: 0.62 + deterministic01(px, pz, 17) * 0.58,
        rotation: deterministic01(px, pz, 23) * Math.PI * 2,
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.045, 0.07, 0.46, 6);
  trunkGeometry.translate(0, 0.23, 0);
  const lowerCrownGeometry = new THREE.DodecahedronGeometry(0.31, 0);
  lowerCrownGeometry.translate(0, 0.57, 0);
  const upperCrownGeometry = new THREE.DodecahedronGeometry(0.235, 0);
  upperCrownGeometry.translate(0, 0.82, 0);

  const trunks = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshStandardMaterial({ color: 0x514735, roughness: 1 }),
    points.length,
  );
  const lowerCrowns = new THREE.InstancedMesh(
    lowerCrownGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: false }),
    points.length,
  );
  const upperCrowns = new THREE.InstancedMesh(
    upperCrownGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: false }),
    points.length,
  );

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const darkGreen = new THREE.Color(0x244b36);
  const lightGreen = new THREE.Color(0x3f6d48);

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y, point.z);

    scale.set(point.scale, point.scale, point.scale);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    const crownWide = 0.9 + deterministic01(point.x, point.z, 29) * 0.3;
    scale.set(point.scale * crownWide, point.scale * (1.02 + crownWide * 0.12), point.scale);
    matrix.compose(position, quaternion, scale);
    lowerCrowns.setMatrixAt(index, matrix);

    scale.set(point.scale * 0.82, point.scale * 0.9, point.scale * 0.82);
    matrix.compose(position, quaternion, scale);
    upperCrowns.setMatrixAt(index, matrix);

    const colorMix = 0.18 + deterministic01(point.x, point.z, 31) * 0.58;
    const crownColor = darkGreen.clone().lerp(lightGreen, colorMix);
    lowerCrowns.setColorAt(index, crownColor);
    upperCrowns.setColorAt(index, crownColor.clone().offsetHSL(0, -0.02, 0.035));
  });

  trunks.instanceMatrix.needsUpdate = true;
  lowerCrowns.instanceMatrix.needsUpdate = true;
  upperCrowns.instanceMatrix.needsUpdate = true;
  if (lowerCrowns.instanceColor) lowerCrowns.instanceColor.needsUpdate = true;
  if (upperCrowns.instanceColor) upperCrowns.instanceColor.needsUpdate = true;
  scene.add(trunks, lowerCrowns, upperCrowns);
}

function addRockInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 0.88;

  for (let x = -WORLD_HALF_WIDTH + 3; x <= WORLD_HALF_WIDTH - 3; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 3; z <= WORLD_HALF_DEPTH - 3; z += spacing) {
      if (!isLandAt(x, z)) continue;

      const strength = mountainStrengthAt(x, z);
      const height = terrainHeight(x, z);
      const roll = deterministic01(x, z, 41);
      if (height < 1.32 || strength < 0.4 || roll > strength * 0.64) continue;

      points.push({
        x: x + (deterministic01(x, z, 43) - 0.5) * 0.44,
        y: height,
        z: z + (deterministic01(x, z, 47) - 0.5) * 0.44,
        scale: 0.34 + deterministic01(x, z, 53) * 0.68,
        rotation: deterministic01(x, z, 59) * Math.PI * 2,
      });
    }
  }

  const geometry = new THREE.DodecahedronGeometry(0.2, 0);
  const rocks = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x676b66, roughness: 1 }),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  points.forEach((point, index) => {
    quaternion.setFromEuler(new THREE.Euler(0.2, point.rotation, 0.14));
    scale.set(point.scale * 1.35, point.scale * 0.72, point.scale);
    position.set(point.x, point.y + 0.07, point.z);
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(index, matrix);
  });

  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
}
