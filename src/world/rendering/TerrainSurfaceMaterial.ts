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

const TEXTURE_SIZE = 256;
let cachedSurfaceSet: TerrainSurfaceSet | null = null;

export function createTerrainSurfaceMaterial(
  options: TerrainSurfaceMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const surfaces = getTerrainSurfaceSet();
  const repeat = options.detailRepeat ?? 34;
  const grass = cloneTexture(surfaces.grass, repeat, true);
  const dirt = cloneTexture(surfaces.dirt, repeat, true);
  const rock = cloneTexture(surfaces.rock, repeat, true);
  const sand = cloneTexture(surfaces.sand, repeat, true);
  const detailNormal = cloneTexture(surfaces.detailNormal, repeat, false);

  const minHeight = options.minHeight ?? 1.0;
  const maxHeight = options.maxHeight ?? 8.0;
  const seaLevel = options.seaLevel ?? 0.0;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: grass,
    normalMap: detailNormal,
    normalScale: new THREE.Vector2(
      options.normalStrength ?? 0.44,
      options.normalStrength ?? 0.44,
    ),
    roughness: options.roughness ?? 0.88,
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
  float coast = 1.0 - smoothstep( terrainSeaLevel + 0.18, terrainSeaLevel + 1.15, vTerrainHeight );
  float rockWeight = smoothstep( 0.075, 0.34, slope );
  rockWeight *= mix( 0.72, 1.0, height01 );
  float sandWeight = coast * ( 1.0 - rockWeight );
  float dirtByHeight = smoothstep( 0.28, 0.76, height01 );
  float dirtBySlope = smoothstep( 0.035, 0.16, slope ) * 0.34;
  float dirtWeight = max( dirtByHeight * 0.64, dirtBySlope ) * ( 1.0 - rockWeight ) * ( 1.0 - sandWeight );
  float grassWeight = max( 0.0, 1.0 - rockWeight - sandWeight - dirtWeight );
  vec4 weights = vec4( grassWeight, dirtWeight, rockWeight, sandWeight );
  return weights / max( 0.0001, dot( weights, vec4( 1.0 ) ) );
}

vec3 sampleTerrainTriplanar( sampler2D tex, vec3 position, vec3 normal, float scale ) {
  vec3 blend = pow( abs( normalize( normal ) ), vec3( 5.0 ) );
  blend /= max( 0.0001, blend.x + blend.y + blend.z );
  vec3 xSample = texture2D( tex, position.zy * scale ).rgb;
  vec3 ySample = texture2D( tex, position.xz * scale ).rgb;
  vec3 zSample = texture2D( tex, position.xy * scale ).rgb;
  return xSample * blend.x + ySample * blend.y + zSample * blend.z;
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec2 terrainUv = vMapUv;
vec4 weights = terrainWeights();
vec3 grassColor = texture2D( terrainGrass, terrainUv ).rgb;
vec3 dirtColor = texture2D( terrainDirt, terrainUv * 0.92 ).rgb;
vec3 sandColor = texture2D( terrainSand, terrainUv * 0.84 ).rgb;
vec3 rockColor = sampleTerrainTriplanar(
  terrainRock,
  vTerrainLocalPosition,
  vTerrainLocalNormal,
  max( 0.08, terrainRepeat * 0.0056 )
);
vec3 terrainColor =
  grassColor * weights.x +
  dirtColor * weights.y +
  rockColor * weights.z +
  sandColor * weights.w;

float macro = 0.96 + 0.04 * sin( vTerrainLocalPosition.x * 0.055 + vTerrainLocalPosition.z * 0.041 );
diffuseColor.rgb *= terrainColor * macro;`,
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () =>
    `terrain-pbr-blend-v2:${repeat}:${minHeight}:${maxHeight}:${seaLevel}`;

  return material;
}

function cloneTexture(source: THREE.CanvasTexture, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const texture = source.clone();
  texture.image = source.image;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
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

type SurfaceKind = 'grass' | 'dirt' | 'rock' | 'sand';

function createAlbedoTexture(kind: SurfaceKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Terrain albedo canvas context is unavailable.');

  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const palette = surfacePalette(kind);

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const broad = periodicSignal(u, v, palette.phase);
      const middle = periodicSignal(u, v, palette.phase + 1.37);
      const fine = periodicSignal(u, v, palette.phase + 3.91);
      const structure = surfaceStructure(kind, u, v, broad, middle, fine);
      const blend = THREE.MathUtils.clamp(0.18 + broad * 0.48 + structure * 0.34, 0, 1);
      const shade = THREE.MathUtils.clamp(0.83 + middle * 0.13 + fine * 0.055, 0.72, 1.05);
      const r = THREE.MathUtils.lerp(palette.low[0], palette.high[0], blend) * shade;
      const g = THREE.MathUtils.lerp(palette.low[1], palette.high[1], blend) * shade;
      const b = THREE.MathUtils.lerp(palette.low[2], palette.high[2], blend) * shade;
      const pixel = (y * TEXTURE_SIZE + x) * 4;
      image.data[pixel] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
      image.data[pixel + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
      image.data[pixel + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
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
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const coarse = periodicSignal(u, v, 0.78);
      const fine = periodicSignal(u, v, 4.12);
      const grain = Math.abs(periodicSignal(u, v, 7.33) - 0.5) * 2;
      height[y * TEXTURE_SIZE + x] = coarse * 0.42 + fine * 0.36 + grain * 0.22;
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
      const normal = new THREE.Vector3(-(right - left) * 4.6, -(down - up) * 4.6, 1).normalize();
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
  phase: number;
} {
  if (kind === 'grass') return { low: [52, 73, 38], high: [118, 129, 74], phase: 0.31 };
  if (kind === 'dirt') return { low: [79, 57, 39], high: [142, 105, 67], phase: 1.63 };
  if (kind === 'rock') return { low: [74, 73, 69], high: [139, 135, 127], phase: 2.77 };
  return { low: [145, 124, 85], high: [205, 181, 126], phase: 4.09 };
}

function surfaceStructure(
  kind: SurfaceKind,
  u: number,
  v: number,
  broad: number,
  middle: number,
  fine: number,
): number {
  const tau = Math.PI * 2;
  if (kind === 'grass') {
    const fibers = 0.5 + 0.5 * Math.sin(tau * (u * 58 + v * 7 + broad * 1.8));
    return THREE.MathUtils.clamp(fibers * 0.44 + middle * 0.34 + fine * 0.22, 0, 1);
  }
  if (kind === 'dirt') {
    const pebbles = Math.pow(Math.abs(fine - 0.5) * 2, 2.3);
    return THREE.MathUtils.clamp(broad * 0.5 + middle * 0.3 + pebbles * 0.2, 0, 1);
  }
  if (kind === 'rock') {
    const strata = Math.abs(Math.sin(tau * (u * 4.2 - v * 3.3 + broad * 1.4)));
    const fracture = Math.pow(Math.abs(Math.sin(tau * (u * 13 + v * 9 + fine))), 5);
    return THREE.MathUtils.clamp(strata * 0.52 + middle * 0.32 - fracture * 0.18 + 0.16, 0, 1);
  }
  const ripple = 0.5 + 0.5 * Math.sin(tau * (u * 18 + v * 3.5 + middle * 0.65));
  return THREE.MathUtils.clamp(ripple * 0.55 + broad * 0.3 + fine * 0.15, 0, 1);
}

function periodicSignal(u: number, v: number, phase: number): number {
  const tau = Math.PI * 2;
  const value =
    Math.sin(tau * (u * 3 + v * 2) + phase) * 0.23
    + Math.cos(tau * (u * 5 - v * 4) - phase * 0.7) * 0.19
    + Math.sin(tau * (u * 9 + v * 7) + phase * 1.9) * 0.14
    + Math.cos(tau * (u * 13 - v * 11) + phase * 0.35) * 0.1
    + Math.sin(tau * (u * 21 + v * 17) - phase * 1.3) * 0.075;
  return THREE.MathUtils.clamp(0.5 + value, 0, 1);
}

function wrap(value: number): number {
  return (value + TEXTURE_SIZE) % TEXTURE_SIZE;
}
