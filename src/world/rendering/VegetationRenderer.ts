import * as THREE from 'three';
import { STRATEGIC_TERRITORIES } from '../StrategicWorld';
import {
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  deterministic01,
  forestDensityAt,
  isLandAt,
  mountainStrengthAt,
  terrainHeight,
} from '../WorldField';

type TreeSpecies = 'conifer' | 'deciduous';

interface TreePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly species: TreeSpecies;
  readonly tint: number;
}

export interface VegetationController {
  update(camera: THREE.Camera): void;
  dispose(): void;
}

const TREE_SPACING = 7.6;
const SETTLEMENT_CLEAR_RADIUS_SQ = 16 * 16;
const settlementPositions = STRATEGIC_TERRITORIES.flatMap((territory) =>
  [territory.capital, ...territory.settlements].map((settlement) => settlement.position),
);

export async function addVegetation(scene: THREE.Scene): Promise<VegetationController> {
  const points = collectTrees();
  const root = new THREE.Group();
  root.name = 'stylized-vegetation';

  const trunkGeometry = new THREE.CylinderGeometry(0.42, 0.58, 3.15, 5);
  trunkGeometry.translate(0, 1.575, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  const trunks = createTreeInstances(points, trunkGeometry, trunkMaterial, 'trunk');
  root.add(trunks);

  const deciduousPoints = points.filter((point) => point.species === 'deciduous');
  const deciduousGeometry = new THREE.IcosahedronGeometry(2.12, 1);
  deciduousGeometry.scale(1, 0.92, 1);
  deciduousGeometry.translate(0, 4.9, 0);
  const deciduousMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  const deciduous = createTreeInstances(
    deciduousPoints,
    deciduousGeometry,
    deciduousMaterial,
    'deciduous',
  );
  root.add(deciduous);

  const coniferPoints = points.filter((point) => point.species === 'conifer');
  const coniferGeometry = new THREE.ConeGeometry(2.05, 4.8, 7);
  coniferGeometry.translate(0, 4.9, 0);
  const coniferMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    flatShading: true,
  });
  const conifers = createTreeInstances(
    coniferPoints,
    coniferGeometry,
    coniferMaterial,
    'conifer',
  );
  root.add(conifers);

  scene.add(root);

  let farMode: boolean | null = null;
  const update = (camera: THREE.Camera): void => {
    const nextFarMode = camera.position.y > 690;
    if (nextFarMode === farMode) return;
    farMode = nextFarMode;

    trunks.visible = !nextFarMode;
    deciduous.castShadow = !nextFarMode;
    conifers.castShadow = !nextFarMode;
  };

  return {
    update,
    dispose: () => {
      scene.remove(root);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}

function collectTrees(): TreePoint[] {
  const points: TreePoint[] = [];

  for (let x = -WORLD_HALF_WIDTH + 14; x <= WORLD_HALF_WIDTH - 14; x += TREE_SPACING) {
    for (let z = -WORLD_HALF_DEPTH + 14; z <= WORLD_HALF_DEPTH - 14; z += TREE_SPACING) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * TREE_SPACING * 0.88;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * TREE_SPACING * 0.88;
      if (!isLandAt(px, pz) || isNearSettlement(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const patch = deterministic01(Math.floor(px / 34), Math.floor(pz / 34), 71);
      const chance = THREE.MathUtils.clamp(
        (density - 0.36) * 1.58 + (patch - 0.5) * 0.22,
        0,
        0.82,
      );
      if (density < 0.45 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const species: TreeSpecies =
        mountain > 0.34 || deterministic01(px, pz, 41) > 0.87 ? 'conifer' : 'deciduous';

      points.push({
        x: px,
        y: terrainHeight(px, pz) - 0.03,
        z: pz,
        scale: 0.78 + deterministic01(px, pz, 31) * 0.44,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        species,
        tint: deterministic01(px, pz, 43),
      });
    }
  }

  return points;
}

function isNearSettlement(x: number, z: number): boolean {
  for (const [sx, sz] of settlementPositions) {
    const dx = x - sx;
    const dz = z - sz;
    if (dx * dx + dz * dz < SETTLEMENT_CLEAR_RADIUS_SQ) return true;
  }
  return false;
}

function createTreeInstances(
  points: readonly TreePoint[],
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  kind: 'trunk' | TreeSpecies,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  mesh.name = `stylized-${kind}-trees`;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.receiveShadow = true;
  mesh.castShadow = kind !== 'trunk';

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y, point.z);
    scale.setScalar(point.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);

    if (kind === 'trunk') {
      color.set(0x8b6c4d).offsetHSL(0, 0, (point.tint - 0.5) * 0.05);
    } else if (kind === 'conifer') {
      color.set(0x3f7650).offsetHSL((point.tint - 0.5) * 0.018, 0, (point.tint - 0.5) * 0.07);
    } else {
      color.set(0x5f8f4c).offsetHSL((point.tint - 0.5) * 0.022, 0, (point.tint - 0.5) * 0.09);
    }
    mesh.setColorAt(index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}
