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

const DEEP_WATER = new THREE.Color(0x173a43);
const OFFSHORE_WATER = new THREE.Color(0x27535a);
const SHALLOW_WATER = new THREE.Color(0x4e7770);
const SHORE_WATER = new THREE.Color(0x688b7d);
const REFLECTION_TINT = new THREE.Color(0x8ba7a8);

export function createWorldWaterMaterial(
  options: WorldWaterMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const controlMapSize = options.controlMapSize ?? 512;
  const controls = getTerrainBlendControlMaps(controlMapSize);
  const timeUniform: WaterTimeUniform = { value: 0 };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: options.roughness ?? 0.36,
    metalness: 0,
    dithering: true,
  });

  material.userData.waterTimeUniform = timeUniform;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterRegionalControl = { value: controls.regional };
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

float waterCoastInfluence() {
  float inside = waterInsideWorld();
  return texture2D( waterRegionalControl, waterControlUv() ).a * inside;
}

vec3 waterWaveNormalWorld( vec2 worldXZ, float time ) {
  vec2 dirA = normalize( vec2( 0.91, 0.42 ) );
  vec2 dirB = normalize( vec2( -0.38, 0.93 ) );
  vec2 dirC = normalize( vec2( 0.26, 0.97 ) );

  float phaseA = dot( worldXZ, dirA ) * 0.19 + time * 0.46;
  float phaseB = dot( worldXZ, dirB ) * 0.31 - time * 0.31;
  float phaseC = dot( worldXZ, dirC ) * 0.53 + time * 0.19;

  vec2 gradient =
    dirA * cos( phaseA ) * 0.028 +
    dirB * cos( phaseB ) * 0.018 +
    dirC * cos( phaseC ) * 0.010;

  return normalize( vec3( -gradient.x, 1.0, -gradient.y ) );
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `float waterCoast = waterCoastInfluence();
float waterShallow = smoothstep( 0.08, 0.84, waterCoast );
float waterShoreBand = smoothstep( 0.58, 0.96, waterCoast );

float waterMacroA = waterNoise( vWaterWorldPosition.xz * 0.012 + vec2( waterTime * 0.025, -waterTime * 0.018 ) );
float waterMacroB = waterNoise( vWaterWorldPosition.xz * 0.031 + vec2( -waterTime * 0.017, waterTime * 0.021 ) );
float waterMacro = waterMacroA * 0.68 + waterMacroB * 0.32;

vec3 waterAlbedo = mix( waterDeepColor, waterOffshoreColor, 0.34 + waterMacro * 0.18 );
waterAlbedo = mix( waterAlbedo, waterShallowColor, waterShallow * 0.84 );
waterAlbedo = mix( waterAlbedo, waterShoreColor, waterShoreBand * 0.22 );

vec3 waterNormalWorldForColor = waterWaveNormalWorld( vWaterWorldPosition.xz, waterTime );
vec3 waterViewDirection = normalize( cameraPosition - vWaterWorldPosition );
float waterFresnel = pow( 1.0 - clamp( dot( waterNormalWorldForColor, waterViewDirection ), 0.0, 1.0 ), 3.0 );
waterAlbedo = mix( waterAlbedo, waterReflectionTint, waterFresnel * 0.13 );

diffuseColor.rgb *= waterAlbedo;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
vec3 waterNormalWorld = waterWaveNormalWorld( vWaterWorldPosition.xz, waterTime );
vec3 waterNormalView = normalize( mat3( viewMatrix ) * waterNormalWorld );
normal = normalize( mix( normal, waterNormalView, 0.46 ) );`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
float waterRoughCoast = waterCoastInfluence();
float waterRoughNoise = waterNoise( vWaterWorldPosition.xz * 0.044 + vec2( waterTime * 0.011, 4.3 ) );
roughnessFactor *= mix( 0.82, 1.18, smoothstep( 0.18, 0.92, waterRoughCoast ) );
roughnessFactor *= mix( 0.94, 1.06, waterRoughNoise );`,
    );

    material.userData.waterShader = shader;
  };

  material.customProgramCacheKey = () =>
    `world-water-natural-v1:${controlMapSize}:${options.roughness ?? 0.36}`;

  return material;
}

export function updateWorldWaterTime(
  material: THREE.MeshStandardMaterial,
  elapsedSeconds: number,
): void {
  const uniform = material.userData.waterTimeUniform as WaterTimeUniform | undefined;
  if (uniform) uniform.value = elapsedSeconds;
}
