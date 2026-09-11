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
  deepWater: new THREE.Color(0x315f70),
  shallowWater: new THREE.Color(0x4f8790),
  wetSand: new THREE.Color(0xa89c70),
  dryGrass: new THREE.Color(0x6f8754),
  fertileGrass: new THREE.Color(0x7fa45b),
  forestFloor: new THREE.Color(0x465f43),
  highland: new THREE.Color(0x676b58),
  rock: new THREE.Color(0x73736c),
};

export function addTerrain(scene: THREE.Scene): void {
  scene.add(createOcean());
  scene.add(createLand());
}

function createOcean(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x376f80,
      roughness: 0.42,
      metalness: 0.025,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.2;
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
      roughness: 0.985,
      metalness: 0,
    }),
  );
}

function terrainColor(x: number, z: number, height: number): THREE.Color {
  let color: THREE.Color;

  if (height < -0.3) {
    color = COLORS.deepWater.clone();
  } else if (height < 0.025) {
    const t = THREE.MathUtils.smoothstep(height, -0.3, 0.025);
    color = COLORS.shallowWater.clone().lerp(COLORS.wetSand, t);
  } else if (height < 0.2) {
    const t = THREE.MathUtils.smoothstep(height, 0.025, 0.2);
    color = COLORS.wetSand.clone().lerp(COLORS.dryGrass, t);
  } else {
    const fertility = fertilityAt(x, z);
    const forest = forestDensityAt(x, z);
    const mountain = mountainStrengthAt(x, z);
    const highland = THREE.MathUtils.smoothstep(height, 1.05, 2.7);

    color = COLORS.dryGrass.clone().lerp(COLORS.fertileGrass, fertility * 0.8);
    color.lerp(COLORS.forestFloor, forest * 0.3);
    color.lerp(COLORS.highland, highland * 0.52);
    color.lerp(COLORS.rock, mountain * highland * 0.62);
  }

  const broadVariation = (deterministic01(x * 0.72, z * 0.72, 13) - 0.5) * 0.055;
  const fineVariation = (deterministic01(x * 3.2, z * 3.2, 19) - 0.5) * 0.032;
  color.offsetHSL(0, broadVariation * 0.24, broadVariation + fineVariation);
  return color;
}
