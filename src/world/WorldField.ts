export const WORLD_WIDTH = 32;
export const WORLD_DEPTH = 24;
export const TERRAIN_SEGMENTS_X = 104;
export const TERRAIN_SEGMENTS_Z = 78;

export type XZ = readonly [number, number];

export const RIVER_PATH: readonly XZ[] = [
  [8.8, -3.2],
  [7.0, -2.2],
  [5.3, -1.4],
  [3.8, -0.2],
  [2.1, 0.4],
  [0.5, 1.1],
  [-1.3, 1.5],
  [-3.2, 2.5],
  [-5.2, 3.4],
  [-7.2, 4.6],
  [-9.8, 5.5],
];

export function terrainHeight(x: number, z: number): number {
  const island = islandSignal(x, z);

  if (island <= 0) {
    return -0.92 + island * 0.72;
  }

  const westernRidge = elongatedGaussian(x, z, -2.4, -3.3, 13.5, 2.8, -0.28) * 1.28;
  const easternRidge = elongatedGaussian(x, z, 5.1, -1.1, 10.5, 2.1, 0.48) * 2.05;
  const northernHighland = elongatedGaussian(x, z, 1.4, 5.8, 19, 5.5, -0.08) * 0.72;
  const rolling =
    valueNoise(x * 0.46, z * 0.46) * 0.15 +
    valueNoise(x * 0.92 + 8.3, z * 0.92 - 3.7) * 0.06;

  const riverDistance = distanceToPolyline(x, z, RIVER_PATH);
  const riverValley = Math.exp(-(riverDistance * riverDistance) / 1.45) * 0.22;
  const riverBed = Math.exp(-(riverDistance * riverDistance) / 0.085) * 0.16;

  return (
    0.1 +
    Math.pow(island, 0.72) * 0.78 +
    westernRidge +
    easternRidge +
    northernHighland +
    rolling -
    riverValley -
    riverBed
  );
}

export function islandSignal(x: number, z: number): number {
  const ellipse = Math.sqrt((x * x) / (14.5 * 14.5) + (z * z) / (10.4 * 10.4));
  const macro = valueNoise(x * 0.16 + 5.1, z * 0.16 - 1.7) * 0.14;
  const coast = valueNoise(x * 0.43 - 2.3, z * 0.43 + 7.8) * 0.075;
  const micro = valueNoise(x * 0.91 + 11.2, z * 0.91 + 4.2) * 0.025;
  return 1 - ellipse + macro + coast + micro;
}

export function isLandAt(x: number, z: number): boolean {
  return islandSignal(x, z) > 0.012;
}

export function riverDistanceAt(x: number, z: number): number {
  return distanceToPolyline(x, z, RIVER_PATH);
}

export function fertilityAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;

  const height = terrainHeight(x, z);
  const river = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 3.1);
  const lowland = 1 - clamp01((height - 0.35) / 1.7);
  return clamp01(0.22 + river * 0.62 + lowland * 0.34);
}

export function forestDensityAt(x: number, z: number): number {
  if (!isLandAt(x, z)) return 0;

  const west = elongatedGaussian(x, z, -7.0, -2.8, 16, 8, 0.18);
  const north = elongatedGaussian(x, z, 0.4, 5.1, 13, 5.5, -0.14);
  const southeast = elongatedGaussian(x, z, 7.6, 3.0, 8.5, 6, 0.36) * 0.72;
  const breakup = valueNoise(x * 0.78 + 2.1, z * 0.78 - 5.4) * 0.26;
  const riverClearing = Math.exp(-Math.pow(riverDistanceAt(x, z), 2) / 0.72) * 0.55;
  const highlandPenalty = clamp01((terrainHeight(x, z) - 1.32) / 1.2) * 0.7;
  return clamp01(Math.max(west, north, southeast) + breakup - riverClearing - highlandPenalty);
}

export function mountainStrengthAt(x: number, z: number): number {
  const east = elongatedGaussian(x, z, 5.1, -1.1, 10.5, 2.1, 0.48);
  const west = elongatedGaussian(x, z, -2.4, -3.3, 13.5, 2.8, -0.28) * 0.58;
  return clamp01(Math.max(east, west));
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
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
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
