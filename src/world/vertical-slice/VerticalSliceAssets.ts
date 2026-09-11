import * as THREE from 'three';
import rawSliceData from '../../assets/vertical-slice/slice-data.json';

type TreePlacement = readonly [x: number, z: number, variant: number, scale: number, rotation: number];
type Point2 = readonly [x: number, z: number];

interface SliceData {
  width: number;
  height: number;
  worldWidth: number;
  worldDepth: number;
  maxHeight: number;
  heightU8: string;
  splatRGB: string;
  trees: TreePlacement[];
  river: Point2[];
  city: Point2;
  border: Point2[];
}

const data = rawSliceData as SliceData;
const heightBytes = decodeBase64(data.heightU8);
const splatBytes = decodeBase64(data.splatRGB);

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
  return `${import.meta.env.BASE_URL}assets/vertical-slice/${name}`;
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
  for (let i = 0, source = 0; i < rgba.length; i += 4, source += 3) {
    rgba[i] = splatBytes[source] ?? 0;
    rgba[i + 1] = splatBytes[source + 1] ?? 0;
    rgba[i + 2] = splatBytes[source + 2] ?? 0;
    rgba[i + 3] = 255;
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
