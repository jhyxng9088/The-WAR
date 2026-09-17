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
  ground: THREE.Texture;
  soil: THREE.Texture;
  rock: THREE.Texture;
  sand: THREE.Texture;
}

const TERRAIN_TEXTURE_URLS = {
  // Four close-range detail sources only. Strategic zoom uses procedural macro
  // color, so repeated photo tiles cannot become a map-scale pattern.
  ground:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sparse_grass/sparse_grass_diff_1k.jpg',
  soil:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirt/dirt_diff_1k.jpg',
  rock:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_ground/rock_ground_diff_1k.jpg',
  sand:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_sand_01/coast_sand_01_diff_1k.jpg',
} as const;

let cachedTextures: TerrainTextureSet | null = null;

export function createWorldTerrainSurfaceMaterial(
  options: WorldTerrainSurfaceMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const repeat = options.detailRepeat ?? 34;
  const seaLevel = options.seaLevel ?? SEA_LEVEL;
  const controls = getTerrainBlendControlMaps(options.controlMapSize ?? 512);
  const textures = getTerrainTextures(options.anisotropy ?? 4);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: false,
    roughness: options.roughness ?? 0.9,
    metalness: 0,
    dithering: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainGroundDetail = { value: textures.ground };
    shader.uniforms.terrainSoilDetail = { value: textures.soil };
    shader.uniforms.terrainRockDetail = { value: textures.rock };
    shader.uniforms.terrainSandDetail = { value: textures.sand };
    shader.uniforms.terrainRegionalControl = { value: controls.regional };
    shader.uniforms.terrainFeatureControl = { value: controls.features };
    shader.uniforms.terrainWorldWidth = { value: WORLD_WIDTH };
    shader.uniforms.terrainWorldDepth = { value: WORLD_DEPTH };
    shader.uniforms.terrainRepeat = { value: repeat };
    shader.uniforms.terrainRiverDistanceMax = { value: controls.riverDistanceMax };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vTerrainLocalPosition;\nvarying vec3 vTerrainLocalNormal;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>\nvTerrainLocalNormal = normalize( objectNormal );`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\nvTerrainLocalPosition = transformed;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D terrainGroundDetail;
uniform sampler2D terrainSoilDetail;
uniform sampler2D terrainRockDetail;
uniform sampler2D terrainSandDetail;
uniform sampler2D terrainRegionalControl;
uniform sampler2D terrainFeatureControl;
uniform float terrainWorldWidth;
uniform float terrainWorldDepth;
uniform float terrainRepeat;
uniform float terrainRiverDistanceMax;
varying vec3 vTerrainLocalPosition;
varying vec3 vTerrainLocalNormal;

float terrainHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}

float terrainNoise( vec2 p ) {
  vec2 cell = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = terrainHash( cell );
  float b = terrainHash( cell + vec2( 1.0, 0.0 ) );
  float c = terrainHash( cell + vec2( 0.0, 1.0 ) );
  float d = terrainHash( cell + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

mat2 terrainRotation( float angle ) {
  float c = cos( angle );
  float s = sin( angle );
  return mat2( c, -s, s, c );
}

float terrainFbm( vec2 p ) {
  float value = 0.0;
  value += terrainNoise( p ) * 0.55;
  p = terrainRotation( 0.61 ) * p * 2.07 + vec2( 17.3, -8.1 );
  value += terrainNoise( p ) * 0.30;
  p = terrainRotation( -0.43 ) * p * 2.11 + vec2( -6.4, 13.7 );
  value += terrainNoise( p ) * 0.15;
  return value;
}

float terrainBroadRegion( vec2 positionXZ, vec2 center, vec2 radius ) {
  vec2 n = ( positionXZ - center ) / radius;
  return exp( -dot( n, n ) * 2.15 );
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

vec2 terrainDetailUv( float scale, float angle, vec2 offset ) {
  vec2 worldXZ = vTerrainLocalPosition.xz;
  vec2 normalizedWorld = vec2(
    worldXZ.x / terrainWorldWidth,
    worldXZ.y / terrainWorldDepth
  );
  vec2 microWarp = vec2(
    terrainFbm( worldXZ * 0.118 + vec2( 9.4, -3.8 ) ),
    terrainFbm( worldXZ * 0.107 + vec2( -5.1, 12.6 ) )
  ) - 0.5;
  vec2 uv = normalizedWorld * terrainRepeat * scale + microWarp * 0.045;
  return terrainRotation( angle ) * uv + offset;
}

float terrainDetailModulation( sampler2D tex, vec2 uv, float contrast ) {
  vec3 sampleColor = texture2D( tex, uv ).rgb;
  float luminance = dot( sampleColor, vec3( 0.2126, 0.7152, 0.0722 ) );
  return mix( 1.0 - contrast, 1.0 + contrast, luminance );
}

float terrainRockTriplanarModulation( vec3 position, vec3 normal, float scale, float contrast ) {
  vec3 blend = pow( abs( normalize( normal ) ), vec3( 4.0 ) );
  blend /= max( blend.x + blend.y + blend.z, 0.0001 );
  float worldScale = terrainRepeat / terrainWorldWidth * scale;
  float xLum = dot(
    texture2D( terrainRockDetail, position.zy * worldScale + vec2( 4.7, 8.1 ) ).rgb,
    vec3( 0.2126, 0.7152, 0.0722 )
  );
  float yLum = dot(
    texture2D( terrainRockDetail, position.xz * worldScale + vec2( 12.3, 1.9 ) ).rgb,
    vec3( 0.2126, 0.7152, 0.0722 )
  );
  float zLum = dot(
    texture2D( terrainRockDetail, position.xy * worldScale + vec2( 2.6, 14.2 ) ).rgb,
    vec3( 0.2126, 0.7152, 0.0722 )
  );
  float luminance = dot( vec3( xLum, yLum, zLum ), blend );
  return mix( 1.0 - contrast, 1.0 + contrast, luminance );
}

float terrainDetailVisibility() {
  // The photos are a near-camera detail layer only. At strategic distance the
  // procedural macro surface fully owns the look, so no tiled photograph can
  // alias into a visible checker/diagonal pattern.
  float viewDistance = length( vViewPosition );
  return 1.0 - smoothstep( 92.0, 172.0, viewDistance );
}

void terrainSurfaceWeights(
  out vec4 primary,
  out vec4 secondary,
  out float regionalMoisture,
  out float regionalDryness,
  out float wetShoreFactor
) {
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
  float lowland = 1.0 - smoothstep( 2.1, 5.1, height );
  float highland = smoothstep( 3.8, 9.2, height );
  float summit = smoothstep( 9.0, 14.4, height );
  float steep = smoothstep( 0.055, 0.29, slope );
  float floodplain = exp( -( riverDistance * riverDistance ) / 22.0 ) * lowland;
  float riverShelf = exp( -( riverDistance * riverDistance ) / 8.4 ) * lowland;

  float northWet = terrainBroadRegion( worldXZ, vec2( -35.0, 92.0 ), vec2( 188.0, 126.0 ) );
  float westTemperate = terrainBroadRegion( worldXZ, vec2( -118.0, 15.0 ), vec2( 208.0, 156.0 ) );
  float southDry = terrainBroadRegion( worldXZ, vec2( 76.0, -102.0 ), vec2( 184.0, 130.0 ) );
  float eastDry = terrainBroadRegion( worldXZ, vec2( 134.0, -10.0 ), vec2( 154.0, 142.0 ) );

  regionalMoisture = clamp(
    moisture + northWet * 0.10 + westTemperate * 0.05 - southDry * 0.12 - eastDry * 0.08,
    0.0,
    1.0
  );
  regionalDryness = clamp(
    1.0 - regionalMoisture + southDry * 0.22 + eastDry * 0.16,
    0.0,
    1.0
  );

  float boundaryNoiseA = terrainFbm( worldXZ * 0.061 + vec2( 4.8, 13.1 ) ) - 0.5;
  float boundaryNoiseB = terrainFbm( worldXZ * 0.083 + vec2( -8.2, 2.7 ) ) - 0.5;
  float broadPatch = terrainFbm( worldXZ * 0.021 + vec2( 19.4, -6.8 ) ) - 0.5;

  float forestFloor = clamp(
    ( regionalMoisture - 0.42 ) * 1.24
      + fertility * 0.54
      + floodplain * 0.26
      - highland * 0.28
      - riverShelf * 0.08
      + boundaryNoiseB * 0.12 * lowland,
    0.0,
    1.0
  );

  float coastLow = 1.0 - smoothstep( 0.22, 1.28, height );
  float coastal = coastInfluence * coastLow * landMask;
  float rockyCoast = coastal * clamp( roughnessValue * 0.90 + steep * 0.88, 0.0, 1.0 );
  float sand = coastal * ( 1.0 - rockyCoast ) * ( 0.58 + regionalDryness * 0.42 );
  wetShoreFactor = clamp( coastal * regionalMoisture * ( 1.0 - rockyCoast ), 0.0, 1.0 );

  float snow = smoothstep( 10.7, 15.2, height ) * mountain * ( 1.0 - steep * 0.18 );
  float cliff = clamp(
    steep * ( 0.42 + mountain * 0.78 )
      + rockyCoast * 0.92
      + summit * steep * 0.34,
    0.0,
    1.0
  );
  cliff *= 1.0 - snow * 0.72;

  float rockGround = clamp(
    highland * ( 0.28 + roughnessValue * 0.54 )
      + mountain * highland * 0.42
      + summit * 0.24
      + max( 0.0, broadPatch ) * highland * 0.12,
    0.0,
    1.0
  );
  rockGround *= 1.0 - max( cliff * 0.74, snow * 0.86 );

  float mossRock = clamp(
    mountain * ( 1.0 - steep ) * regionalMoisture * 0.62
      + highland * forestFloor * 0.34,
    0.0,
    0.82
  );
  mossRock *= 1.0 - max( snow * 0.90, sand );

  float dirt = clamp(
    regionalDryness * lowland * 0.58
      + highland * ( 1.0 - regionalMoisture ) * 0.54
      + roughnessValue * 0.18
      + boundaryNoiseA * lowland * 0.14,
    0.0,
    1.0
  );
  dirt *= 1.0 - max( max( snow, sand ), cliff * 0.82 );

  float forest = clamp(
    forestFloor * lowland * ( 0.58 + regionalMoisture * 0.42 )
      + boundaryNoiseB * regionalMoisture * lowland * 0.08,
    0.0,
    1.0
  );
  forest *= 1.0 - max( max( sand, snow ), cliff );

  float grass = clamp(
    0.48 + fertility * 0.46 + floodplain * 0.24 - regionalDryness * 0.22 - highland * 0.18
      - boundaryNoiseA * lowland * 0.08,
    0.08,
    1.0
  );
  grass *= 1.0 - max( max( sand, snow ), cliff * 0.92 );

  primary = vec4( grass, forest, dirt, rockGround );
  secondary = vec4( mossRock, cliff, sand, snow );

  float total = max(
    0.0001,
    dot( primary, vec4( 1.0 ) ) + dot( secondary, vec4( 1.0 ) )
  );
  primary /= total;
  secondary /= total;
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `vec4 terrainPrimary;
vec4 terrainSecondary;
float terrainRegionalMoisture;
float terrainRegionalDryness;
float terrainWetShoreFactor;
terrainSurfaceWeights(
  terrainPrimary,
  terrainSecondary,
  terrainRegionalMoisture,
  terrainRegionalDryness,
  terrainWetShoreFactor
);

vec2 terrainXZ = vTerrainLocalPosition.xz;
float macroA = terrainFbm( terrainXZ * 0.010 + vec2( 3.4, 9.2 ) );
float macroB = terrainFbm( terrainRotation( 0.47 ) * terrainXZ * 0.023 + vec2( 17.1, -5.8 ) );
float macroC = terrainFbm( terrainRotation( -0.68 ) * terrainXZ * 0.041 + vec2( -11.7, 21.4 ) );
float macroBlend = clamp( macroA * 0.52 + macroB * 0.31 + macroC * 0.17, 0.0, 1.0 );

// Macro colors are procedural and world-scale. These remain stable at any zoom
// and cannot create repeated photo tiles around mountains or coastlines.
vec3 grassColor = mix(
  vec3( 0.30, 0.22, 0.105 ),
  vec3( 0.19, 0.285, 0.125 ),
  terrainRegionalMoisture
);
grassColor = mix( grassColor, vec3( 0.34, 0.235, 0.105 ), terrainRegionalDryness * 0.30 );

vec3 forestColor = mix(
  vec3( 0.205, 0.165, 0.090 ),
  vec3( 0.105, 0.185, 0.095 ),
  terrainRegionalMoisture
);
vec3 dirtColor = mix(
  vec3( 0.245, 0.185, 0.120 ),
  vec3( 0.335, 0.220, 0.110 ),
  terrainRegionalDryness
);
vec3 rockGroundColor = mix( vec3( 0.285, 0.275, 0.245 ), vec3( 0.235, 0.245, 0.220 ), terrainRegionalMoisture );
vec3 mossRockColor = mix( vec3( 0.245, 0.235, 0.195 ), vec3( 0.155, 0.225, 0.145 ), terrainRegionalMoisture );
vec3 cliffColor = mix( vec3( 0.275, 0.245, 0.210 ), vec3( 0.225, 0.235, 0.220 ), terrainRegionalMoisture );
vec3 sandColor = mix( vec3( 0.455, 0.355, 0.205 ), vec3( 0.355, 0.285, 0.180 ), terrainWetShoreFactor );
vec3 snowColor = vec3( 0.79, 0.815, 0.82 );

float macroLight = mix( 0.91, 1.075, macroBlend );
grassColor *= macroLight;
forestColor *= mix( 0.93, 1.055, macroBlend );
dirtColor *= mix( 0.94, 1.06, macroBlend );
rockGroundColor *= mix( 0.95, 1.045, macroBlend );
mossRockColor *= mix( 0.94, 1.05, macroBlend );
cliffColor *= mix( 0.945, 1.04, macroBlend );
sandColor *= mix( 0.965, 1.035, macroBlend );

float detailVisibility = terrainDetailVisibility();
if ( detailVisibility > 0.01 ) {
  vec2 groundUv = terrainDetailUv( 1.00, 0.18, vec2( 1.7, 8.9 ) );
  vec2 soilUv = terrainDetailUv( 0.93, -0.82, vec2( 12.7, 2.4 ) );
  vec2 rockUv = terrainDetailUv( 0.67, 0.46, vec2( 4.1, 13.9 ) );
  vec2 sandUv = terrainDetailUv( 0.74, -0.17, vec2( 10.6, 19.7 ) );

  float groundDetail = terrainDetailModulation( terrainGroundDetail, groundUv, 0.18 );
  float soilDetail = terrainDetailModulation( terrainSoilDetail, soilUv, 0.15 );
  float rockDetail = terrainDetailModulation( terrainRockDetail, rockUv, 0.16 );
  float cliffDetail = terrainRockTriplanarModulation(
    vTerrainLocalPosition,
    vTerrainLocalNormal,
    0.74,
    0.17
  );
  float sandDetail = terrainDetailModulation( terrainSandDetail, sandUv, 0.13 );

  grassColor *= mix( 1.0, groundDetail, detailVisibility );
  forestColor *= mix( 1.0, groundDetail, detailVisibility * 0.82 );
  dirtColor *= mix( 1.0, soilDetail, detailVisibility );
  rockGroundColor *= mix( 1.0, rockDetail, detailVisibility );
  mossRockColor *= mix( 1.0, rockDetail, detailVisibility * 0.72 );
  cliffColor *= mix( 1.0, cliffDetail, detailVisibility );
  sandColor *= mix( 1.0, sandDetail, detailVisibility );
}

vec3 terrainAlbedo =
  grassColor * terrainPrimary.x +
  forestColor * terrainPrimary.y +
  dirtColor * terrainPrimary.z +
  rockGroundColor * terrainPrimary.w +
  mossRockColor * terrainSecondary.x +
  cliffColor * terrainSecondary.y +
  sandColor * terrainSecondary.z +
  snowColor * terrainSecondary.w;

diffuseColor.rgb *= terrainAlbedo;`,
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () =>
    `world-terrain-procedural-lod-v6:${repeat}:${seaLevel}:${options.controlMapSize ?? 512}`;

  return material;
}

function getTerrainTextures(anisotropy: number): TerrainTextureSet {
  if (cachedTextures) return cachedTextures;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  cachedTextures = {
    ground: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.ground), anisotropy),
    soil: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.soil), anisotropy),
    rock: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.rock), anisotropy),
    sand: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.sand), anisotropy),
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
