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
  const spacing = 1.25;

  for (let x = -WORLD_HALF_WIDTH + 3; x <= WORLD_HALF_WIDTH - 3; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 3; z <= WORLD_HALF_DEPTH - 3; z += spacing) {
      const jitterX = (deterministic01(x, z, 3) - 0.5) * spacing * 0.9;
      const jitterZ = (deterministic01(x, z, 7) - 0.5) * spacing * 0.9;
      const px = x + jitterX;
      const pz = z + jitterZ;

      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const roll = deterministic01(px * 1.7, pz * 1.7, 11);
      if (density < 0.48 || roll > density * 0.9) continue;

      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: 0.72 + deterministic01(px, pz, 17) * 0.58,
        rotation: deterministic01(px, pz, 23) * Math.PI * 2,
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.014, 0.022, 0.085, 5);
  trunkGeometry.translate(0, 0.0425, 0);
  const crownGeometry = new THREE.DodecahedronGeometry(0.09, 0);
  crownGeometry.scale(1.05, 1.18, 1.05);
  crownGeometry.translate(0, 0.13, 0);

  const trunks = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshStandardMaterial({ color: 0x4b4437, roughness: 1 }),
    points.length,
  );
  const crowns = new THREE.InstancedMesh(
    crownGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: false }),
    points.length,
  );

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const darkGreen = new THREE.Color(0x294631);
  const lightGreen = new THREE.Color(0x426044);

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y, point.z);

    scale.set(point.scale, point.scale, point.scale);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    const crownWide = 0.88 + deterministic01(point.x, point.z, 29) * 0.22;
    scale.set(point.scale * crownWide, point.scale * (0.92 + crownWide * 0.1), point.scale * crownWide);
    matrix.compose(position, quaternion, scale);
    crowns.setMatrixAt(index, matrix);

    const colorMix = 0.16 + deterministic01(point.x, point.z, 31) * 0.52;
    crowns.setColorAt(index, darkGreen.clone().lerp(lightGreen, colorMix));
  });

  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  scene.add(trunks, crowns);
}

function addRockInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 2.15;

  for (let x = -WORLD_HALF_WIDTH + 5; x <= WORLD_HALF_WIDTH - 5; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 5; z <= WORLD_HALF_DEPTH - 5; z += spacing) {
      if (!isLandAt(x, z)) continue;

      const strength = mountainStrengthAt(x, z);
      const height = terrainHeight(x, z);
      const roll = deterministic01(x, z, 41);
      if (height < 1.55 || strength < 0.46 || roll > strength * 0.34) continue;

      points.push({
        x: x + (deterministic01(x, z, 43) - 0.5) * 0.9,
        y: height,
        z: z + (deterministic01(x, z, 47) - 0.5) * 0.9,
        scale: 0.52 + deterministic01(x, z, 53) * 0.52,
        rotation: deterministic01(x, z, 59) * Math.PI * 2,
      });
    }
  }

  const geometry = new THREE.DodecahedronGeometry(0.075, 0);
  const rocks = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x676963, roughness: 1 }),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  points.forEach((point, index) => {
    quaternion.setFromEuler(new THREE.Euler(0.2, point.rotation, 0.14));
    scale.set(point.scale * 1.35, point.scale * 0.66, point.scale);
    position.set(point.x, point.y + 0.026, point.z);
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(index, matrix);
  });

  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
}
