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

const WIDTH = 768;
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
    river[i] = Math.exp(-(riverDistance * riverDistance) / 10.5);
    land[i] = sample.biome === 'sea' || sample.height <= SEA_LEVEL ? 0 : 1;
  }
}

const rgba = new Uint8Array(PIXELS * 4);
const sun = normalize3(-0.46, 0.82, 0.34);

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

    const macro = fbm(x * 0.012 + 4.7, z * 0.012 - 7.9, 3);
    const regional = fbm(x * 0.032 - 9.1, z * 0.032 + 5.4, 3);
    const detail = fbm(x * 0.095 + 13.2, z * 0.095 - 2.8, 3);
    const grain = (deterministic01(x * 1.9, z * 1.9, 73) - 0.5) * 2;

    const dry = [142, 127, 73] as Vec3;
    const meadow = [92, 122, 64] as Vec3;
    const lush = [58, 103, 55] as Vec3;
    let color = mix3(dry, meadow, smooth(0.22, 0.66, wet));
    color = mix3(color, lush, smooth(0.57, 0.9, wet) * (0.34 + fertile * 0.42));
    color = mix3(color, [128, 105, 65], smooth(0.58, 0.92, 1 - wet) * (0.12 + (1 - fertile) * 0.26));

    const floodplain = basin * (1 - smooth(1.6, 3.1, elevation));
    color = mix3(color, [75, 112, 72], floodplain * (0.16 + fertile * 0.22));

    const forestSignal = woods + macro * 0.05 + regional * 0.07 - basin * 0.12;
    const forestMass = smooth(0.33, 0.69, forestSignal) * (1 - smooth(2.4, 4.35, elevation) * 0.78);
    const canopyNoise = clamp01(0.52 + fbm(x * 0.13 + 8.2, z * 0.13 - 3.4, 3) * 0.42 + detail * 0.12);
    const forestTone = mix3([42, 82, 43], [24, 61, 33], smooth(0.52, 0.9, woods));
    const canopyTone = mix3(forestTone, [18, 49, 28], smooth(0.62, 0.93, canopyNoise) * 0.34);
    color = mix3(color, canopyTone, forestMass * 0.86);

    const highland = smooth(1.15, 3.45, elevation);
    const steep = smooth(0.035, 0.21, slope);
    const mountainCore = smooth(0.18, 0.74, mount);
    const ridgeBroad = ridgedFbm(x * 0.035 + 3.1, z * 0.035 - 6.8, 3);
    const ridgeFine = ridgedFbm(x * 0.11 - 8.4, z * 0.11 + 4.2, 3);
    const fracture = clamp01(ridgeBroad * 0.5 + ridgeFine * 0.25 + Math.abs(detail) * 0.12 + steep * 0.32);
    const rockMask = clamp01(
      steep * 0.78 +
      mountainCore * smooth(0.95, 2.75, elevation) * (0.52 + ridgeBroad * 0.42) +
      rough * 0.12 +
      highland * 0.07,
    );
    let rock = mix3([118, 111, 98], [82, 84, 81], fracture);
    rock = mix3(rock, [51, 56, 55], smooth(0.7, 0.96, fracture) * (0.3 + steep * 0.32));
    color = mix3(color, rock, rockMask * 0.92);

    const coastMask = (coast[i] ?? 0) * (1 - smooth(0.12, 0.66, elevation));
    const rockyCoast = coastMask * smooth(0.09, 0.3, slope + rough * 0.2);
    color = mix3(color, mix3([169, 145, 91], [88, 104, 77], wet * 0.58), coastMask * (1 - rockyCoast) * 0.74);
    color = mix3(color, [58, 63, 59], rockyCoast * 0.66);

    const northness = smooth(48, 105, z);
    const snow = smooth(6.55, 7.65, elevation) * northness * smooth(0.61, 0.91, mount);
    color = mix3(color, [200, 203, 201], snow * (0.16 + ridgeFine * 0.18));

    if (fertile > 0.67 && elevation < 1.35 && woods < 0.42 && basin < 0.4) {
      const gx = Math.floor((x + WORLD_HALF_WIDTH) / 9.5);
      const gz = Math.floor((z + WORLD_HALF_DEPTH) / 8.5);
      const fieldChance = deterministic01(gx, gz, 19);
      const localX = fract((x + WORLD_HALF_WIDTH) / 9.5);
      const localZ = fract((z + WORLD_HALF_DEPTH) / 8.5);
      const edge = Math.min(localX, 1 - localX, localZ, 1 - localZ);
      const fieldMask = fieldChance > 0.58 ? smooth(0.06, 0.18, edge) * smooth(0.67, 0.88, fertile) * 0.11 : 0;
      color = mix3(color, [151, 132, 76], fieldMask);
    }

    const directional = Math.max(0, dot3(normal, sun));
    const light = 0.62 + directional * 0.46;
    const mountainShade = 1 - mountainCore * 0.045 - steep * 0.13;
    const forestShade = 1 - forestMass * 0.028;
    const texture = 1 + regional * 0.024 + detail * 0.018 + grain * (0.012 + rockMask * 0.012 + forestMass * 0.01);
    color = color.map((channel) => channel * light * mountainShade * forestShade * texture) as Vec3;

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

function fract(value: number): number {
  return value - Math.floor(value);
}

function fbm(x: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let normalizer = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise(x * frequency, z * frequency) * amplitude;
    normalizer += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return normalizer > 0 ? value / normalizer : 0;
}

function ridgedFbm(x: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.58;
  let frequency = 1;
  let normalizer = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise(x * frequency, z * frequency);
    value += (1 - Math.abs(n)) * amplitude;
    normalizer += amplitude;
    frequency *= 2.09;
    amplitude *= 0.48;
  }
  return normalizer > 0 ? value / normalizer : 0;
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

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byteValue of data) {
    c ^= byteValue;
    for (let bit = 0; bit < 8; bit += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
