import type { XZ } from '../world/WorldField';

export const TERRITORY_HEX_SIZE = 15;

export const AXIAL_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

export interface AxialCoord {
  readonly q: number;
  readonly r: number;
}

export function axialKey(q: number, r: number): string {
  return `${q}:${r}`;
}

export function axialToWorld(q: number, r: number): XZ {
  return [
    TERRITORY_HEX_SIZE * Math.sqrt(3) * (q + r * 0.5),
    TERRITORY_HEX_SIZE * 1.5 * r,
  ];
}

export function worldToAxial(x: number, z: number): AxialCoord {
  const q = (Math.sqrt(3) / 3 * x - z / 3) / TERRITORY_HEX_SIZE;
  const r = (2 / 3 * z) / TERRITORY_HEX_SIZE;
  return roundAxial(q, r);
}

export function hexCorners(x: number, z: number, radius = TERRITORY_HEX_SIZE): readonly XZ[] {
  const corners: XZ[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    corners.push([
      x + Math.cos(angle) * radius,
      z + Math.sin(angle) * radius,
    ]);
  }
  return corners;
}

export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const ax = a.q;
  const az = a.r;
  const ay = -ax - az;
  const bx = b.q;
  const bz = b.r;
  const by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

function roundAxial(q: number, r: number): AxialCoord {
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}
