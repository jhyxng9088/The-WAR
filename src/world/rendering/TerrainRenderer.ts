import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  deterministic01,
  terrainSampleAt,
  type TerrainSample,
} from '../WorldField';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();

const BIOME_COLORS: Record<TerrainSample['biome'], THREE.Color> = {
  sea: new THREE.Color(0x5d9eb7),
  shore: new THREE.Color(0xd8c78e),
  wetland: new THREE.Color(0x82a96e),
  'fertile-lowland': new THREE.Color(0x8fbb63),
  grassland: new THREE.Color(0x9fbe68),
  'dry-grassland': new THREE.Color(0xb9b26f),
  highland: new THREE.Color(0x879a70),
  rocky: new THREE.Color(0x85877c),
};

export function addTerrain(scene: THREE.Scene): void {
  scene.add(createOcean());
  scene.add(createLand());
}

function createOcean(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    OCEAN_COVERAGE.width,
    OCEAN_COVERAGE.depth,
    1,
    1,
  );
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0x5fa9c5,
    roughness: 0.34,
    metalness: 0,
    dithering: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stylized-ocean';
  mesh.position.y = SEA_LEVEL + 0.018;
  mesh.receiveShadow = true;
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
  const color = new THREE.Color();

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const sample = terrainSampleAt(x, z);
    positions.setZ(i, sample.height);

    color.copy(BIOME_COLORS[sample.biome]);
    applyStylizedVariation(color, sample, x, z);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    dithering: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stylized-continent';
  mesh.receiveShadow = true;
  return mesh;
}

function applyStylizedVariation(
  color: THREE.Color,
  sample: TerrainSample,
  x: number,
  z: number,
): void {
  if (sample.biome === 'sea') return;

  const broad = deterministic01(
    Math.floor(x / 42),
    Math.floor(z / 42),
    901,
  );
  const heightLift = THREE.MathUtils.clamp((sample.height - 2) / 32, 0, 1);
  const fertileLift = sample.fertility * 0.035;
  const roughDarken = sample.roughness * 0.045;

  color.offsetHSL(
    (broad - 0.5) * 0.012,
    (sample.moisture - 0.5) * 0.045,
    fertileLift - roughDarken - heightLift * 0.025 + (broad - 0.5) * 0.026,
  );
}
