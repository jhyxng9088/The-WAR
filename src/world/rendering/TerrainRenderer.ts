import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  deterministic01,
  islandSignal,
  terrainSampleAt,
  type TerrainSample,
} from '../WorldField';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();
const OCEAN_WIDTH = OCEAN_COVERAGE.width;
const OCEAN_DEPTH = OCEAN_COVERAGE.depth;
const OCEAN_SEGMENTS_X = 192;
const OCEAN_SEGMENTS_Z = 144;

const COLORS = {
  deepWater: new THREE.Color(0x274c59),
  offshoreWater: new THREE.Color(0x3b6972),
  shallowWater: new THREE.Color(0x6d918a),
  wetSand: new THREE.Color(0x8f876b),
  dryCoast: new THREE.Color(0xa18f68),
  neutralGrass: new THREE.Color(0x687957),
  dryGrass: new THREE.Color(0x817654),
  fertileGrass: new THREE.Color(0x537848),
  wetland: new THREE.Color(0x506d53),
  highland: new THREE.Color(0x60675b),
  roughGround: new THREE.Color(0x68665f),
  rock: new THREE.Color(0x74706a),
  exposedRock: new THREE.Color(0x85817b),
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
    const shallow = THREE.MathUtils.smoothstep(signal, -0.18, 0.012);
    const nearShelf = THREE.MathUtils.smoothstep(signal, -0.4, -0.06);

    const color = COLORS.deepWater.clone().lerp(COLORS.offshoreWater, nearShelf * 0.76);
    color.lerp(COLORS.shallowWater, shallow * 0.82);

    const variation = (deterministic01(x * 0.12, z * 0.12, 73) - 0.5) * 0.014;
    color.offsetHSL(0, variation * 0.07, variation);

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
      roughness: 0.66,
      metalness: 0.005,
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
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const sample = terrainSampleAt(x, z);
    positions.setZ(i, sample.height);

    const color = terrainColor(x, z, sample);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      dithering: true,
    }),
  );
}

function terrainColor(x: number, z: number, sample: TerrainSample): THREE.Color {
  if (sample.height <= SEA_LEVEL || sample.biome === 'sea') {
    const signal = islandSignal(x, z);
    const shelf = THREE.MathUtils.smoothstep(signal, -0.34, 0.004);
    return COLORS.deepWater.clone().lerp(COLORS.shallowWater, shelf * 0.76);
  }

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 0.75, 2.55);
  const highland = THREE.MathUtils.smoothstep(sample.height, 1.15, 3.9);
  const summit = THREE.MathUtils.smoothstep(sample.height, 3.35, 6.1);
  const exposedRock = THREE.MathUtils.smoothstep(sample.roughness, 0.48, 0.88) * highland;
  const dry = (1 - sample.moisture) * lowland;
  const wet = sample.moisture * lowland;

  const color = COLORS.neutralGrass.clone();
  color.lerp(COLORS.dryGrass, dry * 0.72);
  color.lerp(COLORS.fertileGrass, sample.fertility * 0.8);
  color.lerp(COLORS.wetland, wet * sample.fertility * 0.21);
  color.lerp(COLORS.highland, highland * 0.72);
  color.lerp(COLORS.roughGround, sample.roughness * 0.27);
  color.lerp(COLORS.rock, exposedRock * 0.82);
  color.lerp(COLORS.exposedRock, summit * 0.64);

  const coastHeightMask = 1 - THREE.MathUtils.smoothstep(sample.height, 0.03, 0.48);
  const coastWeight = sample.coastInfluence * coastHeightMask;
  if (coastWeight > 0.001) {
    const coastColor = COLORS.wetSand.clone().lerp(COLORS.dryCoast, (1 - sample.moisture) * 0.78);
    color.lerp(coastColor, coastWeight * 0.84);
  }

  const broadVariation = (deterministic01(x * 0.18, z * 0.18, 79) - 0.5) * 0.026;
  const fineVariation = (deterministic01(x * 0.76, z * 0.76, 83) - 0.5) * 0.011;
  color.offsetHSL(0, broadVariation * 0.08, broadVariation + fineVariation);
  return color;
}
