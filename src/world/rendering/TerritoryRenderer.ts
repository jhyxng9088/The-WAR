import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { deterministic01, terrainHeight, type XZ } from '../WorldField';

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
  addRegionalLandUse(scene, territory.capital, territory.polygon, territory.color);
  addApproachRoads(scene, territory.capital, territory.polygon);
  addCapitalMarker(scene, territory.capital, territory.color);
}

function sampleSmoothBorder(polygon: readonly XZ[]): XZ[] {
  const curve = new THREE.CatmullRomCurve3(
    polygon.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.38,
  );

  const samples: XZ[] = [];
  const count = Math.max(84, polygon.length * 16);
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
    positions.setXYZ(i, x, terrainHeight(x, z) + 0.055, z);
  }
  geometry.computeVertexNormals();

  const tint = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.072,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  tint.renderOrder = 3.8;
  scene.add(tint);
}

function addBorder(scene: THREE.Scene, color: number, borderPoints: readonly XZ[]): void {
  const samples: RibbonSample[] = borderPoints.map(([x, z]) => ({
    position: new THREE.Vector3(x, terrainHeight(x, z) + 0.088, z),
    width: 0.14,
  }));

  const first = samples[0];
  if (!first) return;
  samples.push({ position: first.position.clone(), width: first.width });

  const border = new THREE.Mesh(
    createRibbonGeometry(samples),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  border.renderOrder = 4.4;
  scene.add(border);
}

function addRegionalLandUse(
  scene: THREE.Scene,
  capital: XZ,
  polygon: readonly XZ[],
  color: number,
): void {
  const [capitalX, capitalZ] = capital;
  const fieldGeometry = new THREE.PlaneGeometry(1, 1);
  fieldGeometry.rotateX(-Math.PI / 2);
  const fieldMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const fieldCount = 14;
  const fields = new THREE.InstancedMesh(fieldGeometry, fieldMaterial, fieldCount);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const greenField = new THREE.Color(0x788159);
  const ochreField = new THREE.Color(0x91845d);

  for (let i = 0; i < fieldCount; i += 1) {
    const angle = (i / fieldCount) * Math.PI * 2 + deterministic01(capitalX, capitalZ, i + 71) * 0.5;
    const distance = 2.6 + deterministic01(capitalX, capitalZ, i + 83) * 3.6;
    const x = capitalX + Math.cos(angle) * distance;
    const z = capitalZ + Math.sin(angle) * distance * 0.74;
    const y = terrainHeight(x, z) + 0.046;
    const width = 1.1 + deterministic01(x, z, 91) * 1.45;
    const depth = 0.48 + deterministic01(x, z, 97) * 0.72;

    quaternion.setFromAxisAngle(yAxis, angle + (deterministic01(x, z, 101) - 0.5) * 0.5);
    position.set(x, y, z);
    scale.set(width, 1, depth);
    matrix.compose(position, quaternion, scale);
    fields.setMatrixAt(i, matrix);
    fields.setColorAt(i, greenField.clone().lerp(ochreField, deterministic01(x, z, 103) * 0.78));
  }
  fields.instanceMatrix.needsUpdate = true;
  if (fields.instanceColor) fields.instanceColor.needsUpdate = true;
  fields.renderOrder = 3.5;
  scene.add(fields);

  const settlementGeometry = new THREE.CylinderGeometry(0.24, 0.3, 0.09, 8);
  const settlementMaterial = new THREE.MeshStandardMaterial({ color: 0xb0a38b, roughness: 1 });
  const settlementCount = 6;
  const settlements = new THREE.InstancedMesh(settlementGeometry, settlementMaterial, settlementCount);

  for (let i = 0; i < settlementCount; i += 1) {
    const target = polygon[(i * 2 + 1) % polygon.length];
    if (!target) continue;
    const t = 0.22 + i * 0.025;
    const x = THREE.MathUtils.lerp(capitalX, target[0], t);
    const z = THREE.MathUtils.lerp(capitalZ, target[1], t);
    const y = terrainHeight(x, z) + 0.045;
    const s = 0.85 + deterministic01(x, z, 121) * 0.45;

    position.set(x, y, z);
    quaternion.identity();
    scale.setScalar(s);
    matrix.compose(position, quaternion, scale);
    settlements.setMatrixAt(i, matrix);
  }
  settlements.instanceMatrix.needsUpdate = true;
  scene.add(settlements);

  const district = new THREE.Mesh(
    new THREE.CircleGeometry(2.15, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  district.rotation.x = -Math.PI / 2;
  district.position.set(capitalX, terrainHeight(capitalX, capitalZ) + 0.052, capitalZ);
  district.scale.set(1.28, 0.78, 1);
  district.renderOrder = 3.7;
  scene.add(district);
}

function addApproachRoads(scene: THREE.Scene, capital: XZ, polygon: readonly XZ[]): void {
  const targets = [polygon[0], polygon[2], polygon[4]].filter((point): point is XZ => Boolean(point));

  for (const [targetX, targetZ] of targets) {
    const [capitalX, capitalZ] = capital;
    const endX = THREE.MathUtils.lerp(capitalX, targetX, 0.48);
    const endZ = THREE.MathUtils.lerp(capitalZ, targetZ, 0.48);
    const samples: RibbonSample[] = [];
    const sampleCount = 20;

    for (let i = 0; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      const bend = Math.sin(t * Math.PI) * 0.26;
      const x = THREE.MathUtils.lerp(capitalX, endX, t) + bend * (targetZ > capitalZ ? 1 : -1);
      const z = THREE.MathUtils.lerp(capitalZ, endZ, t) + bend * (targetX > capitalX ? -1 : 1);
      samples.push({
        position: new THREE.Vector3(x, terrainHeight(x, z) + 0.062, z),
        width: THREE.MathUtils.lerp(0.16, 0.08, t),
      });
    }

    const road = new THREE.Mesh(
      createRibbonGeometry(samples),
      new THREE.MeshBasicMaterial({
        color: 0x82755e,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
    );
    road.renderOrder = 4;
    scene.add(road);
  }
}

function addCapitalMarker(scene: THREE.Scene, [x, z]: XZ, color: number): void {
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.02, 0.13, 12),
    new THREE.MeshStandardMaterial({ color: 0xa99f8c, roughness: 1 }),
  );
  foundation.position.y = 0.065;
  group.add(foundation);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.44, 0.24, 10),
    new THREE.MeshStandardMaterial({ color: 0xc0b49b, roughness: 0.96 }),
  );
  hub.position.y = 0.22;
  group.add(hub);

  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26, 0),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
  );
  marker.position.y = 0.58;
  marker.scale.y = 1.35;
  group.add(marker);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.72, 6),
    new THREE.MeshStandardMaterial({ color: 0x4b443a, roughness: 1 }),
  );
  mast.position.set(0.42, 0.48, 0);
  group.add(mast);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.2),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  flag.position.set(0.63, 0.72, 0);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);

  scene.add(group);
}
