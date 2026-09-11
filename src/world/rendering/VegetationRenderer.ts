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

interface ForestPatchPoint {
  x: number;
  y: number;
  z: number;
  radius: number;
  stretch: number;
  rotation: number;
  colorMix: number;
}

export function addVegetation(scene: THREE.Scene): void {
  addForestMassInstances(scene);
  addForestInstances(scene);
  addRockInstances(scene);
}

function addForestMassInstances(scene: THREE.Scene): void {
  const patches: ForestPatchPoint[] = [];
  const spacing = 4.15;

  for (let x = -WORLD_HALF_WIDTH + 7; x <= WORLD_HALF_WIDTH - 7; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 7; z <= WORLD_HALF_DEPTH - 7; z += spacing) {
      const jitterX = (deterministic01(x, z, 101) - 0.5) * spacing * 0.82;
      const jitterZ = (deterministic01(x, z, 103) - 0.5) * spacing * 0.82;
      const px = x + jitterX;
      const pz = z + jitterZ;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.43) * 1.45, 0, 0.72);
      if (density < 0.5 || deterministic01(px, pz, 107) > chance) continue;

      patches.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        radius: 1.65 + density * 1.85 + deterministic01(px, pz, 109) * 0.85,
        stretch: 0.62 + deterministic01(px, pz, 113) * 0.42,
        rotation: deterministic01(px, pz, 127) * Math.PI * 2,
        colorMix: deterministic01(px, pz, 131),
      });
    }
  }

  const geometry = new THREE.CircleGeometry(1, 11);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, patches.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const darkForest = new THREE.Color(0x344f36);
  const lightForest = new THREE.Color(0x587050);

  patches.forEach((patch, index) => {
    quaternion.setFromAxisAngle(yAxis, patch.rotation);
    position.set(patch.x, patch.y + 0.014, patch.z);
    scale.set(patch.radius, 1, patch.radius * patch.stretch);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, darkForest.clone().lerp(lightForest, patch.colorMix * 0.72));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = 0.45;
  scene.add(mesh);
}

function addForestInstances(scene: THREE.Scene): void {
  const points: InstancePoint[] = [];
  const spacing = 1.82;

  for (let x = -WORLD_HALF_WIDTH + 4; x <= WORLD_HALF_WIDTH - 4; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 4; z <= WORLD_HALF_DEPTH - 4; z += spacing) {
      const jitterX = (deterministic01(x, z, 3) - 0.5) * spacing * 0.94;
      const jitterZ = (deterministic01(x, z, 7) - 0.5) * spacing * 0.94;
      const px = x + jitterX;
      const pz = z + jitterZ;

      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.42) * 0.92, 0, 0.4);
      const roll = deterministic01(px * 1.35, pz * 1.35, 11);
      if (density < 0.5 || roll > chance) continue;

      const y = terrainHeight(px, pz);
      const selector = deterministic01(px, pz, 67);
      const variant = y > 1.72 ? 1 : selector < 0.36 ? 0 : selector < 0.73 ? 2 : 1;

      points.push({
        x: px,
        y,
        z: pz,
        scale: 0.78 + deterministic01(px, pz, 17) * 0.58,
        rotation: deterministic01(px, pz, 23) * Math.PI * 2,
        variant,
      });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.012, 0.019, 0.088, 5);
  trunkGeometry.translate(0, 0.044, 0);

  const broadCrown = new THREE.DodecahedronGeometry(0.095, 0);
  broadCrown.scale(1.2, 0.96, 1.1);
  broadCrown.translate(0, 0.139, 0);

  const coniferCrown = new THREE.ConeGeometry(0.082, 0.2, 6);
  coniferCrown.translate(0, 0.15, 0);

  const tallCrown = new THREE.IcosahedronGeometry(0.09, 0);
  tallCrown.scale(0.9, 1.28, 0.92);
  tallCrown.translate(0, 0.147, 0);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x554a3b, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98 });

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
    [new THREE.Color(0x36563b), new THREE.Color(0x607958)],
    [new THREE.Color(0x2e4b36), new THREE.Color(0x526a4b)],
    [new THREE.Color(0x405f3f), new THREE.Color(0x6d825d)],
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
  const spacing = 3.25;

  for (let x = -WORLD_HALF_WIDTH + 7; x <= WORLD_HALF_WIDTH - 7; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 7; z <= WORLD_HALF_DEPTH - 7; z += spacing) {
      if (!isLandAt(x, z)) continue;

      const strength = mountainStrengthAt(x, z);
      const height = terrainHeight(x, z);
      const roll = deterministic01(x, z, 41);
      if (height < 1.82 || strength < 0.5 || roll > strength * 0.16) continue;

      points.push({
        x: x + (deterministic01(x, z, 43) - 0.5) * 1.35,
        y: height,
        z: z + (deterministic01(x, z, 47) - 0.5) * 1.35,
        scale: 0.42 + deterministic01(x, z, 53) * 0.5,
        rotation: deterministic01(x, z, 59) * Math.PI * 2,
        variant: 0,
      });
    }
  }

  const geometry = new THREE.IcosahedronGeometry(0.05, 0);
  const rocks = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const darkStone = new THREE.Color(0x62645f);
  const lightStone = new THREE.Color(0x89857c);

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
