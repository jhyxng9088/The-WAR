import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  islandSignal,
  mountainStrengthAt,
  riverDistanceAt,
  terrainSampleAt,
  type TerrainSample,
} from '../WorldField';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();
const OCEAN_WIDTH = OCEAN_COVERAGE.width;
const OCEAN_DEPTH = OCEAN_COVERAGE.depth;
const OCEAN_SEGMENTS_X = 176;
const OCEAN_SEGMENTS_Z = 132;
const SUN_DIRECTION = new THREE.Vector3(-0.52, 0.78, 0.35).normalize();

const COLORS = {
  deepWater: new THREE.Color(0x243f47),
  offshoreWater: new THREE.Color(0x3e6066),
  shallowWater: new THREE.Color(0x718a80),
  wetShore: new THREE.Color(0x777764),
  sand: new THREE.Color(0xa08e6a),
  saltGrass: new THREE.Color(0x6e765b),
  lowland: new THREE.Color(0x66724d),
  fertile: new THREE.Color(0x496445),
  floodplain: new THREE.Color(0x5b704e),
  dryPlain: new THREE.Color(0x88794f),
  upland: new THREE.Color(0x62675a),
  dryUpland: new THREE.Color(0x756b55),
  earth: new THREE.Color(0x70624f),
  stone: new THREE.Color(0x77736b),
  paleStone: new THREE.Color(0x91897d),
  cliff: new THREE.Color(0x66645f),
};

export function addTerrain(scene: THREE.Scene): void {
  scene.add(createOcean());
  scene.add(createLand());
}

function createOcean(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    OCEAN_WIDTH,
    OCEAN_DEPTH,
    OCEAN_SEGMENTS_X,
    OCEAN_SEGMENTS_Z,
  );
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const signal = islandSignal(x, z);
    const shelf = THREE.MathUtils.smoothstep(signal, -0.42, -0.045);
    const shoal = THREE.MathUtils.smoothstep(signal, -0.11, 0.008);

    const color = COLORS.deepWater.clone().lerp(COLORS.offshoreWater, shelf * 0.76);
    color.lerp(COLORS.shallowWater, shoal * 0.7);

    const basinVariation =
      broadRegion(x, z, -85, -48, 170, 118) * 0.022 -
      broadRegion(x, z, 96, 56, 150, 105) * 0.013;
    color.offsetHSL(0, basinVariation * 0.18, basinVariation);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0,
      dithering: true,
    }),
  );
  mesh.position.y = SEA_LEVEL;
  mesh.renderOrder = -2;
  return mesh;
}

function createLand(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    WORLD_WIDTH,
    WORLD_DEPTH,
    TERRAIN_SEGMENTS_X,
    TERRAIN_SEGMENTS_Z,
  );
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const samples: TerrainSample[] = new Array(positions.count);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const sample = terrainSampleAt(x, z);
    samples[i] = sample;
    positions.setZ(i, sample.height);
  }

  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);

  const normals = geometry.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const normal = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    const sample = samples[i];
    if (!sample) continue;

    const x = positions.getX(i);
    const z = positions.getZ(i);
    normal.set(normals.getX(i), normals.getY(i), normals.getZ(i)).normalize();

    const color = terrainColor(x, z, sample, normal);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      dithering: true,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function terrainColor(
  x: number,
  z: number,
  sample: TerrainSample,
  normal: THREE.Vector3,
): THREE.Color {
  if (sample.height <= SEA_LEVEL || sample.biome === 'sea') {
    return COLORS.deepWater.clone().lerp(COLORS.shallowWater, sample.coastInfluence * 0.6);
  }

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 0.78, 2.55);
  const highland = THREE.MathUtils.smoothstep(sample.height, 1.15, 3.7);
  const summit = THREE.MathUtils.smoothstep(sample.height, 3.2, 5.7);
  const slope = 1 - THREE.MathUtils.clamp(normal.y, 0, 1);
  const steep = THREE.MathUtils.smoothstep(slope, 0.045, 0.27);
  const mountain = mountainStrengthAt(x, z);
  const riverDistance = riverDistanceAt(x, z);
  const floodplain = Math.exp(-(riverDistance * riverDistance) / 15.5) * lowland;
  const riverShelf = Math.exp(-(riverDistance * riverDistance) / 4.8) * lowland;

  const northWet = broadRegion(x, z, -18, 63, 145, 84);
  const westTemperate = broadRegion(x, z, -86, 10, 170, 126);
  const centralBasin = broadRegion(x, z, -8, 7, 190, 112);
  const southDry = broadRegion(x, z, 70, -62, 150, 92);
  const eastDry = broadRegion(x, z, 104, -12, 122, 105);
  const plateau = broadRegion(x, z, 13, 61, 118, 74);

  const regionalMoisture = THREE.MathUtils.clamp(
    sample.moisture + northWet * 0.1 + westTemperate * 0.05 - southDry * 0.12 - eastDry * 0.08,
    0,
    1,
  );
  const regionalDryness = THREE.MathUtils.clamp(1 - regionalMoisture + southDry * 0.24 + eastDry * 0.16, 0, 1);

  const color = COLORS.lowland.clone();
  color.lerp(COLORS.fertile, sample.fertility * 0.58 + centralBasin * sample.fertility * 0.12);
  color.lerp(COLORS.floodplain, floodplain * (0.3 + sample.fertility * 0.38));
  color.lerp(COLORS.dryPlain, regionalDryness * lowland * 0.72);
  color.lerp(COLORS.upland, highland * 0.72);
  color.lerp(COLORS.dryUpland, regionalDryness * highland * 0.44);
  color.lerp(COLORS.earth, steep * (1 - mountain) * 0.38 + sample.roughness * 0.13);

  const exposedRock = THREE.MathUtils.clamp(
    steep * 0.78 + mountain * highland * 0.44 + sample.roughness * summit * 0.46,
    0,
    1,
  );
  color.lerp(COLORS.stone, exposedRock * 0.74);
  color.lerp(COLORS.paleStone, summit * (0.34 + steep * 0.28));

  const ridgeShadow = mountain * steep * (0.52 + plateau * 0.18);
  color.lerp(COLORS.cliff, ridgeShadow * 0.26);

  if (sample.coastInfluence > 0.01) {
    const coastLow = 1 - THREE.MathUtils.smoothstep(sample.height, 0.04, 0.56);
    const coastal = sample.coastInfluence * coastLow;
    const rockyCoast = coastal * THREE.MathUtils.clamp(sample.roughness * 1.25 + steep * 0.92, 0, 1);
    const wetCoast = coastal * regionalMoisture * (1 - rockyCoast);
    const dryCoast = coastal * regionalDryness * (1 - rockyCoast);

    color.lerp(COLORS.wetShore, wetCoast * 0.58);
    color.lerp(COLORS.saltGrass, coastal * sample.fertility * 0.3);
    color.lerp(COLORS.sand, dryCoast * 0.7);
    color.lerp(COLORS.cliff, rockyCoast * 0.82);
  }

  color.lerp(COLORS.floodplain, riverShelf * 0.09);

  const sunFacing = THREE.MathUtils.clamp((normal.dot(SUN_DIRECTION) + 0.16) / 1.16, 0, 1);
  const hillshade = 0.78 + sunFacing * 0.27 + normal.y * 0.055;
  color.multiplyScalar(hillshade);

  return color;
}

function broadRegion(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
): number {
  const nx = (x - centerX) / radiusX;
  const nz = (z - centerZ) / radiusZ;
  return Math.exp(-(nx * nx + nz * nz) * 2.15);
}
