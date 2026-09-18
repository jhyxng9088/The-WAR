import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  Vector3,
} from "three";
import {
  SEA_LEVEL,
  WORLD_DEPTH,
  WORLD_WIDTH,
  WorldField,
  type Point2,
  type RiverPath,
} from "./WorldField";

export interface WorldSceneHandle {
  readonly scene: Scene;
  readonly field: WorldField;
  readonly width: number;
  readonly depth: number;
  dispose(): void;
}

const TERRAIN_SEGMENTS_X = 180;
const TERRAIN_SEGMENTS_Z = 132;
const FOREST_INSTANCE_COUNT = 460;

export function createWorldScene(): WorldSceneHandle {
  const field = new WorldField();
  const scene = new Scene();
  scene.background = new Color(0xb9c9c7);
  scene.fog = new Fog(0xb9c9c7, 5600, 9400);

  const hemisphere = new HemisphereLight(0xe5eee2, 0x536052, 1.9);
  scene.add(hemisphere);

  const sunlight = new DirectionalLight(0xfff6dc, 2.15);
  sunlight.position.set(-2400, 4200, 1600);
  sunlight.target.position.set(0, 0, 0);
  scene.add(sunlight, sunlight.target);

  const water = createWater();
  const terrain = createTerrain(field);
  const rivers = field.rivers.map((river) => createRiver(field, river));
  const forest = createForest(field);
  const settlements = createScaleSettlements(field);

  scene.add(water, terrain, ...rivers, forest.mesh, ...settlements.meshes);

  return {
    scene,
    field,
    width: WORLD_WIDTH,
    depth: WORLD_DEPTH,
    dispose(): void {
      scene.clear();
      terrain.geometry.dispose();
      disposeMaterial(terrain.material);
      water.geometry.dispose();
      disposeMaterial(water.material);

      for (const river of rivers) {
        river.geometry.dispose();
        disposeMaterial(river.material);
      }

      forest.geometry.dispose();
      forest.material.dispose();
      settlements.dispose();
    },
  };
}

function createTerrain(field: WorldField): Mesh {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const xCount = TERRAIN_SEGMENTS_X + 1;
  const zCount = TERRAIN_SEGMENTS_Z + 1;

  for (let zIndex = 0; zIndex < zCount; zIndex += 1) {
    const z = -WORLD_DEPTH * 0.5 + (zIndex / TERRAIN_SEGMENTS_Z) * WORLD_DEPTH;

    for (let xIndex = 0; xIndex < xCount; xIndex += 1) {
      const x = -WORLD_WIDTH * 0.5 + (xIndex / TERRAIN_SEGMENTS_X) * WORLD_WIDTH;
      const height = field.heightAt(x, z);

      positions.push(x, height, z);

      const color = terrainColor(field, x, z, height);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let zIndex = 0; zIndex < TERRAIN_SEGMENTS_Z; zIndex += 1) {
    for (let xIndex = 0; xIndex < TERRAIN_SEGMENTS_X; xIndex += 1) {
      const a = zIndex * xCount + xIndex;
      const b = a + 1;
      const c = a + xCount;
      const d = c + 1;

      if ((xIndex + zIndex) % 2 === 0) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, c, d, a, d, b);
      }
    }
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
    flatShading: true,
  });

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = "continent-terrain";
  return mesh;
}

function terrainColor(
  field: WorldField,
  x: number,
  z: number,
  height: number,
): Color {
  if (height < SEA_LEVEL) {
    return new Color(0x395f68);
  }

  const slope = field.slopeAt(x, z);
  const forest = field.forestDensityAt(x, z);
  const riverDistance = field.distanceToRiver(x, z);

  let color: Color;

  if (height < 14) {
    color = new Color(0xb8aa7b);
  } else if (height < 70) {
    color = new Color(0x82936d);
  } else if (height < 155) {
    color = new Color(0x748367);
  } else if (height < 280) {
    color = new Color(0x787a67);
  } else if (height < 430) {
    color = new Color(0x777269);
  } else {
    color = new Color(0x6e6a66);
  }

  if (riverDistance < 150 && height < 105) {
    color.lerp(new Color(0x91a873), 0.28);
  }

  if (forest > 0.46) {
    color.lerp(new Color(0x536a51), Math.min(0.32, forest * 0.28));
  }

  if (slope > 0.78) {
    color.lerp(new Color(0x6d6c65), Math.min(0.55, (slope - 0.78) * 0.7));
  }

  const regionalVariation =
    Math.sin(x * 0.0017 + z * 0.0009) * 0.025 +
    Math.sin(z * 0.0021 - x * 0.0007) * 0.018;

  color.offsetHSL(0, regionalVariation * 0.25, regionalVariation);
  return color;
}

function createWater(): Mesh {
  const geometry = new PlaneGeometry(WORLD_WIDTH + 1600, WORLD_DEPTH + 1600, 1, 1);
  const material = new MeshStandardMaterial({
    color: 0x5e8c99,
    roughness: 0.72,
    metalness: 0.02,
  });
  const water = new Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA_LEVEL + 0.65;
  water.receiveShadow = true;
  water.name = "simple-water";
  return water;
}

function createRiver(field: WorldField, river: RiverPath): Mesh {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const points = river.points;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    if (!current) continue;

    const previous = points[Math.max(0, index - 1)] ?? current;
    const next = points[Math.min(points.length - 1, index + 1)] ?? current;
    const tangentX = next[0] - previous[0];
    const tangentZ = next[1] - previous[1];
    const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentZ));
    const normalX = -tangentZ / tangentLength;
    const normalZ = tangentX / tangentLength;
    const t = points.length <= 1 ? 0 : index / (points.length - 1);
    const width = river.sourceWidth + (river.mouthWidth - river.sourceWidth) * t;
    const y = Math.max(SEA_LEVEL + 0.9, field.heightAt(current[0], current[1]) + 1.2);

    positions.push(
      current[0] + normalX * width,
      y,
      current[1] + normalZ * width,
      current[0] - normalX * width,
      y,
      current[1] - normalZ * width,
    );
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const base = index * 2;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({
    color: 0x4f8291,
    roughness: 0.58,
    metalness: 0,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = "river";
  return mesh;
}

function createForest(field: WorldField): {
  mesh: InstancedMesh;
  geometry: IcosahedronGeometry;
  material: MeshStandardMaterial;
} {
  const geometry = new IcosahedronGeometry(1, 0);
  const material = new MeshStandardMaterial({
    color: 0x405b45,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const mesh = new InstancedMesh(geometry, material, FOREST_INSTANCE_COUNT);
  mesh.name = "forest-masses";
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const random = mulberry32(0x57415231);
  const dummy = new Object3D();
  let accepted = 0;
  let attempts = 0;

  while (accepted < FOREST_INSTANCE_COUNT && attempts < FOREST_INSTANCE_COUNT * 45) {
    attempts += 1;
    const x = (random() - 0.5) * WORLD_WIDTH;
    const z = (random() - 0.5) * WORLD_DEPTH;
    const density = field.forestDensityAt(x, z);

    if (density < 0.48 || random() > density) continue;

    const height = field.heightAt(x, z);
    if (height <= SEA_LEVEL + 4) continue;

    const radius = 1.8 + random() * 2.4;
    const vertical = 3.2 + random() * 3.8;

    dummy.position.set(x, height + vertical * 0.52, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(
      radius * (0.82 + random() * 0.25),
      vertical,
      radius * (0.82 + random() * 0.25),
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(accepted, dummy.matrix);

    accepted += 1;
  }

  mesh.count = accepted;
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material };
}

function createScaleSettlements(field: WorldField): {
  meshes: InstancedMesh[];
  dispose(): void;
} {
  const centers: readonly Point2[] = [
    [-1320, 80],
    [-420, 620],
    [530, -420],
    [1180, 480],
    [1600, -260],
    [240, 1260],
  ];

  const buildingGeometry = new BoxGeometry(1, 1, 1);
  const buildingMaterial = new MeshStandardMaterial({
    color: 0xb6aa87,
    roughness: 0.95,
  });

  const countPerSettlement = 7;
  const mesh = new InstancedMesh(
    buildingGeometry,
    buildingMaterial,
    centers.length * countPerSettlement,
  );
  mesh.name = "scale-settlements";
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const dummy = new Object3D();
  const random = mulberry32(0x5343414c);
  let instance = 0;

  for (const [centerX, centerZ] of centers) {
    for (let local = 0; local < countPerSettlement; local += 1) {
      const angle = (local / countPerSettlement) * Math.PI * 2 + random() * 0.5;
      const radius = local === 0 ? 0 : 12 + random() * 25;
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;
      const height = field.heightAt(x, z);

      const width = local === 0 ? 8 : 4 + random() * 3;
      const depth = local === 0 ? 8 : 4 + random() * 3;
      const buildingHeight = local === 0 ? 10 : 4 + random() * 5;

      dummy.position.set(x, height + buildingHeight * 0.5, z);
      dummy.rotation.set(0, random() * Math.PI, 0);
      dummy.scale.set(width, buildingHeight, depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(instance, dummy.matrix);
      instance += 1;
    }
  }

  mesh.instanceMatrix.needsUpdate = true;

  return {
    meshes: [mesh],
    dispose(): void {
      buildingGeometry.dispose();
      buildingMaterial.dispose();
    },
  };
}

function disposeMaterial(material: Mesh["material"]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
  } else {
    material.dispose();
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
