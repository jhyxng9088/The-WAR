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

const OCEAN_WIDTH = WORLD_WIDTH * 1.46;
const OCEAN_DEPTH = WORLD_DEPTH * 1.46;
const OCEAN_SEGMENTS_X = 160;
const OCEAN_SEGMENTS_Z = 112;

const COLORS = {
  deepWater: new THREE.Color(0x274c59),
  offshoreWater: new THREE.Color(0x3b6972),
  shallowWater: new THREE.Color(0x6d918a),
  wetSand: new THREE.Color(0x8f876b),
  dryCoast: new THREE.Color(0xa18f68),
  neutralGrass: new THREE.Color(0x6d7f59),
  dryGrass: new THREE.Color(0x827958),
  fertileGrass: new THREE.Color(0x587c49),
  wetland: new THREE.Color(0x526e54),
  highland: new THREE.Color(0x62695d),
  roughGround: new THREE.Color(0x6b6962),
  rock: new THREE.Color(0x77736d),
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

    const variation = (deterministic01(x * 0.12, z * 0.12, 73) - 0.5) * 0.015;
    color.offsetHSL(0, variation * 0.08, variation);

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
      roughness: 0.62,
      metalness: 0.01,
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
      roughness: 0.94,
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

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 0.72, 2.3);
  const highland = THREE.MathUtils.smoothstep(sample.height, 1.05, 3.55);
  const summit = THREE.MathUtils.smoothstep(sample.height, 3.0, 5.8);
  const exposedRock = THREE.MathUtils.smoothstep(sample.roughness, 0.5, 0.9) * highland;
  const dry = (1 - sample.moisture) * lowland;
  const wet = sample.moisture * lowland;

  const color = COLORS.neutralGrass.clone();
  color.lerp(COLORS.dryGrass, dry * 0.68);
  color.lerp(COLORS.fertileGrass, sample.fertility * 0.76);
  color.lerp(COLORS.wetland, wet * sample.fertility * 0.2);
  color.lerp(COLORS.highland, highland * 0.68);
  color.lerp(COLORS.roughGround, sample.roughness * 0.24);
  color.lerp(COLORS.rock, exposedRock * 0.78);
  color.lerp(COLORS.exposedRock, summit * 0.58);

  const coastHeightMask = 1 - THREE.MathUtils.smoothstep(sample.height, 0.03, 0.48);
  const coastWeight = sample.coastInfluence * coastHeightMask;
  if (coastWeight > 0.001) {
    const coastColor = COLORS.wetSand.clone().lerp(COLORS.dryCoast, (1 - sample.moisture) * 0.78);
    color.lerp(coastColor, coastWeight * 0.84);
  }

  const broadVariation = (deterministic01(x * 0.18, z * 0.18, 79) - 0.5) * 0.024;
  const fineVariation = (deterministic01(x * 0.76, z * 0.76, 83) - 0.5) * 0.01;
  color.offsetHSL(0, broadVariation * 0.08, broadVariation + fineVariation);
  return color;
}
