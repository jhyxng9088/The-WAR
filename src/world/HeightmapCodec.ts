export function decodeHeightmapBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeHeightmapBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function quantizeHeightmap(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    bytes[i] = Math.round(clamp01(values[i] ?? 0) * 255);
  }
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
