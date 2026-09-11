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

interface TreePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly variant: 0 | 1;
  readonly colorMix: number;
}

export function addVegetation(scene: THREE.Scene): void {
  const points = collectTrees();
  addTreeVariant(scene, points.filter((point) => point.variant === 0), 0);
  addTreeVariant(scene, points.filter((point) => point.variant === 1), 1);
}

function collectTrees(): TreePoint[] {
  const points: TreePoint[] = [];
  const spacing = 1.85;

  for (let x = -WORLD_HALF_WIDTH + 4; x <= WORLD_HALF_WIDTH - 4; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 4; z <= WORLD_HALF_DEPTH - 4; z += spacing) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * spacing * 0.92;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * spacing * 0.92;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.27) * 1.15, 0, 0.72);
      if (density < 0.37 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const uplandScale = THREE.MathUtils.lerp(1, 0.76, mountain);
      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: (1.0 + deterministic01(px, pz, 31) * 0.62) * uplandScale,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        variant: mountain > 0.4 || deterministic01(px, pz, 41) > 0.7 ? 1 : 0,
        colorMix: deterministic01(px, pz, 43),
      });
    }
  }

  return points;
}

function addTreeVariant(scene: THREE.Scene, points: readonly TreePoint[], variant: 0 | 1): void {
  const geometry = variant === 0
    ? new THREE.IcosahedronGeometry(0.39, 0)
    : new THREE.ConeGeometry(0.3, 0.96, 7);

  if (variant === 0) {
    geometry.scale(1.12, 1.05, 1.12);
    geometry.translate(0, 0.43, 0);
  } else {
    geometry.translate(0, 0.48, 0);
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const dark = new THREE.Color(variant === 0 ? 0x21462b : 0x1c3c2d);
  const light = new THREE.Color(variant === 0 ? 0x4b7048 : 0x3e6047);
  const color = new THREE.Color();

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y + 0.018, point.z);
    const lateral = point.scale * (0.94 + point.colorMix * 0.14);
    scale.set(lateral, point.scale, lateral);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    color.copy(dark).lerp(light, 0.2 + point.colorMix * 0.62);
    mesh.setColorAt(index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  scene.add(mesh);
}
