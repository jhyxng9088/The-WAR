import * as THREE from 'three';

const SUN_DIRECTION = new THREE.Vector3(-0.48, 0.82, 0.3).normalize();

const LAND_VERTEX_SHADER = /* glsl */ `
  attribute float aMoisture;
  attribute float aFertility;
  attribute float aRoughness;
  attribute float aCoast;
  attribute float aMountain;
  attribute float aForest;
  attribute float aRiver;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vMoisture;
  varying float vFertility;
  varying float vRoughness;
  varying float vCoast;
  varying float vMountain;
  varying float vForest;
  varying float vRiver;

  #include <fog_pars_vertex>

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vMoisture = aMoisture;
    vFertility = aFertility;
    vRoughness = aRoughness;
    vCoast = aCoast;
    vMountain = aMountain;
    vForest = aForest;
    vRiver = aRiver;

    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LAND_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDirection;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vMoisture;
  varying float vFertility;
  varying float vRoughness;
  varying float vCoast;
  varying float vMountain;
  varying float vForest;
  varying float vRiver;

  #include <fog_pars_fragment>
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  #include <dithering_pars_fragment>

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

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
    for (int i = 0; i < 4; i++) {
      value += noise2(p) * amplitude;
      p = rot * p * 2.03 + 7.17;
      amplitude *= 0.5;
    }
    return value;
  }

  float ridged(vec2 p) {
    float n = fbm(p);
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  vec3 saturateColor(vec3 color, float amount) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, amount);
  }

  void main() {
    vec2 p = vWorldPosition.xz;
    float elevation = vWorldPosition.y;
    vec3 baseNormal = normalize(vWorldNormal);
    float slope = 1.0 - clamp(baseNormal.y, 0.0, 1.0);

    float macro = fbm(p * 0.017 + vec2(7.2, -3.9));
    float meso = fbm(p * 0.058 + vec2(-4.1, 8.7));
    float fine = fbm(p * 0.19 + vec2(11.3, 2.4));
    float crag = ridged(p * 0.115 + vec2(-8.0, 5.0));
    float strata = 0.5 + 0.5 * sin(elevation * 7.8 + p.x * 0.09 - p.y * 0.055 + meso * 3.8);

    vec3 dryGrass = vec3(0.45, 0.42, 0.24);
    vec3 meadow = vec3(0.31, 0.43, 0.23);
    vec3 lushGrass = vec3(0.20, 0.36, 0.20);
    vec3 forestFloor = vec3(0.095, 0.235, 0.13);
    vec3 floodplain = vec3(0.27, 0.43, 0.25);
    vec3 soil = vec3(0.36, 0.29, 0.20);
    vec3 warmRock = vec3(0.34, 0.33, 0.30);
    vec3 darkRock = vec3(0.23, 0.24, 0.23);
    vec3 paleRock = vec3(0.49, 0.48, 0.44);
    vec3 sand = vec3(0.58, 0.50, 0.33);
    vec3 wetShore = vec3(0.31, 0.34, 0.24);
    vec3 snow = vec3(0.83, 0.84, 0.82);

    float wetness = clamp(vMoisture + (macro - 0.5) * 0.16, 0.0, 1.0);
    float dryness = clamp(1.0 - wetness + (meso - 0.5) * 0.12, 0.0, 1.0);
    float fertility = clamp(vFertility + (macro - 0.5) * 0.12, 0.0, 1.0);

    vec3 color = mix(dryGrass, meadow, smoothstep(0.22, 0.62, wetness));
    color = mix(color, lushGrass, smoothstep(0.52, 0.88, wetness) * (0.45 + fertility * 0.5));
    color = mix(color, floodplain, vRiver * (0.38 + fertility * 0.44));
    color = mix(color, soil, smoothstep(0.48, 0.92, dryness) * (0.16 + (1.0 - fertility) * 0.26));

    float forestPatch = smoothstep(0.34, 0.73, vForest + (meso - 0.5) * 0.24 + (fine - 0.5) * 0.11);
    forestPatch *= 1.0 - smoothstep(2.1, 4.25, elevation) * 0.74;
    color = mix(color, forestFloor, forestPatch * 0.72);

    float highland = smoothstep(1.55, 3.65, elevation);
    float steepRock = smoothstep(0.075, 0.31, slope);
    float mountainRock = smoothstep(0.26, 0.88, vMountain) * smoothstep(1.25, 3.65, elevation);
    float rockMask = clamp(
      steepRock * 0.78 + mountainRock * (0.34 + crag * 0.42) + vRoughness * 0.16 + highland * 0.12,
      0.0,
      1.0
    );
    vec3 rock = mix(warmRock, darkRock, clamp(crag * 0.82 + steepRock * 0.3, 0.0, 1.0));
    rock = mix(rock, paleRock, strata * highland * 0.34);
    color = mix(color, rock, rockMask);

    float coastLow = 1.0 - smoothstep(0.12, 0.62, elevation);
    float coastMask = clamp(vCoast * coastLow, 0.0, 1.0);
    float rockyCoast = coastMask * smoothstep(0.08, 0.28, slope + vRoughness * 0.24);
    color = mix(color, mix(sand, wetShore, wetness * 0.76), coastMask * (1.0 - rockyCoast) * 0.84);
    color = mix(color, darkRock, rockyCoast * 0.86);

    float snowLine = 5.25 + (macro - 0.5) * 0.55;
    float snowMask = smoothstep(snowLine, snowLine + 1.28, elevation);
    snowMask *= smoothstep(0.46, 0.82, vMountain);
    snowMask *= 0.42 + crag * 0.52;
    color = mix(color, snow, clamp(snowMask, 0.0, 0.88));

    float normalDetailStrength = rockMask * 0.54 + vMountain * 0.12;
    float detailCenter = fbm(p * 0.23);
    float detailX = fbm((p + vec2(0.42, 0.0)) * 0.23);
    float detailZ = fbm((p + vec2(0.0, 0.42)) * 0.23);
    vec3 detailNormal = normalize(vec3((detailCenter - detailX) * 1.8, 1.0, (detailCenter - detailZ) * 1.8));
    vec3 normal = normalize(mix(baseNormal, detailNormal, clamp(normalDetailStrength, 0.0, 0.62)));

    float sun = max(dot(normal, normalize(uSunDirection)), 0.0);
    float halfLambert = sun * 0.68 + 0.32;
    float ambient = 0.56;
    float occlusion = 1.0 - steepRock * 0.13 - vMountain * 0.055;
    color *= (ambient + halfLambert * 0.54) * occlusion;

    float materialGrain = mix(0.93, 1.065, fine);
    materialGrain *= mix(0.96, 1.045, meso);
    color *= materialGrain;
    color = saturateColor(color, 1.08);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <dithering_fragment>
  }
`;

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
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  #include <dithering_pars_fragment>

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
    float broad = noise2(p * 0.025 + 7.3);
    float ripple = noise2(p * 0.16 - 4.8);
    vec3 deep = vec3(0.035, 0.145, 0.205);
    vec3 shelf = vec3(0.075, 0.265, 0.335);
    vec3 shallow = vec3(0.20, 0.47, 0.49);
    vec3 color = mix(deep, shelf, clamp(vShelf * 0.86, 0.0, 1.0));
    color = mix(color, shallow, clamp(vShoal * 0.78, 0.0, 1.0));
    color *= mix(0.9, 1.08, broad * 0.68 + ripple * 0.32);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <dithering_fragment>
  }
`;

export function createLandSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: SUN_DIRECTION.clone() },
    },
    vertexShader: LAND_VERTEX_SHADER,
    fragmentShader: LAND_FRAGMENT_SHADER,
    fog: true,
    dithering: true,
  });
}

export function createOceanSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    fog: true,
    dithering: true,
  });
}
