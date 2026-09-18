import * as THREE from 'three';
import { NATIONS } from '../StrategicWorld';
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

const TREE_SPACING = 5.4;
const FOREST_PATCH_STEP = 25;
const SETTLEMENT_CLEAR_RADIUS_SQ = 11 * 11;
const settlementPositions = NATIONS.map((nation) => nation.capital.position);

export async function addVegetation(scene: THREE.Scene): Promise<VegetationController> {
  const points = collectTrees();
  const root = new THREE.Group();
  root.name = 'stylized-vegetation';

  const forestFloor = createForestFloor();
  root.add(forestFloor);

  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.29, 1.85, 5);
  trunkGeometry.translate(0, 0.925, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  const trunks = createTreeInstances(points, trunkGeometry, trunkMaterial, 'trunk');
  root.add(trunks);

  const deciduousPoints = points.filter((point) => point.species === 'deciduous');
  const deciduousGeometry = new THREE.IcosahedronGeometry(1.18, 0);
  deciduousGeometry.scale(1, 0.9, 1);
  deciduousGeometry.translate(0, 2.9, 0);
  const deciduousMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
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
  const coniferGeometry = new THREE.ConeGeometry(1.12, 2.85, 6);
  coniferGeometry.translate(0, 2.95, 0);
  const coniferMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
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
    const nextFarMode = camera.position.y > 650;
    if (nextFarMode === farMode) return;
    farMode = nextFarMode;

    // At strategic zoom the forest should read as a mass, not thousands of trunks.
    trunks.visible = !nextFarMode;
    deciduous.castShadow = !nextFarMode;
    conifers.castShadow = !nextFarMode;
    forestFloor.material.opacity = nextFarMode ? 0.88 : 0.64;
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

  for (let x = -WORLD_HALF_WIDTH + 12; x <= WORLD_HALF_WIDTH - 12; x += TREE_SPACING) {
    for (let z = -WORLD_HALF_DEPTH + 12; z <= WORLD_HALF_DEPTH - 12; z += TREE_SPACING) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * TREE_SPACING * 0.9;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * TREE_SPACING * 0.9;
      if (!isLandAt(px, pz) || isNearSettlement(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const cluster = forestClusterAt(px, pz);
      const chance = THREE.MathUtils.clamp(
        (density - 0.34) * 1.62 + (cluster - 0.5) * 0.42,
        0,
        0.9,
      );
      if (density < 0.43 || cluster < 0.34 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const species: TreeSpecies =
        mountain > 0.34 || deterministic01(px, pz, 41) > 0.88 ? 'conifer' : 'deciduous';

      points.push({
        x: px,
        y: terrainHeight(px, pz) - 0.02,
        z: pz,
        scale: 0.78 + deterministic01(px, pz, 31) * 0.34,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        species,
        tint: deterministic01(px, pz, 43),
      });
    }
  }

  return points;
}

function createForestFloor(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const segments = 12;
  const baseColor = new THREE.Color();
  const vertexColor = new THREE.Color();

  for (
    let gx = -WORLD_HALF_WIDTH + FOREST_PATCH_STEP;
    gx < WORLD_HALF_WIDTH - FOREST_PATCH_STEP;
    gx += FOREST_PATCH_STEP
  ) {
    for (
      let gz = -WORLD_HALF_DEPTH + FOREST_PATCH_STEP;
      gz < WORLD_HALF_DEPTH - FOREST_PATCH_STEP;
      gz += FOREST_PATCH_STEP
    ) {
      const cx = gx + (deterministic01(gx, gz, 101) - 0.5) * FOREST_PATCH_STEP * 0.72;
      const cz = gz + (deterministic01(gx, gz, 103) - 0.5) * FOREST_PATCH_STEP * 0.72;
      if (!isLandAt(cx, cz) || isNearSettlement(cx, cz)) continue;

      const density = forestDensityAt(cx, cz);
      const cluster = forestClusterAt(cx, cz);
      const strength = THREE.MathUtils.clamp(
        (density - 0.47) * 2.1 + (cluster - 0.48) * 0.76,
        0,
        1,
      );
      if (strength < 0.18) continue;

      const radiusX = 9 + strength * 12 + deterministic01(cx, cz, 107) * 5;
      const radiusZ = 8 + strength * 11 + deterministic01(cx, cz, 109) * 5;
      const centerIndex = positions.length / 3;

      baseColor.set(mountainStrengthAt(cx, cz) > 0.34 ? 0x416744 : 0x4d7747);
      baseColor.offsetHSL(
        (deterministic01(cx, cz, 113) - 0.5) * 0.015,
        0,
        (deterministic01(cx, cz, 127) - 0.5) * 0.035,
      );

      positions.push(cx, terrainHeight(cx, cz) + 0.11, cz);
      colors.push(baseColor.r, baseColor.g, baseColor.b);

      for (let i = 0; i < segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        const irregularity = 0.76 + deterministic01(cx + i * 3.1, cz - i * 2.4, 131) * 0.38;
        const x = cx + Math.cos(angle) * radiusX * irregularity;
        const z = cz + Math.sin(angle) * radiusZ * irregularity;
        positions.push(x, terrainHeight(x, z) + 0.105, z);

        vertexColor.copy(baseColor).offsetHSL(
          0,
          0,
          (deterministic01(x, z, 137) - 0.5) * 0.025,
        );
        colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }

      for (let i = 0; i < segments; i += 1) {
        const a = centerIndex + 1 + i;
        const b = centerIndex + 1 + ((i + 1) % segments);
        indices.push(centerIndex, a, b);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stylized-forest-floor';
  mesh.renderOrder = 1.8;
  mesh.receiveShadow = true;
  return mesh;
}

function forestClusterAt(x: number, z: number): number {
  const broadCellX = Math.floor(x / 44);
  const broadCellZ = Math.floor(z / 44);
  const localCellX = Math.floor(x / 19);
  const localCellZ = Math.floor(z / 19);

  const broad = deterministic01(broadCellX, broadCellZ, 151);
  const local = deterministic01(localCellX, localCellZ, 157);
  return broad * 0.72 + local * 0.28;
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
      color.set(0x866a4d).offsetHSL(0, 0, (point.tint - 0.5) * 0.04);
    } else if (kind === 'conifer') {
      color.set(0x3d6d48).offsetHSL((point.tint - 0.5) * 0.012, 0, (point.tint - 0.5) * 0.055);
    } else {
      color.set(0x568247).offsetHSL((point.tint - 0.5) * 0.016, 0, (point.tint - 0.5) * 0.065);
    }
    mesh.setColorAt(index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}
