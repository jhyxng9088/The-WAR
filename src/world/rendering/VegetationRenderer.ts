import * as THREE from 'three';
import {
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
  const spacing = 0.58;

  for (let x = -14.4; x <= 14.4; x += spacing) {
    for (let z = -10.4; z <= 10.4; z += spacing) {
      const jitterX = (deterministic01(x, z, 3) - 0.5) * spacing * 0.72;
      const jitterZ = (deterministic01(x, z, 7) - 0.5) * spacing * 0.72;
      const px = x + jitterX;
      const pz = z + jitterZ;

      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const roll = deterministic01(px * 2.1, pz * 2.1, 11);
      if (density < 0.46 || roll > density * 0.9) continue;

      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: 0.72 + deterministic01(px, pz, 17) * 0.64,
        rotation: deterministic01(px, pz, 23) * Math.PI * 2,
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.075, 0.42, 5);
  trunkGeometry.translate(0, 0.21, 0);
  const crownGeometry = new THREE.DodecahedronGeometry(0.31, 0);
  crownGeometry.translate(0, 0.56, 0);

  const trunks = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshStandardMaterial({ color: 0x554d3b, roughness: 1 }),
    points.length,
  );
  const crowns = new THREE.InstancedMesh(
    crownGeometry,
    new THREE.MeshStandardMaterial({ color: 0x355f43, roughness: 1 }),
    points.length,
  );

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), point.rotation);
    position.set(point.x, point.y, point.z);

    scale.set(point.scale, point.scale, point.scale);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    const crownWide = 0.9 + deterministic01(point.x, point.z, 29) * 0.28;
    scale.set(point.scale * crownWide, point.scale * (1.08 + crownWide * 0.12), point.scale);
    matrix.compose(position, quaternion, scale);
    crowns.setMatrixAt(index, matrix);
  });

  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);
}

function addRockInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 0.72;

  for (let x = -11.5; x <= 11.5; x += spacing) {
    for (let z = -8.5; z <= 8.5; z += spacing) {
      if (!isLandAt(x, z)) continue;

      const strength = mountainStrengthAt(x, z);
      const height = terrainHeight(x, z);
      const roll = deterministic01(x, z, 41);
      if (height < 1.15 || strength < 0.42 || roll > strength * 0.72) continue;

      points.push({
        x: x + (deterministic01(x, z, 43) - 0.5) * 0.36,
        y: height,
        z: z + (deterministic01(x, z, 47) - 0.5) * 0.36,
        scale: 0.42 + deterministic01(x, z, 53) * 0.7,
        rotation: deterministic01(x, z, 59) * Math.PI * 2,
      });
    }
  }

  const geometry = new THREE.DodecahedronGeometry(0.22, 0);
  const rocks = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x6f736c, roughness: 1 }),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  points.forEach((point, index) => {
    quaternion.setFromEuler(new THREE.Euler(0.2, point.rotation, 0.14));
    scale.set(point.scale * 1.25, point.scale * 0.76, point.scale);
    matrix.compose(new THREE.Vector3(point.x, point.y + 0.08, point.z), quaternion, scale);
    rocks.setMatrixAt(index, matrix);
  });

  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
}
