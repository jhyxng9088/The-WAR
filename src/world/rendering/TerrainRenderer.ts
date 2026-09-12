import * as THREE from 'three';
import { WorldCamera } from '../../camera/WorldCamera';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  coastInfluenceAt,
  terrainSampleAt,
} from '../WorldField';
import { createWorldTerrainSurfaceMaterial } from './WorldTerrainSurfaceMaterial';

const OCEAN_COVERAGE = WorldCamera.requiredSurfaceCoverage();
const OCEAN_SEGMENTS_X = 128;
const OCEAN_SEGMENTS_Z = 128;

const OCEAN_COLORS = {
  deepWater: new THREE.Color(0x16333a),
  offshoreWater: new THREE.Color(0x274b54),
  shallowWater: new THREE.Color(0x52766f),
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
    const color = OCEAN_COLORS.deepWater
      .clone()
      .lerp(OCEAN_COLORS.offshoreWater, 0.22 + broad * 0.16);
    color.lerp(OCEAN_COLORS.shallowWater, coast * 0.78);

    const variation = Math.sin(x * 0.017 + z * 0.012) * 0.009;
    color.offsetHSL(0, variation * 0.1, variation);
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
      roughness: 0.52,
      metalness: 0,
      dithering: true,
    }),
  );
  mesh.position.y = SEA_LEVEL;
  mesh.renderOrder = -2;
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
      detailRepeat: 38,
      roughness: 0.86,
      seaLevel: SEA_LEVEL,
      controlMapSize: 256,
      anisotropy: 4,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
