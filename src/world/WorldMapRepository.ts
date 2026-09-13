import { supabase } from '../backend/SupabaseClient';
import {
  decodeHeightmapBase64,
  encodeHeightmapBase64,
  quantizeHeightmap,
} from './HeightmapCodec';
import {
  applyWorldHeightmapSource,
  resetWorldHeightmapToAuthored,
} from './WorldField';

interface CanonicalWorldMapRow {
  version: number | string;
  width: number;
  height: number;
  encoding: string;
  data: string;
  updated_at: string;
}

export interface CanonicalWorldMap {
  version: number;
  width: number;
  height: number;
  bytes: Uint8Array;
  updatedAt: string;
}

export interface WorldMapHydrationResult {
  source: 'supabase' | 'authored-fallback';
  version: number | null;
}

export async function hydrateCanonicalWorldMap(): Promise<WorldMapHydrationResult> {
  try {
    const map = await loadCanonicalWorldMap();
    if (!map) {
      resetWorldHeightmapToAuthored();
      return { source: 'authored-fallback', version: null };
    }

    applyWorldHeightmapSource(map.bytes, map.width, map.height);
    return { source: 'supabase', version: map.version };
  } catch (error) {
    console.warn('Canonical world map load failed; using authored fallback.', error);
    resetWorldHeightmapToAuthored();
    return { source: 'authored-fallback', version: null };
  }
}

export async function loadCanonicalWorldMap(): Promise<CanonicalWorldMap | null> {
  const { data, error } = await supabase
    .from('world_map_current')
    .select('version,width,height,encoding,data,updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(`Canonical world map read failed: ${error.message}`);
  if (!data) return null;

  const row = data as CanonicalWorldMapRow;
  if (row.encoding !== 'u8-base64') throw new Error(`Unsupported world map encoding: ${row.encoding}`);
  if (!Number.isInteger(row.width) || !Number.isInteger(row.height) || row.width < 2 || row.height < 2) {
    throw new Error(`Invalid canonical world map dimensions: ${row.width}x${row.height}`);
  }

  const version = parseWorldMapVersion(row.version);
  const bytes = decodeHeightmapBase64(row.data);
  if (bytes.length !== row.width * row.height) {
    throw new Error(`Canonical world map payload mismatch: ${bytes.length} samples.`);
  }

  return {
    version,
    width: row.width,
    height: row.height,
    bytes,
    updatedAt: row.updated_at,
  };
}

export async function publishCanonicalWorldMap(
  values: Float32Array | Uint8Array,
  width: number,
  height: number,
): Promise<{ version: number; updatedAt: string }> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error('Invalid world map dimensions.');
  }
  if (values.length !== width * height) throw new Error('World map sample count does not match dimensions.');

  const bytes = values instanceof Uint8Array ? values.slice() : quantizeHeightmap(values);
  const { data, error } = await supabase.rpc('publish_world_map', {
    p_width: width,
    p_height: height,
    p_data: encodeHeightmapBase64(bytes),
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.updated_at !== 'string') {
    throw new Error('Supabase returned an invalid publish response.');
  }

  const version = parseWorldMapVersion(row.version as unknown);
  applyWorldHeightmapSource(bytes, width, height);
  return { version, updatedAt: row.updated_at };
}

export async function isWorldMapEditor(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_world_map_editor');
  if (error) return false;
  return data === true;
}

function parseWorldMapVersion(value: unknown): number {
  const version = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`Invalid canonical world map version: ${String(value)}`);
  }
  return version;
}
