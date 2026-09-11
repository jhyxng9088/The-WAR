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
const OCEAN_SEGMENTS_X = 192;
const OCEAN_SEGMENTS_Z = 144;

const COLORS = {
  deepWater: new THREE.Color(0x274c59),
  offshoreWater: new THREE.Color(0x3b6972),
  shallowWater: new THREE.Color(0x6d918a),
  wetSand: new THREE.Color(0x8f876b),
  dryCoast: new THREE.Color(0xa18f68),
  neutralGrass: new THREE.Color(0x697651),
  dryGrass: new THREE.Color(0x857650),
  fertileGrass: new THREE.Color(0x4f7447),
  wetland: new THREE.Color(0x4b6851),
  highland: new THREE.Color(0x626457),
  roughGround: new THREE.Color(0x6b655a),
  rock: new THREE.Color(0x77716a),
  exposedRock: new THREE.Color(0x8b847a),
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

    const color = terrainColor(sample);
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
      roughness: 0.92,
      metalness: 0,
      dithering: true,
    }),
  );
}

function terrainColor(sample: TerrainSample): THREE.Color {
  if (sample.height <= SEA_LEVEL || sample.biome === 'sea') {
    return COLORS.deepWater.clone().lerp(COLORS.shallowWater, sample.coastInfluence * 0.72);
  }

  const lowland = 1 - THREE.MathUtils.smoothstep(sample.height, 0.78, 2.7);
  const highland = THREE.MathUtils.smoothstep(sample.height, 1.15, 3.95);
  const summit = THREE.MathUtils.smoothstep(sample.height, 3.35, 6.1);
  const exposedRock = THREE.MathUtils.smoothstep(sample.roughness, 0.48, 0.88) * highland;
  const dry = (1 - sample.moisture) * lowland;
  const wet = sample.moisture * lowland;

  const color = COLORS.neutralGrass.clone();
  color.lerp(COLORS.dryGrass, dry * 0.82);
  color.lerp(COLORS.fertileGrass, sample.fertility * (0.7 + lowland * 0.2));
  color.lerp(COLORS.wetland, wet * sample.fertility * 0.3);
  color.lerp(COLORS.highland, highland * 0.74);
  color.lerp(COLORS.roughGround, sample.roughness * 0.28);
  color.lerp(COLORS.rock, exposedRock * 0.84);
  color.lerp(COLORS.exposedRock, summit * 0.66);

  const coastHeightMask = 1 - THREE.MathUtils.smoothstep(sample.height, 0.03, 0.48);
  const coastWeight = sample.coastInfluence * coastHeightMask;
  if (coastWeight > 0.001) {
    const coastColor = COLORS.wetSand.clone().lerp(COLORS.dryCoast, (1 - sample.moisture) * 0.78);
    color.lerp(coastColor, coastWeight * 0.84);
  }

  return color;
}
