export const WORLD_WIDTH = 64;
export const WORLD_DEPTH = 44;
export const WORLD_HALF_WIDTH = WORLD_WIDTH / 2;
export const WORLD_HALF_DEPTH = WORLD_DEPTH / 2;
export const TERRAIN_SEGMENTS_X = 216;
export const TERRAIN_SEGMENTS_Z = 148;
export const SEA_LEVEL = -0.18;

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

export const RIVER_PATHS: readonly (readonly XZ[])[] = [
  [
    [24.0, -5.8],
    [20.5, -3.9],
    [16.8, -1.8],
    [12.4, 0.2],
    [7.8, 1.8],
    [3.1, 2.7],
    [-1.8, 3.5],
    [-7.2, 4.8],
    [-12.8, 6.2],
    [-18.7, 7.4],
    [-25.8, 8.3],
  ],
  [
    [10.6, 15.4],
    [9.4, 12.0],
    [7.5, 9.2],
    [5.7, 6.8],
    [4.1, 4.8],
    [3.1, 2.7],
  ],
  [
    [-2.8, -15.8],
    [-1.7, -11.6],
    [-0.8, -7.8],
    [0.3, -4.5],
    [1.7, -1.2],
    [3.1, 2.7],
  ],
];

export function terrainSampleAt(x: number, z: number): TerrainSample {
  const signal = islandSignal(x, z);
  const height = terrainHeightFromSignal(x, z, signal);
  const coastInfluence = coastInfluenceFromSignal(signal);
  const roughness = roughnessFromValues(x, z, height, signal);
  const moisture = moistureFromValues(x, z, signal, coastInfluence);
  const fertility = fertilityFromValues(x, z, height, moisture, roughness, signal);

  return {
    height,
    moisture,
    fertility,
    roughness,
    coastInfluence,
    biome: biomeFromValues(height, moisture, fertility, roughness, coastInfluence, signal),
  };
}

export function terrainHeight(x: number, z: number): number {
  const signal = islandSignal(x, z);
  return terrainHeightFromSignal(x, z, signal);
}

export function islandSignal(x: number, z: number): number {
  const rotated = rotatePoint(x, z, -0.035);
  const ellipse = Math.sqrt(
    (rotated.x * rotated.x) / (29.7 * 29.7) + (rotated.z * rotated.z) / (19.7 * 19.7),
  );

  const northWestCape = elongatedGaussian(x, z, -21.8, 9.8, 110, 28, -0.28) * 0.13;
  const eastCape = elongatedGaussian(x, z, 24.2, -2.8, 96, 22, 0.16) * 0.11;
  const southWestShelf = elongatedGaussian(x, z, -17.0, -14.6, 92, 25, 0.12) * 0.08;

  const northBay = elongatedGaussian(x, z, -2.0, 18.1, 78, 18, 0.05) * 0.13;
  const westBay = elongatedGaussian(x, z, -28.1, 3.8, 58, 13, -0.08) * 0.11;
  const southEastBay = elongatedGaussian(x, z, 16.8, -16.2, 72, 16, -0.28) * 0.14;

  const macro = valueNoise(x * 0.07 + 5.1, z * 0.07 - 1.7) * 0.13;
  const meso = valueNoise(x * 0.17 - 2.3, z * 0.17 + 7.8) * 0.058;
  const coast = valueNoise(x * 0.39 + 11.2, z * 0.39 + 4.2) * 0.017;

  return (
    1 -
    ellipse +
    macro +
    meso +
    coast +
    northWestCape +
    eastCape +
    southWestShelf -
    northBay -
    westBay -
    southEastBay
  );
}

export function isLandAt(x: number, z: number): boolean {
  return islandSignal(x, z) > 0.004;
}

export function riverDistanceAt(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;

  for (const path of RIVER_PATHS) {
    best = Math.min(best, distanceToPolyline(x, z, path));
  }

  return best;
}

export function coastInfluenceAt(x: number, z: number): number {
  return coastInfluenceFromSignal(islandSignal(x, z));
}

export function moistureAt(x: number, z: number): number {
  const signal = islandSignal(x, z);
  return moistureFromValues(x, z, signal, coastInfluenceFromSignal(signal));
}

export function roughnessAt(x: number, z: number): number {
  const signal = islandSignal(x, z);
  const height = terrainHeightFromSignal(x, z, signal);
  return roughnessFromValues(x, z, height, signal);
}

export function fertilityAt(x: number, z: number): number {
  const signal = islandSignal(x, z);
  const height = terrainHeightFromSignal(x, z, signal);
  const coastInfluence = coastInfluenceFromSignal(signal);
  const roughness = roughnessFromValues(x, z, height, signal);
  const moisture = moistureFromValues(x, z, signal, coastInfluence);
  return fertilityFromValues(x, z, height, moisture, roughness, signal);
}

export function biomeAt(x: number, z: number): TerrainBiome {
  return terrainSampleAt(x, z).biome;
}

export function forestDensityAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;

  const farWest = elongatedGaussian(x, z, -20.0, -2.2, 34, 13, 0.18);
  const northWest = elongatedGaussian(x, z, -10.0, 11.0, 31, 10, -0.2);
  const north = elongatedGaussian(x, z, 2.0, 14.0, 30, 8.5, 0.08);
  const southCentral = elongatedGaussian(x, z, 2.5, -12.8, 34, 10, -0.12);
  const east = elongatedGaussian(x, z, 20.0, 2.5, 26, 12, 0.34) * 0.86;
  const breakup = valueNoise(x * 0.43 + 2.1, z * 0.43 - 5.4) * 0.27;
  const riverClearing = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 1.15) * 0.52;
  const highlandPenalty = clamp01((terrainHeight(x, z) - 1.55) / 1.3) * 0.72;

  return clamp01(
    Math.max(farWest, northWest, north, southCentral, east) + breakup - riverClearing - highlandPenalty,
  );
}

export function mountainStrengthAt(x: number, z: number): number {
  const west = elongatedGaussian(x, z, -13.4, -5.7, 66, 7.5, -0.34) * 0.7;
  const center = elongatedGaussian(x, z, 5.8, -4.1, 48, 5.8, 0.42);
  const northEast = elongatedGaussian(x, z, 15.7, 8.0, 46, 6.5, -0.52) * 0.95;
  return clamp01(Math.max(west, center, northEast));
}

export function deterministic01(x: number, z: number, seed = 0): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function terrainHeightFromSignal(x: number, z: number, signal: number): number {
  if (signal <= 0) {
    const depth = clamp01(-signal / 0.38);
    const shelf = smoothstep01(depth);
    return SEA_LEVEL - 0.035 - shelf * 1.22;
  }

  const inland = smoothstep01(signal / 0.13);
  const continentalRise = Math.pow(clamp01(signal / 0.78), 0.72) * 0.34;

  const westernRidge = elongatedGaussian(x, z, -13.4, -5.7, 66, 7.5, -0.34) * 1.28;
  const centralRidge = elongatedGaussian(x, z, 5.8, -4.1, 48, 5.8, 0.42) * 1.76;
  const northEasternRange = elongatedGaussian(x, z, 15.7, 8.0, 46, 6.5, -0.52) * 1.52;
  const northernPlateau = elongatedGaussian(x, z, -2.0, 11.2, 128, 44, -0.05) * 0.52;
  const southernUpland = elongatedGaussian(x, z, -9.0, -12.5, 102, 34, 0.14) * 0.38;
  const easternTableland = elongatedGaussian(x, z, 19.0, -5.0, 72, 28, 0.08) * 0.32;

  const centralPlain = elongatedGaussian(x, z, -5.2, 2.8, 150, 58, 0.04) * 0.28;
  const easternBasin = elongatedGaussian(x, z, 13.0, 2.1, 112, 46, -0.12) * 0.2;
  const southernLowland = elongatedGaussian(x, z, 4.0, -11.2, 104, 36, 0.08) * 0.18;

  const macroUndulation = valueNoise(x * 0.095 - 3.4, z * 0.095 + 9.1) * 0.15;
  const mesoHills = valueNoise(x * 0.245 + 7.6, z * 0.245 - 4.8) * 0.095;
  const localRelief = valueNoise(x * 0.57 - 12.1, z * 0.57 + 1.3) * 0.035;
  const microRelief = valueNoise(x * 1.18 + 2.7, z * 1.18 - 13.0) * 0.012;

  const riverDistance = riverDistanceAt(x, z);
  const riverValley = Math.exp(-(riverDistance * riverDistance) / 3.7) * 0.2;
  const riverBed = Math.exp(-(riverDistance * riverDistance) / 0.16) * 0.13;

  const coastCliffs =
    Math.max(
      elongatedGaussian(x, z, -27.0, -4.0, 44, 8, -0.2),
      elongatedGaussian(x, z, 23.5, 8.5, 38, 7, 0.3),
      elongatedGaussian(x, z, -7.0, 18.0, 46, 7, -0.08),
    ) *
    coastInfluenceFromSignal(signal) *
    0.38;

  const broadRelief =
    westernRidge +
    centralRidge +
    northEasternRange +
    northernPlateau +
    southernUpland +
    easternTableland -
    centralPlain -
    easternBasin -
    southernLowland;

  return (
    SEA_LEVEL +
    0.025 +
    inland * 0.46 +
    continentalRise +
    broadRelief * inland +
    macroUndulation * inland +
    mesoHills * inland +
    localRelief * inland +
    microRelief * inland -
    (riverValley + riverBed) * inland +
    coastCliffs
  );
}

function moistureFromValues(x: number, z: number, signal: number, coastInfluence: number): number {
  if (signal <= 0) return 1;

  const river = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 7.2);
  const westernAir = elongatedGaussian(x, z, -17.0, 4.0, 210, 92, -0.08) * 0.18;
  const northernWet = elongatedGaussian(x, z, 0.0, 13.0, 170, 52, 0.02) * 0.14;
  const southEastDry = elongatedGaussian(x, z, 17.0, -10.0, 130, 45, -0.12) * 0.24;
  const climateNoise = valueNoise(x * 0.105 + 4.4, z * 0.105 - 8.2) * 0.13;

  return clamp01(
    0.38 + coastInfluence * 0.2 + river * 0.38 + westernAir + northernWet + climateNoise - southEastDry,
  );
}

function roughnessFromValues(x: number, z: number, height: number, signal: number): number {
  if (signal <= 0) return 0;

  const mountain = mountainStrengthAt(x, z);
  const elevation = smoothRange(height, 0.9, 2.6);
  const brokenGround = Math.abs(valueNoise(x * 0.34 - 6.1, z * 0.34 + 2.8)) * 0.28;
  const rockyNoise = Math.abs(valueNoise(x * 0.78 + 9.2, z * 0.78 - 5.0)) * 0.16;
  const coastalCliff =
    coastInfluenceFromSignal(signal) *
    Math.max(
      elongatedGaussian(x, z, -27.0, -4.0, 44, 8, -0.2),
      elongatedGaussian(x, z, 23.5, 8.5, 38, 7, 0.3),
      elongatedGaussian(x, z, -7.0, 18.0, 46, 7, -0.08),
    );

  return clamp01(0.08 + mountain * 0.52 + elevation * 0.3 + brokenGround + rockyNoise + coastalCliff * 0.34);
}

function fertilityFromValues(
  x: number,
  z: number,
  height: number,
  moisture: number,
  roughness: number,
  signal: number,
): number {
  if (signal <= 0) return 0;

  const river = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 5.8);
  const lowland = 1 - smoothRange(height, 0.7, 2.2);
  const temperateMoisture = 1 - Math.abs(moisture - 0.68) * 1.25;
  const roughPenalty = roughness * 0.44;
  const highPenalty = smoothRange(height, 1.65, 2.9) * 0.48;

  return clamp01(
    0.08 + lowland * 0.35 + river * 0.37 + clamp01(temperateMoisture) * 0.28 - roughPenalty - highPenalty,
  );
}

function biomeFromValues(
  height: number,
  moisture: number,
  fertility: number,
  roughness: number,
  coastInfluence: number,
  signal: number,
): TerrainBiome {
  if (signal <= 0 || height <= SEA_LEVEL) return 'sea';
  if (coastInfluence > 0.48 && height < 0.28) return moisture > 0.72 ? 'wetland' : 'shore';
  if (roughness > 0.68 || height > 2.45) return 'rocky';
  if (height > 1.32 || roughness > 0.48) return 'highland';
  if (moisture > 0.78 && height < 0.72) return 'wetland';
  if (fertility > 0.64) return 'fertile-lowland';
  if (moisture < 0.36) return 'dry-grassland';
  return 'grassland';
}

function coastInfluenceFromSignal(signal: number): number {
  const distance = Math.abs(signal);
  return 1 - smoothRange(distance, 0.018, 0.19);
}

function distanceToPolyline(x: number, z: number, points: readonly XZ[]): number {
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (!start || !end) continue;

    const [ax, az] = start;
    const [bx, bz] = end;
    const abx = bx - ax;
    const abz = bz - az;
    const lengthSq = abx * abx + abz * abz;
    const t = lengthSq === 0 ? 0 : clamp01(((x - ax) * abx + (z - az) * abz) / lengthSq);
    const px = ax + abx * t;
    const pz = az + abz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }

  return best;
}

function elongatedGaussian(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  spreadLong: number,
  spreadShort: number,
  rotation: number,
): number {
  const dx = x - centerX;
  const dz = z - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rx = dx * cos - dz * sin;
  const rz = dx * sin + dz * cos;
  return Math.exp(-((rx * rx) / spreadLong + (rz * rz) / spreadShort));
}

function rotatePoint(x: number, z: number, rotation: number): { x: number; z: number } {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: x * cos - z * sin,
    z: x * sin + z * cos,
  };
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
