export const WORLD_WIDTH = 144;
export const WORLD_DEPTH = 100;
export const WORLD_HALF_WIDTH = WORLD_WIDTH / 2;
export const WORLD_HALF_DEPTH = WORLD_DEPTH / 2;
export const TERRAIN_SEGMENTS_X = 320;
export const TERRAIN_SEGMENTS_Z = 224;
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

export interface RiverDefinition {
  points: readonly XZ[];
  sourceWidth: number;
  mouthWidth: number;
}

interface MountainRange {
  path: readonly XZ[];
  width: number;
  amplitude: number;
}

export const RIVERS: readonly RiverDefinition[] = [
  {
    points: [
      [47, 33], [43, 30], [39, 27], [35, 25], [32, 22], [28, 20], [25, 17], [21, 16],
      [18, 13], [14, 12], [10, 9], [6, 10], [1, 8], [-4, 9], [-9, 7], [-14, 8],
      [-19, 6], [-25, 7], [-31, 5], [-37, 7], [-43, 6], [-49, 8], [-55, 7], [-61, 5], [-67, 4],
    ],
    sourceWidth: 0.2,
    mouthWidth: 0.96,
  },
  {
    points: [
      [31, 35], [29, 32], [30, 29], [27, 27], [28, 24], [25, 22], [23, 19], [21, 16],
    ],
    sourceWidth: 0.11,
    mouthWidth: 0.38,
  },
  {
    points: [
      [40, -21], [37, -18], [38, -14], [34, -12], [33, -8], [29, -6], [28, -2], [24, 0],
      [23, 4], [19, 6], [18, 10], [14, 12],
    ],
    sourceWidth: 0.12,
    mouthWidth: 0.42,
  },
  {
    points: [
      [-21, 36], [-25, 33], [-27, 29], [-31, 27], [-33, 23], [-37, 22], [-39, 19], [-44, 18],
      [-48, 16], [-52, 17], [-56, 15], [-61, 16], [-65, 18], [-69, 20],
    ],
    sourceWidth: 0.14,
    mouthWidth: 0.58,
  },
  {
    points: [
      [8, -30], [4, -29], [1, -27], [-3, -28], [-6, -25], [-10, -24], [-14, -21], [-18, -22],
      [-21, -18], [-26, -17], [-30, -14], [-35, -15], [-39, -12], [-44, -12], [-49, -14], [-54, -13],
      [-59, -16], [-64, -19], [-68, -22],
    ],
    sourceWidth: 0.15,
    mouthWidth: 0.64,
  },
  {
    points: [
      [49, 32], [52, 29], [51, 26], [55, 23], [54, 19], [58, 16], [57, 12], [61, 9],
      [60, 5], [64, 1], [63, -3], [67, -7], [69, -12],
    ],
    sourceWidth: 0.13,
    mouthWidth: 0.56,
  },
];

const MOUNTAIN_RANGES: readonly MountainRange[] = [
  {
    path: [[-46, -22], [-43, -14], [-40, -6], [-37, 2], [-33, 10], [-29, 18], [-25, 27], [-21, 35]],
    width: 4.6,
    amplitude: 1.0,
  },
  {
    path: [[14, 18], [22, 22], [31, 26], [40, 29], [49, 33], [58, 35]],
    width: 5.0,
    amplitude: 1.08,
  },
  {
    path: [[-9, -30], [0, -29], [10, -27], [20, -25], [30, -23], [40, -20]],
    width: 5.0,
    amplitude: 0.9,
  },
  {
    path: [[-9, 14], [-3, 16], [4, 18], [10, 19], [16, 18]],
    width: 4.3,
    amplitude: 0.62,
  },
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
  const rotated = rotatePoint(x, z, -0.055);
  const ellipse = Math.sqrt(
    (rotated.x * rotated.x) / (67.4 * 67.4) + (rotated.z * rotated.z) / (46.2 * 46.2),
  );

  const northWestCape = elongatedGaussian(x, z, -51, 28, 520, 88, -0.24) * 0.11;
  const northCape = elongatedGaussian(x, z, 6, 44, 430, 62, 0.05) * 0.075;
  const eastCape = elongatedGaussian(x, z, 62, -5, 460, 70, 0.18) * 0.105;
  const southWestCape = elongatedGaussian(x, z, -43, -36, 430, 74, 0.13) * 0.085;

  const northBay = elongatedGaussian(x, z, -8, 46, 360, 48, 0.02) * 0.105;
  const westBay = elongatedGaussian(x, z, -67, 6, 260, 34, -0.08) * 0.095;
  const southBay = elongatedGaussian(x, z, 8, -46, 360, 46, 0.08) * 0.105;
  const southEastBay = elongatedGaussian(x, z, 49, -38, 320, 42, -0.2) * 0.12;

  const macro = valueNoise(x * 0.031 + 5.1, z * 0.031 - 1.7) * 0.14;
  const meso = valueNoise(x * 0.082 - 2.3, z * 0.082 + 7.8) * 0.062;
  const coast = valueNoise(x * 0.19 + 11.2, z * 0.19 + 4.2) * 0.021;

  return (
    1 - ellipse + macro + meso + coast + northWestCape + northCape + eastCape + southWestCape -
    northBay - westBay - southBay - southEastBay
  );
}

export function isLandAt(x: number, z: number): boolean {
  return islandSignal(x, z) > 0.004;
}

export function riverDistanceAt(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const river of RIVERS) best = Math.min(best, distanceToPolyline(x, z, river.points));
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

  const moisture = moistureAt(x, z);
  const height = terrainHeight(x, z);
  const mountain = mountainStrengthAt(x, z);
  const regional = valueNoise(x * 0.075 + 2.1, z * 0.075 - 5.4) * 0.24;
  const patch = valueNoise(x * 0.23 - 3.8, z * 0.23 + 8.1) * 0.17;
  const wetEnough = smoothRange(moisture, 0.42, 0.76);
  const highlandPenalty = smoothRange(height, 1.95, 3.6) * 0.72;
  const riverClearing = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 2.0) * 0.42;

  return clamp01(0.08 + wetEnough * 0.68 + regional + patch - highlandPenalty - mountain * 0.34 - riverClearing);
}

export function mountainStrengthAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;
  let best = 0;
  for (const range of MOUNTAIN_RANGES) {
    const distance = distanceToPolyline(x, z, range.path);
    const core = Math.exp(-(distance * distance) / (2 * range.width * range.width));
    best = Math.max(best, core * range.amplitude);
  }

  const breakup = 0.86 + Math.abs(valueNoise(x * 0.13 + 6.4, z * 0.13 - 4.1)) * 0.24;
  return clamp01(best * breakup);
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
    const depth = clamp01(-signal / 0.34);
    return SEA_LEVEL - 0.035 - smoothstep01(depth) * 1.35;
  }

  const inland = smoothstep01(signal / 0.12);
  const continentalRise = Math.pow(clamp01(signal / 0.82), 0.72) * 0.52;
  const mountain = mountainStrengthAt(x, z);

  const northPlateau = elongatedGaussian(x, z, -2, 25, 1050, 260, -0.04) * 0.68;
  const westUpland = elongatedGaussian(x, z, -44, -4, 820, 240, -0.12) * 0.48;
  const southEastTableland = elongatedGaussian(x, z, 39, -22, 720, 210, 0.08) * 0.56;
  const centralShelf = elongatedGaussian(x, z, 17, 2, 1280, 180, 0.3) * 0.34;
  const northWestRolling = elongatedGaussian(x, z, -49, 24, 780, 175, -0.34) * 0.3;
  const southCentralRise = elongatedGaussian(x, z, 3, -19, 1080, 210, 0.17) * 0.36;

  const centralPlain = elongatedGaussian(x, z, -5, 8, 1800, 520, 0.03) * 0.42;
  const eastBasin = elongatedGaussian(x, z, 38, 4, 850, 300, -0.12) * 0.32;
  const southLowland = elongatedGaussian(x, z, -21, -26, 940, 280, 0.08) * 0.3;

  const macroUndulation = valueNoise(x * 0.045 - 3.4, z * 0.045 + 9.1) * 0.27;
  const mesoHills = valueNoise(x * 0.115 + 7.6, z * 0.115 - 4.8) * 0.17;
  const localRelief = valueNoise(x * 0.31 - 12.1, z * 0.31 + 1.3) * 0.052;
  const microRelief = valueNoise(x * 0.72 + 2.7, z * 0.72 - 13.0) * 0.012;

  const crestBreakup = 0.72 + Math.abs(valueNoise(x * 0.18 + 13.1, z * 0.18 - 6.2)) * 0.62;
  const crag = Math.abs(valueNoise(x * 0.48 - 9.3, z * 0.48 + 3.6)) * mountain;
  const foothills = Math.pow(mountain, 0.62) * 0.42;
  const mountainShoulder = Math.pow(mountain, 0.9) * (1.12 + crestBreakup * 0.62);
  const mountainCrest = Math.pow(mountain, 2.5) * (2.55 + crestBreakup * 1.34 + crag * 0.88);

  const riverDistance = riverDistanceAt(x, z);
  const riverValley = Math.exp(-(riverDistance * riverDistance) / 8.4) * 0.38;
  const riverBed = Math.exp(-(riverDistance * riverDistance) / 0.32) * 0.18;

  const cliffMask = Math.max(
    elongatedGaussian(x, z, -63, -10, 150, 28, -0.16),
    elongatedGaussian(x, z, 61, 17, 145, 26, 0.25),
    elongatedGaussian(x, z, -16, 45, 170, 28, -0.06),
  );
  const coastCliffs = cliffMask * coastInfluenceFromSignal(signal) * 0.55;

  const uplands = northPlateau + westUpland + southEastTableland + centralShelf + northWestRolling + southCentralRise;
  const basins = centralPlain + eastBasin + southLowland;

  const landHeight = (
    SEA_LEVEL + 0.03 + inland * 0.52 + continentalRise +
    (uplands - basins) * inland + foothills * inland + mountainShoulder * inland + mountainCrest * inland +
    macroUndulation * inland + mesoHills * inland + localRelief * inland + microRelief * inland -
    (riverValley + riverBed) * inland + coastCliffs
  );

  return Math.max(SEA_LEVEL + 0.018, landHeight);
}

function moistureFromValues(x: number, z: number, signal: number, coastInfluence: number): number {
  if (signal <= 0) return 1;

  const river = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 13.5);
  const westMoisture = elongatedGaussian(x, z, -41, 9, 1450, 520, -0.06) * 0.17;
  const northWet = elongatedGaussian(x, z, 0, 31, 1350, 390, 0.02) * 0.13;
  const southEastDry = elongatedGaussian(x, z, 44, -26, 980, 330, -0.1) * 0.25;
  const climateNoise = valueNoise(x * 0.052 + 4.4, z * 0.052 - 8.2) * 0.14;

  return clamp01(0.36 + coastInfluence * 0.18 + river * 0.39 + westMoisture + northWet + climateNoise - southEastDry);
}

function roughnessFromValues(x: number, z: number, height: number, signal: number): number {
  if (signal <= 0) return 0;

  const mountain = mountainStrengthAt(x, z);
  const elevation = smoothRange(height, 1.0, 4.6);
  const brokenGround = Math.abs(valueNoise(x * 0.17 - 6.1, z * 0.17 + 2.8)) * 0.28;
  const rockyNoise = Math.abs(valueNoise(x * 0.42 + 9.2, z * 0.42 - 5.0)) * 0.2;
  const coastalCliff = coastInfluenceFromSignal(signal) * Math.max(
    elongatedGaussian(x, z, -63, -10, 150, 28, -0.16),
    elongatedGaussian(x, z, 61, 17, 145, 26, 0.25),
    elongatedGaussian(x, z, -16, 45, 170, 28, -0.06),
  );

  return clamp01(0.07 + mountain * 0.6 + elevation * 0.3 + brokenGround + rockyNoise + coastalCliff * 0.36);
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

  const river = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 11.5);
  const lowland = 1 - smoothRange(height, 0.9, 2.8);
  const temperateMoisture = 1 - Math.abs(moisture - 0.67) * 1.2;
  const roughPenalty = roughness * 0.43;
  const highPenalty = smoothRange(height, 2.35, 4.7) * 0.52;

  return clamp01(0.08 + lowland * 0.36 + river * 0.36 + clamp01(temperateMoisture) * 0.28 - roughPenalty - highPenalty);
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
  if (coastInfluence > 0.5 && height < 0.3) return moisture > 0.72 ? 'wetland' : 'shore';
  if (roughness > 0.69 || height > 3.45) return 'rocky';
  if (height > 1.75 || roughness > 0.5) return 'highland';
  if (moisture > 0.8 && height < 0.78) return 'wetland';
  if (fertility > 0.64) return 'fertile-lowland';
  if (moisture < 0.35) return 'dry-grassland';
  return 'grassland';
}

function coastInfluenceFromSignal(signal: number): number {
  return 1 - smoothRange(Math.abs(signal), 0.012, 0.105);
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
  return { x: x * cos - z * sin, z: x * sin + z * cos };
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
