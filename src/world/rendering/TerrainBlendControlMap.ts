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
  /** R moisture, G fertility, B roughness, A visual coast influence. */
  regional: THREE.DataTexture;
  /** R mountain strength, G normalized river distance, B land mask, A normalized water depth. */
  features: THREE.DataTexture;
  riverDistanceMax: number;
  waterDepthMax: number;
}

// 512² keeps biome/coast transitions fine enough for the strategy camera without
// the 4x startup/memory cost of 1024² on iPad-class devices.
const DEFAULT_CONTROL_SIZE = 512;
const RIVER_DISTANCE_MAX = 48;
const WATER_DEPTH_MAX = 2.4;
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
      const waterDepth = land
        ? 0
        : THREE.MathUtils.clamp((SEA_LEVEL - sample.height) / WATER_DEPTH_MAX, 0, 1);
      const coast = THREE.MathUtils.clamp(coastInfluenceAt(worldX, z), 0, 1);
      // Rendering used to paint the whole 15+ world-unit coast influence as a tan
      // band. Compress it here so only the actual shoreline reads as sand/wet soil.
      const visualCoast = Math.pow(coast, land ? 2.6 : 1.8);

      regionalData[pixel] = encode01(sample.moisture);
      regionalData[pixel + 1] = encode01(sample.fertility);
      regionalData[pixel + 2] = encode01(sample.roughness);
      regionalData[pixel + 3] = encode01(visualCoast);

      featureData[pixel] = encode01(mountainStrengthAt(worldX, z));
      featureData[pixel + 1] = encode01(
        THREE.MathUtils.clamp(riverDistance / RIVER_DISTANCE_MAX, 0, 1),
      );
      featureData[pixel + 2] = encode01(land);
      featureData[pixel + 3] = encode01(waterDepth);
    }
  }

  const result: TerrainBlendControlMaps = {
    regional: createControlTexture(regionalData, size, 'terrain-regional-control'),
    features: createControlTexture(featureData, size, 'terrain-feature-control'),
    riverDistanceMax: RIVER_DISTANCE_MAX,
    waterDepthMax: WATER_DEPTH_MAX,
  };
  cache.set(size, result);
  return result;
}

/**
 * Terrain Lab can replace the active heightmap at runtime. Dispose the old data
 * textures before rebuilding materials so its preview and THE WAR derive every
 * biome/coast/water mask from the same WorldField state.
 */
export function clearTerrainBlendControlMapCache(): void {
  for (const controls of cache.values()) {
    controls.regional.dispose();
    controls.features.dispose();
  }
  cache.clear();
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
