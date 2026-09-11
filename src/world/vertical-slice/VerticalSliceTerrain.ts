import * as THREE from 'three';
import {
  SLICE_BORDER,
  SLICE_CITY,
  SLICE_DEPTH,
  SLICE_RIVER,
  SLICE_WIDTH,
  createForestTexture,
  createSplatTexture,
  heightAt,
  verticalSliceAssetUrl,
} from './VerticalSliceAssets';

const TERRAIN_SEGMENTS_X = 128;
const TERRAIN_SEGMENTS_Z = 88;

export function addVerticalSliceTerrain(scene: THREE.Scene): void {
  scene.add(createTerrainMesh());
  scene.add(createRibbon(SLICE_RIVER, 1.05, 2.35, 0x416d75, 0.93, 0.085));
  scene.add(createRibbon(SLICE_BORDER, 0.24, 0.24, 0xd8c47f, 0.82, 0.13));
  scene.add(createRibbon([
    [-34, -4], [-17, -7], [1, -10], SLICE_CITY, [34, -19], [50, -25],
  ], 0.36, 0.46, 0xbda977, 0.77, 0.1));
}

function createTerrainMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    SLICE_WIDTH,
    SLICE_DEPTH,
    TERRAIN_SEGMENTS_X,
    TERRAIN_SEGMENTS_Z,
  );
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    positions.setZ(i, heightAt(x, z));
  }
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  const loader = new THREE.TextureLoader();
  const grass = configureTile(loader.load(verticalSliceAssetUrl('grass.svg')));
  const rock = configureTile(loader.load(verticalSliceAssetUrl('rock.svg')));
  const soil = configureTile(loader.load(verticalSliceAssetUrl('soil.svg')));
  const sand = configureTile(loader.load(verticalSliceAssetUrl('sand.svg')));
  const splat = createSplatTexture();
  const forest = createForestTexture();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGrass: { value: grass },
      uRock: { value: rock },
      uSoil: { value: soil },
      uSand: { value: sand },
      uSplat: { value: splat },
      uForest: { value: forest },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorld = worldPosition.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uGrass;
      uniform sampler2D uRock;
      uniform sampler2D uSoil;
      uniform sampler2D uSand;
      uniform sampler2D uSplat;
      uniform sampler2D uForest;
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      varying vec3 vWorld;

      vec3 sampleLayer(sampler2D tex, vec2 worldXZ, float scale, vec2 offset) {
        vec3 fine = texture2D(tex, worldXZ * scale + offset).rgb;
        vec3 broad = texture2D(tex, worldXZ * (scale * 0.39) + offset.yx * 0.61).rgb;
        return mix(fine, broad, 0.26);
      }

      vec3 sampleRockTriplanar(vec3 worldPos, vec3 normal) {
        vec3 weights = pow(abs(normal), vec3(5.0));
        weights /= max(weights.x + weights.y + weights.z, 0.001);
        float scale = 0.118;
        vec3 xProjection = texture2D(uRock, worldPos.zy * scale).rgb;
        vec3 yProjection = texture2D(uRock, worldPos.xz * scale).rgb;
        vec3 zProjection = texture2D(uRock, worldPos.xy * scale).rgb;
        return xProjection * weights.x + yProjection * weights.y + zProjection * weights.z;
      }

      void main() {
        vec3 normal = normalize(vNormalWorld);
        vec3 mask = texture2D(uSplat, vUv).rgb;
        float forestMass = texture2D(uForest, vUv).r;
        float slope = clamp(1.0 - normal.y, 0.0, 1.0);

        float authoredRock = mask.r * smoothstep(0.09, 0.31, slope);
        float slopeRock = smoothstep(0.23, 0.56, slope) * smoothstep(2.4, 6.0, vWorld.y);
        float highRock = smoothstep(7.0, 10.2, vWorld.y) * 0.58;
        float rockWeight = clamp(max(authoredRock, max(slopeRock, highRock)), 0.0, 1.0);
        float soilWeight = mask.g * (1.0 - rockWeight * 0.7);
        float sandWeight = mask.b * (1.0 - rockWeight);
        float grassWeight = max(0.0, 1.0 - rockWeight - soilWeight - sandWeight);
        float total = max(0.001, grassWeight + rockWeight + soilWeight + sandWeight);
        grassWeight /= total;
        rockWeight /= total;
        soilWeight /= total;
        sandWeight /= total;

        vec2 worldXZ = vWorld.xz;
        vec3 grass = sampleLayer(uGrass, worldXZ, 0.105, vec2(0.17, 0.41));
        vec3 rock = sampleRockTriplanar(vWorld, normal);
        vec3 soil = sampleLayer(uSoil, worldXZ, 0.12, vec2(0.53, 0.11));
        vec3 sand = sampleLayer(uSand, worldXZ, 0.14, vec2(0.31, 0.72));
        vec3 base = grass * grassWeight + rock * rockWeight + soil * soilWeight + sand * sandWeight;

        vec3 forestFloor = vec3(0.105, 0.205, 0.095);
        float forestBlend = forestMass * (1.0 - rockWeight) * 0.7;
        base = mix(base, mix(base * 0.58, forestFloor, 0.42), forestBlend);

        float territorySide = smoothstep(-2.2, 2.2, vWorld.z - (vWorld.x * 0.14 - 6.0));
        vec3 westTint = vec3(0.28, 0.39, 0.29);
        vec3 eastTint = vec3(0.46, 0.34, 0.27);
        base = mix(base, mix(eastTint, westTint, territorySide), 0.07);

        float summit = smoothstep(10.0, 12.8, vWorld.y) * smoothstep(0.18, 0.58, slope);
        base = mix(base, vec3(0.70, 0.69, 0.65), summit * 0.13);

        vec3 lightDir = normalize(vec3(-0.52, 0.80, 0.30));
        float diffuse = max(dot(normal, lightDir), 0.0);
        float horizon = 0.5 + 0.5 * normal.y;
        float light = 0.55 + diffuse * 0.49 + horizon * 0.08;
        float valleyShade = mix(0.94, 1.0, smoothstep(0.6, 4.5, vWorld.y));
        vec3 color = base * light * valleyShade;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function configureTile(texture: THREE.Texture): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createRibbon(
  points: readonly (readonly [number, number])[],
  startWidth: number,
  endWidth: number,
  color: number,
  opacity: number,
  lift: number,
): THREE.Mesh {
  const samples = Math.max(24, points.length * 18);
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const width = THREE.MathUtils.lerp(startWidth, endWidth, t);
    for (const sign of [-1, 1]) {
      const x = center.x + side.x * width * 0.5 * sign;
      const z = center.z + side.z * width * 0.5 * sign;
      positions.push(x, heightAt(x, z) + lift, z);
    }
    if (i < samples) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.84,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = lift > 0.1 ? 4 : 2;
  return mesh;
}
