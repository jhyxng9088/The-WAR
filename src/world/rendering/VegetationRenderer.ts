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

interface ForestMassPoint {
  x: number;
  y: number;
  z: number;
  radius: number;
  stretch: number;
  height: number;
  rotation: number;
  colorMix: number;
}

interface TreePoint {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  variant: number;
}

export function addVegetation(scene: THREE.Scene): void {
  addForestMassLayer(scene);
  addRepresentativeTreeLayer(scene);
}

function addForestMassLayer(scene: THREE.Scene): void {
  const masses: ForestMassPoint[] = [];
  const spacing = 5.2;

  for (let x = -WORLD_HALF_WIDTH + 7; x <= WORLD_HALF_WIDTH - 7; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 7; z <= WORLD_HALF_DEPTH - 7; z += spacing) {
      const px = x + (deterministic01(x, z, 101) - 0.5) * spacing * 0.86;
      const pz = z + (deterministic01(x, z, 103) - 0.5) * spacing * 0.86;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const mountain = mountainStrengthAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.38) * 1.18, 0, 0.62);
      if (density < 0.46 || deterministic01(px, pz, 107) > chance) continue;

      const uplandCompactness = 1 - mountain * 0.22;
      masses.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        radius: (2.15 + density * 2.35 + deterministic01(px, pz, 109) * 1.25) * uplandCompactness,
        stretch: 0.62 + deterministic01(px, pz, 113) * 0.56,
        height: 0.18 + density * 0.32 + mountain * 0.09,
        rotation: deterministic01(px, pz, 127) * Math.PI * 2,
        colorMix: deterministic01(px, pz, 131),
      });
    }
  }

  const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const canopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, masses.length);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const deepForest = new THREE.Color(0x334936);
  const midForest = new THREE.Color(0x52644a);

  masses.forEach((mass, index) => {
    quaternion.setFromAxisAngle(yAxis, mass.rotation);
    position.set(mass.x, mass.y + mass.height * 0.34, mass.z);
    scale.set(mass.radius, mass.height, mass.radius * mass.stretch);
    matrix.compose(position, quaternion, scale);
    canopy.setMatrixAt(index, matrix);
    canopy.setColorAt(index, deepForest.clone().lerp(midForest, 0.28 + mass.colorMix * 0.48));
  });

  canopy.instanceMatrix.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  canopy.receiveShadow = true;
  scene.add(canopy);
}

function addRepresentativeTreeLayer(scene: THREE.Scene): void {
  const points: TreePoint[] = [];
  const spacing = 4.15;

  for (let x = -WORLD_HALF_WIDTH + 5; x <= WORLD_HALF_WIDTH - 5; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 5; z <= WORLD_HALF_DEPTH - 5; z += spacing) {
      const px = x + (deterministic01(x, z, 7) - 0.5) * spacing * 0.8;
      const pz = z + (deterministic01(x, z, 11) - 0.5) * spacing * 0.8;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.58) * 0.42, 0, 0.13);
      if (density < 0.64 || deterministic01(px, pz, 17) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const selector = deterministic01(px, pz, 23);
      const variant = mountain > 0.48 || selector > 0.66 ? 1 : 0;
      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: 0.82 + deterministic01(px, pz, 29) * 0.46,
        rotation: deterministic01(px, pz, 31) * Math.PI * 2,
        variant,
      });
    }
  }

  const broadGeometry = new THREE.ConeGeometry(0.22, 0.42, 7);
  broadGeometry.translate(0, 0.21, 0);
  const coniferGeometry = new THREE.ConeGeometry(0.18, 0.52, 7);
  coniferGeometry.translate(0, 0.26, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });

  const groups = [points.filter((point) => point.variant === 0), points.filter((point) => point.variant === 1)];
  const meshes = [
    new THREE.InstancedMesh(broadGeometry, material, groups[0]?.length ?? 0),
    new THREE.InstancedMesh(coniferGeometry, material, groups[1]?.length ?? 0),
  ];

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const palettes = [
    [new THREE.Color(0x3b533b), new THREE.Color(0x627055)],
    [new THREE.Color(0x30483a), new THREE.Color(0x53634c)],
  ] as const;

  meshes.forEach((mesh, variant) => {
    const list = groups[variant] ?? [];
    const palette = palettes[variant] ?? palettes[0];
    list.forEach((point, index) => {
      quaternion.setFromAxisAngle(yAxis, point.rotation);
      position.set(point.x, point.y, point.z);
      scale.setScalar(point.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(
        index,
        palette[0].clone().lerp(palette[1], 0.2 + deterministic01(point.x, point.z, 41) * 0.62),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  scene.add(...meshes);
}
