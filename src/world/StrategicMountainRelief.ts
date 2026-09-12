export interface StrategicMountainRelief {
  height: number;
  strength: number;
}

interface MountainRange {
  centerX: number;
  centerZ: number;
  halfLength: number;
  halfWidth: number;
  angle: number;
  height: number;
  seed: number;
}

// Broad, separated ranges keep several defensible high-ground regions without
// turning the center of the strategic map into one dominant mountain fortress.
const MOUNTAIN_RANGES: readonly MountainRange[] = [
  { centerX: -118, centerZ: 108, halfLength: 86, halfWidth: 25, angle: 0.56, height: 4.3, seed: 11 },
  { centerX: -132, centerZ: -92, halfLength: 78, halfWidth: 24, angle: -0.48, height: 4.0, seed: 23 },
  { centerX: 142, centerZ: -42, halfLength: 84, halfWidth: 23, angle: 0.44, height: 4.5, seed: 37 },
  { centerX: 92, centerZ: 132, halfLength: 68, halfWidth: 21, angle: -0.24, height: 3.6, seed: 53 },
  { centerX: 24, centerZ: -138, halfLength: 62, halfWidth: 19, angle: 0.18, height: 3.2, seed: 71 },
];

export function strategicMountainReliefAt(
  x: number,
  z: number,
  landInterior: number,
): StrategicMountainRelief {
  if (landInterior <= 0) return { height: 0, strength: 0 };

  let height = 0;
  let strength = 0;

  for (const range of MOUNTAIN_RANGES) {
    const sample = rangeSample(range, x, z);
    height = Math.max(height, sample.height);
    strength = Math.max(strength, sample.strength);
  }

  const interior = smoothstep01(landInterior);
  return {
    height: height * interior,
    strength: strength * interior,
  };
}

function rangeSample(range: MountainRange, x: number, z: number): StrategicMountainRelief {
  const dx = x - range.centerX;
  const dz = z - range.centerZ;
  const cos = Math.cos(range.angle);
  const sin = Math.sin(range.angle);
  const along = (dx * cos + dz * sin) / range.halfLength;
  const across = (-dx * sin + dz * cos) / range.halfWidth;

  const alongEnvelope = Math.exp(-Math.pow(Math.abs(along), 4) * 1.8);
  const ridgeCore = Math.exp(-(across * across) * 2.45);
  const foothills = Math.exp(-(across * across) * 0.72) * 0.34;
  const broken = 0.82 + 0.18 * valueNoise(
    x * 0.035 + range.seed * 0.17,
    z * 0.035 - range.seed * 0.11,
    range.seed,
  );
  const secondary = 0.88 + 0.12 * valueNoise(
    x * 0.076 - range.seed * 0.09,
    z * 0.076 + range.seed * 0.13,
    range.seed + 97,
  );

  const ridge = clamp01((ridgeCore + foothills) * alongEnvelope * broken * secondary);
  const crest = Math.pow(ridge, 1.34);
  const strength = smoothstep01((ridge - 0.14) / 0.72);

  return {
    height: crest * range.height,
    strength,
  };
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep01(x - x0);
  const tz = smoothstep01(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * tz;
}

function hash2(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
