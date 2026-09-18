import {
  WORLD_HEIGHTMAP_HEIGHT,
  WORLD_HEIGHTMAP_U8,
  WORLD_HEIGHTMAP_WIDTH,
} from '../assets/world/AuthoredWorldHeightmap';
import { decodeHeightmapBase64 } from './HeightmapCodec';
import { strategicMountainReliefAt } from './StrategicMountainRelief';

export const MAP_SCALE = 2.5;
export const WORLD_WIDTH = 420;
export const WORLD_DEPTH = 420;
export const WORLD_HALF_WIDTH = WORLD_WIDTH / 2;
export const WORLD_HALF_DEPTH = WORLD_DEPTH / 2;
export const TERRAIN_SEGMENTS_X = 256;
export const TERRAIN_SEGMENTS_Z = 256;
export const SEA_LEVEL = -0.5;

export type XZ = readonly [number, number];

export type TerrainBiome =
  | 'sea'
  | 'shore'
  | 'wetland'
  | 'fertile-lowland'
  | 'grassland'
  | 'dry-grassland'
  | 'highland'
  | 'rocky';

export interface TerrainSample {
  height: number;
  moisture: number;
  fertility: number;
  roughness: number;
  coastInfluence: number;
  biome: TerrainBiome;
}

export interface RiverDefinition {
  points: readonly XZ[];
  sourceWidth: number;
  mouthWidth: number;
}

export interface WorldHeightmapSnapshot {
  width: number;
  height: number;
  bytes: Uint8Array;
}

export const RIVERS: readonly RiverDefinition[] = [];

const LAND_THRESHOLD = 0.028;
const MAX_LAND_HEIGHT = 12.2;
const AUTHORED_HEIGHT_BYTES = decodeHeightmapBase64(WORLD_HEIGHTMAP_U8);
const MIN_RUNTIME_HEIGHTMAP_SIZE = 257;

let SOURCE_HEIGHT_BYTES = AUTHORED_HEIGHT_BYTES.slice();
let SOURCE_HEIGHTMAP_WIDTH = WORLD_HEIGHTMAP_WIDTH;
let SOURCE_HEIGHTMAP_HEIGHT = WORLD_HEIGHTMAP_HEIGHT;

let HEIGHT_VALUES = bytesToNormalizedValues(AUTHORED_HEIGHT_BYTES);
let HEIGHTMAP_WIDTH = WORLD_HEIGHTMAP_WIDTH;
let HEIGHTMAP_HEIGHT = WORLD_HEIGHTMAP_HEIGHT;
let EXPECTED_SAMPLES = HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT;
let WATER_DISTANCE_CELLS: Uint8Array<ArrayBufferLike> = new Uint8Array(EXPECTED_SAMPLES);
let LAND_DISTANCE_CELLS: Uint8Array<ArrayBufferLike> = new Uint8Array(EXPECTED_SAMPLES);

applyWorldHeightmapSource(AUTHORED_HEIGHT_BYTES, WORLD_HEIGHTMAP_WIDTH, WORLD_HEIGHTMAP_HEIGHT);

export function applyWorldHeightmapSource(bytes: Uint8Array, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error(`Invalid world heightmap dimensions: ${width}x${height}.`);
  }

  const expectedSamples = width * height;
  if (bytes.length !== expectedSamples) {
    throw new Error(
      `World heightmap is incomplete: expected ${expectedSamples} samples, got ${bytes.length}.`,
    );
  }

  SOURCE_HEIGHT_BYTES = bytes.slice();
  SOURCE_HEIGHTMAP_WIDTH = width;
  SOURCE_HEIGHTMAP_HEIGHT = height;

  const runtime = createRuntimeHeightmap(bytes, width, height);
  HEIGHT_VALUES = runtime.values;
  HEIGHTMAP_WIDTH = runtime.width;
  HEIGHTMAP_HEIGHT = runtime.height;
  EXPECTED_SAMPLES = HEIGHTMAP_WIDTH * HEIGHTMAP_HEIGHT;
  WATER_DISTANCE_CELLS = createDistanceField('water');
  LAND_DISTANCE_CELLS = createDistanceField('land');
}

export function resetWorldHeightmapToAuthored(): void {
  applyWorldHeightmapSource(AUTHORED_HEIGHT_BYTES, WORLD_HEIGHTMAP_WIDTH, WORLD_HEIGHTMAP_HEIGHT);
}

export function getWorldHeightmapSnapshot(): WorldHeightmapSnapshot {
  return {
    width: SOURCE_HEIGHTMAP_WIDTH,
    height: SOURCE_HEIGHTMAP_HEIGHT,
    bytes: SOURCE_HEIGHT_BYTES.slice(),
  };
}

export function terrainSampleAt(x: number, z: number): TerrainSample {
  const raw = heightmapValueAt(x, z);
  const height = terrainHeightFromRawAt(x, z, raw);
  const coastInfluence = coastInfluenceFromRaw(x, z, raw);
  const roughness = roughnessFromValues(x, z, height, raw);
  const moisture = moistureFromValues(x, z, raw, coastInfluence, height);
  const fertility = fertilityFromValues(x, z, height, moisture, roughness, raw);

  return {
    height,
    moisture,
    fertility,
    roughness,
    coastInfluence,
    biome: biomeFromValues(height, moisture, fertility, roughness, coastInfluence, raw),
  };
}

export function terrainHeight(x: number, z: number): number {
  const raw = heightmapValueAt(x, z);
  return terrainHeightFromRawAt(x, z, raw);
}

export function terrainHeightFromRawValue(x: number, z: number, raw: number): number {
  return terrainHeightFromRawAt(x, z, clamp01(raw));
}

export function islandSignal(x: number, z: number): number {
  return heightmapValueAt(x, z) - LAND_THRESHOLD;
}

export function isLandAt(x: number, z: number): boolean {
  return heightmapValueAt(x, z) > LAND_THRESHOLD;
}

export function riverDistanceAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;
  return waterDistanceAt(x, z);
}

export function coastInfluenceAt(x: number, z: number): number {
  return coastInfluenceFromRaw(x, z, heightmapValueAt(x, z));
}

export function moistureAt(x: number, z: number): number {
  const raw = heightmapValueAt(x, z);
  const height = terrainHeightFromRawAt(x, z, raw);
  return moistureFromValues(x, z, raw, coastInfluenceFromRaw(x, z, raw), height);
}

export function roughnessAt(x: number, z: number): number {
  const raw = heightmapValueAt(x, z);
  return roughnessFromValues(x, z, terrainHeightFromRawAt(x, z, raw), raw);
}

export function fertilityAt(x: number, z: number): number {
  const raw = heightmapValueAt(x, z);
  const height = terrainHeightFromRawAt(x, z, raw);
  const coastInfluence = coastInfluenceFromRaw(x, z, raw);
  const roughness = roughnessFromValues(x, z, height, raw);
  const moisture = moistureFromValues(x, z, raw, coastInfluence, height);
  return fertilityFromValues(x, z, height, moisture, roughness, raw);
}

export function biomeAt(x: number, z: number): TerrainBiome {
  return terrainSampleAt(x, z).biome;
}

export function forestDensityAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;

  const raw = heightmapValueAt(x, z);
  const moisture = moistureAt(x, z);
  const height = terrainHeightFromRawAt(x, z, raw);
  const mountain = mountainStrengthAt(x, z);
  const waterDistance = waterDistanceAt(x, z);
  const regionNoise = valueNoise(x * 0.022 + 6.1, z * 0.022 - 3.7) * 0.2;
  const patchNoise = valueNoise(x * 0.066 - 2.4, z * 0.066 + 8.5) * 0.16;
  const lowlandPreference = 1 - smoothRange(height, 4.6, 9.2);
  const waterClearing = 1 - smoothRange(waterDistance, 2.4, 8.5);

  return clamp01(
    0.09
      + moisture * 0.55
      + lowlandPreference * 0.22
      + regionNoise
      + patchNoise
      - mountain * 0.48
      - waterClearing * 0.31,
  );
}

export function mountainStrengthAt(x: number, z: number): number {
  const raw = heightmapValueAt(x, z);
  if (raw <= LAND_THRESHOLD) return 0;

  const elevation = smoothRange(raw, 0.34, 0.82);
  const localRoughness = heightGradientAt(x, z);
  const authoredRidge = smoothRange(localRoughness, 0.014, 0.075);
  const landInterior = smoothRange(raw, LAND_THRESHOLD + 0.012, 0.19);
  const strategicRidge = strategicMountainReliefAt(x, z, landInterior).strength;
  const authoredStrength = elevation * 0.78 + authoredRidge * elevation * 0.46;
  return clamp01(Math.max(authoredStrength, strategicRidge * 0.96));
}

export function deterministic01(x: number, z: number, seed = 0): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function terrainHeightFromRawAt(x: number, z: number, raw: number): number {
  if (raw <= LAND_THRESHOLD) {
    const waterDepth = 1 - clamp01(raw / LAND_THRESHOLD);
    return SEA_LEVEL - 0.035 - waterDepth * 2.25;
  }

  const normalized = clamp01((raw - LAND_THRESHOLD) / (1 - LAND_THRESHOLD));
  const shaped = Math.pow(normalized, 1.14);
  const baseHeight = SEA_LEVEL + 0.045 + shaped * MAX_LAND_HEIGHT;
  const landInterior = smoothRange(raw, LAND_THRESHOLD + 0.012, 0.19);
  const strategicRelief = strategicMountainReliefAt(x, z, landInterior);
  return baseHeight + strategicRelief.height;
}

function coastInfluenceFromRaw(x: number, z: number, raw: number): number {
  if (raw <= LAND_THRESHOLD) {
    return 1 - smoothRange(landDistanceAt(x, z), 1.8, 28);
  }
  return 1 - smoothRange(waterDistanceAt(x, z), 1.8, 15.5);
}

function moistureFromValues(
  x: number,
  z: number,
  raw: number,
  coastInfluence: number,
  height: number,
): number {
  if (raw <= LAND_THRESHOLD) return 1;

  const waterDistance = waterDistanceAt(x, z);
  const waterMoisture = 1 - smoothRange(waterDistance, 2.2, 34);
  const elevationDryness = smoothRange(height, 6.2, 13.2);
  const broad = valueNoise(x * 0.012 + 4.2, z * 0.012 - 7.1) * 0.12;
  const local = valueNoise(x * 0.039 - 8.6, z * 0.039 + 2.8) * 0.07;

  return clamp01(
    0.38
      + waterMoisture * 0.34
      + coastInfluence * 0.12
      + broad
      + local
      - elevationDryness * 0.23,
  );
}

function roughnessFromValues(x: number, z: number, height: number, raw: number): number {
  if (raw <= LAND_THRESHOLD) return 0;

  const gradient = heightGradientAt(x, z);
  const slope = smoothRange(gradient, 0.012, 0.086);
  const elevation = smoothRange(height, 4.8, 13.8);
  const brokenGround = Math.abs(valueNoise(x * 0.045 - 3.1, z * 0.045 + 7.4)) * 0.13;
  const landInterior = smoothRange(raw, LAND_THRESHOLD + 0.012, 0.19);
  const strategicRidge = strategicMountainReliefAt(x, z, landInterior).strength;
  return clamp01(0.06 + slope * 0.60 + elevation * 0.20 + strategicRidge * 0.24 + brokenGround);
}

function fertilityFromValues(
  x: number,
  z: number,
  height: number,
  moisture: number,
  roughness: number,
  raw: number,
): number {
  if (raw <= LAND_THRESHOLD) return 0;

  const lowland = 1 - smoothRange(height, 2.2, 7.2);
  const waterDistance = waterDistanceAt(x, z);
  const waterBonus = 1 - smoothRange(waterDistance, 3.5, 22);
  const temperateMoisture = 1 - Math.abs(moisture - 0.68) * 1.15;
  const regional = valueNoise(x * 0.017 + 1.7, z * 0.017 + 9.3) * 0.07;

  return clamp01(
    0.08
      + lowland * 0.38
      + waterBonus * 0.25
      + clamp01(temperateMoisture) * 0.28
      + regional
      - roughness * 0.34,
  );
}

function biomeFromValues(
  height: number,
  moisture: number,
  fertility: number,
  roughness: number,
  coastInfluence: number,
  raw: number,
): TerrainBiome {
  if (raw <= LAND_THRESHOLD || height <= SEA_LEVEL) return 'sea';
  if (coastInfluence > 0.62 && height < 0.75) return moisture > 0.76 ? 'wetland' : 'shore';
  if (roughness > 0.7 || height > 9.0) return 'rocky';
  if (height > 5.6 || roughness > 0.5) return 'highland';
  if (moisture > 0.84 && height < 2.2) return 'wetland';
  if (fertility > 0.64) return 'fertile-lowland';
  if (moisture < 0.35) return 'dry-grassland';
  return 'grassland';
}

function heightGradientAt(x: number, z: number): number {
  const step = WORLD_WIDTH / (HEIGHTMAP_WIDTH - 1);
  const dx = heightmapValueAt(x + step, z) - heightmapValueAt(x - step, z);
  const dz = heightmapValueAt(x, z + step) - heightmapValueAt(x, z - step);
  return Math.hypot(dx, dz) * 0.5;
}

function heightmapValueAt(x: number, z: number): number {
  const u = clamp01((x + WORLD_HALF_WIDTH) / WORLD_WIDTH) * (HEIGHTMAP_WIDTH - 1);
  const v = clamp01((WORLD_HALF_DEPTH - z) / WORLD_DEPTH) * (HEIGHTMAP_HEIGHT - 1);

  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(HEIGHTMAP_WIDTH - 1, x0 + 1);
  const y1 = Math.min(HEIGHTMAP_HEIGHT - 1, y0 + 1);
  const tx = u - x0;
  const ty = v - y0;

  const a = heightValueAtCell(x0, y0);
  const b = heightValueAtCell(x1, y0);
  const c = heightValueAtCell(x0, y1);
  const d = heightValueAtCell(x1, y1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function waterDistanceAt(x: number, z: number): number {
  return distanceFieldAt(WATER_DISTANCE_CELLS, x, z);
}

function landDistanceAt(x: number, z: number): number {
  return distanceFieldAt(LAND_DISTANCE_CELLS, x, z);
}

function distanceFieldAt(field: Uint8Array, x: number, z: number): number {
  const u = clamp01((x + WORLD_HALF_WIDTH) / WORLD_WIDTH) * (HEIGHTMAP_WIDTH - 1);
  const v = clamp01((WORLD_HALF_DEPTH - z) / WORLD_DEPTH) * (HEIGHTMAP_HEIGHT - 1);
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(HEIGHTMAP_WIDTH - 1, x0 + 1);
  const y1 = Math.min(HEIGHTMAP_HEIGHT - 1, y0 + 1);
  const tx = u - x0;
  const ty = v - y0;
  const a = field[y0 * HEIGHTMAP_WIDTH + x0] ?? 0;
  const b = field[y0 * HEIGHTMAP_WIDTH + x1] ?? 0;
  const c = field[y1 * HEIGHTMAP_WIDTH + x0] ?? 0;
  const d = field[y1 * HEIGHTMAP_WIDTH + x1] ?? 0;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  const cells = top + (bottom - top) * ty;
  const worldUnitsPerCell = 0.5 * (
    WORLD_WIDTH / (HEIGHTMAP_WIDTH - 1)
    + WORLD_DEPTH / (HEIGHTMAP_HEIGHT - 1)
  );
  return cells * worldUnitsPerCell;
}

function heightValueAtCell(x: number, y: number): number {
  return HEIGHT_VALUES[y * HEIGHTMAP_WIDTH + x] ?? 0;
}

function bytesToNormalizedValues(bytes: Uint8Array): Float32Array {
  const values = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) values[i] = (bytes[i] ?? 0) / 255;
  return values;
}

function createRuntimeHeightmap(
  bytes: Uint8Array,
  width: number,
  height: number,
): { width: number; height: number; values: Float32Array } {
  const targetWidth = Math.max(width, MIN_RUNTIME_HEIGHTMAP_SIZE);
  const targetHeight = Math.max(height, MIN_RUNTIME_HEIGHTMAP_SIZE);

  if (targetWidth === width && targetHeight === height) {
    return { width, height, values: bytesToNormalizedValues(bytes) };
  }

  const values = new Float32Array(targetWidth * targetHeight);

  const sourceAt = (x: number, y: number): number => {
    const sx = Math.min(width - 1, Math.max(0, x));
    const sy = Math.min(height - 1, Math.max(0, y));
    return (bytes[sy * width + sx] ?? 0) / 255;
  };

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y / (targetHeight - 1)) * (height - 1);
    const y1 = Math.floor(sourceY);
    const ty = sourceY - y1;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x / (targetWidth - 1)) * (width - 1);
      const x1 = Math.floor(sourceX);
      const tx = sourceX - x1;

      const row0 = catmullRom(
        sourceAt(x1 - 1, y1 - 1),
        sourceAt(x1, y1 - 1),
        sourceAt(x1 + 1, y1 - 1),
        sourceAt(x1 + 2, y1 - 1),
        tx,
      );
      const row1 = catmullRom(
        sourceAt(x1 - 1, y1),
        sourceAt(x1, y1),
        sourceAt(x1 + 1, y1),
        sourceAt(x1 + 2, y1),
        tx,
      );
      const row2 = catmullRom(
        sourceAt(x1 - 1, y1 + 1),
        sourceAt(x1, y1 + 1),
        sourceAt(x1 + 1, y1 + 1),
        sourceAt(x1 + 2, y1 + 1),
        tx,
      );
      const row3 = catmullRom(
        sourceAt(x1 - 1, y1 + 2),
        sourceAt(x1, y1 + 2),
        sourceAt(x1 + 1, y1 + 2),
        sourceAt(x1 + 2, y1 + 2),
        tx,
      );

      values[y * targetWidth + x] = clamp01(catmullRom(row0, row1, row2, row3, ty));
    }
  }

  return { width: targetWidth, height: targetHeight, values };
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
      + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function createDistanceField(target: 'water' | 'land'): Uint8Array {
  const size = EXPECTED_SAMPLES;
  const distance = new Float32Array(size);
  const infinity = 1_000_000;
  const diagonal = Math.SQRT2;

  for (let y = 0; y < HEIGHTMAP_HEIGHT; y += 1) {
    for (let x = 0; x < HEIGHTMAP_WIDTH; x += 1) {
      const index = y * HEIGHTMAP_WIDTH + x;
      const isWater = heightValueAtCell(x, y) <= LAND_THRESHOLD;
      const isTarget = target === 'water' ? isWater : !isWater;
      distance[index] = isTarget ? 0 : infinity;
    }
  }

  for (let y = 0; y < HEIGHTMAP_HEIGHT; y += 1) {
    for (let x = 0; x < HEIGHTMAP_WIDTH; x += 1) {
      const index = y * HEIGHTMAP_WIDTH + x;
      let best = distance[index] ?? infinity;
      if (x > 0) best = Math.min(best, (distance[index - 1] ?? infinity) + 1);
      if (y > 0) best = Math.min(best, (distance[index - HEIGHTMAP_WIDTH] ?? infinity) + 1);
      if (x > 0 && y > 0) {
        best = Math.min(best, (distance[index - HEIGHTMAP_WIDTH - 1] ?? infinity) + diagonal);
      }
      if (x + 1 < HEIGHTMAP_WIDTH && y > 0) {
        best = Math.min(best, (distance[index - HEIGHTMAP_WIDTH + 1] ?? infinity) + diagonal);
      }
      distance[index] = best;
    }
  }

  for (let y = HEIGHTMAP_HEIGHT - 1; y >= 0; y -= 1) {
    for (let x = HEIGHTMAP_WIDTH - 1; x >= 0; x -= 1) {
      const index = y * HEIGHTMAP_WIDTH + x;
      let best = distance[index] ?? infinity;
      if (x + 1 < HEIGHTMAP_WIDTH) best = Math.min(best, (distance[index + 1] ?? infinity) + 1);
      if (y + 1 < HEIGHTMAP_HEIGHT) {
        best = Math.min(best, (distance[index + HEIGHTMAP_WIDTH] ?? infinity) + 1);
      }
      if (x + 1 < HEIGHTMAP_WIDTH && y + 1 < HEIGHTMAP_HEIGHT) {
        best = Math.min(best, (distance[index + HEIGHTMAP_WIDTH + 1] ?? infinity) + diagonal);
      }
      if (x > 0 && y + 1 < HEIGHTMAP_HEIGHT) {
        best = Math.min(best, (distance[index + HEIGHTMAP_WIDTH - 1] ?? infinity) + diagonal);
      }
      distance[index] = best;
    }
  }

  const result = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) result[i] = Math.min(255, Math.round(distance[i] ?? 0));
  return result;
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep01(x - x0);
  const tz = smoothstep01(z - z0);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return (ab + (cd - ab) * tz) * 2 - 1;
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothRange(value: number, min: number, max: number): number {
  if (max <= min) return value >= max ? 1 : 0;
  return smoothstep01((value - min) / (max - min));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
