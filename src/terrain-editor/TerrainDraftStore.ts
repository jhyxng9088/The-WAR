import {
  decodeHeightmapBase64,
  encodeHeightmapBase64,
  quantizeHeightmap,
} from '../world/HeightmapCodec';

const TERRAIN_DRAFT_STORAGE_KEY = 'the-war:terrain-draft:v1';
const MAX_DIMENSION = 1025;

interface SerializedTerrainDraft {
  version: 1;
  width: number;
  height: number;
  encoding: 'u8-base64';
  data: string;
  updatedAt: number;
}

export interface TerrainDraft {
  width: number;
  height: number;
  bytes: Uint8Array;
  updatedAt: number;
}

export function readTerrainDraft(): TerrainDraft | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(TERRAIN_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SerializedTerrainDraft>;
    if (
      parsed.version !== 1
      || parsed.encoding !== 'u8-base64'
      || !Number.isInteger(parsed.width)
      || !Number.isInteger(parsed.height)
      || typeof parsed.data !== 'string'
    ) return null;

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

export function writeTerrainDraft(
  values: Float32Array | Uint8Array,
  width: number,
  height: number,
): TerrainDraft | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) return null;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || values.length !== width * height) return null;

  const bytes = values instanceof Uint8Array ? values.slice() : quantizeHeightmap(values);
  const updatedAt = Date.now();
  const payload: SerializedTerrainDraft = {
    version: 1,
    width,
    height,
    encoding: 'u8-base64',
    data: encodeHeightmapBase64(bytes),
    updatedAt,
  };

  try {
    window.localStorage.setItem(TERRAIN_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    return { width, height, bytes, updatedAt };
  } catch {
    return null;
  }
}

export function clearTerrainDraft(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.removeItem(TERRAIN_DRAFT_STORAGE_KEY);
}
