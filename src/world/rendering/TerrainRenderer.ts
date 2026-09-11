import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  islandSignal,
  terrainSampleAt,
  type TerrainSample,
} from '../WorldField';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();
const OCEAN_WIDTH = OCEAN_COVERAGE.width;
const OCEAN_DEPTH = OCEAN_COVERAGE.depth;
const OCEAN_SEGMENTS_X = 224;
const OCEAN_SEGMENTS_Z = 168;
const SUN_DIRECTION = new THREE.Vector3(-0.56, 0.72, 0.4).normalize();

const COLORS = {
  deepWater: new THREE.Color(0x203f4b),
  offshoreWater: new THREE.Color(0x37636d),
  shallowWater: new THREE.Color(0x75988e),
  wetSand: new THREE.Color(0x8a8268),
  dryCoast: new THREE.Color(0xa6926a),
  neutralGrass: new THREE.Color(0x66784e),
  meadow: new THREE.Color(0x718758),
  dryGrass: new THREE.Color(0x8c7c51),
  fertileGrass: new THREE.Color(0x496f43),
  deepFertile: new THREE.Color(0x3b6040),
  wetland: new THREE.Color(0x455f4c),
  earth: new THREE.Color(0x75664d),
  highland: new THREE.Color(0x62675a),
  roughGround: new THREE.Color(0x696156),
  rock: new THREE.Color(0x79736b),
  exposedRock: new THREE.Color(0x968d80),
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
    const shallow = THREE.MathUtils.smoothstep(signal, -0.2, 0.012);
    const nearShelf = THREE.MathUtils.smoothstep(signal, -0.48, -0.055);

    const color = COLORS.deepWater.clone().lerp(COLORS.offshoreWater, nearShelf * 0.8);
    color.lerp(COLORS.shallowWater, shallow * 0.84);

    const broadWater = (
      Math.sin(x * 0.018 + z * 0.006) +
      Math.sin(z * 0.025 - x * 0.004) * 0.55
    ) / 1.55;
    color.offsetHSL(0, broadWater * 0.009, broadWater * 0.018);

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
      roughness: 0.58,
      metalness: 0.008,
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

function terrainColor(
  x: number,
  z: number,
  sample: TerrainSample,
  normal: THREE.Vector3,
): THREE.Color {
  if (sample.height <= SEA_LEVEL || sample.biome === 'sea') {
    return COLORS.deepWater.clone().lerp(COLORS.shallowWater, sample.coastInfluence * 0.72);
  }

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 0.72, 2.65);
  const highland = THREE.MathUtils.smoothstep(sample.height, 1.1, 4.0);
  const summit = THREE.MathUtils.smoothstep(sample.height, 3.25, 6.0);
  const inclination = 1 - THREE.MathUtils.clamp(normal.y, 0, 1);
  const steep = THREE.MathUtils.smoothstep(inclination, 0.035, 0.28);
  const rockySlope = THREE.MathUtils.clamp(steep * 0.8 + sample.roughness * highland * 0.6, 0, 1);
  const dry = (1 - sample.moisture) * lowland;
  const wet = sample.moisture * lowland;
  const richValley = sample.fertility * sample.moisture * lowland;

  const color = COLORS.neutralGrass.clone();
  color.lerp(COLORS.meadow, sample.moisture * lowland * 0.22);
  color.lerp(COLORS.dryGrass, dry * 0.84);
  color.lerp(COLORS.fertileGrass, sample.fertility * (0.62 + lowland * 0.22));
  color.lerp(COLORS.deepFertile, richValley * 0.25);
  color.lerp(COLORS.wetland, wet * sample.fertility * 0.28);
  color.lerp(COLORS.highland, highland * 0.68);
  color.lerp(COLORS.earth, steep * (1 - highland) * 0.32);
  color.lerp(COLORS.roughGround, sample.roughness * 0.2);
  color.lerp(COLORS.rock, rockySlope * 0.78);
  color.lerp(COLORS.exposedRock, summit * 0.62 + steep * summit * 0.2);

  const strata = 0.5 + Math.sin(sample.height * 10.6 + x * 0.042 - z * 0.034) * 0.5;
  color.lerp(COLORS.exposedRock, strata * rockySlope * 0.115);

  const coastHeightMask = 1 - THREE.MathUtils.smoothstep(sample.height, 0.025, 0.5);
  const coastWeight = sample.coastInfluence * coastHeightMask;
  if (coastWeight > 0.001) {
    const coastColor = COLORS.wetSand.clone().lerp(COLORS.dryCoast, (1 - sample.moisture) * 0.76);
    color.lerp(coastColor, coastWeight * 0.86);
  }

  const regionalVariation = (
    Math.sin(x * 0.014 + z * 0.004) +
    Math.sin(z * 0.021 - x * 0.003) * 0.62 +
    Math.sin((x + z) * 0.008) * 0.38
  ) / 2;
  color.offsetHSL(
    regionalVariation * 0.004,
    regionalVariation * 0.015,
    regionalVariation * 0.022,
  );

  const fineRelief = (
    Math.sin(x * 0.19 + Math.sin(z * 0.052) * 1.4) +
    Math.sin(z * 0.23 - x * 0.041) * 0.62
  ) / 1.62;
  const fineStrength = 0.006 + sample.roughness * 0.02 + rockySlope * 0.014;
  color.offsetHSL(0, fineRelief * 0.004, fineRelief * fineStrength);

  const sunFacing = THREE.MathUtils.clamp((normal.dot(SUN_DIRECTION) + 0.18) / 1.18, 0, 1);
  const hillshade = 0.81 + sunFacing * 0.24 + normal.y * 0.045;
  color.multiplyScalar(hillshade);

  return color;
}
