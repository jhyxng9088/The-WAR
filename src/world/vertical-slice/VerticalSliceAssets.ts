import * as THREE from 'three';
import rawSliceData from '../../assets/vertical-slice/slice-data.json';
import {
  AUTHORED_HEIGHT_U8,
  AUTHORED_MATERIAL_RLE,
} from '../../assets/vertical-slice/AuthoredSliceSurface';

type TreePlacement = readonly [x: number, z: number, variant: number, scale: number, rotation: number];
type Point2 = readonly [x: number, z: number];

interface SliceData {
  width: number;
  height: number;
  worldWidth: number;
  worldDepth: number;
  maxHeight: number;
  trees: TreePlacement[];
  river: Point2[];
  city: Point2;
  border: Point2[];
}

const data = rawSliceData as unknown as SliceData;
const expectedSamples = data.width * data.height;
const heightBytes = decodeBase64(AUTHORED_HEIGHT_U8);
const materialIds = decodeMaterialRle(AUTHORED_MATERIAL_RLE, expectedSamples);

if (heightBytes.length !== expectedSamples) {
  throw new Error(
    `Authored slice height is incomplete: expected ${expectedSamples} samples, got ${heightBytes.length}.`,
  );
}

export const SLICE_WIDTH = data.worldWidth;
export const SLICE_DEPTH = data.worldDepth;
export const SLICE_HALF_WIDTH = SLICE_WIDTH / 2;
export const SLICE_HALF_DEPTH = SLICE_DEPTH / 2;
export const SLICE_GRID_WIDTH = data.width;
export const SLICE_GRID_HEIGHT = data.height;
export const SLICE_TREES = data.trees;
export const SLICE_RIVER = data.river;
export const SLICE_CITY = data.city;
export const SLICE_BORDER = data.border;

export function verticalSliceAssetUrl(name: string): string {
  return new URL(`assets/vertical-slice/${name}`, document.baseURI).toString();
}

export function heightAt(x: number, z: number): number {
  const u = THREE.MathUtils.clamp((x + SLICE_HALF_WIDTH) / SLICE_WIDTH, 0, 1) * (SLICE_GRID_WIDTH - 1);
  const v = THREE.MathUtils.clamp((SLICE_HALF_DEPTH - z) / SLICE_DEPTH, 0, 1) * (SLICE_GRID_HEIGHT - 1);
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(SLICE_GRID_WIDTH - 1, x0 + 1);
  const y1 = Math.min(SLICE_GRID_HEIGHT - 1, y0 + 1);
  const tx = u - x0;
  const ty = v - y0;
  const a = heightSample(x0, y0);
  const b = heightSample(x1, y0);
  const c = heightSample(x0, y1);
  const d = heightSample(x1, y1);
  const top = THREE.MathUtils.lerp(a, b, tx);
  const bottom = THREE.MathUtils.lerp(c, d, tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

export function createSplatTexture(): THREE.DataTexture {
  const rgba = new Uint8Array(SLICE_GRID_WIDTH * SLICE_GRID_HEIGHT * 4);

  for (let sample = 0, target = 0; sample < materialIds.length; sample += 1, target += 4) {
    const materialId = materialIds[sample] ?? 0;
    // 0 grass, 1 rock, 2 soil, 3 sand. Grass is inferred in the terrain shader.
    rgba[target] = materialId === 1 ? 255 : 0;
    rgba[target + 1] = materialId === 2 ? 255 : 0;
    rgba[target + 2] = materialId === 3 ? 255 : 0;
    rgba[target + 3] = 255;
  }

  const texture = new THREE.DataTexture(rgba, SLICE_GRID_WIDTH, SLICE_GRID_HEIGHT, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function heightSample(x: number, y: number): number {
  const value = heightBytes[y * SLICE_GRID_WIDTH + x] ?? 0;
  return (value / 255) * data.maxHeight;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeMaterialRle(value: string, expectedSamples: number): Uint8Array {
  const output = new Uint8Array(expectedSamples);
  let offset = 0;

  for (const run of value.split(',')) {
    const [countText, materialText] = run.split(':');
    const count = Number.parseInt(countText ?? '', 10);
    const materialId = Number.parseInt(materialText ?? '', 10);
    if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(materialId) || materialId < 0 || materialId > 3) {
      throw new Error(`Invalid authored material run: ${run}`);
    }
    if (offset + count > expectedSamples) {
      throw new Error(`Authored material mask exceeds ${expectedSamples} samples.`);
    }
    output.fill(materialId, offset, offset + count);
    offset += count;
  }

  if (offset !== expectedSamples) {
    throw new Error(`Authored material mask is incomplete: expected ${expectedSamples} samples, got ${offset}.`);
  }

  return output;
}
