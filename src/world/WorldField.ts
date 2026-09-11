export const WORLD_WIDTH = 64;
export const WORLD_DEPTH = 44;
export const WORLD_HALF_WIDTH = WORLD_WIDTH / 2;
export const WORLD_HALF_DEPTH = WORLD_DEPTH / 2;
export const TERRAIN_SEGMENTS_X = 168;
export const TERRAIN_SEGMENTS_Z = 116;

export type XZ = readonly [number, number];

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

export function terrainHeight(x: number, z: number): number {
  const island = islandSignal(x, z);

  if (island <= 0) {
    return -1.05 + island * 0.72;
  }

  const westernRidge = elongatedGaussian(x, z, -12.5, -5.2, 48, 5.8, -0.34) * 1.55;
  const centralRidge = elongatedGaussian(x, z, 5.7, -4.0, 34, 4.2, 0.42) * 2.28;
  const northEasternRange = elongatedGaussian(x, z, 15.5, 8.2, 30, 4.6, -0.52) * 2.0;
  const northernHighland = elongatedGaussian(x, z, -1.0, 11.8, 52, 12, -0.04) * 0.72;
  const southernShelf = elongatedGaussian(x, z, -8.0, -13.6, 42, 10, 0.12) * 0.46;

  const rolling =
    valueNoise(x * 0.24, z * 0.24) * 0.18 +
    valueNoise(x * 0.5 + 8.3, z * 0.5 - 3.7) * 0.08 +
    valueNoise(x * 1.05 - 2.1, z * 1.05 + 11.4) * 0.025;

  const riverDistance = riverDistanceAt(x, z);
  const riverValley = Math.exp(-(riverDistance * riverDistance) / 2.1) * 0.25;
  const riverBed = Math.exp(-(riverDistance * riverDistance) / 0.11) * 0.18;

  return (
    0.12 +
    Math.pow(island, 0.72) * 0.86 +
    westernRidge +
    centralRidge +
    northEasternRange +
    northernHighland +
    southernShelf +
    rolling -
    riverValley -
    riverBed
  );
}

export function islandSignal(x: number, z: number): number {
  const ellipse = Math.sqrt((x * x) / (29.4 * 29.4) + (z * z) / (19.6 * 19.6));
  const macro = valueNoise(x * 0.085 + 5.1, z * 0.085 - 1.7) * 0.16;
  const coast = valueNoise(x * 0.22 - 2.3, z * 0.22 + 7.8) * 0.075;
  const micro = valueNoise(x * 0.52 + 11.2, z * 0.52 + 4.2) * 0.018;
  return 1 - ellipse + macro + coast + micro;
}

export function isLandAt(x: number, z: number): boolean {
  return islandSignal(x, z) > 0.01;
}

export function riverDistanceAt(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;

  for (const path of RIVER_PATHS) {
    best = Math.min(best, distanceToPolyline(x, z, path));
  }

  return best;
}

export function fertilityAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;

  const height = terrainHeight(x, z);
  const river = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 5.4);
  const lowland = 1 - clamp01((height - 0.42) / 2.0);
  return clamp01(0.18 + river * 0.68 + lowland * 0.32);
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
  const west = elongatedGaussian(x, z, -12.5, -5.2, 48, 5.8, -0.34) * 0.68;
  const center = elongatedGaussian(x, z, 5.7, -4.0, 34, 4.2, 0.42);
  const northEast = elongatedGaussian(x, z, 15.5, 8.2, 30, 4.6, -0.52) * 0.92;
  return clamp01(Math.max(west, center, northEast));
}

export function deterministic01(x: number, z: number, seed = 0): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

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

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
