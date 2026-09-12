import * as THREE from 'three';
import {
  SEA_LEVEL,
  WORLD_DEPTH,
  WORLD_WIDTH,
  coastInfluenceAt,
  mountainStrengthAt,
  riverDistanceAt,
  terrainSampleAt,
} from '../WorldField';

export interface TerrainBlendControlMaps {
  /** R moisture, G fertility, B roughness, A coast influence. */
  regional: THREE.DataTexture;
  /** R mountain strength, G normalized river distance, B land mask, A reserved. */
  features: THREE.DataTexture;
  riverDistanceMax: number;
}

const DEFAULT_CONTROL_SIZE = 256;
const RIVER_DISTANCE_MAX = 48;
const cache = new Map<number, TerrainBlendControlMaps>();

export function getTerrainBlendControlMaps(size = DEFAULT_CONTROL_SIZE): TerrainBlendControlMaps {
  const cached = cache.get(size);
  if (cached) return cached;

  const regionalData = new Uint8Array(size * size * 4);
  const featureData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    const z = (v - 0.5) * WORLD_DEPTH;

    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const worldX = (u - 0.5) * WORLD_WIDTH;
      const sample = terrainSampleAt(worldX, z);
      const pixel = (y * size + x) * 4;
      const riverDistance = riverDistanceAt(worldX, z);
      const land = sample.height > SEA_LEVEL && sample.biome !== 'sea' ? 1 : 0;

      regionalData[pixel] = encode01(sample.moisture);
      regionalData[pixel + 1] = encode01(sample.fertility);
      regionalData[pixel + 2] = encode01(sample.roughness);
      regionalData[pixel + 3] = encode01(coastInfluenceAt(worldX, z));

      featureData[pixel] = encode01(mountainStrengthAt(worldX, z));
      featureData[pixel + 1] = encode01(
        THREE.MathUtils.clamp(riverDistance / RIVER_DISTANCE_MAX, 0, 1),
      );
      featureData[pixel + 2] = encode01(land);
      featureData[pixel + 3] = 255;
    }
  }

  const result: TerrainBlendControlMaps = {
    regional: createControlTexture(regionalData, size, 'terrain-regional-control'),
    features: createControlTexture(featureData, size, 'terrain-feature-control'),
    riverDistanceMax: RIVER_DISTANCE_MAX,
  };
  cache.set(size, result);
  return result;
}

function createControlTexture(data: Uint8Array, size: number, name: string): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function encode01(value: number): number {
  return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}
