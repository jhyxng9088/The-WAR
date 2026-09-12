import * as THREE from 'three';

interface TerrainSurfaceMaterialOptions {
  detailRepeat?: number;
  normalStrength?: number;
  roughness?: number;
  minHeight?: number;
  maxHeight?: number;
  seaLevel?: number;
}

interface TerrainSurfaceSet {
  grass: THREE.CanvasTexture;
  dirt: THREE.CanvasTexture;
  rock: THREE.CanvasTexture;
  sand: THREE.CanvasTexture;
  detailNormal: THREE.CanvasTexture;
}

type SurfaceKind = 'grass' | 'dirt' | 'rock' | 'sand';

const TEXTURE_SIZE = 256;
let cachedSurfaceSet: TerrainSurfaceSet | null = null;

export function createTerrainSurfaceMaterial(
  options: TerrainSurfaceMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const surfaces = getTerrainSurfaceSet();
  const repeat = options.detailRepeat ?? 24;
  const grass = cloneTexture(surfaces.grass, true);
  const dirt = cloneTexture(surfaces.dirt, true);
  const rock = cloneTexture(surfaces.rock, true);
  const sand = cloneTexture(surfaces.sand, true);
  const detailNormal = cloneTexture(surfaces.detailNormal, false);

  const minHeight = options.minHeight ?? 1.0;
  const maxHeight = options.maxHeight ?? 8.0;
  const seaLevel = options.seaLevel ?? 0.0;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: false,
    map: grass,
    normalMap: detailNormal,
    normalScale: new THREE.Vector2(
      options.normalStrength ?? 0.14,
      options.normalStrength ?? 0.14,
    ),
    roughness: options.roughness ?? 0.9,
    metalness: 0,
    dithering: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainGrass = { value: grass };
    shader.uniforms.terrainDirt = { value: dirt };
    shader.uniforms.terrainRock = { value: rock };
    shader.uniforms.terrainSand = { value: sand };
    shader.uniforms.terrainMinHeight = { value: minHeight };
    shader.uniforms.terrainMaxHeight = { value: maxHeight };
    shader.uniforms.terrainSeaLevel = { value: seaLevel };
    shader.uniforms.terrainRepeat = { value: repeat };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\nvarying float vTerrainHeight;\nvarying vec3 vTerrainLocalPosition;\nvarying vec3 vTerrainLocalNormal;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>\nvTerrainLocalNormal = normalize( objectNormal );`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\nvTerrainHeight = transformed.y;\nvTerrainLocalPosition = transformed;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D terrainGrass;
uniform sampler2D terrainDirt;
uniform sampler2D terrainRock;
uniform sampler2D terrainSand;
uniform float terrainMinHeight;
uniform float terrainMaxHeight;
uniform float terrainSeaLevel;
uniform float terrainRepeat;
varying float vTerrainHeight;
varying vec3 vTerrainLocalPosition;
varying vec3 vTerrainLocalNormal;

vec4 terrainWeights() {
  vec3 n = normalize( vTerrainLocalNormal );
  float slope = 1.0 - clamp( abs( n.y ), 0.0, 1.0 );
  float height01 = smoothstep( terrainMinHeight, terrainMaxHeight, vTerrainHeight );
  float coast = 1.0 - smoothstep( terrainSeaLevel + 0.12, terrainSeaLevel + 0.85, vTerrainHeight );

  float rockBySlope = smoothstep( 0.14, 0.52, slope );
  float rockByHeight = smoothstep( 0.76, 0.98, height01 ) * 0.28;
  float rockWeight = clamp( max( rockBySlope, rockByHeight ), 0.0, 1.0 );

  float sandWeight = coast * ( 1.0 - rockWeight ) * 0.82;
  float dirtByHeight = smoothstep( 0.42, 0.82, height01 ) * 0.42;
  float dirtBySlope = smoothstep( 0.08, 0.28, slope ) * 0.34;
  float dirtWeight = max( dirtByHeight, dirtBySlope ) * ( 1.0 - rockWeight ) * ( 1.0 - sandWeight );
  float grassWeight = max( 0.0, 1.0 - rockWeight - sandWeight - dirtWeight );

  vec4 weights = vec4( grassWeight, dirtWeight, rockWeight, sandWeight );
  return weights / max( 0.0001, dot( weights, vec4( 1.0 ) ) );
}

vec3 sampleTerrainTriplanar( sampler2D tex, vec3 position, vec3 normal, float scale ) {
  vec3 blend = pow( abs( normalize( normal ) ), vec3( 4.0 ) );
  blend /= max( 0.0001, blend.x + blend.y + blend.z );
  vec3 xSample = texture2D( tex, position.zy * scale ).rgb;
  vec3 ySample = texture2D( tex, position.xz * scale ).rgb;
  vec3 zSample = texture2D( tex, position.xy * scale ).rgb;
  return xSample * blend.x + ySample * blend.y + zSample * blend.z;
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec4 weights = terrainWeights();
float baseScale = max( 0.035, terrainRepeat * 0.0038 );
vec3 grassColor = sampleTerrainTriplanar( terrainGrass, vTerrainLocalPosition, vTerrainLocalNormal, baseScale );
vec3 dirtColor = sampleTerrainTriplanar( terrainDirt, vTerrainLocalPosition, vTerrainLocalNormal, baseScale * 0.82 );
vec3 rockColor = sampleTerrainTriplanar( terrainRock, vTerrainLocalPosition, vTerrainLocalNormal, baseScale * 0.58 );
vec3 sandColor = sampleTerrainTriplanar( terrainSand, vTerrainLocalPosition, vTerrainLocalNormal, baseScale * 0.72 );
vec3 terrainColor =
  grassColor * weights.x +
  dirtColor * weights.y +
  rockColor * weights.z +
  sandColor * weights.w;
diffuseColor.rgb *= terrainColor;`,
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () =>
    `terrain-pbr-blend-v3:${repeat}:${minHeight}:${maxHeight}:${seaLevel}`;

  return material;
}

function cloneTexture(source: THREE.CanvasTexture, srgb: boolean): THREE.CanvasTexture {
  const texture = source.clone();
  texture.image = source.image;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function getTerrainSurfaceSet(): TerrainSurfaceSet {
  if (cachedSurfaceSet) return cachedSurfaceSet;

  const grass = createAlbedoTexture('grass');
  const dirt = createAlbedoTexture('dirt');
  const rock = createAlbedoTexture('rock');
  const sand = createAlbedoTexture('sand');
  const detailNormal = createDetailNormalTexture();

  cachedSurfaceSet = { grass, dirt, rock, sand, detailNormal };
  return cachedSurfaceSet;
}

function createAlbedoTexture(kind: SurfaceKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Terrain albedo canvas context is unavailable.');

  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const palette = surfacePalette(kind);
  const seed = surfaceSeed(kind);

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const macro = fractalTileNoise(u, v, seed, 3, 0.55);
      const micro = fractalTileNoise(u, v, seed + 17, 5, 0.5);
      const blend = THREE.MathUtils.clamp(macro * 0.72 + micro * 0.28, 0, 1);
      const shade = 0.92 + (micro - 0.5) * 0.13;
      const pixel = (y * TEXTURE_SIZE + x) * 4;
      image.data[pixel] = channel(palette.low[0], palette.high[0], blend, shade);
      image.data[pixel + 1] = channel(palette.low[1], palette.high[1], blend, shade);
      image.data[pixel + 2] = channel(palette.low[2], palette.high[2], blend, shade);
      image.data[pixel + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDetailNormalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Terrain normal canvas context is unavailable.');

  const height = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      height[y * TEXTURE_SIZE + x] = fractalTileNoise(
        x / TEXTURE_SIZE,
        y / TEXTURE_SIZE,
        91,
        5,
        0.52,
      );
    }
  }

  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const index = y * TEXTURE_SIZE + x;
      const left = height[y * TEXTURE_SIZE + wrap(x - 1)] ?? 0.5;
      const right = height[y * TEXTURE_SIZE + wrap(x + 1)] ?? 0.5;
      const up = height[wrap(y - 1) * TEXTURE_SIZE + x] ?? 0.5;
      const down = height[wrap(y + 1) * TEXTURE_SIZE + x] ?? 0.5;
      const normal = new THREE.Vector3(-(right - left) * 1.25, -(down - up) * 1.25, 1).normalize();
      const pixel = index * 4;
      image.data[pixel] = Math.round((normal.x * 0.5 + 0.5) * 255);
      image.data[pixel + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      image.data[pixel + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      image.data[pixel + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function surfacePalette(kind: SurfaceKind): {
  low: readonly [number, number, number];
  high: readonly [number, number, number];
} {
  if (kind === 'grass') return { low: [74, 91, 55], high: [133, 145, 92] };
  if (kind === 'dirt') return { low: [104, 76, 52], high: [158, 124, 84] };
  if (kind === 'rock') return { low: [95, 95, 90], high: [154, 151, 142] };
  return { low: [161, 142, 105], high: [214, 193, 150] };
}

function surfaceSeed(kind: SurfaceKind): number {
  if (kind === 'grass') return 11;
  if (kind === 'dirt') return 37;
  if (kind === 'rock') return 59;
  return 83;
}

function channel(low: number, high: number, blend: number, shade: number): number {
  return Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(low, high, blend) * shade, 0, 255));
}

function fractalTileNoise(
  u: number,
  v: number,
  seed: number,
  octaves: number,
  persistence: number,
): number {
  let amplitude = 1;
  let total = 0;
  let weight = 0;
  let cells = 4;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += tileValueNoise(u, v, cells, seed + octave * 19) * amplitude;
    weight += amplitude;
    amplitude *= persistence;
    cells *= 2;
  }
  return weight > 0 ? total / weight : 0.5;
}

function tileValueNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothFraction(x - x0);
  const ty = smoothFraction(y - y0);
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const ax = ((x0 % cells) + cells) % cells;
  const ay = ((y0 % cells) + cells) % cells;

  const a = hash2(ax, ay, seed);
  const b = hash2(x1, ay, seed);
  const c = hash2(ax, y1, seed);
  const d = hash2(x1, y1, seed);
  const top = THREE.MathUtils.lerp(a, b, tx);
  const bottom = THREE.MathUtils.lerp(c, d, tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

function hash2(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function smoothFraction(value: number): number {
  return value * value * (3 - 2 * value);
}

function wrap(value: number): number {
  return (value + TEXTURE_SIZE) % TEXTURE_SIZE;
}
