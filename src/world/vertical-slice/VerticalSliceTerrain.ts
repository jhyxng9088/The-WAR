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
  scene.add(createRibbon(SLICE_RIVER, 1.18, 2.7, 0x3d6971, 0.96, 0.09));
  scene.add(createRibbon(SLICE_BORDER, 0.28, 0.28, 0xd8c47f, 0.88, 0.14));
  scene.add(createRibbon([
    [-34, -4], [-17, -7], [1, -10], SLICE_CITY, [34, -19], [50, -25],
  ], 0.42, 0.52, 0xbda977, 0.82, 0.11));
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

      void main() {
        vec3 mask = texture2D(uSplat, vUv).rgb;
        float rockWeight = mask.r;
        float soilWeight = mask.g;
        float sandWeight = mask.b;
        float grassWeight = max(0.0, 1.0 - rockWeight - soilWeight - sandWeight);
        float total = max(0.001, grassWeight + rockWeight + soilWeight + sandWeight);
        grassWeight /= total;
        rockWeight /= total;
        soilWeight /= total;
        sandWeight /= total;

        vec3 grass = texture2D(uGrass, vUv * vec2(18.0, 13.0)).rgb;
        vec3 rock = texture2D(uRock, vUv * vec2(22.0, 16.0)).rgb;
        vec3 soil = texture2D(uSoil, vUv * vec2(17.0, 12.0)).rgb;
        vec3 sand = texture2D(uSand, vUv * vec2(20.0, 15.0)).rgb;
        vec3 base = grass * grassWeight + rock * rockWeight + soil * soilWeight + sand * sandWeight;

        float forestMass = texture2D(uForest, vUv).r;
        vec3 forestFloor = vec3(0.12, 0.22, 0.105);
        base = mix(base, mix(base * 0.56, forestFloor, 0.44), forestMass * 0.72);

        float territorySide = smoothstep(-2.0, 2.0, vWorld.z - (vWorld.x * 0.14 - 6.0));
        vec3 westTint = vec3(0.28, 0.39, 0.29);
        vec3 eastTint = vec3(0.46, 0.34, 0.27);
        base = mix(base, mix(eastTint, westTint, territorySide), 0.09);

        vec3 normal = normalize(vNormalWorld);
        vec3 lightDir = normalize(vec3(-0.52, 0.78, 0.34));
        float diffuse = max(dot(normal, lightDir), 0.0);
        float slopeShade = clamp(normal.y, 0.0, 1.0);
        float light = 0.42 + diffuse * 0.72 + slopeShade * 0.08;
        vec3 color = base * light;
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
    roughness: 0.72,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = lift > 0.1 ? 4 : 2;
  return mesh;
}
