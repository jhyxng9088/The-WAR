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
  variant: number;
}

export function addVegetation(scene: THREE.Scene): void {
  addForestInstances(scene);
  addRockInstances(scene);
}

function addForestInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 1.12;

  for (let x = -WORLD_HALF_WIDTH + 4; x <= WORLD_HALF_WIDTH - 4; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 4; z <= WORLD_HALF_DEPTH - 4; z += spacing) {
      const jitterX = (deterministic01(x, z, 3) - 0.5) * spacing * 0.94;
      const jitterZ = (deterministic01(x, z, 7) - 0.5) * spacing * 0.94;
      const px = x + jitterX;
      const pz = z + jitterZ;

      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const roll = deterministic01(px * 1.35, pz * 1.35, 11);
      if (density < 0.44 || roll > density * 0.94) continue;

      const y = terrainHeight(px, pz);
      const selector = deterministic01(px, pz, 67);
      const variant = y > 1.72 ? 1 : selector < 0.36 ? 0 : selector < 0.73 ? 2 : 1;

      points.push({
        x: px,
        y,
        z: pz,
        scale: 0.7 + deterministic01(px, pz, 17) * 0.62,
        rotation: deterministic01(px, pz, 23) * Math.PI * 2,
        variant,
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.011, 0.018, 0.082, 5);
  trunkGeometry.translate(0, 0.041, 0);

  const broadCrown = new THREE.DodecahedronGeometry(0.082, 0);
  broadCrown.scale(1.18, 0.96, 1.08);
  broadCrown.translate(0, 0.125, 0);

  const coniferCrown = new THREE.ConeGeometry(0.072, 0.18, 6);
  coniferCrown.translate(0, 0.14, 0);

  const tallCrown = new THREE.IcosahedronGeometry(0.078, 0);
  tallCrown.scale(0.88, 1.28, 0.9);
  tallCrown.translate(0, 0.135, 0);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x494238, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97 });

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, points.length);
  const variantPoints: InstancePoint[][] = [[], [], []];
  for (const point of points) variantPoints[point.variant]?.push(point);

  const crowns = [
    new THREE.InstancedMesh(broadCrown, crownMaterial, variantPoints[0]?.length ?? 0),
    new THREE.InstancedMesh(coniferCrown, crownMaterial, variantPoints[1]?.length ?? 0),
    new THREE.InstancedMesh(tallCrown, crownMaterial, variantPoints[2]?.length ?? 0),
  ];

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y, point.z);
    const trunkScale = point.variant === 1 ? point.scale * 1.08 : point.scale;
    scale.set(trunkScale, trunkScale, trunkScale);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;

  const palettes = [
    [new THREE.Color(0x27452e), new THREE.Color(0x476249)],
    [new THREE.Color(0x213b2b), new THREE.Color(0x39563d)],
    [new THREE.Color(0x304b32), new THREE.Color(0x526b4a)],
  ] as const;

  crowns.forEach((mesh, variant) => {
    const variantList = variantPoints[variant] ?? [];
    const palette = palettes[variant] ?? palettes[0];

    variantList.forEach((point, index) => {
      quaternion.setFromAxisAngle(yAxis, point.rotation);
      position.set(point.x, point.y, point.z);

      const width = 0.88 + deterministic01(point.x, point.z, 29) * 0.24;
      const height = 0.9 + deterministic01(point.x, point.z, 37) * 0.22;
      scale.set(point.scale * width, point.scale * height, point.scale * width);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);

      const colorMix = 0.18 + deterministic01(point.x, point.z, 31) * 0.62;
      mesh.setColorAt(index, palette[0].clone().lerp(palette[1], colorMix));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  scene.add(trunks, ...crowns);
}

function addRockInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 2.55;

  for (let x = -WORLD_HALF_WIDTH + 6; x <= WORLD_HALF_WIDTH - 6; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 6; z <= WORLD_HALF_DEPTH - 6; z += spacing) {
      if (!isLandAt(x, z)) continue;

      const strength = mountainStrengthAt(x, z);
      const height = terrainHeight(x, z);
      const roll = deterministic01(x, z, 41);
      if (height < 1.72 || strength < 0.48 || roll > strength * 0.24) continue;

      points.push({
        x: x + (deterministic01(x, z, 43) - 0.5) * 1.15,
        y: height,
        z: z + (deterministic01(x, z, 47) - 0.5) * 1.15,
        scale: 0.45 + deterministic01(x, z, 53) * 0.58,
        rotation: deterministic01(x, z, 59) * Math.PI * 2,
        variant: 0,
      });
    }
  }

  const geometry = new THREE.IcosahedronGeometry(0.052, 0);
  const rocks = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const darkStone = new THREE.Color(0x5f625d);
  const lightStone = new THREE.Color(0x85827a);

  points.forEach((point, index) => {
    quaternion.setFromEuler(new THREE.Euler(0.18, point.rotation, 0.12));
    scale.set(point.scale * 1.48, point.scale * 0.62, point.scale);
    position.set(point.x, point.y + 0.018, point.z);
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(index, matrix);

    const mix = deterministic01(point.x, point.z, 71) * 0.72;
    rocks.setColorAt(index, darkStone.clone().lerp(lightStone, mix));
  });

  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  scene.add(rocks);
}
