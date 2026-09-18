export const WORLD_WIDTH = 5200;
export const WORLD_DEPTH = 3800;
export const SEA_LEVEL = 0;

export type Point2 = readonly [x: number, z: number];

export interface RiverPath {
  readonly points: readonly Point2[];
  readonly sourceWidth: number;
  readonly mouthWidth: number;
}

const RIVERS: readonly RiverPath[] = [
  {
    points: [
      [-520, -1510],
      [-430, -1260],
      [-300, -1010],
      [-120, -760],
      [40, -510],
      [130, -220],
      [220, 80],
      [420, 360],
      [690, 650],
      [990, 900],
      [1320, 1150],
      [1630, 1370],
    ],
    sourceWidth: 10,
    mouthWidth: 30,
  },
  {
    points: [
      [-1540, -970],
      [-1480, -720],
      [-1400, -450],
      [-1510, -150],
      [-1630, 120],
      [-1700, 420],
      [-1840, 720],
      [-2070, 980],
    ],
    sourceWidth: 8,
    mouthWidth: 24,
  },
  {
    points: [
      [1120, -1080],
      [1170, -820],
      [1260, -560],
      [1230, -260],
      [1320, 20],
      [1490, 250],
      [1660, 450],
      [1900, 620],
      [2160, 720],
    ],
    sourceWidth: 8,
    mouthWidth: 26,
  },
] as const;

const NORTH_RIDGE: readonly Point2[] = [
  [-1850, -930],
  [-1420, -1180],
  [-980, -1300],
  [-520, -1260],
  [-80, -1110],
  [360, -980],
  [820, -1040],
  [1280, -900],
  [1680, -650],
];

const SOUTHWEST_RIDGE: readonly Point2[] = [
  [-1950, 900],
  [-1650, 650],
  [-1350, 520],
  [-1080, 610],
  [-820, 830],
  [-600, 1120],
];

const EAST_RIDGE: readonly Point2[] = [
  [820, -540],
  [1050, -310],
  [1180, 40],
  [1100, 360],
  [1240, 700],
  [1510, 970],
];

interface RidgeDefinition {
  points: readonly Point2[];
  width: number;
  height: number;
  passes: readonly Point2[];
}

const RIDGES: readonly RidgeDefinition[] = [
  {
    points: NORTH_RIDGE,
    width: 205,
    height: 190,
    passes: [
      [-1040, -1280],
      [330, -980],
      [1210, -900],
    ],
  },
  {
    points: SOUTHWEST_RIDGE,
    width: 185,
    height: 145,
    passes: [
      [-1450, 580],
      [-850, 810],
    ],
  },
  {
    points: EAST_RIDGE,
    width: 190,
    height: 155,
    passes: [
      [1110, -10],
      [1240, 700],
    ],
  },
] as const;

export class WorldField {
  public readonly width = WORLD_WIDTH;
  public readonly depth = WORLD_DEPTH;
  public readonly seaLevel = SEA_LEVEL;
  public readonly rivers = RIVERS;

  public landMaskAt(x: number, z: number): number {
    const nx = x / 2450;
    const nz = z / 1740;

    let field =
      1 -
      Math.pow(Math.abs(nx), 2.45) -
      Math.pow(Math.abs(nz), 2.2);

    field += ellipseInfluence(x, z, 2050, 280, 930, 780) * 0.58;
    field += ellipseInfluence(x, z, -2150, 420, 850, 720) * 0.42;
    field += ellipseInfluence(x, z, 250, 1600, 920, 650) * 0.32;

    field -= ellipseInfluence(x, z, -250, -1740, 880, 620) * 0.68;
    field -= ellipseInfluence(x, z, -2380, -120, 680, 900) * 0.34;
    field -= ellipseInfluence(x, z, 2350, 1200, 720, 650) * 0.28;

    field +=
      Math.sin(x * 0.0042 + z * 0.0014) * 0.035 +
      Math.sin(z * 0.0051 - x * 0.0011) * 0.025 +
      Math.sin((x + z) * 0.0023) * 0.018;

    return field;
  }

  public heightAt(x: number, z: number): number {
    const landMask = this.landMaskAt(x, z);

    if (landMask <= 0) {
      return -24 - Math.min(80, Math.abs(landMask) * 85);
    }

    const coastFade = smoothstep(0, 0.19, landMask);

    let height =
      24 +
      Math.sin(x * 0.0021) * 8 +
      Math.sin(z * 0.0027) * 6 +
      Math.sin((x - z) * 0.0013) * 7;

    const westPlateau = ellipseInfluence(x, z, -1020, -120, 910, 710);
    height += smoothstep(0.08, 0.48, westPlateau) * 112;
    height += smoothstep(0.52, 0.76, westPlateau) * 28;

    const easternUpland = ellipseInfluence(x, z, 1320, 80, 900, 940);
    height += smoothstep(0.12, 0.65, easternUpland) * 70;

    const southTableland = ellipseInfluence(x, z, 300, 1120, 980, 520);
    height += smoothstep(0.18, 0.66, southTableland) * 58;

    for (const ridge of RIDGES) {
      height += ridgeContribution(x, z, ridge);

      for (const [passX, passZ] of ridge.passes) {
        height -= gaussianDistance(x, z, passX, passZ, ridge.width * 0.72) * ridge.height * 0.62;
      }
    }

    height -= ellipseInfluence(x, z, 260, 170, 720, 570) * 58;
    height -= ellipseInfluence(x, z, -240, 840, 660, 420) * 28;

    const riverDistance = this.distanceToRiver(x, z);
    height -= Math.exp(-Math.pow(riverDistance / 88, 2)) * 34;
    height -= Math.exp(-Math.pow(riverDistance / 190, 2)) * 14;

    const broadRolling =
      Math.sin(x * 0.006 + z * 0.0015) * 4 +
      Math.sin(z * 0.005 - x * 0.002) * 3;
    height += broadRolling;

    return Math.max(5, Math.min(325, height * coastFade + 4));
  }

  public slopeAt(x: number, z: number): number {
    const step = 28;
    const dx = this.heightAt(x + step, z) - this.heightAt(x - step, z);
    const dz = this.heightAt(x, z + step) - this.heightAt(x, z - step);
    return Math.hypot(dx, dz) / (step * 2);
  }

  public distanceToRiver(x: number, z: number): number {
    let best = Number.POSITIVE_INFINITY;

    for (const river of RIVERS) {
      best = Math.min(best, distanceToPolyline(x, z, river.points));
    }

    return best;
  }

  public forestDensityAt(x: number, z: number): number {
    if (this.landMaskAt(x, z) <= 0) return 0;

    const height = this.heightAt(x, z);
    if (height > 245) return 0;

    let density = 0;
    density += ellipseInfluence(x, z, -1550, -240, 750, 650) * 0.85;
    density += ellipseInfluence(x, z, -820, 720, 720, 520) * 0.72;
    density += ellipseInfluence(x, z, 820, -520, 700, 620) * 0.62;
    density += ellipseInfluence(x, z, 1560, 760, 650, 520) * 0.78;
    density += ellipseInfluence(x, z, 230, 1220, 680, 360) * 0.45;

    density +=
      Math.sin(x * 0.007 + z * 0.003) * 0.08 +
      Math.sin(z * 0.009 - x * 0.002) * 0.06;

    const riverMoisture = Math.exp(-Math.pow(this.distanceToRiver(x, z) / 360, 2)) * 0.12;
    const elevationPenalty = smoothstep(155, 245, height) * 0.58;

    return clamp01(density + riverMoisture - elevationPenalty);
  }
}

function ridgeContribution(
  x: number,
  z: number,
  ridge: RidgeDefinition,
): number {
  const distance = distanceToPolyline(x, z, ridge.points);
  const core = Math.exp(-Math.pow(distance / ridge.width, 2));
  const foothill = Math.exp(-Math.pow(distance / (ridge.width * 2.25), 2)) * 0.34;
  return ridge.height * (core + foothill);
}

function distanceToPolyline(
  x: number,
  z: number,
  points: readonly Point2[],
): number {
  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    best = Math.min(best, distanceToSegment(x, z, a[0], a[1], b[0], b[1]));
  }

  return best;
}

function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSquared = abx * abx + abz * abz;

  if (lengthSquared <= 0.00001) {
    return Math.hypot(px - ax, pz - az);
  }

  const t = clamp01(((px - ax) * abx + (pz - az) * abz) / lengthSquared);
  const closestX = ax + abx * t;
  const closestZ = az + abz * t;
  return Math.hypot(px - closestX, pz - closestZ);
}

function ellipseInfluence(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
): number {
  const dx = (x - centerX) / radiusX;
  const dz = (z - centerZ) / radiusZ;
  return clamp01(1 - (dx * dx + dz * dz));
}

function gaussianDistance(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radius: number,
): number {
  const distance = Math.hypot(x - centerX, z - centerZ);
  return Math.exp(-Math.pow(distance / radius, 2));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
