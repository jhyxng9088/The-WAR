import * as THREE from 'three';
import { WORLD_DEPTH, WORLD_WIDTH } from '../WorldField';
import { getTerrainBlendControlMaps } from './TerrainBlendControlMap';

interface WorldWaterMaterialOptions {
  controlMapSize?: number;
  roughness?: number;
}

interface WaterTimeUniform {
  value: number;
}

const DEEP_WATER = new THREE.Color(0x153743);
const OFFSHORE_WATER = new THREE.Color(0x214954);
const SHALLOW_WATER = new THREE.Color(0x28515a);
const SHORE_WATER = new THREE.Color(0x2f5559);
const REFLECTION_TINT = new THREE.Color(0x789094);

export function createWorldWaterMaterial(
  options: WorldWaterMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const controlMapSize = options.controlMapSize ?? 512;
  const controls = getTerrainBlendControlMaps(controlMapSize);
  const timeUniform: WaterTimeUniform = { value: 0 };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: options.roughness ?? 0.48,
    metalness: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    dithering: true,
  });

  material.userData.waterTimeUniform = timeUniform;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterRegionalControl = { value: controls.regional };
    shader.uniforms.waterFeatureControl = { value: controls.features };
    shader.uniforms.waterWorldWidth = { value: WORLD_WIDTH };
    shader.uniforms.waterWorldDepth = { value: WORLD_DEPTH };
    shader.uniforms.waterTime = timeUniform;
    shader.uniforms.waterDeepColor = { value: DEEP_WATER };
    shader.uniforms.waterOffshoreColor = { value: OFFSHORE_WATER };
    shader.uniforms.waterShallowColor = { value: SHALLOW_WATER };
    shader.uniforms.waterShoreColor = { value: SHORE_WATER };
    shader.uniforms.waterReflectionTint = { value: REFLECTION_TINT };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vWaterWorldPosition;',
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvWaterWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D waterRegionalControl;
uniform sampler2D waterFeatureControl;
uniform float waterWorldWidth;
uniform float waterWorldDepth;
uniform float waterTime;
uniform vec3 waterDeepColor;
uniform vec3 waterOffshoreColor;
uniform vec3 waterShallowColor;
uniform vec3 waterShoreColor;
uniform vec3 waterReflectionTint;
varying vec3 vWaterWorldPosition;

float waterHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}

float waterNoise( vec2 p ) {
  vec2 cell = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = waterHash( cell );
  float b = waterHash( cell + vec2( 1.0, 0.0 ) );
  float c = waterHash( cell + vec2( 0.0, 1.0 ) );
  float d = waterHash( cell + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

float waterInsideWorld() {
  vec2 halfWorld = vec2( waterWorldWidth, waterWorldDepth ) * 0.5;
  vec2 inside = step( abs( vWaterWorldPosition.xz ), halfWorld );
  return inside.x * inside.y;
}

vec2 waterControlUv() {
  return clamp(
    vec2(
      vWaterWorldPosition.x / waterWorldWidth + 0.5,
      vWaterWorldPosition.z / waterWorldDepth + 0.5
    ),
    vec2( 0.0 ),
    vec2( 1.0 )
  );
}

vec4 waterRegionalData() {
  return texture2D( waterRegionalControl, waterControlUv() );
}

vec4 waterFeatureData() {
  return texture2D( waterFeatureControl, waterControlUv() );
}

float waterDepthNormalized() {
  float inside = waterInsideWorld();
  float encodedDepth = waterFeatureData().a;
  return mix( 1.0, encodedDepth, inside );
}

float waterCoastInfluence() {
  float inside = waterInsideWorld();
  return waterRegionalData().a * inside;
}

float waterSurfaceMask() {
  float inside = waterInsideWorld();
  float landMask = waterFeatureData().b * inside;
  return 1.0 - smoothstep( 0.40, 0.60, landMask );
}

vec3 waterWaveNormalWorld( vec2 worldXZ, float time ) {
  vec2 dirA = normalize( vec2( 0.91, 0.42 ) );
  vec2 dirB = normalize( vec2( -0.38, 0.93 ) );
  vec2 dirC = normalize( vec2( 0.26, 0.97 ) );

  float phaseA = dot( worldXZ, dirA ) * 0.20 + time * 0.43;
  float phaseB = dot( worldXZ, dirB ) * 0.34 - time * 0.29;
  float phaseC = dot( worldXZ, dirC ) * 0.58 + time * 0.17;

  vec2 gradient =
    dirA * cos( phaseA ) * 0.040 +
    dirB * cos( phaseB ) * 0.025 +
    dirC * cos( phaseC ) * 0.014;

  return normalize( vec3( -gradient.x, 1.0, -gradient.y ) );
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `float waterDepth = waterDepthNormalized();
float waterCoast = waterCoastInfluence();
float waterMask = waterSurfaceMask();

float depthBlend = smoothstep( 0.045, 0.78, waterDepth );
float offshoreBlend = smoothstep( 0.16, 0.52, waterDepth );
float veryShallow = 1.0 - smoothstep( 0.025, 0.17, waterDepth );

vec3 waterAlbedo = mix( waterShallowColor, waterDeepColor, depthBlend );
waterAlbedo = mix( waterAlbedo, waterOffshoreColor, offshoreBlend * ( 1.0 - depthBlend ) * 0.34 );
waterAlbedo = mix( waterAlbedo, waterShoreColor, veryShallow * 0.015 );

float waterDetailA = waterNoise(
  vWaterWorldPosition.xz * 0.090 + vec2( waterTime * 0.018, -waterTime * 0.013 )
);
float waterDetailB = waterNoise(
  vWaterWorldPosition.xz * 0.170 + vec2( -waterTime * 0.012, waterTime * 0.016 )
);
float waterDetail = waterDetailA * 0.62 + waterDetailB * 0.38;
waterAlbedo *= mix( 0.985, 1.018, waterDetail );

vec3 waterNormalWorldForColor = waterWaveNormalWorld( vWaterWorldPosition.xz, waterTime );
vec3 waterViewDirection = normalize( cameraPosition - vWaterWorldPosition );
float waterFresnel = pow(
  1.0 - clamp( dot( waterNormalWorldForColor, waterViewDirection ), 0.0, 1.0 ),
  3.0
);
waterAlbedo = mix( waterAlbedo, waterReflectionTint, waterFresnel * 0.075 );

diffuseColor.rgb *= waterAlbedo;

float depthAlpha = mix( 0.92, 0.985, smoothstep( 0.018, 0.42, waterDepth ) );
float coastSoftening = mix( 1.0, 0.985, smoothstep( 0.55, 0.96, waterCoast ) );
diffuseColor.a *= depthAlpha * coastSoftening * waterMask;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
vec3 waterNormalWorld = waterWaveNormalWorld( vWaterWorldPosition.xz, waterTime );
vec3 waterNormalView = normalize( mat3( viewMatrix ) * waterNormalWorld );
normal = normalize( mix( normal, waterNormalView, 0.58 ) );`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
float waterRoughDepth = waterDepthNormalized();
float waterRoughNoise = waterNoise( vWaterWorldPosition.xz * 0.11 + vec2( waterTime * 0.010, 4.3 ) );
float shallowRoughness = 1.18;
float deepRoughness = 0.88;
roughnessFactor *= mix( shallowRoughness, deepRoughness, smoothstep( 0.05, 0.55, waterRoughDepth ) );
roughnessFactor *= mix( 0.97, 1.03, waterRoughNoise );`,
    );

    material.userData.waterShader = shader;
  };

  material.customProgramCacheKey = () =>
    `world-water-depth-shore-v4-no-glow:${controlMapSize}:${options.roughness ?? 0.48}`;

  return material;
}

export function updateWorldWaterTime(
  material: THREE.MeshStandardMaterial,
  elapsedSeconds: number,
): void {
  const uniform = material.userData.waterTimeUniform as WaterTimeUniform | undefined;
  if (uniform) uniform.value = elapsedSeconds;
}
