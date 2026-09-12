export const WORLD_HEIGHTMAP_STORAGE_KEY = 'the-war:world-heightmap:v1';
export const WORLD_HEIGHTMAP_LOCAL_EVENT = 'the-war:world-heightmap-updated';

export interface StoredWorldHeightmap {
  width: number;
  height: number;
  bytes: Uint8Array;
  updatedAt: number;
}

interface SerializedWorldHeightmap {
  version: 1;
  width: number;
  height: number;
  encoding: 'u8-base64';
  data: string;
  updatedAt: number;
}

const MAX_DIMENSION = 1025;

export function readWorldHeightmapOverride(): StoredWorldHeightmap | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(WORLD_HEIGHTMAP_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SerializedWorldHeightmap>;
    if (
      parsed.version !== 1
      || parsed.encoding !== 'u8-base64'
      || !Number.isInteger(parsed.width)
      || !Number.isInteger(parsed.height)
      || typeof parsed.data !== 'string'
    ) {
      return null;
    }

    const width = parsed.width as number;
    const height = parsed.height as number;
    if (width < 2 || height < 2 || width > MAX_DIMENSION || height > MAX_DIMENSION) return null;

    const bytes = decodeHeightmapBase64(parsed.data);
    if (bytes.length !== width * height) return null;

    return {
      width,
      height,
      bytes,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeWorldHeightmapOverride(
  values: Float32Array | Uint8Array,
  width: number,
  height: number,
): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) return false;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || values.length !== width * height) return false;

  const bytes = values instanceof Uint8Array ? values.slice() : quantizeHeightmap(values);
  const payload: SerializedWorldHeightmap = {
    version: 1,
    width,
    height,
    encoding: 'u8-base64',
    data: encodeHeightmapBase64(bytes),
    updatedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(WORLD_HEIGHTMAP_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(WORLD_HEIGHTMAP_LOCAL_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearWorldHeightmapOverride(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return false;

  try {
    window.localStorage.removeItem(WORLD_HEIGHTMAP_STORAGE_KEY);
    window.dispatchEvent(new Event(WORLD_HEIGHTMAP_LOCAL_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function decodeHeightmapBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function sampleHeightmapBytesBilinear(
  values: Uint8Array,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  const x = clamp01(u) * (width - 1);
  const y = clamp01(v) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = values[y0 * width + x0] ?? 0;
  const b = values[y0 * width + x1] ?? 0;
  const c = values[y1 * width + x0] ?? 0;
  const d = values[y1 * width + x1] ?? 0;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function quantizeHeightmap(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    bytes[i] = Math.round(clamp01(values[i] ?? 0) * 255);
  }
  return bytes;
}

function encodeHeightmapBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
