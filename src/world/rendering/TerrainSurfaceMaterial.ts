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

  float fbm3(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
    for (int i = 0; i < 3; i++) {
      value += noise2(p) * amplitude;
      p = rot * p * 2.03 + 7.17;
      amplitude *= 0.5;
    }
    return value;
  }

  float ridged(vec2 p) {
    return 1.0 - abs(fbm3(p) * 2.0 - 1.0);
  }

  vec3 increaseSaturation(vec3 color, float amount) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, amount);
  }

  void main() {
    vec2 p = vWorldPosition.xz;
    float elevation = vWorldPosition.y;
    vec3 baseNormal = normalize(vWorldNormal);
    float slope = 1.0 - clamp(baseNormal.y, 0.0, 1.0);

    float macro = fbm3(p * 0.014 + vec2(7.2, -3.9));
    float meso = fbm3(p * 0.052 + vec2(-4.1, 8.7));
    float fine = noise2(p * 0.21 + vec2(11.3, 2.4));
    float crag = ridged(p * 0.105 + vec2(-8.0, 5.0));

    vec3 dryGrass = vec3(0.36, 0.34, 0.17);
    vec3 meadow = vec3(0.235, 0.355, 0.155);
    vec3 lushGrass = vec3(0.13, 0.285, 0.13);
    vec3 forestFloor = vec3(0.045, 0.145, 0.070);
    vec3 forestDeep = vec3(0.025, 0.105, 0.050);
    vec3 floodplain = vec3(0.17, 0.315, 0.16);
    vec3 soil = vec3(0.305, 0.225, 0.135);
    vec3 warmRock = vec3(0.285, 0.275, 0.255);
    vec3 coolRock = vec3(0.205, 0.215, 0.215);
    vec3 darkRock = vec3(0.125, 0.135, 0.14);
    vec3 sand = vec3(0.52, 0.43, 0.25);
    vec3 wetShore = vec3(0.23, 0.285, 0.20);
    vec3 snow = vec3(0.73, 0.76, 0.77);

    float wetness = clamp(vMoisture + (macro - 0.5) * 0.19, 0.0, 1.0);
    float dryness = clamp(1.0 - wetness + (meso - 0.5) * 0.16, 0.0, 1.0);
    float fertility = clamp(vFertility + (macro - 0.5) * 0.13, 0.0, 1.0);

    vec3 color = mix(dryGrass, meadow, smoothstep(0.2, 0.58, wetness));
    color = mix(color, lushGrass, smoothstep(0.5, 0.86, wetness) * (0.42 + fertility * 0.5));
    color = mix(color, soil, smoothstep(0.54, 0.9, dryness) * (0.18 + (1.0 - fertility) * 0.32));

    float basin = vRiver * (1.0 - smoothstep(1.65, 3.25, elevation));
    color = mix(color, floodplain, basin * (0.34 + fertility * 0.42));

    float forestSignal = vForest + (macro - 0.5) * 0.10 + (meso - 0.5) * 0.18;
    float forestMass = smoothstep(0.22, 0.58, forestSignal);
    forestMass *= 1.0 - smoothstep(2.15, 4.15, elevation) * 0.72;
    forestMass *= 1.0 - basin * 0.24;
    vec3 forestColor = mix(forestFloor, forestDeep, smoothstep(0.48, 0.9, vForest));
    color = mix(color, forestColor, forestMass * 0.88);

    float highland = smoothstep(1.25, 3.25, elevation);
    float steepRock = smoothstep(0.055, 0.245, slope);
    float mountainCore = smoothstep(0.18, 0.72, vMountain);
    float mountainRock = mountainCore * smoothstep(0.95, 2.75, elevation);
    float rockMask = clamp(
      steepRock * 0.84 + mountainRock * (0.5 + crag * 0.42) + vRoughness * 0.19 + highland * 0.09,
      0.0,
      1.0
    );

    float fracture = clamp(crag * 0.72 + fine * 0.22 + steepRock * 0.28, 0.0, 1.0);
    vec3 rock = mix(warmRock, coolRock, fracture);
    rock = mix(rock, darkRock, smoothstep(0.64, 0.95, fracture) * (0.44 + steepRock * 0.42));
    color = mix(color, rock, rockMask * 0.96);

    float coastLow = 1.0 - smoothstep(0.10, 0.62, elevation);
    float coastMask = clamp(vCoast * coastLow, 0.0, 1.0);
    float rockyCoast = coastMask * smoothstep(0.08, 0.26, slope + vRoughness * 0.23);
    color = mix(color, mix(sand, wetShore, wetness * 0.68), coastMask * (1.0 - rockyCoast) * 0.82);
    color = mix(color, darkRock, rockyCoast * 0.8);

    float northness = smoothstep(28.0, 82.0, p.y);
    float summit = smoothstep(6.25, 7.35, elevation);
    float snowMask = summit * northness * smoothstep(0.55, 0.86, vMountain);
    snowMask *= 0.28 + crag * 0.34;
    color = mix(color, snow, clamp(snowMask, 0.0, 0.46));

    float detailStrength = clamp(rockMask * 0.42 + mountainCore * 0.08, 0.0, 0.5);
    float detailCenter = noise2(p * 0.29);
    float detailX = noise2((p + vec2(0.34, 0.0)) * 0.29);
    float detailZ = noise2((p + vec2(0.0, 0.34)) * 0.29);
    vec3 detailNormal = normalize(vec3((detailCenter - detailX) * 2.1, 1.0, (detailCenter - detailZ) * 2.1));
    vec3 normal = normalize(mix(baseNormal, detailNormal, detailStrength));

    float sun = max(dot(normal, normalize(uSunDirection)), 0.0);
    float halfLambert = sun * 0.72 + 0.28;
    float occlusion = 1.0 - steepRock * 0.17 - mountainCore * 0.07 - forestMass * 0.05;
    color *= (0.43 + halfLambert * 0.62) * occlusion;

    float grain = mix(0.91, 1.075, fine) * mix(0.965, 1.035, meso);
    color *= grain;
    color = increaseSaturation(color, 1.12);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
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

export function createLandSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: fogUniforms({
      uSunDirection: { value: SUN_DIRECTION.clone() },
    }),
    vertexShader: LAND_VERTEX_SHADER,
    fragmentShader: LAND_FRAGMENT_SHADER,
    fog: true,
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
