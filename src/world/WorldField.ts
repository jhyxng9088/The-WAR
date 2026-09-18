export const WORLD_WIDTH = 5200;
export const WORLD_DEPTH = 3800;
export const SEA_LEVEL = 0;

export type Point2 = readonly [x: number, z: number];

export type TerrainKind =
  | "water"
  | "coast"
  | "river-valley"
  | "grassland"
  | "basin"
  | "rolling-hills"
  | "forest"
  | "plateau"
  | "highland"
  | "mountain";

export interface RiverPath {
  readonly points: readonly Point2[];
  readonly sourceWidth: number;
  readonly mouthWidth: number;
}

interface RidgeDefinition {
  readonly points: readonly Point2[];
  readonly width: number;
  readonly height: number;
  readonly passes: readonly Point2[];
}

const RIVERS: readonly RiverPath[] = [
  makeRiver(
    [
      [-520, -1510], [-410, -1360], [-490, -1190], [-310, -1040],
      [-370, -860], [-120, -710], [-20, -520], [140, -390],
      [70, -190], [250, -10], [180, 210], [430, 390],
      [500, 600], [770, 690], [850, 910], [1120, 1010],
      [1240, 1210], [1630, 1370],
    ],
    7,
    28,
  ),
  makeRiver(
    [
      [-1580, -980], [-1440, -850], [-1520, -690], [-1390, -500],
      [-1500, -330], [-1370, -150], [-1550, 30], [-1460, 240],
      [-1660, 390], [-1600, 590], [-1850, 720], [-1880, 880],
      [-2080, 1010],
    ],
    6,
    22,
  ),
  makeRiver(
    [
      [1130, -1110], [1030, -950], [1170, -800], [1060, -650],
      [1250, -500], [1140, -300], [1320, -120], [1220, 80],
      [1450, 210], [1370, 390], [1610, 510], [1740, 470],
      [1900, 620], [2030, 580], [2180, 720],
    ],
    6,
    23,
  ),
  makeRiver(
    [
      [-320, 470], [-180, 560], [-250, 680], [-50, 760],
      [70, 850], [30, 980], [200, 1060], [250, 1190],
      [430, 1260], [560, 1390],
    ],
    5,
    16,
  ),
] as const;

const RIDGES: readonly RidgeDefinition[] = [
  {
    points: [
      [-2000, -980], [-1640, -1140], [-1270, -1240], [-900, -1290],
      [-520, -1240], [-120, -1110], [300, -980], [700, -990],
      [1080, -900], [1450, -720],
    ],
    width: 330,
    height: 205,
    passes: [
      [-1390, -1210],
      [-170, -1090],
      [1020, -910],
    ],
  },
  {
    points: [
      [860, -560], [1010, -320], [1080, -50], [1050, 240],
      [1130, 500], [1290, 760], [1510, 980],
    ],
    width: 275,
    height: 175,
    passes: [
      [1070, -40],
      [1220, 620],
    ],
  },
  {
    points: [
      [-1980, 880], [-1660, 650], [-1370, 560], [-1120, 650],
      [-900, 860], [-720, 1110],
    ],
    width: 300,
    height: 140,
    passes: [
      [-1510, 600],
      [-930, 820],
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
      return -28 - Math.min(82, Math.abs(landMask) * 82);
    }

    const coastFade = smoothstep(0, 0.16, landMask);

    let height =
      23 +
      Math.sin(x * 0.00165) * 7 +
      Math.sin(z * 0.00195) * 6 +
      Math.sin((x - z) * 0.00105) * 5;

    // Broad, smooth uplifts. No stacked hard height bands.
    height += this.plateauMaskAt(x, z) * 82;
    height += gaussianEllipse(x, z, 1350, 80, 900, 980) * 58;
    height += gaussianEllipse(x, z, 200, 1190, 1080, 590) * 42;
    height += gaussianEllipse(x, z, 1740, -590, 690, 580) * 48;

    for (const ridge of RIDGES) {
      height += ridgeContribution(x, z, ridge);

      for (const [passX, passZ] of ridge.passes) {
        height -=
          gaussianDistance(x, z, passX, passZ, ridge.width * 0.78) *
          ridge.height *
          0.52;
      }
    }

    // Large playable lowlands and basins keep mountains from dominating.
    height -= this.basinMaskAt(x, z) * 24;
    height -= gaussianEllipse(x, z, 900, 1050, 900, 520) * 18;
    height -= gaussianEllipse(x, z, -1650, 250, 700, 520) * 12;

    const riverDistance = this.distanceToRiver(x, z);
    height -= Math.exp(-Math.pow(riverDistance / 95, 2)) * 22;
    height -= Math.exp(-Math.pow(riverDistance / 250, 2)) * 10;

    // Gentle local relief only.
    height +=
      Math.sin(x * 0.0042 + z * 0.0011) * 3.2 +
      Math.sin(z * 0.0039 - x * 0.0015) * 2.6;

    return Math.max(4, Math.min(380, height * coastFade + 4));
  }

  public slopeAt(x: number, z: number): number {
    const step = 34;
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
    density += gaussianEllipse(x, z, -1650, -140, 760, 650) * 0.74;
    density += gaussianEllipse(x, z, -760, 760, 700, 500) * 0.68;
    density += gaussianEllipse(x, z, 650, -420, 650, 570) * 0.56;
    density += gaussianEllipse(x, z, 1640, 760, 620, 500) * 0.66;
    density += gaussianEllipse(x, z, 180, 1280, 660, 330) * 0.38;

    density +=
      Math.sin(x * 0.006 + z * 0.0025) * 0.055 +
      Math.sin(z * 0.0078 - x * 0.0017) * 0.045;

    const riverMoisture =
      Math.exp(-Math.pow(this.distanceToRiver(x, z) / 360, 2)) * 0.08;
    const elevationPenalty = smoothstep(165, 245, height) * 0.56;

    return clamp01(density + riverMoisture - elevationPenalty);
  }

  public terrainKindAt(x: number, z: number): TerrainKind {
    const landMask = this.landMaskAt(x, z);
    if (landMask <= 0) return "water";

    const height = this.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    const riverDistance = this.distanceToRiver(x, z);
    const forest = this.forestDensityAt(x, z);

    if (landMask < 0.12 && height < 34) return "coast";
    if (riverDistance < 175 && height < 95) return "river-valley";
    if (height > 220 || slope > 0.62) return "mountain";
    if (
      this.plateauMaskAt(x, z) > 0.45 &&
      height > 88 &&
      slope < 0.34
    ) {
      return "plateau";
    }
    if (this.basinMaskAt(x, z) > 0.46 && height < 58) return "basin";
    if (forest > 0.5) return "forest";
    if (height > 125) return "highland";
    if (height > 62 || slope > 0.22) return "rolling-hills";
    return "grassland";
  }

  private plateauMaskAt(x: number, z: number): number {
    return gaussianEllipse(x, z, -1120, -80, 980, 780);
  }

  private basinMaskAt(x: number, z: number): number {
    return Math.max(
      gaussianEllipse(x, z, 180, 220, 1080, 780),
      gaussianEllipse(x, z, -250, 860, 720, 500) * 0.75,
    );
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
    Math.exp(-Math.pow(distance / (ridge.width * 1.9), 2)) * 0.3;
  const foothill =
    Math.exp(-Math.pow(distance / (ridge.width * 3.1), 2)) * 0.12;

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

function gaussianEllipse(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
): number {
  const dx = (x - centerX) / radiusX;
  const dz = (z - centerZ) / radiusZ;
  return Math.exp(-(dx * dx + dz * dz) * 1.45);
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
    points: sampleCatmullRom(controls, 5),
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
