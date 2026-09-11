import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  WORLD_WIDTH,
  islandSignal,
  terrainSampleAt,
} from '../WorldField';
import { createLandSurfaceMaterial, createOceanSurfaceMaterial } from './TerrainSurfaceMaterial';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();
const OCEAN_SEGMENTS_X = 144;
const OCEAN_SEGMENTS_Z = 108;

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
  const shelf = new Float32Array(positions.count);
  const shoal = new Float32Array(positions.count);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const signal = islandSignal(x, z);
    shelf[i] = THREE.MathUtils.smoothstep(signal, -0.44, -0.05);
    shoal[i] = THREE.MathUtils.smoothstep(signal, -0.12, 0.008);
  }

  geometry.setAttribute('aShelf', new THREE.BufferAttribute(shelf, 1));
  geometry.setAttribute('aShoal', new THREE.BufferAttribute(shoal, 1));
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, createOceanSurfaceMaterial());
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
  const uv = geometry.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    positions.setZ(i, terrainSampleAt(x, z).height);

    // The baked texture is authored north-up: +Z is the top of the image.
    uv.setXY(
      i,
      THREE.MathUtils.clamp((x + WORLD_HALF_WIDTH) / WORLD_WIDTH, 0, 1),
      THREE.MathUtils.clamp((z + WORLD_HALF_DEPTH) / WORLD_DEPTH, 0, 1),
    );
  }

  positions.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, createLandSurfaceMaterial());
  mesh.receiveShadow = false;
  return mesh;
}
