import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  terrainSampleAt,
} from '../WorldField';
import { createWorldTerrainSurfaceMaterial } from './WorldTerrainSurfaceMaterial';
import { createWorldWaterMaterial, updateWorldWaterTime } from './WorldWaterMaterial';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();

export function addTerrain(scene: THREE.Scene): void {
  scene.add(createOcean());
  scene.add(createLand());
}

function createOcean(): THREE.Mesh {
  // Water detail is fragment-driven, so a dense water grid would only waste vertices.
  const geometry = new THREE.PlaneGeometry(
    OCEAN_COVERAGE.width,
    OCEAN_COVERAGE.depth,
    1,
    1,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  const material = createWorldWaterMaterial({
    controlMapSize: 512,
    roughness: 0.48,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Tiny separation avoids z fighting exactly where smoothed shoreline vertices
  // approach sea level. The transparent material still reveals the seabed below.
  mesh.position.y = SEA_LEVEL + 0.006;
  mesh.renderOrder = 2;
  mesh.receiveShadow = true;
  mesh.onBeforeRender = () => {
    updateWorldWaterTime(material, performance.now() * 0.001);
  };
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

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const sample = terrainSampleAt(x, z);
    positions.setZ(i, sample.height);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(
    geometry,
    createWorldTerrainSurfaceMaterial({
      detailRepeat: 32,
      roughness: 0.9,
      seaLevel: SEA_LEVEL,
      controlMapSize: 512,
      anisotropy: 4,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
