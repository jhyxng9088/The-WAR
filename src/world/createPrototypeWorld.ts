import * as THREE from 'three';

const LAND_WIDTH = 30;
const LAND_DEPTH = 23;
const SEGMENTS_X = 64;
const SEGMENTS_Z = 48;

export function createPrototypeWorld(scene: THREE.Scene): void {
  addLighting(scene);
  addOcean(scene);
  addTerrain(scene);
  addRiver(scene);
  addForest(scene);

  addTerritory(scene, 0x4e86ff, [
    [-8.8, 3.8],
    [-6.0, 5.4],
    [-2.7, 4.7],
    [-1.2, 2.0],
    [-2.6, -0.4],
    [-6.3, -1.0],
    [-9.1, 1.0],
  ]);

  addTerritory(scene, 0xef6a69, [
    [2.4, -0.2],
    [5.2, -1.9],
    [8.9, -1.0],
    [10.0, -4.0],
    [7.6, -6.5],
    [3.9, -5.8],
    [1.4, -3.3],
  ]);

  addCapital(scene, -5.9, 2.1, 0x4e86ff);
  addCapital(scene, 6.7, -3.7, 0xef6a69);
}

function addLighting(scene: THREE.Scene): void {
  const hemisphere = new THREE.HemisphereLight(0xe7f4ff, 0x56654a, 2.25);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff3d2, 2.8);
  sun.position.set(-9, 18, 7);
  scene.add(sun);
}

function addOcean(scene: THREE.Scene): void {
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshPhongMaterial({
      color: 0x6f9fad,
      transparent: true,
      opacity: 0.92,
      shininess: 36,
    }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0;
  ocean.renderOrder = -1;
  scene.add(ocean);
}

function addTerrain(scene: THREE.Scene): void {
  const geometry = new THREE.PlaneGeometry(
    LAND_WIDTH,
    LAND_DEPTH,
    SEGMENTS_X,
    SEGMENTS_Z,
  );
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const height = heightAt(x, z);
    positions.setZ(i, height);

    const color = terrainColor(x, z, height);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      flatShading: false,
    }),
  );

  scene.add(terrain);
}

function addRiver(scene: THREE.Scene): void {
  const riverXZ: Array<[number, number]> = [
    [6.4, -1.3],
    [4.6, -0.9],
    [3.1, 0.0],
    [1.6, 0.5],
    [0.4, 1.4],
    [-1.2, 1.8],
    [-2.8, 2.9],
    [-4.7, 4.0],
    [-6.5, 5.7],
  ];

  const curve = new THREE.CatmullRomCurve3(
    riverXZ.map(([x, z]) => new THREE.Vector3(x, Math.max(0.05, heightAt(x, z) + 0.06), z)),
  );

  const river = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 72, 0.16, 7, false),
    new THREE.MeshPhongMaterial({
      color: 0x5aa9cc,
      emissive: 0x17333e,
      shininess: 80,
    }),
  );

  scene.add(river);
}

function addForest(scene: THREE.Scene): void {
  const points: THREE.Vector3[] = [];

  for (let x = -11; x <= 11; x += 1.05) {
    for (let z = -8; z <= 8; z += 1.05) {
      const jitterX = Math.sin(x * 4.71 + z * 1.63) * 0.28;
      const jitterZ = Math.cos(z * 5.17 - x * 1.29) * 0.28;
      const px = x + jitterX;
      const pz = z + jitterZ;
      const height = heightAt(px, pz);

      if (height > 0.2 && height < 1.25 && forestSignal(px, pz) > 0.58) {
        points.push(new THREE.Vector3(px, height + 0.26, pz));
      }
    }
  }

  const geometry = new THREE.ConeGeometry(0.22, 0.65, 6);
  const material = new THREE.MeshStandardMaterial({ color: 0x355f45, roughness: 1 });
  const trees = new THREE.InstancedMesh(geometry, material, points.length);
  const matrix = new THREE.Matrix4();

  points.forEach((point, index) => {
    const scale = 0.78 + ((Math.sin(index * 9.17) + 1) * 0.12);
    matrix.compose(
      point,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), index * 1.71),
      new THREE.Vector3(scale, scale, scale),
    );
    trees.setMatrixAt(index, matrix);
  });

  trees.instanceMatrix.needsUpdate = true;
  scene.add(trees);
}

function addTerritory(
  scene: THREE.Scene,
  color: number,
  points: Array<[number, number]>,
): void {
  const center = points.reduce(
    (sum, [x, z]) => ({ x: sum.x + x / points.length, z: sum.z + z / points.length }),
    { x: 0, z: 0 },
  );

  const vertices: number[] = [center.x, heightAt(center.x, center.z) + 0.11, center.z];
  for (const [x, z] of points) {
    vertices.push(x, heightAt(x, z) + 0.11, z);
  }

  const indices: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    indices.push(0, i + 1, ((i + 1) % points.length) + 1);
  }

  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  fillGeometry.setIndex(indices);
  fillGeometry.computeVertexNormals();

  const fill = new THREE.Mesh(
    fillGeometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.renderOrder = 2;
  scene.add(fill);

  const borderPositions: number[] = [];
  for (const [x, z] of points) {
    borderPositions.push(x, heightAt(x, z) + 0.16, z);
  }

  const borderGeometry = new THREE.BufferGeometry();
  borderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(borderPositions, 3));
  const border = new THREE.LineLoop(
    borderGeometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.94 }),
  );
  border.renderOrder = 3;
  scene.add(border);
}

function addCapital(scene: THREE.Scene, x: number, z: number, color: number): void {
  const y = heightAt(x, z);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8dfc9, roughness: 0.9 }),
  );
  base.position.set(x, y + 0.17, z);
  scene.add(base);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 0.34, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  roof.position.set(x, y + 0.5, z);
  scene.add(roof);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  marker.position.set(x, y + 0.88, z);
  scene.add(marker);
}

function terrainColor(x: number, z: number, height: number): THREE.Color {
  if (height < -0.05) return new THREE.Color(0x577b82);
  if (height < 0.17) return new THREE.Color(0xc9ba83);
  if (height > 1.5) return new THREE.Color(0x7c817b);
  if (height > 1.05) return new THREE.Color(0x77806f);
  if (forestSignal(x, z) > 0.52) return new THREE.Color(0x557958);
  return new THREE.Color(0x83a66b);
}

function forestSignal(x: number, z: number): number {
  const westPatch = gaussian(x, z, -6.7, -2.4, 11, 8);
  const northPatch = gaussian(x, z, 1.8, 5.0, 9, 5);
  const texture = (Math.sin(x * 0.92) + Math.cos(z * 1.13)) * 0.11;
  return Math.max(westPatch, northPatch) + texture;
}

function heightAt(x: number, z: number): number {
  const ellipse = Math.sqrt((x * x) / (13.4 * 13.4) + (z * z) / (9.8 * 9.8));
  const coastNoise =
    Math.sin(x * 0.72) * 0.055 +
    Math.cos(z * 0.91) * 0.05 +
    Math.sin((x + z) * 1.37) * 0.028;
  const island = 1 - ellipse + coastNoise;

  if (island <= 0) return -0.7 + island * 0.8;

  const ridge = gaussian(x, z, 5.3, -1.9, 14, 3.2) * 1.85;
  const northernRise = gaussian(x, z, 2.4, 5.2, 17, 5.5) * 0.62;
  const rolling = (Math.sin(x * 0.55) * Math.cos(z * 0.49) + 1) * 0.08;

  return 0.14 + island * 0.64 + ridge + northernRise + rolling;
}

function gaussian(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  spreadX: number,
  spreadZ: number,
): number {
  const dx = x - centerX;
  const dz = z - centerZ;
  return Math.exp(-((dx * dx) / spreadX + (dz * dz) / spreadZ));
}
