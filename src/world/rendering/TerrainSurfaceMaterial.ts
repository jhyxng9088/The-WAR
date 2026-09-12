import * as THREE from 'three';

interface TerrainSurfaceMaterialOptions {
  detailRepeat?: number;
  normalStrength?: number;
  roughness?: number;
}

interface TerrainDetailMaps {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
}

const TEXTURE_SIZE = 256;
let cachedMaps: TerrainDetailMaps | null = null;

export function createTerrainSurfaceMaterial(
  options: TerrainSurfaceMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const source = getTerrainDetailMaps();
  const albedo = cloneDetailTexture(source.albedo, options.detailRepeat ?? 24);
  const normal = cloneDetailTexture(source.normal, options.detailRepeat ?? 24);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(
      options.normalStrength ?? 0.42,
      options.normalStrength ?? 0.42,
    ),
    roughness: options.roughness ?? 0.9,
    metalness: 0,
    dithering: true,
  });

  return material;
}

function cloneDetailTexture(source: THREE.CanvasTexture, repeat: number): THREE.CanvasTexture {
  const texture = source.clone();
  texture.image = source.image;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function getTerrainDetailMaps(): TerrainDetailMaps {
  if (cachedMaps) return cachedMaps;

  const heightField = buildPeriodicSurfaceHeight();
  const albedoCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  albedoCanvas.width = TEXTURE_SIZE;
  albedoCanvas.height = TEXTURE_SIZE;
  normalCanvas.width = TEXTURE_SIZE;
  normalCanvas.height = TEXTURE_SIZE;

  const albedoContext = albedoCanvas.getContext('2d');
  const normalContext = normalCanvas.getContext('2d');
  if (!albedoContext || !normalContext) {
    throw new Error('Terrain detail canvas context is unavailable.');
  }

  const albedoImage = albedoContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const normalImage = normalContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const index = y * TEXTURE_SIZE + x;
      const pixel = index * 4;
      const height = heightField[index] ?? 0.5;
      const coarse = periodicSignal(x / TEXTURE_SIZE, y / TEXTURE_SIZE, 0.55);
      const grain = periodicSignal(x / TEXTURE_SIZE, y / TEXTURE_SIZE, 2.1);
      const shade = THREE.MathUtils.clamp(
        0.79 + height * 0.2 + coarse * 0.035 + grain * 0.018,
        0.72,
        1,
      );

      albedoImage.data[pixel] = Math.round(255 * shade * 0.99);
      albedoImage.data[pixel + 1] = Math.round(255 * shade);
      albedoImage.data[pixel + 2] = Math.round(255 * shade * 0.96);
      albedoImage.data[pixel + 3] = 255;

      const left = heightField[y * TEXTURE_SIZE + wrap(x - 1)] ?? height;
      const right = heightField[y * TEXTURE_SIZE + wrap(x + 1)] ?? height;
      const up = heightField[wrap(y - 1) * TEXTURE_SIZE + x] ?? height;
      const down = heightField[wrap(y + 1) * TEXTURE_SIZE + x] ?? height;
      const dx = (right - left) * 3.4;
      const dy = (down - up) * 3.4;
      const normal = new THREE.Vector3(-dx, -dy, 1).normalize();

      normalImage.data[pixel] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 3] = 255;
    }
  }

  albedoContext.putImageData(albedoImage, 0, 0);
  normalContext.putImageData(normalImage, 0, 0);

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.generateMipmaps = true;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.magFilter = THREE.LinearFilter;

  const normal = new THREE.CanvasTexture(normalCanvas);
  normal.colorSpace = THREE.NoColorSpace;
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.generateMipmaps = true;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.magFilter = THREE.LinearFilter;

  cachedMaps = { albedo, normal };
  return cachedMaps;
}

function buildPeriodicSurfaceHeight(): Float32Array {
  const values = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const macro = periodicSignal(u, v, 0.2);
      const middle = periodicSignal(u, v, 1.25);
      const fine = periodicSignal(u, v, 3.4);
      const pebbles = Math.abs(periodicSignal(u, v, 6.2) - 0.5) * 2;
      values[y * TEXTURE_SIZE + x] = THREE.MathUtils.clamp(
        0.2 + macro * 0.28 + middle * 0.27 + fine * 0.17 + pebbles * 0.08,
        0,
        1,
      );
    }
  }
  return values;
}

function periodicSignal(u: number, v: number, phase: number): number {
  const tau = Math.PI * 2;
  const value =
    Math.sin(tau * (u * 3 + v * 2) + phase) * 0.24
    + Math.cos(tau * (u * 5 - v * 4) - phase * 0.7) * 0.2
    + Math.sin(tau * (u * 9 + v * 7) + phase * 1.9) * 0.15
    + Math.cos(tau * (u * 13 - v * 11) + phase * 0.35) * 0.11
    + Math.sin(tau * (u * 21 + v * 17) - phase * 1.3) * 0.08;
  return THREE.MathUtils.clamp(0.5 + value, 0, 1);
}

function wrap(value: number): number {
  return (value + TEXTURE_SIZE) % TEXTURE_SIZE;
}
