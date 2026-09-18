import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
type TreeLod = 'low' | 'mid' | 'high';

interface TreePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly species: TreeSpecies;
  readonly colorMix: number;
}

interface TreePart {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
}

interface TreeTemplate {
  readonly parts: readonly TreePart[];
}

interface TreeAssetSet {
  readonly conifer: Record<TreeLod, TreeTemplate>;
  readonly deciduous: Record<TreeLod, TreeTemplate>;
}

export interface VegetationController {
  update(camera: THREE.Camera): void;
  dispose(): void;
}

const TREE_SPACING = 2.55;
const TREE_CHUNK_SIZE = 70;
const HIGH_LOD_MAX_CAMERA_Y = 78;
const MID_LOD_MAX_CAMERA_Y = 148;
const TREE_MODEL_HEIGHT: Record<TreeSpecies, number> = {
  conifer: 0.76,
  deciduous: 0.68,
};

const SETTLEMENT_CLEAR_RADIUS_SQ = 3.4 * 3.4;
const settlementPositions = STRATEGIC_TERRITORIES.flatMap((territory) =>
  territory.settlements.map((settlement) => settlement.position),
);

export async function addVegetation(scene: THREE.Scene): Promise<VegetationController> {
  const points = collectTrees();
  const assets = await loadTreeAssets();

  const root = new THREE.Group();
  root.name = 'world-vegetation';

  const lodRoots: Record<TreeLod, THREE.Group> = {
    low: new THREE.Group(),
    mid: new THREE.Group(),
    high: new THREE.Group(),
  };
  lodRoots.low.name = 'trees-low';
  lodRoots.mid.name = 'trees-mid';
  lodRoots.high.name = 'trees-high';

  root.add(lodRoots.low, lodRoots.mid, lodRoots.high);
  scene.add(root);

  const species: readonly TreeSpecies[] = ['conifer', 'deciduous'];
  const lods: readonly TreeLod[] = ['low', 'mid', 'high'];

  for (const lod of lods) {
    for (const treeSpecies of species) {
      const speciesPoints = points.filter((point) => point.species === treeSpecies);
      addChunkedInstances(
        lodRoots[lod],
        assets[treeSpecies][lod],
        speciesPoints,
        treeSpecies,
        lod,
      );
    }
  }

  let activeLod: TreeLod | null = null;

  const update = (camera: THREE.Camera): void => {
    const cameraY = camera.position.y;
    const nextLod: TreeLod =
      cameraY <= HIGH_LOD_MAX_CAMERA_Y
        ? 'high'
        : cameraY <= MID_LOD_MAX_CAMERA_Y
          ? 'mid'
          : 'low';

    if (nextLod === activeLod) return;
    activeLod = nextLod;

    lodRoots.low.visible = nextLod === 'low';
    lodRoots.mid.visible = nextLod === 'mid';
    lodRoots.high.visible = nextLod === 'high';
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

  for (let x = -WORLD_HALF_WIDTH + 5; x <= WORLD_HALF_WIDTH - 5; x += TREE_SPACING) {
    for (let z = -WORLD_HALF_DEPTH + 5; z <= WORLD_HALF_DEPTH - 5; z += TREE_SPACING) {
      const px = x + (deterministic01(x, z, 17) - 0.5) * TREE_SPACING * 0.94;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * TREE_SPACING * 0.94;
      if (!isLandAt(px, pz) || isNearSettlement(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const chance = THREE.MathUtils.clamp((density - 0.43) * 0.82, 0, 0.42);
      if (density < 0.49 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const coniferBias = deterministic01(px, pz, 41);
      const species: TreeSpecies =
        mountain > 0.38 || coniferBias > 0.79 ? 'conifer' : 'deciduous';

      points.push({
        x: px,
        y: terrainHeight(px, pz) - 0.015,
        z: pz,
        scale: 0.82 + deterministic01(px, pz, 31) * 0.34,
        rotation: deterministic01(px, pz, 37) * Math.PI * 2,
        species,
        colorMix: deterministic01(px, pz, 43),
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

async function loadTreeAssets(): Promise<TreeAssetSet> {
  const loader = new GLTFLoader();

  const [
    coniferLow,
    coniferMid,
    coniferHigh,
    deciduousLow,
    deciduousMid,
    deciduousHigh,
  ] = await Promise.all([
    loadTreeTemplate(loader, treeAssetUrl('conifer-low.glb'), 'conifer'),
    loadTreeTemplate(loader, treeAssetUrl('conifer-mid.glb'), 'conifer'),
    loadTreeTemplate(loader, treeAssetUrl('conifer-high.glb'), 'conifer'),
    loadTreeTemplate(loader, treeAssetUrl('deciduous-low.glb'), 'deciduous'),
    loadTreeTemplate(loader, treeAssetUrl('deciduous-mid.glb'), 'deciduous'),
    loadTreeTemplate(loader, treeAssetUrl('deciduous-high.glb'), 'deciduous'),
  ]);

  return {
    conifer: { low: coniferLow, mid: coniferMid, high: coniferHigh },
    deciduous: { low: deciduousLow, mid: deciduousMid, high: deciduousHigh },
  };
}

async function loadTreeTemplate(
  loader: GLTFLoader,
  url: string,
  species: TreeSpecies,
): Promise<TreeTemplate> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const modelHeight = Math.max(0.0001, size.y);
  const modelScale = TREE_MODEL_HEIGHT[species] / modelHeight;
  const parts: TreePart[] = [];

  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.translate(-center.x, -bounds.min.y, -center.z);
    geometry.scale(modelScale, modelScale, modelScale);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = cloneTreeMaterial(object.material);
    parts.push({ geometry, material });
  });

  if (parts.length === 0) {
    throw new Error(`Tree model contains no mesh: ${url}`);
  }

  return { parts };
}

function cloneTreeMaterial(
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  const cloneOne = (source: THREE.Material): THREE.Material => {
    const cloned = source.clone();
    if (cloned instanceof THREE.MeshStandardMaterial) {
      cloned.roughness = Math.max(0.86, cloned.roughness);
      cloned.metalness = 0;
      cloned.dithering = true;
    }
    return cloned;
  };

  return Array.isArray(material) ? material.map(cloneOne) : cloneOne(material);
}

function addChunkedInstances(
  root: THREE.Group,
  template: TreeTemplate,
  points: readonly TreePoint[],
  species: TreeSpecies,
  lod: TreeLod,
): void {
  const chunks = new Map<string, TreePoint[]>();

  for (const point of points) {
    const chunkX = Math.floor((point.x + WORLD_HALF_WIDTH) / TREE_CHUNK_SIZE);
    const chunkZ = Math.floor((point.z + WORLD_HALF_DEPTH) / TREE_CHUNK_SIZE);
    const key = `${chunkX}:${chunkZ}`;
    const chunk = chunks.get(key);
    if (chunk) chunk.push(point);
    else chunks.set(key, [point]);
  }

  for (const chunkPoints of chunks.values()) {
    for (const part of template.parts) {
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        chunkPoints.length,
      );
      mesh.name = `${species}-${lod}-trees`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.castShadow = lod !== 'low';
      mesh.receiveShadow = true;

      populateInstances(mesh, chunkPoints, species);
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
}

function populateInstances(
  mesh: THREE.InstancedMesh,
  points: readonly TreePoint[],
  species: TreeSpecies,
): void {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const neutral = new THREE.Color(0xffffff);
  const speciesTint = new THREE.Color(species === 'conifer' ? 0xd4ddcf : 0xdde0cb);
  const color = new THREE.Color();

  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(yAxis, point.rotation);
    position.set(point.x, point.y, point.z);
    scale.setScalar(point.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);

    color.copy(neutral).lerp(speciesTint, 0.05 + point.colorMix * 0.10);
    mesh.setColorAt(index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function treeAssetUrl(filename: string): string {
  const basePath = window.location.pathname.startsWith('/The-WAR/')
    ? '/The-WAR/'
    : '/';
  return new URL(`${basePath}assets/trees/${filename}`, window.location.origin).href;
}
