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

  addTint(scene, territory);
  addBorder(scene, territory);
  addCapital(scene, territory.capital, territory.color);
}

function addTint(scene: THREE.Scene, territory: TerritoryVisual): void {
  const shape = new THREE.Shape();
  territory.polygon.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    positions.setXYZ(i, x, terrainHeight(x, z) + 0.055, z);
  }
  geometry.computeVertexNormals();

  const tint = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: territory.color,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  tint.renderOrder = 4;
  scene.add(tint);
}

function addBorder(scene: THREE.Scene, territory: TerritoryVisual): void {
  const first = territory.polygon[0];
  if (!first) return;

  const samples: RibbonSample[] = [];
  const points: readonly XZ[] = [...territory.polygon, first];

  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    if (!current || !next) continue;

    const [ax, az] = current;
    const [bx, bz] = next;
    const subdivisions = 10;

    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const x = THREE.MathUtils.lerp(ax, bx, t);
      const z = THREE.MathUtils.lerp(az, bz, t);
      samples.push({
        position: new THREE.Vector3(x, terrainHeight(x, z) + 0.085, z),
        width: 0.065,
      });
    }
  }

  const last = points[points.length - 1];
  if (!last) return;
  const [x, z] = last;
  samples.push({ position: new THREE.Vector3(x, terrainHeight(x, z) + 0.085, z), width: 0.065 });

  const border = new THREE.Mesh(
    createRibbonGeometry(samples),
    new THREE.MeshBasicMaterial({ color: territory.color, transparent: true, opacity: 0.78 }),
  );
  border.renderOrder = 5;
  scene.add(border);
}

function addCapital(scene: THREE.Scene, [x, z]: XZ, color: number): void {
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const stone = new THREE.MeshStandardMaterial({ color: 0xd7cfb8, roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });

  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.42), stone);
  keep.position.y = 0.24;
  group.add(keep);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 4), roof);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.y = 0.62;
  group.add(keepRoof);

  const offsets: readonly XZ[] = [
    [-0.42, -0.18], [0.4, -0.22], [-0.28, 0.38], [0.34, 0.34],
  ];
  for (const [dx, dz] of offsets) {
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.2, 0.2), stone);
    house.position.set(dx, 0.1, dz);
    group.add(house);
    const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 4), roof);
    houseRoof.rotation.y = Math.PI / 4;
    houseRoof.position.set(dx, 0.28, dz);
    group.add(houseRoof);
  }

  const beacon = new THREE.PointLight(color, 0.55, 2.4, 2);
  beacon.position.set(0, 0.72, 0);
  group.add(beacon);
  scene.add(group);
}
