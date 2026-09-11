import * as THREE from 'three';
import { TERRAIN_BAKED_TEXTURE } from './terrainBakedTexture';

const OCEAN_VERTEX_SHADER = /* glsl */ `
  attribute float aShelf;
  attribute float aShoal;

  varying vec3 vWorldPosition;
  varying float vShelf;
  varying float vShoal;

  #include <fog_pars_vertex>

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vShelf = aShelf;
    vShoal = aShoal;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  varying float vShelf;
  varying float vShoal;

  #include <fog_pars_fragment>

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec2 p = vWorldPosition.xz;
    float broad = noise2(p * 0.024 + 7.3);
    float ripple = noise2(p * 0.15 - 4.8);
    vec3 deep = vec3(0.022, 0.105, 0.155);
    vec3 shelf = vec3(0.045, 0.205, 0.275);
    vec3 shallow = vec3(0.13, 0.36, 0.40);
    vec3 color = mix(deep, shelf, clamp(vShelf * 0.9, 0.0, 1.0));
    color = mix(color, shallow, clamp(vShoal * 0.72, 0.0, 1.0));
    color *= mix(0.92, 1.055, broad * 0.72 + ripple * 0.28);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function fogUniforms(extra: Record<string, THREE.IUniform>): Record<string, THREE.IUniform> {
  return THREE.UniformsUtils.merge([THREE.UniformsLib.fog, extra]);
}

const LAND_TEXTURE = new THREE.TextureLoader().load(TERRAIN_BAKED_TEXTURE);
LAND_TEXTURE.colorSpace = THREE.SRGBColorSpace;
LAND_TEXTURE.flipY = true;
LAND_TEXTURE.minFilter = THREE.LinearMipmapLinearFilter;
LAND_TEXTURE.magFilter = THREE.LinearFilter;
LAND_TEXTURE.generateMipmaps = true;
LAND_TEXTURE.anisotropy = 4;

export function createLandSurfaceMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: LAND_TEXTURE,
    color: 0xffffff,
    fog: true,
    toneMapped: true,
  });
}

export function createOceanSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: fogUniforms({}),
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    fog: true,
  });
}
