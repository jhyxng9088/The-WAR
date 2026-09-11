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
      opacity: 0.036,
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
    width: 0.07,
  }));

  const first = samples[0];
  if (!first) return;
  samples.push({ position: first.position.clone(), width: first.width });

  const border = new THREE.Mesh(
    createRibbonGeometry(samples),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
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
  group.scale.setScalar(1.28);

  const stone = new THREE.MeshStandardMaterial({ color: 0xd2c7aa, roughness: 0.96 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5d4c39, roughness: 1 });

  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.56), stone);
  keep.position.y = 0.34;
  group.add(keep);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.34, 4), roof);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.y = 0.83;
  group.add(keepRoof);

  const offsets: readonly XZ[] = [
    [-0.72, -0.28], [0.68, -0.34], [-0.5, 0.62], [0.58, 0.58], [0.02, -0.78],
    [-0.88, 0.22], [0.86, 0.2],
  ];
  for (const [dx, dz] of offsets) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.22, 0.25), stone);
    house.position.set(dx, 0.11, dz);
    group.add(house);

    const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(0.205, 0.18, 4), roof);
    houseRoof.rotation.y = Math.PI / 4;
    houseRoof.position.set(dx, 0.31, dz);
    group.add(houseRoof);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 6), wood);
  mast.position.set(0.36, 0.98, 0.12);
  group.add(mast);

  const flagGeometry = new THREE.PlaneGeometry(0.38, 0.19);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  flag.position.set(0.55, 1.16, 0.12);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);

  scene.add(group);
}
