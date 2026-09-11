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
  const spacing = 3.15;

  for (let x = -WORLD_HALF_WIDTH + 5; x <= WORLD_HALF_WIDTH - 5; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 5; z <= WORLD_HALF_DEPTH - 5; z += spacing) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * spacing * 0.88;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * spacing * 0.88;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.43) * 0.54, 0, 0.28);
      if (density < 0.5 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: 0.72 + deterministic01(px, pz, 31) * 0.54,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        variant: mountain > 0.46 || deterministic01(px, pz, 41) > 0.68 ? 1 : 0,
        colorMix: deterministic01(px, pz, 43),
      });
    }
  }

  return points;
}

function addTreeVariant(scene: THREE.Scene, points: readonly TreePoint[], variant: 0 | 1): void {
  const geometry = variant === 0
    ? new THREE.ConeGeometry(0.24, 0.48, 7)
    : new THREE.ConeGeometry(0.19, 0.62, 6);
  geometry.translate(0, variant === 0 ? 0.24 : 0.31, 0);

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
  const dark = new THREE.Color(variant === 0 ? 0x2f4837 : 0x293e36);
  const light = new THREE.Color(variant === 0 ? 0x52654b : 0x435747);

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y, point.z);
    scale.setScalar(point.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, dark.clone().lerp(light, 0.18 + point.colorMix * 0.62));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}
