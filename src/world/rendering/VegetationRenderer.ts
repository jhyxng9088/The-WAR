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

const TREE_LOD_DISTANCE = 235;

export function addVegetation(scene: THREE.Scene): void {
  const points = collectTrees();
  const nearForest = new THREE.Group();
  addTreeVariant(nearForest, points.filter((point) => point.variant === 0), 0);
  addTreeVariant(nearForest, points.filter((point) => point.variant === 1), 1);

  const lod = new THREE.LOD();
  lod.addLevel(nearForest, 0);
  lod.addLevel(new THREE.Object3D(), TREE_LOD_DISTANCE);
  lod.autoUpdate = true;
  scene.add(lod);
}

function collectTrees(): TreePoint[] {
  const points: TreePoint[] = [];
  const spacing = 1.82;

  for (let x = -WORLD_HALF_WIDTH + 4; x <= WORLD_HALF_WIDTH - 4; x += spacing) {
    for (let z = -WORLD_HALF_DEPTH + 4; z <= WORLD_HALF_DEPTH - 4; z += spacing) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * spacing * 0.94;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * spacing * 0.94;
      if (!isLandAt(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.24) * 1.18, 0, 0.74);
      if (density < 0.34 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const uplandScale = THREE.MathUtils.lerp(1, 0.74, mountain);
      points.push({
        x: px,
        y: terrainHeight(px, pz),
        z: pz,
        scale: (0.72 + deterministic01(px, pz, 31) * 0.48) * uplandScale,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        variant: mountain > 0.36 || deterministic01(px, pz, 41) > 0.58 ? 1 : 0,
        colorMix: deterministic01(px, pz, 43),
      });
    }
  }

  return points;
}

function addTreeVariant(parent: THREE.Group, points: readonly TreePoint[], variant: 0 | 1): void {
  const geometry = variant === 0
    ? new THREE.DodecahedronGeometry(0.38, 0)
    : new THREE.ConeGeometry(0.3, 1.02, 7);

  if (variant === 0) {
    geometry.scale(1, 1.14, 1);
    geometry.translate(0, 0.44, 0);
  } else {
    geometry.translate(0, 0.51, 0);
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
  const dark = new THREE.Color(variant === 0 ? 0x24452d : 0x203d31);
  const light = new THREE.Color(variant === 0 ? 0x48644a : 0x435c49);

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y + 0.02, point.z);
    const lateral = point.scale * (0.9 + point.colorMix * 0.12);
    scale.set(lateral, point.scale, lateral);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, dark.clone().lerp(light, 0.22 + point.colorMix * 0.58));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  parent.add(mesh);
}
