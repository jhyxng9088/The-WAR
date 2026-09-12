import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  coastInfluenceAt,
  mountainStrengthAt,
  riverDistanceAt,
  terrainSampleAt,
  type TerrainSample,
} from '../WorldField';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();
const OCEAN_SEGMENTS_X = 128;
const OCEAN_SEGMENTS_Z = 128;
const SUN_DIRECTION = new THREE.Vector3(-0.5, 0.8, 0.32).normalize();

const COLORS = {
  deepWater: new THREE.Color(0x173944),
  offshoreWater: new THREE.Color(0x285764),
  shallowWater: new THREE.Color(0x5b8582),
  wetShore: new THREE.Color(0x777862),
  sand: new THREE.Color(0xaa976e),
  lowland: new THREE.Color(0x71805a),
  fertile: new THREE.Color(0x55724d),
  forestFloor: new THREE.Color(0x36513f),
  floodplain: new THREE.Color(0x66805a),
  dryPlain: new THREE.Color(0x938358),
  upland: new THREE.Color(0x697062),
  earth: new THREE.Color(0x776650),
  stone: new THREE.Color(0x77746d),
  paleStone: new THREE.Color(0x9b958b),
  snow: new THREE.Color(0xd2d3cf),
  cliff: new THREE.Color(0x5e5d59),
};

export function addTerrain(scene: THREE.Scene): void {
  scene.add(createOcean());
  scene.add(createLand());
}

function createOcean(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    OCEAN_COVERAGE.width,
    OCEAN_COVERAGE.depth,
    OCEAN_SEGMENTS_X,
    OCEAN_SEGMENTS_Z,
  );
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const coast = coastInfluenceAt(x, z);
    const broad = 0.5 + 0.5 * Math.sin(x * 0.011 + z * 0.008);
    const color = COLORS.deepWater.clone().lerp(COLORS.offshoreWater, 0.22 + broad * 0.16);
    color.lerp(COLORS.shallowWater, coast * 0.78);

    const variation = Math.sin(x * 0.017 + z * 0.012) * 0.012;
    color.offsetHSL(0, variation * 0.14, variation);
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
      roughness: 0.7,
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
      roughness: 0.96,
      metalness: 0,
      dithering: true,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function terrainColor(x: number, z: number, sample: TerrainSample, normal: THREE.Vector3): THREE.Color {
  if (sample.height <= SEA_LEVEL || sample.biome === 'sea') {
    return COLORS.deepWater.clone().lerp(COLORS.shallowWater, sample.coastInfluence * 0.58);
  }

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 1.9, 4.35);
  const highland = THREE.MathUtils.smoothstep(sample.height, 3.25, 7.6);
  const summit = THREE.MathUtils.smoothstep(sample.height, 7.35, 10.9);
  const slope = 1 - THREE.MathUtils.clamp(normal.y, 0, 1);
  const steep = THREE.MathUtils.smoothstep(slope, 0.045, 0.28);
  const mountain = mountainStrengthAt(x, z);
  const riverDistance = riverDistanceAt(x, z);
  const floodplain = Math.exp(-(riverDistance * riverDistance) / 20.5) * lowland;
  const riverShelf = Math.exp(-(riverDistance * riverDistance) / 7.2) * lowland;

  const northWet = broadRegion(x, z, -35, 92, 188, 126);
  const westTemperate = broadRegion(x, z, -118, 15, 208, 156);
  const southDry = broadRegion(x, z, 76, -102, 184, 130);
  const eastDry = broadRegion(x, z, 134, -10, 154, 142);
  const regionalMoisture = THREE.MathUtils.clamp(
    sample.moisture + northWet * 0.1 + westTemperate * 0.05 - southDry * 0.12 - eastDry * 0.08,
    0,
    1,
  );
  const regionalDryness = THREE.MathUtils.clamp(1 - regionalMoisture + southDry * 0.22 + eastDry * 0.16, 0, 1);

  const color = COLORS.lowland.clone();
  color.lerp(COLORS.fertile, sample.fertility * 0.62);
  color.lerp(COLORS.floodplain, floodplain * (0.28 + sample.fertility * 0.34));
  color.lerp(COLORS.dryPlain, regionalDryness * lowland * 0.62);
  color.lerp(COLORS.upland, highland * 0.72);
  color.lerp(COLORS.earth, steep * (1 - mountain) * 0.34 + sample.roughness * 0.12);

  const forestFloor = THREE.MathUtils.clamp(
    (regionalMoisture - 0.46) * 1.15 + sample.fertility * 0.4 - highland * 0.34 - riverShelf * 0.14,
    0,
    0.75,
  );
  color.lerp(COLORS.forestFloor, forestFloor * 0.5);

  const exposedRock = THREE.MathUtils.clamp(
    steep * 0.82 + mountain * highland * 0.5 + sample.roughness * summit * 0.4,
    0,
    1,
  );
  color.lerp(COLORS.stone, exposedRock * 0.78);
  color.lerp(COLORS.paleStone, summit * (0.3 + steep * 0.34));

  const snow = THREE.MathUtils.clamp((sample.height - 9.0) / 2.5, 0, 1) * mountain;
  color.lerp(COLORS.snow, snow * (0.46 + steep * 0.2));
  color.lerp(COLORS.cliff, mountain * steep * 0.2);

  if (sample.coastInfluence > 0.01) {
    const coastLow = 1 - THREE.MathUtils.smoothstep(sample.height, 0.18, 1.15);
    const coastal = sample.coastInfluence * coastLow;
    const rockyCoast = coastal * THREE.MathUtils.clamp(sample.roughness * 1.1 + steep * 0.86, 0, 1);
    const wetCoast = coastal * regionalMoisture * (1 - rockyCoast);
    const dryCoast = coastal * regionalDryness * (1 - rockyCoast);
    color.lerp(COLORS.wetShore, wetCoast * 0.5);
    color.lerp(COLORS.sand, dryCoast * 0.68);
    color.lerp(COLORS.cliff, rockyCoast * 0.78);
  }

  color.lerp(COLORS.floodplain, riverShelf * 0.07);
  const sunFacing = THREE.MathUtils.clamp((normal.dot(SUN_DIRECTION) + 0.16) / 1.16, 0, 1);
  const hillshade = 0.76 + sunFacing * 0.3 + normal.y * 0.055;
  color.multiplyScalar(hillshade);

  const regionalVariation = Math.sin(x * 0.019 + z * 0.015) * 0.012;
  color.offsetHSL(0, regionalVariation * 0.2, regionalVariation);
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
