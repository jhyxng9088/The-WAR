import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import {
  SEA_LEVEL,
  WORLD_DEPTH,
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  WORLD_WIDTH,
  deterministic01,
  forestDensityAt,
  mountainStrengthAt,
  riverDistanceAt,
  terrainSampleAt,
} from '../src/world/WorldField.ts';

const WIDTH = 896;
const HEIGHT = Math.round(WIDTH * WORLD_DEPTH / WORLD_WIDTH);
const PIXELS = WIDTH * HEIGHT;
const DX = WORLD_WIDTH / (WIDTH - 1);
const DZ = WORLD_DEPTH / (HEIGHT - 1);

const height = new Float32Array(PIXELS);
const moisture = new Float32Array(PIXELS);
const fertility = new Float32Array(PIXELS);
const roughness = new Float32Array(PIXELS);
const coast = new Float32Array(PIXELS);
const mountain = new Float32Array(PIXELS);
const forest = new Float32Array(PIXELS);
const river = new Float32Array(PIXELS);
const land = new Uint8Array(PIXELS);

const started = performance.now();

for (let py = 0; py < HEIGHT; py += 1) {
  const z = WORLD_HALF_DEPTH - py * DZ;
  for (let px = 0; px < WIDTH; px += 1) {
    const x = -WORLD_HALF_WIDTH + px * DX;
    const i = py * WIDTH + px;
    const sample = terrainSampleAt(x, z);
    height[i] = sample.height;
    moisture[i] = sample.moisture;
    fertility[i] = sample.fertility;
    roughness[i] = sample.roughness;
    coast[i] = sample.coastInfluence;
    mountain[i] = mountainStrengthAt(x, z);
    forest[i] = forestDensityAt(x, z);
    const riverDistance = riverDistanceAt(x, z);
    river[i] = Math.exp(-(riverDistance * riverDistance) / 13.5);
    land[i] = sample.biome === 'sea' || sample.height <= SEA_LEVEL ? 0 : 1;
  }
}

const rgba = new Uint8Array(PIXELS * 4);
const sun = normalize3(-0.48, 0.82, 0.3);

for (let py = 0; py < HEIGHT; py += 1) {
  const z = WORLD_HALF_DEPTH - py * DZ;
  for (let px = 0; px < WIDTH; px += 1) {
    const i = py * WIDTH + px;
    const o = i * 4;
    if (!land[i]) {
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = 0;
      continue;
    }

    const x = -WORLD_HALF_WIDTH + px * DX;
    const hL = height[py * WIDTH + Math.max(0, px - 1)] ?? height[i] ?? 0;
    const hR = height[py * WIDTH + Math.min(WIDTH - 1, px + 1)] ?? height[i] ?? 0;
    const hU = height[Math.max(0, py - 1) * WIDTH + px] ?? height[i] ?? 0;
    const hD = height[Math.min(HEIGHT - 1, py + 1) * WIDTH + px] ?? height[i] ?? 0;
    const dhdx = (hR - hL) / (2 * DX);
    const dhdz = (hU - hD) / (2 * DZ);
    const normal = normalize3(-dhdx, 1, -dhdz);
    const slope = clamp01(1 - normal[1]);
    const elevation = height[i] ?? 0;
    const wet = moisture[i] ?? 0;
    const fertile = fertility[i] ?? 0;
    const rough = roughness[i] ?? 0;
    const mount = mountain[i] ?? 0;
    const woods = forest[i] ?? 0;
    const basin = river[i] ?? 0;

    const macro = valueNoise(x * 0.026 + 7.4, z * 0.026 - 4.2);
    const meso = valueNoise(x * 0.081 - 5.1, z * 0.081 + 8.8);
    const fine = valueNoise(x * 0.31 + 11.7, z * 0.31 + 2.2);
    const grain = (deterministic01(x * 3.1, z * 3.1, 73) - 0.5) * 2;

    let color = mix3([139, 126, 69], [88, 119, 59], smooth(0.22, 0.66, wet));
    color = mix3(color, [49, 94, 48], smooth(0.57, 0.9, wet) * (0.42 + fertile * 0.45));
    color = mix3(color, [124, 102, 61], smooth(0.56, 0.91, 1 - wet) * (0.15 + (1 - fertile) * 0.3));

    const floodplain = basin * (1 - smooth(1.5, 3.2, elevation));
    color = mix3(color, [69, 109, 68], floodplain * (0.25 + fertile * 0.34));

    const forestSignal = woods + macro * 0.08 + meso * 0.11;
    const forestMass = smooth(0.27, 0.63, forestSignal) * (1 - smooth(2.25, 4.35, elevation) * 0.7);
    const canopy = 0.5 + 0.5 * Math.sin(x * 2.7 + fine * 4.2) * Math.sin(z * 2.45 - macro * 3.1);
    const forestTone = mix3([35, 75, 39], [19, 55, 30], smooth(0.53, 0.9, woods));
    forestTone[0] += (canopy - 0.5) * 8;
    forestTone[1] += (canopy - 0.5) * 13;
    forestTone[2] += (canopy - 0.5) * 7;
    color = mix3(color, forestTone, forestMass * 0.91);

    const highland = smooth(1.1, 3.35, elevation);
    const steep = smooth(0.035, 0.22, slope);
    const mountainCore = smooth(0.17, 0.73, mount);
    const fracture = clamp01(Math.abs(Math.sin(x * 0.72 + z * 0.21 + fine * 3.8)) * 0.58 + Math.abs(meso) * 0.3 + steep * 0.35);
    const rockMask = clamp01(steep * 0.85 + mountainCore * smooth(0.9, 2.7, elevation) * (0.56 + fracture * 0.42) + rough * 0.14 + highland * 0.08);
    let rock = mix3([112, 105, 91], [76, 78, 76], fracture);
    rock = mix3(rock, [48, 53, 52], smooth(0.7, 0.98, fracture) * (0.42 + steep * 0.35));
    color = mix3(color, rock, rockMask * 0.95);

    const coastMask = (coast[i] ?? 0) * (1 - smooth(0.1, 0.62, elevation));
    const rockyCoast = coastMask * smooth(0.08, 0.3, slope + rough * 0.22);
    color = mix3(color, mix3([167, 142, 86], [81, 101, 72], wet * 0.62), coastMask * (1 - rockyCoast) * 0.82);
    color = mix3(color, [54, 59, 56], rockyCoast * 0.78);

    const northness = smooth(42, 100, z);
    const snow = smooth(6.4, 7.55, elevation) * northness * smooth(0.58, 0.9, mount);
    color = mix3(color, [194, 199, 198], snow * (0.22 + fracture * 0.2));

    if (fertile > 0.64 && elevation < 1.3 && woods < 0.48 && basin < 0.55) {
      const fieldBand = Math.abs(Math.sin(x * 0.46 + Math.floor(z / 7) * 0.9));
      const fieldMask = smooth(0.82, 0.98, fieldBand) * smooth(0.64, 0.87, fertile) * 0.12;
      color = mix3(color, [150, 132, 73], fieldMask);
    }

    const light = 0.54 + Math.max(0, dot3(normal, sun)) * 0.58;
    const occlusion = 1 - steep * 0.16 - mountainCore * 0.06 - forestMass * 0.035;
    const texture = 1 + meso * 0.035 + fine * 0.025 + grain * (0.018 + rockMask * 0.025 + forestMass * 0.018);
    color = color.map((channel) => channel * light * occlusion * texture) as Vec3;

    rgba[o] = byte(color[0]);
    rgba[o + 1] = byte(color[1]);
    rgba[o + 2] = byte(color[2]);
    rgba[o + 3] = 255;
  }
}

mkdirSync('public', { recursive: true });
const png = encodePng(WIDTH, HEIGHT, rgba);
writeFileSync('public/terrain-baked.png', png);
console.log(`terrain baker: ${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(1)} KiB, ${(performance.now() - started).toFixed(0)} ms`);

type Vec3 = [number, number, number];

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function normalize3(x: number, y: number, z: number): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(min: number, max: number, value: number): number {
  const t = clamp01((value - min) / Math.max(0.000001, max - min));
  return t * t * (3 - 2 * t);
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(0, 1, x - x0);
  const tz = smooth(0, 1, z - z0);
  const a = hash(x0, z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return (ab + (cd - ab) * tz) * 2 - 1;
}

function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function encodePng(width: number, height: number, pixels: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, row + 1);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byteValue of data) c = (CRC_TABLE[(c ^ byteValue) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
