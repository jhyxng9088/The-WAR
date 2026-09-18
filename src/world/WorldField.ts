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
  makeRiver(
    [
      [-520, -1510], [-400, -1360], [-470, -1190], [-300, -1040],
      [-360, -850], [-120, -720], [-40, -520], [120, -390],
      [70, -170], [250, 10], [190, 220], [420, 390],
      [520, 600], [760, 700], [850, 900], [1110, 1020],
      [1260, 1200], [1630, 1370],
    ],
    8,
    28,
  ),
  makeRiver(
    [
      [-1540, -970], [-1430, -840], [-1510, -680], [-1390, -500],
      [-1490, -330], [-1390, -130], [-1540, 40], [-1480, 250],
      [-1650, 390], [-1630, 590], [-1840, 720], [-1880, 870],
      [-2070, 980],
    ],
    7,
    23,
  ),
  makeRiver(
    [
      [1120, -1080], [1030, -940], [1160, -800], [1080, -630],
      [1260, -500], [1160, -300], [1320, -120], [1240, 80],
      [1430, 210], [1390, 390], [1600, 520], [1740, 470],
      [1900, 620], [2020, 590], [2160, 720],
    ],
    7,
    24,
  ),
] as const;

interface RidgeDefinition {
  readonly points: readonly Point2[];
  readonly width: number;
  readonly height: number;
  readonly passes: readonly Point2[];
}

const RIDGES: readonly RidgeDefinition[] = [
  {
    points: [
      [-2050, -900], [-1710, -1120], [-1320, -1330], [-900, -1440],
      [-470, -1390], [-40, -1190], [390, -1050], [820, -1080],
      [1240, -940], [1700, -640],
    ],
    width: 215,
    height: 365,
    passes: [
      [-1420, -1280],
      [-180, -1160],
      [1080, -980],
    ],
  },
  {
    points: [
      [-2100, 930], [-1810, 650], [-1500, 500], [-1210, 540],
      [-960, 720], [-760, 1010], [-610, 1320],
    ],
    width: 205,
    height: 250,
    passes: [
      [-1580, 540],
      [-920, 760],
    ],
  },
  {
    points: [
      [760, -620], [980, -400], [1110, -120], [1090, 180],
      [1160, 480], [1320, 760], [1560, 1040],
    ],
    width: 190,
    height: 305,
    passes: [
      [1080, -70],
      [1210, 570],
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
      Math.pow(Math.abs(nx), 2.42) -
      Math.pow(Math.abs(nz), 2.18);

    field += ellipseInfluence(x, z, 2070, 240, 930, 780) * 0.6;
    field += ellipseInfluence(x, z, -2180, 430, 850, 720) * 0.46;
    field += ellipseInfluence(x, z, 260, 1600, 940, 650) * 0.34;

    field -= ellipseInfluence(x, z, -250, -1760, 900, 630) * 0.72;
    field -= ellipseInfluence(x, z, -2400, -100, 700, 920) * 0.38;
    field -= ellipseInfluence(x, z, 2380, 1190, 740, 660) * 0.32;
    field -= ellipseInfluence(x, z, 2150, -780, 520, 500) * 0.18;

    field +=
      Math.sin(x * 0.0038 + z * 0.0012) * 0.038 +
      Math.sin(z * 0.0048 - x * 0.0011) * 0.028 +
      Math.sin((x + z) * 0.0021) * 0.02;

    return field;
  }

  public heightAt(x: number, z: number): number {
    const landMask = this.landMaskAt(x, z);

    if (landMask <= 0) {
      return -30 - Math.min(90, Math.abs(landMask) * 90);
    }

    const coastFade = smoothstep(0, 0.18, landMask);

    let height =
      20 +
      Math.sin(x * 0.0018) * 10 +
      Math.sin(z * 0.0022) * 8 +
      Math.sin((x - z) * 0.0011) * 7;

    // Western fortress plateau: broad high land with a readable escarpment edge.
    const westPlateau = ellipseInfluence(x, z, -1120, -80, 960, 760);
    height += smoothstep(0.10, 0.46, westPlateau) * 150;
    height += smoothstep(0.48, 0.70, westPlateau) * 105;

    // Eastern uplift: lower than the western plateau, but cut by a long spine.
    const eastUpland = ellipseInfluence(x, z, 1390, 80, 900, 980);
    height += smoothstep(0.12, 0.52, eastUpland) * 105;
    height += smoothstep(0.52, 0.76, eastUpland) * 48;

    // Southern tableland creates a separate elevated war theatre.
    const southTableland = ellipseInfluence(x, z, 240, 1190, 1020, 560);
    height += smoothstep(0.16, 0.56, southTableland) * 88;
    height += smoothstep(0.58, 0.78, southTableland) * 42;

    // Broken north-east high country.
    const northEastShelf = ellipseInfluence(x, z, 1740, -590, 620, 560);
    height += smoothstep(0.2, 0.58, northEastShelf) * 135;

    for (const ridge of RIDGES) {
      height += ridgeContribution(x, z, ridge);

      for (const [passX, passZ] of ridge.passes) {
        height -=
          gaussianDistance(x, z, passX, passZ, ridge.width * 0.95) *
          ridge.height *
          0.66;
      }
    }

    // Large basins keep the map from becoming one continuous mountain mass.
    height -= ellipseInfluence(x, z, 220, 150, 760, 620) * 118;
    height -= ellipseInfluence(x, z, -260, 820, 680, 460) * 54;
    height -= ellipseInfluence(x, z, 1850, 520, 440, 400) * 42;

    // Rivers carve broad strategic valleys, not tiny decorative grooves.
    const riverDistance = this.distanceToRiver(x, z);
    height -= Math.exp(-Math.pow(riverDistance / 82, 2)) * 62;
    height -= Math.exp(-Math.pow(riverDistance / 205, 2)) * 28;

    // Small-scale rolling relief only; major forms above remain dominant.
    height +=
      Math.sin(x * 0.0052 + z * 0.0012) * 5 +
      Math.sin(z * 0.0047 - x * 0.0018) * 4;

    return Math.max(5, Math.min(620, height * coastFade + 4));
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
    if (height > 330) return 0;

    let density = 0;
    density += ellipseInfluence(x, z, -1650, -160, 760, 650) * 0.82;
    density += ellipseInfluence(x, z, -760, 760, 700, 500) * 0.72;
    density += ellipseInfluence(x, z, 690, -430, 650, 570) * 0.6;
    density += ellipseInfluence(x, z, 1640, 760, 620, 500) * 0.7;
    density += ellipseInfluence(x, z, 180, 1280, 660, 330) * 0.42;

    density +=
      Math.sin(x * 0.0065 + z * 0.0026) * 0.065 +
      Math.sin(z * 0.0082 - x * 0.0018) * 0.05;

    const riverMoisture =
      Math.exp(-Math.pow(this.distanceToRiver(x, z) / 340, 2)) * 0.1;
    const elevationPenalty = smoothstep(220, 330, height) * 0.65;

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
  const shoulder =
    Math.exp(-Math.pow(distance / (ridge.width * 1.8), 2)) * 0.34;
  const foothill =
    Math.exp(-Math.pow(distance / (ridge.width * 3.0), 2)) * 0.16;

  return ridge.height * (core + shoulder + foothill);
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

function makeRiver(
  controls: readonly Point2[],
  sourceWidth: number,
  mouthWidth: number,
): RiverPath {
  return {
    points: sampleCatmullRom(controls, 3),
    sourceWidth,
    mouthWidth,
  };
}

function sampleCatmullRom(
  controls: readonly Point2[],
  samplesPerSpan: number,
): Point2[] {
  if (controls.length < 2) return [...controls];

  const result: Point2[] = [];

  for (let index = 0; index < controls.length - 1; index += 1) {
    const p0 = controls[Math.max(0, index - 1)] ?? controls[index]!;
    const p1 = controls[index]!;
    const p2 = controls[index + 1]!;
    const p3 = controls[Math.min(controls.length - 1, index + 2)] ?? p2;

    for (let sample = 0; sample < samplesPerSpan; sample += 1) {
      const t = sample / samplesPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        ((2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z =
        0.5 *
        ((2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      result.push([x, z]);
    }
  }

  const last = controls[controls.length - 1];
  if (last) result.push(last);
  return result;
}
