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
type TreeDisplayMode = 'strategic' | TreeLod;

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

interface ForestMass {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly material: THREE.ShaderMaterial;
}

export interface VegetationController {
  update(camera: THREE.Camera): void;
  dispose(): void;
}

const TREE_SPACING = 1.82;
const TREE_CHUNK_SIZE = 58;
const HIGH_LOD_MAX_CAMERA_Y = 78;
const MID_LOD_MAX_CAMERA_Y = 148;
const STRATEGIC_MASS_ONLY_CAMERA_Y = 185;
const TREE_MODEL_HEIGHT: Record<TreeSpecies, number> = {
  conifer: 0.88,
  deciduous: 0.82,
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

  const forestMass = createForestMass();
  root.add(forestMass.mesh, lodRoots.low, lodRoots.mid, lodRoots.high);
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

  let activeMode: TreeDisplayMode | null = null;

  const update = (camera: THREE.Camera): void => {
    const cameraY = camera.position.y;
    const nextMode: TreeDisplayMode =
      cameraY > STRATEGIC_MASS_ONLY_CAMERA_Y
        ? 'strategic'
        : cameraY > MID_LOD_MAX_CAMERA_Y
          ? 'low'
          : cameraY > HIGH_LOD_MAX_CAMERA_Y
            ? 'mid'
            : 'high';

    if (nextMode === activeMode) return;
    activeMode = nextMode;

    lodRoots.low.visible = nextMode === 'low';
    lodRoots.mid.visible = nextMode === 'mid';
    lodRoots.high.visible = nextMode === 'high';

    const forestOpacity =
      nextMode === 'strategic'
        ? 0.78
        : nextMode === 'low'
          ? 0.52
          : nextMode === 'mid'
            ? 0.34
            : 0.18;
    forestMass.material.uniforms.forestOpacity.value = forestOpacity;
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
      const px = x + (deterministic01(x, z, 17) - 0.5) * TREE_SPACING * 0.92;
      const pz = z + (deterministic01(x, z, 23) - 0.5) * TREE_SPACING * 0.92;
      if (!isLandAt(px, pz) || isNearSettlement(px, pz)) continue;

      const density = forestDensityAt(px, pz);
      const cluster = forestClusterAt(px, pz);
      const suitability = smoothstep01(0.44, 0.74, density);
      const clusterCore = smoothstep01(0.40, 0.68, cluster + (density - 0.5) * 0.34);
      const chance = THREE.MathUtils.clamp(
        0.03 + suitability * clusterCore * 0.94,
        0,
        0.92,
      );
      if (density < 0.43 || deterministic01(px, pz, 29) > chance) continue;

      const mountain = mountainStrengthAt(px, pz);
      const coniferBias = deterministic01(px, pz, 41);
      const species: TreeSpecies =
        mountain > 0.32 || coniferBias > 0.84 ? 'conifer' : 'deciduous';

      const interiorBoost = 0.90 + clusterCore * 0.16;
      points.push({
        x: px,
        y: terrainHeight(px, pz) - 0.015,
        z: pz,
        scale: interiorBoost * (0.86 + deterministic01(px, pz, 31) * 0.30),
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

function createForestMass(): ForestMass {
  const positions: number[] = [];
  const colors: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  const segments = 18;
  const step = 13.5;

  for (let gx = -WORLD_HALF_WIDTH + step; gx < WORLD_HALF_WIDTH - step; gx += step) {
    for (let gz = -WORLD_HALF_DEPTH + step; gz < WORLD_HALF_DEPTH - step; gz += step) {
      const cx = gx + (deterministic01(gx, gz, 131) - 0.5) * step * 0.78;
      const cz = gz + (deterministic01(gx, gz, 137) - 0.5) * step * 0.78;
      if (!isLandAt(cx, cz) || isNearSettlement(cx, cz)) continue;

      const density = forestDensityAt(cx, cz);
      const cluster = forestClusterAt(cx, cz);
      const strength =
        smoothstep01(0.49, 0.80, density)
        * smoothstep01(0.40, 0.70, cluster + density * 0.12);
      if (strength < 0.12) continue;

      const mountain = mountainStrengthAt(cx, cz);
      const radiusX = 5.8 + strength * 10.8 + deterministic01(cx, cz, 139) * 3.0;
      const radiusZ = 5.4 + strength * 9.4 + deterministic01(cx, cz, 149) * 3.2;
      const baseColor = new THREE.Color(mountain > 0.35 ? 0x263b2f : 0x314b31);
      const colorJitter = deterministic01(cx, cz, 151);
      baseColor.offsetHSL(
        (colorJitter - 0.5) * 0.018,
        (colorJitter - 0.5) * 0.05,
        (colorJitter - 0.5) * 0.045,
      );

      appendForestPatch(
        positions,
        colors,
        alphas,
        indices,
        cx,
        cz,
        radiusX,
        radiusZ,
        strength,
        baseColor,
        segments,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('forestAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      forestOpacity: { value: 0.78 },
    },
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>

      attribute vec3 color;
      attribute float forestAlpha;

      varying vec3 vForestColor;
      varying float vForestAlpha;

      void main() {
        vForestColor = color;
        vForestAlpha = forestAlpha;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>

      uniform float forestOpacity;
      varying vec3 vForestColor;
      varying float vForestAlpha;

      void main() {
        float alpha = vForestAlpha * forestOpacity;
        if ( alpha < 0.008 ) discard;
        gl_FragColor = vec4( vForestColor, alpha );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'strategic-forest-mass';
  mesh.renderOrder = 1.6;
  mesh.frustumCulled = true;

  return { mesh, material };
}

function appendForestPatch(
  positions: number[],
  colors: number[],
  alphas: number[],
  indices: number[],
  cx: number,
  cz: number,
  radiusX: number,
  radiusZ: number,
  strength: number,
  color: THREE.Color,
  segments: number,
): void {
  const base = positions.length / 3;
  const centerHeight = terrainHeight(cx, cz) + 0.045;
  positions.push(cx, centerHeight, cz);
  colors.push(color.r, color.g, color.b);
  alphas.push(0.46 + strength * 0.18);

  const innerStart = base + 1;
  const outerStart = innerStart + segments;

  for (let ring = 0; ring < 2; ring += 1) {
    const ringScale = ring === 0 ? 0.58 : 1.0;
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const irregularity =
        0.80
        + deterministic01(cx + i * 1.73, cz - i * 0.91, 163 + ring * 17) * 0.34;
      const x = cx + Math.cos(angle) * radiusX * ringScale * irregularity;
      const z = cz + Math.sin(angle) * radiusZ * ringScale * irregularity;
      const y = terrainHeight(x, z) + 0.044;

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      alphas.push(ring === 0 ? 0.38 + strength * 0.14 : 0.0);
    }
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    const innerA = innerStart + i;
    const innerB = innerStart + next;
    const outerA = outerStart + i;
    const outerB = outerStart + next;

    indices.push(base, innerA, innerB);
    indices.push(innerA, outerA, outerB);
    indices.push(innerA, outerB, innerB);
  }
}

function forestClusterAt(x: number, z: number): number {
  const broad = smoothValueNoise(x / 27, z / 27, 71);
  const medium = smoothValueNoise(x / 13, z / 13, 83);
  const fine = smoothValueNoise(x / 6.5, z / 6.5, 97);
  return THREE.MathUtils.clamp(broad * 0.56 + medium * 0.31 + fine * 0.13, 0, 1);
}

function smoothValueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothCurve(x - x0);
  const tz = smoothCurve(z - z0);

  const a = deterministic01(x0, z0, seed);
  const b = deterministic01(x0 + 1, z0, seed);
  const c = deterministic01(x0, z0 + 1, seed);
  const d = deterministic01(x0 + 1, z0 + 1, seed);

  const top = THREE.MathUtils.lerp(a, b, tx);
  const bottom = THREE.MathUtils.lerp(c, d, tx);
  return THREE.MathUtils.lerp(top, bottom, tz);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function smoothstep01(min: number, max: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - min) / Math.max(0.0001, max - min), 0, 1);
  return t * t * (3 - 2 * t);
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
