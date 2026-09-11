import * as THREE from 'three';
import { deterministic01, isLandAt, terrainHeight, type XZ } from '../WorldField';
import { STRATEGIC_TERRITORIES, type StrategicSettlement } from '../StrategicWorld';

interface BuildingInstance {
  readonly position: THREE.Vector3;
  readonly rotation: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly color: THREE.Color;
}

interface FieldInstance {
  readonly position: THREE.Vector3;
  readonly rotation: number;
  readonly width: number;
  readonly depth: number;
  readonly color: THREE.Color;
}

const BUILDING_BASE = new THREE.Color(0xb7aa91);
const BUILDING_DARK = new THREE.Color(0x8f8471);
const FIELD_GREEN = new THREE.Color(0x78815b);
const FIELD_OCHRE = new THREE.Color(0x9a875d);

export function addSettlements(scene: THREE.Scene): void {
  const buildings: BuildingInstance[] = [];
  const fields: FieldInstance[] = [];

  for (const territory of STRATEGIC_TERRITORIES) {
    const settlements = [territory.capital, ...territory.settlements];
    for (const item of settlements) collectSettlement(item, territory.color, buildings, fields);
    addTerritoryLabel(scene, territory.name, territory.capital.position, territory.color);
  }

  addFieldInstances(scene, fields);
  addBuildingInstances(scene, buildings);
  addCapitalMarkers(scene);
}

function collectSettlement(
  settlement: StrategicSettlement,
  territoryColor: number,
  buildings: BuildingInstance[],
  fields: FieldInstance[],
): void {
  const [cx, cz] = settlement.position;
  const capital = settlement.kind === 'capital';
  const buildingCount = capital ? 18 : 7;
  const radius = capital ? 2.5 : 1.25;
  const tint = new THREE.Color(territoryColor);

  for (let i = 0; i < buildingCount; i += 1) {
    const angle = deterministic01(cx, cz, 300 + i) * Math.PI * 2;
    const distance = Math.sqrt(deterministic01(cx, cz, 340 + i)) * radius;
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance * 0.78;
    if (!isLandAt(x, z)) continue;

    const width = (capital ? 0.42 : 0.34) + deterministic01(x, z, 370 + i) * 0.34;
    const depth = 0.34 + deterministic01(x, z, 390 + i) * 0.3;
    const height = (capital ? 0.42 : 0.3) + deterministic01(x, z, 410 + i) * 0.46;
    const baseColor = BUILDING_BASE.clone().lerp(BUILDING_DARK, deterministic01(x, z, 430 + i) * 0.48);
    baseColor.lerp(tint, 0.08);
    buildings.push({
      position: new THREE.Vector3(x, terrainHeight(x, z), z),
      rotation: angle + deterministic01(x, z, 450 + i) * 0.8,
      width,
      depth,
      height,
      color: baseColor,
    });
  }

  const fieldCount = capital ? 7 : 2;
  for (let i = 0; i < fieldCount; i += 1) {
    const angle = (i / fieldCount) * Math.PI * 2 + deterministic01(cx, cz, 500 + i) * 0.62;
    const distance = (capital ? 3.3 : 1.7) + deterministic01(cx, cz, 520 + i) * (capital ? 2.8 : 1.2);
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance * 0.76;
    if (!isLandAt(x, z)) continue;

    fields.push({
      position: new THREE.Vector3(x, terrainHeight(x, z) + 0.045, z),
      rotation: angle + deterministic01(x, z, 540 + i) * 0.5,
      width: 1.05 + deterministic01(x, z, 560 + i) * 1.65,
      depth: 0.48 + deterministic01(x, z, 580 + i) * 0.86,
      color: FIELD_GREEN.clone().lerp(FIELD_OCHRE, deterministic01(x, z, 600 + i) * 0.82),
    });
  }
}

function addBuildingInstances(scene: THREE.Scene, buildings: readonly BuildingInstance[]): void {
  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const roofGeometry = new THREE.ConeGeometry(0.72, 0.42, 4);
  roofGeometry.rotateY(Math.PI / 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, buildings.length);
  const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, buildings.length);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const roofColor = new THREE.Color(0x655d52);

  buildings.forEach((building, index) => {
    quaternion.setFromAxisAngle(yAxis, building.rotation);
    position.set(building.position.x, building.position.y + building.height * 0.5, building.position.z);
    scale.set(building.width, building.height, building.depth);
    matrix.compose(position, quaternion, scale);
    bodies.setMatrixAt(index, matrix);
    bodies.setColorAt(index, building.color);

    position.set(building.position.x, building.position.y + building.height + 0.12, building.position.z);
    scale.set(building.width * 0.72, Math.max(0.28, building.height * 0.42), building.depth * 0.72);
    matrix.compose(position, quaternion, scale);
    roofs.setMatrixAt(index, matrix);
    roofs.setColorAt(index, roofColor);
  });

  bodies.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  scene.add(bodies, roofs);
}

function addFieldInstances(scene: THREE.Scene, fields: readonly FieldInstance[]): void {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, fields.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  fields.forEach((field, index) => {
    quaternion.setFromAxisAngle(yAxis, field.rotation);
    scale.set(field.width, 1, field.depth);
    matrix.compose(field.position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, field.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = 3.7;
  scene.add(mesh);
}

function addCapitalMarkers(scene: THREE.Scene): void {
  const geometry = new THREE.OctahedronGeometry(0.48, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geometry, material, STRATEGIC_TERRITORIES.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(0.8, 1.35, 0.8);

  STRATEGIC_TERRITORIES.forEach((territory, index) => {
    const [x, z] = territory.capital.position;
    const position = new THREE.Vector3(x, terrainHeight(x, z) + 1.55, z);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(territory.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

function addTerritoryLabel(scene: THREE.Scene, name: string, [x, z]: XZ, color: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(12, 18, 20, 0.72)';
  context.fillRect(16, 14, canvas.width - 32, canvas.height - 28);
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.lineWidth = 5;
  context.strokeRect(16, 14, canvas.width - 32, canvas.height - 28);
  context.fillStyle = '#f5f1e8';
  context.font = '600 34px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, canvas.width * 0.5, canvas.height * 0.52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.position.set(x, terrainHeight(x, z) + 4.6, z);
  sprite.scale.set(10.5, 2.65, 1);
  sprite.renderOrder = 8;
  scene.add(sprite);
}
