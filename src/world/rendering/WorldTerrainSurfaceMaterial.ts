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
  forest: THREE.Texture;
  dryForest: THREE.Texture;
  mossRock: THREE.Texture;
  dirt: THREE.Texture;
  mud: THREE.Texture;
  rockGround: THREE.Texture;
  cliffRock: THREE.Texture;
  coastSand: THREE.Texture;
  snow: THREE.Texture;
}

const TERRAIN_TEXTURE_URLS = {
  // Poly Haven CC0 1K diffuse textures. Keep the sampler count below the common
  // mobile WebGL fragment limit while giving each climate band multiple surfaces.
  grass:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sparse_grass/sparse_grass_diff_1k.jpg',
  forest:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_diff_1k.jpg',
  dryForest:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_03/forrest_ground_03_diff_1k.jpg',
  mossRock:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg',
  dirt:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dirt/dirt_diff_1k.jpg',
  mud:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud_rocks_01/brown_mud_rocks_01_diff_1k.jpg',
  rockGround:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_ground/rock_ground_diff_1k.jpg',
  cliffRock:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_06/rock_06_diff_1k.jpg',
  coastSand:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_sand_01/coast_sand_01_diff_1k.jpg',
  snow:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/snow_04/snow_04_diff_1k.jpg',
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
    shader.uniforms.terrainGrass = { value: textures.grass };
    shader.uniforms.terrainForest = { value: textures.forest };
    shader.uniforms.terrainDryForest = { value: textures.dryForest };
    shader.uniforms.terrainMossRock = { value: textures.mossRock };
    shader.uniforms.terrainDirt = { value: textures.dirt };
    shader.uniforms.terrainMud = { value: textures.mud };
    shader.uniforms.terrainRockGround = { value: textures.rockGround };
    shader.uniforms.terrainCliffRock = { value: textures.cliffRock };
    shader.uniforms.terrainCoastSand = { value: textures.coastSand };
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
uniform sampler2D terrainGrass;
uniform sampler2D terrainForest;
uniform sampler2D terrainDryForest;
uniform sampler2D terrainMossRock;
uniform sampler2D terrainDirt;
uniform sampler2D terrainMud;
uniform sampler2D terrainRockGround;
uniform sampler2D terrainCliffRock;
uniform sampler2D terrainCoastSand;
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
  value += terrainNoise( p ) * 0.54;
  p = terrainRotation( 0.73 ) * p * 2.03 + vec2( 17.3, -8.1 );
  value += terrainNoise( p ) * 0.29;
  p = terrainRotation( -0.47 ) * p * 2.11 + vec2( -6.4, 13.7 );
  value += terrainNoise( p ) * 0.17;
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

vec2 terrainWarpedUv( float scale, float angle, vec2 offset ) {
  vec2 worldXZ = vTerrainLocalPosition.xz;
  vec2 normalizedWorld = vec2(
    worldXZ.x / terrainWorldWidth,
    worldXZ.y / terrainWorldDepth
  );
  vec2 fineWarp = vec2(
    terrainNoise( worldXZ * 0.083 + vec2( 13.2, -7.4 ) + offset * 0.113 ),
    terrainNoise( worldXZ * 0.071 + vec2( -9.6, 5.8 ) + offset * 0.097 )
  ) - 0.5;
  vec2 uv = normalizedWorld * terrainRepeat * scale + fineWarp * 0.035;
  return terrainRotation( angle ) * uv + offset;
}

vec3 terrainFilteredSample( sampler2D tex, vec2 uv ) {
  // Positive mip bias suppresses the high-frequency photo pattern when hundreds
  // of repeats are minified into the strategic camera view. The UV scale stays
  // unchanged, so close-up physical scale remains the same.
  return texture2D( tex, uv, 1.35 ).rgb;
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

  float boundaryNoiseA = terrainNoise( worldXZ * 0.082 + vec2( 4.8, 13.1 ) ) - 0.5;
  float boundaryNoiseB = terrainNoise( worldXZ * 0.137 + vec2( -8.2, 2.7 ) ) - 0.5;
  float broadPatch = terrainNoise( worldXZ * 0.028 + vec2( 19.4, -6.8 ) ) - 0.5;

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

vec2 grassUv = terrainWarpedUv( 1.00, 0.18, vec2( 1.7, 8.9 ) );
vec2 forestUv = terrainWarpedUv( 0.82, -0.31, vec2( 7.8, 16.4 ) );
vec2 dryForestUv = terrainWarpedUv( 0.76, 0.49, vec2( 3.3, 21.8 ) );
vec2 dirtUv = terrainWarpedUv( 0.93, -0.82, vec2( 12.7, 2.4 ) );
vec2 mudUv = terrainWarpedUv( 0.58, 0.36, vec2( 20.3, 7.6 ) );
vec2 snowUv = terrainWarpedUv( 0.56, 0.27, vec2( 6.3, 11.5 ) );

vec2 terrainXZ = vTerrainLocalPosition.xz;
vec3 grassColor = terrainFilteredSample( terrainGrass, grassUv );
vec3 dryForestColor = terrainFilteredSample( terrainDryForest, dryForestUv );
vec3 forestColor = terrainFilteredSample( terrainForest, forestUv );
vec3 dirtColor = terrainFilteredSample( terrainDirt, dirtUv );
vec3 mudColor = terrainFilteredSample( terrainMud, mudUv );
vec3 snowColor = terrainFilteredSample( terrainSnow, snowUv );

// Mountain and coast surfaces deliberately avoid photo textures here. Those areas
// cover large continuous regions, so even rotated/warped image tiles reveal a
// repeating grid at strategic zoom. Multi-octave world-space noise has no tile seam
// or fixed image period, while the rest of the terrain keeps the existing photos.
float rockMacro = terrainFbm( terrainXZ * 0.047 + vec2( 4.2, -11.7 ) );
float rockDetail = terrainFbm(
  terrainRotation( 0.61 ) * terrainXZ * 0.115 + vec2( 19.4, 7.8 )
);
float rockPattern = clamp( rockMacro * 0.72 + rockDetail * 0.28, 0.0, 1.0 );
float slope = 1.0 - clamp( abs( normalize( vTerrainLocalNormal ).y ), 0.0, 1.0 );
float heightFactor = smoothstep( 3.2, 13.8, vTerrainLocalPosition.y );

vec3 lowRock = vec3( 0.255, 0.235, 0.195 );
vec3 highRock = vec3( 0.455, 0.410, 0.325 );
vec3 rockGroundColor = mix( lowRock, highRock, rockPattern );
rockGroundColor *= mix( 1.04, 0.90, heightFactor * 0.52 );

float mossNoise = terrainFbm( terrainXZ * 0.036 + vec2( -8.7, 16.2 ) );
vec3 mossTint = mix( vec3( 0.245, 0.255, 0.165 ), vec3( 0.345, 0.365, 0.225 ), mossNoise );
vec3 mossRockColor = mix(
  rockGroundColor,
  mossTint,
  clamp( terrainRegionalMoisture * 0.58 + mossNoise * 0.18, 0.12, 0.68 )
);

float cliffNoise = terrainFbm(
  terrainRotation( -0.83 ) * terrainXZ * 0.072 + vec2( 12.1, -3.9 )
);
vec3 cliffColor = mix( vec3( 0.185, 0.175, 0.155 ), vec3( 0.385, 0.355, 0.295 ), cliffNoise );
cliffColor *= mix( 1.0, 0.78, smoothstep( 0.08, 0.42, slope ) );

float sandBroad = terrainFbm( terrainXZ * 0.052 + vec2( 31.7, -14.6 ) );
float sandFine = terrainFbm(
  terrainRotation( 0.44 ) * terrainXZ * 0.138 + vec2( -5.2, 22.4 )
);
float sandPattern = clamp( sandBroad * 0.78 + sandFine * 0.22, 0.0, 1.0 );
vec3 sandColor = mix( vec3( 0.545, 0.445, 0.285 ), vec3( 0.735, 0.625, 0.405 ), sandPattern );

float grassMacroVariation = terrainNoise( terrainXZ * 0.014 + vec2( 6.8, -3.1 ) );
grassColor *= mix( 0.965, 1.035, grassMacroVariation );

float dryVariantNoise = terrainNoise( terrainXZ * 0.037 + vec2( 9.7, -4.3 ) );
float wetVariantNoise = terrainNoise( terrainXZ * 0.043 + vec2( -12.6, 15.2 ) );
float dryVariant = smoothstep( 0.42, 0.84, terrainRegionalDryness ) * mix( 0.28, 0.78, dryVariantNoise );
float mudVariant = smoothstep( 0.56, 0.90, terrainRegionalMoisture ) * mix( 0.18, 0.72, wetVariantNoise );

// Use extra physical surfaces inside each climate class instead of tinting one brown photo everywhere.
grassColor = mix( grassColor, dryForestColor, dryVariant * 0.30 );
forestColor = mix( forestColor, dryForestColor, dryVariant * 0.66 );
dirtColor = mix( dirtColor, mudColor, mudVariant * ( 1.0 - terrainRegionalDryness * 0.58 ) );

// Keep climate readable without painting broad vertex-color gradients back over the photos.
grassColor *= mix( vec3( 1.03, 0.94, 0.84 ), vec3( 0.92, 1.04, 0.90 ), terrainRegionalMoisture );
forestColor *= mix( vec3( 0.96, 0.91, 0.84 ), vec3( 0.91, 1.02, 0.90 ), terrainRegionalMoisture );
dirtColor *= mix( vec3( 0.92, 0.88, 0.82 ), vec3( 1.04, 0.95, 0.84 ), terrainRegionalDryness );
sandColor *= mix( 1.0, 0.74, terrainWetShoreFactor * 0.58 );

vec3 terrainAlbedo =
  grassColor * terrainPrimary.x +
  forestColor * terrainPrimary.y +
  dirtColor * terrainPrimary.z +
  rockGroundColor * terrainPrimary.w +
  mossRockColor * terrainSecondary.x +
  cliffColor * terrainSecondary.y +
  sandColor * terrainSecondary.z +
  snowColor * terrainSecondary.w;

// Keep only broad irregular variation at strategic zoom; no second photo frequency
// is mixed in, which avoids the large diagonal beat/checker pattern.
float macroA = terrainNoise( terrainXZ * 0.010 + vec2( 3.4, 9.2 ) );
float macroB = terrainNoise( terrainXZ * 0.024 + vec2( 17.1, -5.8 ) );
float macroLight = mix( 0.95, 1.045, macroA * 0.68 + macroB * 0.32 );
terrainAlbedo *= macroLight;
diffuseColor.rgb *= terrainAlbedo;`,
    );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () =>
    `world-terrain-natural-blend-v7:${repeat}:${seaLevel}:${options.controlMapSize ?? 512}`;

  return material;
}

function getTerrainTextures(anisotropy: number): TerrainTextureSet {
  if (cachedTextures) return cachedTextures;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  cachedTextures = {
    grass: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.grass), anisotropy),
    forest: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.forest), anisotropy),
    dryForest: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.dryForest), anisotropy),
    mossRock: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.mossRock), anisotropy),
    dirt: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.dirt), anisotropy),
    mud: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.mud), anisotropy),
    rockGround: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.rockGround), anisotropy),
    cliffRock: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.cliffRock), anisotropy),
    coastSand: prepareTexture(loader.load(TERRAIN_TEXTURE_URLS.coastSand), anisotropy),
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
