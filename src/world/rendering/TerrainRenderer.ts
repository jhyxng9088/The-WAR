import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  forestDensityAt,
  islandSignal,
  mountainStrengthAt,
  riverDistanceAt,
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
  const moisture = new Float32Array(positions.count);
  const fertility = new Float32Array(positions.count);
  const roughness = new Float32Array(positions.count);
  const coast = new Float32Array(positions.count);
  const mountain = new Float32Array(positions.count);
  const forest = new Float32Array(positions.count);
  const river = new Float32Array(positions.count);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const sample = terrainSampleAt(x, z);
    const riverDistance = riverDistanceAt(x, z);

    positions.setZ(i, sample.height);
    moisture[i] = sample.moisture;
    fertility[i] = sample.fertility;
    roughness[i] = sample.roughness;
    coast[i] = sample.coastInfluence;
    mountain[i] = mountainStrengthAt(x, z);
    forest[i] = forestDensityAt(x, z);
    river[i] = Math.exp(-(riverDistance * riverDistance) / 14.0);
  }

  geometry.setAttribute('aMoisture', new THREE.BufferAttribute(moisture, 1));
  geometry.setAttribute('aFertility', new THREE.BufferAttribute(fertility, 1));
  geometry.setAttribute('aRoughness', new THREE.BufferAttribute(roughness, 1));
  geometry.setAttribute('aCoast', new THREE.BufferAttribute(coast, 1));
  geometry.setAttribute('aMountain', new THREE.BufferAttribute(mountain, 1));
  geometry.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
  geometry.setAttribute('aRiver', new THREE.BufferAttribute(river, 1));

  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, createLandSurfaceMaterial());
  mesh.receiveShadow = true;
  return mesh;
}
