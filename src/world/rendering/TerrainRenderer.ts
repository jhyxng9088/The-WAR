import * as THREE from 'three';
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

const OCEAN_WIDTH = 112;
const OCEAN_DEPTH = 88;
const OCEAN_SEGMENTS_X = 112;
const OCEAN_SEGMENTS_Z = 88;

const COLORS = {
  deepWater: new THREE.Color(0x244d5a),
  offshoreWater: new THREE.Color(0x376c76),
  shallowWater: new THREE.Color(0x668f8a),
  wetSand: new THREE.Color(0x91886b),
  dryCoast: new THREE.Color(0xa39268),
  neutralGrass: new THREE.Color(0x70805a),
  dryGrass: new THREE.Color(0x817b55),
  fertileGrass: new THREE.Color(0x62864f),
  wetland: new THREE.Color(0x557457),
  highland: new THREE.Color(0x626b5c),
  roughGround: new THREE.Color(0x6d6c62),
  rock: new THREE.Color(0x73716c),
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
    const shallow = THREE.MathUtils.smoothstep(signal, -0.24, 0.015);
    const nearShelf = THREE.MathUtils.smoothstep(signal, -0.46, -0.08);

    const color = COLORS.deepWater.clone().lerp(COLORS.offshoreWater, nearShelf * 0.72);
    color.lerp(COLORS.shallowWater, shallow * 0.84);

    const variation = (deterministic01(x * 0.22, z * 0.22, 73) - 0.5) * 0.018;
    color.offsetHSL(0, variation * 0.12, variation);

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
      metalness: 0.015,
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
      roughness: 0.965,
      metalness: 0,
      dithering: true,
    }),
  );
}

function terrainColor(x: number, z: number, sample: TerrainSample): THREE.Color {
  if (sample.height <= SEA_LEVEL || sample.biome === 'sea') {
    const signal = islandSignal(x, z);
    const shelf = THREE.MathUtils.smoothstep(signal, -0.42, 0.005);
    return COLORS.deepWater.clone().lerp(COLORS.shallowWater, shelf * 0.74);
  }

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 0.62, 2.05);
  const highland = THREE.MathUtils.smoothstep(sample.height, 0.88, 2.45);
  const exposedRock = THREE.MathUtils.smoothstep(sample.roughness, 0.48, 0.88) * highland;
  const dry = (1 - sample.moisture) * lowland;
  const wet = sample.moisture * lowland;

  const color = COLORS.neutralGrass.clone();
  color.lerp(COLORS.dryGrass, dry * 0.62);
  color.lerp(COLORS.fertileGrass, sample.fertility * 0.72);
  color.lerp(COLORS.wetland, wet * sample.fertility * 0.22);
  color.lerp(COLORS.highland, highland * 0.62);
  color.lerp(COLORS.roughGround, sample.roughness * 0.22);
  color.lerp(COLORS.rock, exposedRock * 0.74);

  const coastHeightMask = 1 - THREE.MathUtils.smoothstep(sample.height, 0.04, 0.5);
  const coastWeight = sample.coastInfluence * coastHeightMask;
  if (coastWeight > 0.001) {
    const coastColor = COLORS.wetSand.clone().lerp(COLORS.dryCoast, (1 - sample.moisture) * 0.78);
    color.lerp(coastColor, coastWeight * 0.86);
  }

  const broadVariation = (deterministic01(x * 0.34, z * 0.34, 79) - 0.5) * 0.025;
  const fineVariation = (deterministic01(x * 1.45, z * 1.45, 83) - 0.5) * 0.012;
  color.offsetHSL(0, broadVariation * 0.08, broadVariation + fineVariation);
  return color;
}
