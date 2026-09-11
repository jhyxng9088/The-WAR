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
  const spacing = 2.4;

  for (let x = -WORLD_HALF_WIDTH + 4; x <= WORLD_HALF_WIDTH - 4; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 4; z <= WORLD_HALF_DEPTH - 4; z += spacing) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * spacing * 0.9;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * spacing * 0.9;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.34) * 0.78, 0, 0.46);
      if (density < 0.43 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const uplandScale = THREE.MathUtils.lerp(1, 0.8, mountain);
      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: (0.92 + deterministic01(px, pz, 31) * 0.64) * uplandScale,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        variant: mountain > 0.38 || deterministic01(px, pz, 41) > 0.64 ? 1 : 0,
        colorMix: deterministic01(px, pz, 43),
      });
    }
  }

  return points;
}

function addTreeVariant(scene: THREE.Scene, points: readonly TreePoint[], variant: 0 | 1): void {
  const geometry = variant === 0
    ? new THREE.DodecahedronGeometry(0.42, 0)
    : new THREE.ConeGeometry(0.34, 1.12, 7);

  if (variant === 0) {
    geometry.scale(1, 1.18, 1);
    geometry.translate(0, 0.5, 0);
  } else {
    geometry.translate(0, 0.56, 0);
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
  const dark = new THREE.Color(variant === 0 ? 0x173824 : 0x173229);
  const light = new THREE.Color(variant === 0 ? 0x36563a : 0x314c3b);

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y + 0.02, point.z);
    const lateral = point.scale * (0.88 + point.colorMix * 0.16);
    scale.set(lateral, point.scale, lateral);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, dark.clone().lerp(light, 0.18 + point.colorMix * 0.64));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  scene.add(mesh);
}
