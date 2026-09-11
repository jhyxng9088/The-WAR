import * as THREE from 'three';
import {
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_WIDTH,
  deterministic01,
  fertilityAt,
  forestDensityAt,
  mountainStrengthAt,
  terrainHeight,
} from '../WorldField';

const COLORS = {
  deepWater: new THREE.Color(0x456f7f),
  shallowWater: new THREE.Color(0x6f9ca0),
  wetSand: new THREE.Color(0xbbaa7b),
  dryGrass: new THREE.Color(0x789360),
  fertileGrass: new THREE.Color(0x8daf6d),
  forestFloor: new THREE.Color(0x536f52),
  highland: new THREE.Color(0x737765),
  rock: new THREE.Color(0x777a72),
};

export function addTerrain(scene: THREE.Scene): void {
  scene.add(createOcean());
  scene.add(createLand());
}

function createOcean(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x4f8292,
      roughness: 0.34,
      metalness: 0.03,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.19;
  mesh.renderOrder = -2;
  return mesh;
}

function createLand(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    WORLD_WIDTH,
    WORLD_DEPTH,
    TERRAIN_SEGMENTS_X,
    TERRAIN_SEGMENTS_Z,
  );

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const height = terrainHeight(x, z);
    positions.setZ(i, height);

    const color = terrainColor(x, z, height);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    }),
  );
}

function terrainColor(x: number, z: number, height: number): THREE.Color {
  let color: THREE.Color;

  if (height < -0.28) {
    color = COLORS.deepWater.clone();
  } else if (height < 0.02) {
    const t = THREE.MathUtils.smoothstep(height, -0.28, 0.02);
    color = COLORS.shallowWater.clone().lerp(COLORS.wetSand, t);
  } else if (height < 0.2) {
    const t = THREE.MathUtils.smoothstep(height, 0.02, 0.2);
    color = COLORS.wetSand.clone().lerp(COLORS.dryGrass, t);
  } else {
    const fertility = fertilityAt(x, z);
    const forest = forestDensityAt(x, z);
    const mountain = mountainStrengthAt(x, z);
    const highland = THREE.MathUtils.smoothstep(height, 0.95, 2.3);

    color = COLORS.dryGrass.clone().lerp(COLORS.fertileGrass, fertility * 0.72);
    color.lerp(COLORS.forestFloor, forest * 0.28);
    color.lerp(COLORS.highland, highland * 0.46);
    color.lerp(COLORS.rock, mountain * highland * 0.52);
  }

  const variation = (deterministic01(x * 3.7, z * 3.7, 19) - 0.5) * 0.045;
  color.offsetHSL(0, variation * 0.3, variation);
  return color;
}
