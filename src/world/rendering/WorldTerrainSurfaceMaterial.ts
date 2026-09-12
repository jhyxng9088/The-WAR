import * as THREE from 'three';
import { SEA_LEVEL, WORLD_DEPTH, WORLD_WIDTH } from '../WorldField';
import { getTerrainBlendControlMaps } from './TerrainBlendControlMap';

interface WorldTerrainSurfaceMaterialOptions {
  detailRepeat?: number;
  roughness?: number;
  seaLevel?: number;
  controlMapSize?: number;
  anisotropy?: number;
}

interface TerrainTextureSet {
  grass: THREE.Texture;
  dirt: THREE.Texture;
  rock: THREE.Texture;
  sand: THREE.Texture;
  snow: THREE.Texture;
}

const TERRAIN_TEXTURE_URLS = {
  // Poly Haven CC0 1K diffuse textures. Kept remote for this pass so the production bundle
  // gains real photographic surface detail without committing large binary assets.
  grass:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sparse_grass/sparse_grass_diff_1k.jpg',
  dirt: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirt/dirt_diff_1k.jpg',
  rock:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_ground_02/rock_ground_02_diff_1k.jpg',
  sand: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sand_03/sand_03_diff_1k.jpg',
  snow: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_02/snow_02_diff_1k.jpg',
} as const;

let cachedTextures: TerrainTextureSet | null = null;

export function createWorldTerrainSurfaceMaterial(
  options: WorldTerrainSurfaceMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const repeat = options.detailRepeat ?? 38;
  const seaLevel = options.seaLevel ?? SEA_LEVEL;
  const controls = getTerrainBlendControlMaps(options.controlMapSize ?? 256);
  const textures = getTerrainTextures(options.anisotropy ?? 4);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: false,
    roughness: options.roughness ?? 0.86,
    metalness: 0,
    dithering: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainGrass = { value: textures.grass };
    shader.uniforms.terrainDirt = { value: textures.dirt };
    shader.uniforms.terrainRock = { value: textures.rock };
    shader.uniforms.terrainSand = { value: textures.sand };
    shader.uniforms.terrainSnow = { value: textures.snow };
    shader.uniforms.terrainRegionalControl = { value: controls.regional };
    shader.uniforms.terrainFeatureControl = { value: controls.features };
    shader.uniforms.terrainWorldWidth = { value: WORLD_WIDTH };
    shader.uniforms.terrainWorldDepth = { value: WORLD_DEPTH };
    shader.uniforms.terrainRepeat = { value: repeat };
    shader.uniforms.terrainSeaLevel = { value: seaLevel };
    shader.uniforms.terrainRiverDistanceMax = { value: controls.riverDistanceMax };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vTerrainLocalPosition;
varying vec3 vTerrainLocalNormal;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
vTerrainLocalNormal = normalize( objectNormal );`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vTerrainLocalPosition = transformed;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D terrainGrass;
uniform sampler2D terrainDirt;
uniform sampler2D terrainRock;
uniform sampler2D terrainSand;
uniform sampler2D terrainSnow;
uniform sampler2D terrainRegionalControl;
uniform sampler2D terrainFeatureControl;
uniform float terrainWorldWidth;
uniform float terrainWorldDepth;
uniform float terrainRepeat;
uniform float terrainSeaLevel;
uniform float terrainRiverDistanceMax;
varying vec3 vTerrainLocalPosition;
varying vec3 vTerrainLocalNormal;

float terrainBroadRegion( vec2 positionXZ, vec2 center, vec2 radius ) {
  vec2 n = ( positionXZ - center ) / radius;
  return exp( -dot( n, n ) * 2.15 );
}

void terrainFadeWeights( inout vec4 primary, inout float snowWeight, float amount ) {
  float keep = 1.0 - clamp( amount, 0.0, 1.0 );
  primary *= keep;
  snowWeight *= keep;
}

void terrainBlendGrass( inout vec4 primary, inout float snowWeight, float amount ) {
  float t = clamp( amount, 0.0, 1.0 );
  terrainFadeWeights( primary, snowWeight, t );
  primary.x += t;
}

void terrainBlendDirt( inout vec4 primary, inout float snowWeight, float amount ) {
  float t = clamp( amount, 0.0, 1.0 );
  terrainFadeWeights( primary, snowWeight, t );
  primary.y += t;
}

void terrainBlendRock( inout vec4 primary, inout float snowWeight, float amount ) {
  float t = clamp( amount, 0.0, 1.0 );
  terrainFadeWeights( primary, snowWeight, t );
  primary.z += t;
}

void terrainBlendSand( inout vec4 primary, inout float snowWeight, float amount ) {
  float t = clamp( amount, 0.0, 1.0 );
  terrainFadeWeights( primary, snowWeight, t );
  primary.w += t;
}

void terrainBlendSnow( inout vec4 primary, inout float snowWeight, float amount ) {
  float t = clamp( amount, 0.0, 1.0 );
  terrainFadeWeights( primary, snowWeight, t );
  snowWeight += t;
}

vec2 terrainControlUv() {
  return clamp(
    vec2(
      vTerrainLocalPosition.x / terrainWorldWidth + 0.5,
      vTerrainLocalPosition.z / terrainWorldDepth + 0.5
    ),
    vec2( 0.0 ),
    vec2( 1.0 )
  );
}

void terrainSurfaceWeights( out vec4 primary, out float snowWeight, out float fertileFactor, out float wetShoreFactor ) {
  vec2 worldXZ = vTerrainLocalPosition.xz;
  vec4 regional = texture2D( terrainRegionalControl, terrainControlUv() );
  vec4 features = texture2D( terrainFeatureControl, terrainControlUv() );

  float moisture = regional.r;
  float fertility = regional.g;
  float roughnessValue = regional.b;
  float coastInfluence = regional.a;
  float mountain = features.r;
  float riverDistance = features.g * terrainRiverDistanceMax;
  float landMask = features.b;
  float height = vTerrainLocalPosition.y;

  vec3 terrainNormal = normalize( vTerrainLocalNormal );
  float slope = 1.0 - clamp( abs( terrainNormal.y ), 0.0, 1.0 );
  float lowland = 1.0 - smoothstep( 1.9, 4.35, height );
  float highland = smoothstep( 3.25, 7.6, height );
  float summit = smoothstep( 7.35, 10.9, height );
  float steep = smoothstep( 0.045, 0.28, slope );
  float floodplain = exp( -( riverDistance * riverDistance ) / 20.5 ) * lowland;
  float riverShelf = exp( -( riverDistance * riverDistance ) / 7.2 ) * lowland;

  float northWet = terrainBroadRegion( worldXZ, vec2( -35.0, 92.0 ), vec2( 188.0, 126.0 ) );
  float westTemperate = terrainBroadRegion( worldXZ, vec2( -118.0, 15.0 ), vec2( 208.0, 156.0 ) );
  float southDry = terrainBroadRegion( worldXZ, vec2( 76.0, -102.0 ), vec2( 184.0, 130.0 ) );
  float eastDry = terrainBroadRegion( worldXZ, vec2( 134.0, -10.0 ), vec2( 154.0, 142.0 ) );

  float regionalMoisture = clamp(
    moisture + northWet * 0.10 + westTemperate * 0.05 - southDry * 0.12 - eastDry * 0.08,
    0.0,
    1.0
  );
  float regionalDryness = clamp(
    1.0 - regionalMoisture + southDry * 0.22 + eastDry * 0.16,
    0.0,
    1.0
  );

  primary = vec4( 1.0, 0.0, 0.0, 0.0 );
  snowWeight = 0.0;
  fertileFactor = clamp( fertility * 0.46 + floodplain * 0.34, 0.0, 1.0 );
  wetShoreFactor = 0.0;

  // fertile + floodplain remain grass physically, but bias the photo greener later.
  terrainBlendGrass( primary, snowWeight, fertility * 0.46 );
  terrainBlendGrass( primary, snowWeight, floodplain * 0.34 );

  // dryPlain + upland + earth become exposed dirt/soil.
  terrainBlendDirt( primary, snowWeight, regionalDryness * lowland * 0.42 );
  terrainBlendDirt( primary, snowWeight, highland * 0.44 );
  terrainBlendDirt(
    primary,
    snowWeight,
    steep * ( 1.0 - mountain ) * 0.28 + roughnessValue * 0.08
  );

  float forestFloor = clamp(
    ( regionalMoisture - 0.46 ) * 1.15 + fertility * 0.40 - highland * 0.34 - riverShelf * 0.14,
    0.0,
    0.75
  );
  terrainBlendGrass( primary, snowWeight, forestFloor * 0.28 );

  float exposedRock = clamp(
    steep * 0.86 + mountain * highland * 0.52 + roughnessValue * summit * 0.42,
    0.0,
    1.0
  );
  terrainBlendRock( primary, snowWeight, exposedRock * 0.42 );
  terrainBlendRock( primary, snowWeight, summit * 0.22 );

  float snow = clamp( ( height - 9.0 ) / 2.5, 0.0, 1.0 ) * mountain;
  terrainBlendSnow( primary, snowWeight, snow * 0.34 );
  terrainBlendRock( primary, snowWeight, mountain * steep * 0.20 );

  if ( coastInfluence > 0.01 && landMask > 0.5 ) {
    float coastLow = 1.0 - smoothstep( 0.18, 1.15, height );
    float coastal = coastInfluence * coastLow;
    float rockyCoast = coastal * clamp( roughnessValue * 1.10 + steep * 0.86, 0.0, 1.0 );
    float wetCoast = coastal * regionalMoisture * ( 1.0 - rockyCoast );
    float dryCoast = coastal * regionalDryness * ( 1.0 - rockyCoast );
    wetShoreFactor = clamp( wetCoast, 0.0, 1.0 );
    terrainBlendSand( primary, snowWeight, wetCoast * 0.30 );
    terrainBlendSand( primary, snowWeight, dryCoast * 0.40 );
    terrainBlendRock( primary, snowWeight, rockyCoast * 0.34 );
  }

  float total = max( 0.0001, dot( primary, vec4( 1.0 ) ) + snowWeight );
  primary /= total;
  snowWeight /= total;
}

vec2 terrainSurfaceUv() {
  return vec2(
    vTerrainLocalPosition.x / terrainWorldWidth,
    vTerrainLocalPosition.z / terrainWorldDepth
  ) * terrainRepeat;
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec4 terrainWeights;
float terrainSnowWeight;
float terrainFertileFactor;
float terrainWetShoreFactor;
terrainSurfaceWeights(
  terrainWeights,
  terrainSnowWeight,
  terrainFertileFactor,
  terrainWetShoreFactor
);

vec2 terrainUv = terrainSurfaceUv();
vec3 grassColor = texture2D( terrainGrass, terrainUv ).rgb;
vec3 dirtColor = texture2D( terrainDirt, terrainUv * 0.88 + vec2( 13.4, 5.8 ) ).rgb;
vec3 rockColor = texture2D( terrainRock, terrainUv * 0.72 + vec2( 2.9, 17.1 ) ).rgb;
vec3 sandColor = texture2D( terrainSand, terrainUv * 0.82 + vec2( 11.7, 19.3 ) ).rgb;
vec3 snowColor = texture2D( terrainSnow, terrainUv * 0.76 + vec2( 5.4, 9.2 ) ).rgb;

// Preserve the old fertile/floodplain and wet-shore color intent without returning to vertex colors.
vec3 fertileGrassColor = grassColor * vec3( 0.90, 1.06, 0.88 );
grassColor = mix( grassColor, fertileGrassColor, terrainFertileFactor * 0.52 );
sandColor *= mix( 1.0, 0.78, terrainWetShoreFactor * 0.42 );

vec3 terrainAlbedo =
  grassColor * terrainWeights.x +
  dirtColor * terrainWeights.y +
  rockColor * terrainWeights.z +
  sandColor * terrainWeights.w +
  snowColor * terrainSnowWeight;

// Keep only the old tiny macro variation; visible detail now comes from photo texels.
float macroVariation = sin( vTerrainLocalPosition.x * 0.019 + vTerrainLocalPosition.z * 0.015 ) * 0.008;
terrainAlbedo *= 1.0 + macroVariation;
diffuseColor.rgb *= terrainAlbedo;`,
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () =>
    `world-terrain-photo-blend-v1:${repeat}:${seaLevel}:${options.controlMapSize ?? 256}`;

  return material;
}

function getTerrainTextures(anisotropy: number): TerrainTextureSet {
  if (cachedTextures) return cachedTextures;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  cachedTextures = {
    grass: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.grass), anisotropy),
    dirt: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.dirt), anisotropy),
    rock: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.rock), anisotropy),
    sand: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.sand), anisotropy),
    snow: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.snow), anisotropy),
  };

  return cachedTextures;
}

function prepareTexture(texture: THREE.Texture, anisotropy: number): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
