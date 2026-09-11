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
  const count = Math.max(64, polygon.length * 12);
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
    positions.setXYZ(i, x, terrainHeight(x, z) + 0.048, z);
  }
  geometry.computeVertexNormals();

  const tint = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  tint.renderOrder = 4;
  scene.add(tint);
}

function addBorder(scene: THREE.Scene, color: number, borderPoints: readonly XZ[]): void {
  const samples: RibbonSample[] = borderPoints.map(([x, z]) => ({
    position: new THREE.Vector3(x, terrainHeight(x, z) + 0.078, z),
    width: 0.052,
  }));

  const first = samples[0];
  if (!first) return;
  samples.push({ position: first.position.clone(), width: first.width });

  const border = new THREE.Mesh(
    createRibbonGeometry(samples),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    }),
  );
  border.renderOrder = 5;
  scene.add(border);
}

function addCapital(scene: THREE.Scene, [x, z]: XZ, color: number): void {
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const stone = new THREE.MeshStandardMaterial({ color: 0xd2c7aa, roughness: 0.96 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5d4c39, roughness: 1 });

  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.46), stone);
  keep.position.y = 0.25;
  group.add(keep);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 4), roof);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.y = 0.65;
  group.add(keepRoof);

  const offsets: readonly XZ[] = [
    [-0.54, -0.2], [0.5, -0.26], [-0.34, 0.48], [0.42, 0.42], [0.02, -0.58],
  ];
  for (const [dx, dz] of offsets) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.22), stone);
    house.position.set(dx, 0.1, dz);
    group.add(house);

    const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(0.185, 0.17, 4), roof);
    houseRoof.rotation.y = Math.PI / 4;
    houseRoof.position.set(dx, 0.285, dz);
    group.add(houseRoof);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 6), wood);
  mast.position.set(0.28, 0.78, 0.1);
  group.add(mast);

  const flagGeometry = new THREE.PlaneGeometry(0.32, 0.17);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  flag.position.set(0.43, 0.96, 0.1);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);

  scene.add(group);
}
