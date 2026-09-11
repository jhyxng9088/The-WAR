import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { terrainHeight, type XZ } from '../WorldField';

export interface TerritoryVisual {
  color: number;
  polygon: readonly XZ[];
  capital: XZ;
}

export function addTerritory(scene: THREE.Scene, territory: TerritoryVisual): void {
  if (territory.polygon.length < 3) {
    throw new Error('A territory polygon requires at least three points.');
  }

  const borderPoints = sampleSmoothBorder(territory.polygon);
  addTint(scene, territory.color, borderPoints);
  addBorder(scene, territory.color, borderPoints);
  addApproachRoads(scene, territory.capital, territory.polygon);
  addCapital(scene, territory.capital, territory.color);
}

function sampleSmoothBorder(polygon: readonly XZ[]): XZ[] {
  const curve = new THREE.CatmullRomCurve3(
    polygon.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.38,
  );

  const samples: XZ[] = [];
  const count = Math.max(72, polygon.length * 14);
  for (let i = 0; i < count; i += 1) {
    const point = curve.getPoint(i / count);
    samples.push([point.x, point.z]);
  }
  return samples;
}

function addTint(scene: THREE.Scene, color: number, borderPoints: readonly XZ[]): void {
  const first = borderPoints[0];
  if (!first) return;

  const shape = new THREE.Shape();
  shape.moveTo(first[0], first[1]);
  for (let i = 1; i < borderPoints.length; i += 1) {
    const point = borderPoints[i];
    if (!point) continue;
    shape.lineTo(point[0], point[1]);
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    positions.setXYZ(i, x, terrainHeight(x, z) + 0.045, z);
  }
  geometry.computeVertexNormals();

  const tint = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.03,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  tint.renderOrder = 4;
  scene.add(tint);
}

function addBorder(scene: THREE.Scene, color: number, borderPoints: readonly XZ[]): void {
  const samples: RibbonSample[] = borderPoints.map(([x, z]) => ({
    position: new THREE.Vector3(x, terrainHeight(x, z) + 0.07, z),
    width: 0.075,
  }));

  const first = samples[0];
  if (!first) return;
  samples.push({ position: first.position.clone(), width: first.width });

  const border = new THREE.Mesh(
    createRibbonGeometry(samples),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  border.renderOrder = 5;
  scene.add(border);
}

function addApproachRoads(scene: THREE.Scene, capital: XZ, polygon: readonly XZ[]): void {
  const targets = [polygon[0], polygon[2], polygon[4]].filter((point): point is XZ => Boolean(point));

  for (const [targetX, targetZ] of targets) {
    const [capitalX, capitalZ] = capital;
    const endX = THREE.MathUtils.lerp(capitalX, targetX, 0.46);
    const endZ = THREE.MathUtils.lerp(capitalZ, targetZ, 0.46);
    const samples: RibbonSample[] = [];
    const sampleCount = 18;

    for (let i = 0; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      const curve = t * t * (3 - 2 * t);
      const bend = Math.sin(t * Math.PI) * 0.18;
      const x = THREE.MathUtils.lerp(capitalX, endX, t) + bend * (targetZ > capitalZ ? 1 : -1);
      const z = THREE.MathUtils.lerp(capitalZ, endZ, t) + bend * (targetX > capitalX ? -1 : 1);
      samples.push({
        position: new THREE.Vector3(x, terrainHeight(x, z) + 0.052, z),
        width: THREE.MathUtils.lerp(0.16, 0.1, curve),
      });
    }

    const road = new THREE.Mesh(
      createRibbonGeometry(samples),
      new THREE.MeshBasicMaterial({
        color: 0x8e8265,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    road.renderOrder = 4;
    scene.add(road);
  }
}

function addCapital(scene: THREE.Scene, [x, z]: XZ, color: number): void {
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(1.42);

  const stone = new THREE.MeshStandardMaterial({ color: 0xc9bea3, roughness: 0.96 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x8f8877, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x55483a, roughness: 1 });

  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.74, 0.62), stone);
  keep.position.y = 0.37;
  group.add(keep);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.47, 0.37, 4), roof);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.y = 0.92;
  group.add(keepRoof);

  addWall(group, 0, 0.14, -0.78, 1.56, 0.22, 0.13, darkStone);
  addWall(group, 0, 0.14, 0.78, 1.56, 0.22, 0.13, darkStone);
  addWall(group, -0.78, 0.14, 0, 0.13, 0.22, 1.56, darkStone);
  addWall(group, 0.78, 0.14, 0, 0.13, 0.22, 1.56, darkStone);

  const towerGeometry = new THREE.CylinderGeometry(0.13, 0.15, 0.4, 8);
  const towerRoofGeometry = new THREE.ConeGeometry(0.17, 0.18, 8);
  const towerOffsets: readonly XZ[] = [
    [-0.78, -0.78], [0.78, -0.78], [-0.78, 0.78], [0.78, 0.78],
  ];
  for (const [dx, dz] of towerOffsets) {
    const tower = new THREE.Mesh(towerGeometry, stone);
    tower.position.set(dx, 0.2, dz);
    group.add(tower);

    const towerRoof = new THREE.Mesh(towerRoofGeometry, roof);
    towerRoof.position.set(dx, 0.49, dz);
    group.add(towerRoof);
  }

  const houses: readonly [number, number, number, number][] = [
    [-0.46, -0.34, 0.25, 0.0],
    [0.42, -0.38, 0.23, 0.22],
    [-0.4, 0.4, 0.22, -0.18],
    [0.44, 0.36, 0.24, 0.12],
    [0.04, -0.56, 0.2, -0.08],
    [-1.08, -0.2, 0.24, 0.22],
    [1.04, 0.12, 0.22, -0.18],
    [-0.94, 0.54, 0.2, 0.08],
    [0.9, -0.56, 0.22, 0.18],
    [-0.28, 1.02, 0.21, -0.14],
    [0.36, 1.08, 0.2, 0.2],
    [0.2, -1.08, 0.22, -0.2],
  ];
  for (const [dx, dz, size, rotation] of houses) {
    addHouse(group, dx, dz, size, rotation, stone, roof);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), wood);
  mast.position.set(0.38, 1.08, 0.12);
  group.add(mast);

  const flagGeometry = new THREE.PlaneGeometry(0.42, 0.21);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  flag.position.set(0.59, 1.3, 0.12);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);

  scene.add(group);
}

function addWall(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  wall.position.set(x, y, z);
  group.add(wall);
}

function addHouse(
  group: THREE.Group,
  x: number,
  z: number,
  size: number,
  rotation: number,
  stone: THREE.Material,
  roof: THREE.Material,
): void {
  const houseGroup = new THREE.Group();
  houseGroup.position.set(x, 0, z);
  houseGroup.rotation.y = rotation;

  const house = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.72, size * 0.88), stone);
  house.position.y = size * 0.36;
  houseGroup.add(house);

  const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.72, size * 0.55, 4), roof);
  houseRoof.rotation.y = Math.PI / 4;
  houseRoof.position.y = size * 0.93;
  houseGroup.add(houseRoof);

  group.add(houseGroup);
}
