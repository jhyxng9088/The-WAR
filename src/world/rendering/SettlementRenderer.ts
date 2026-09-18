import * as THREE from 'three';
import { deterministic01, isLandAt, terrainHeight, type XZ } from '../WorldField';
import { NATIONS, type StrategicSettlement } from '../StrategicWorld';

interface BuildingInstance {
  readonly position: THREE.Vector3;
  readonly rotation: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly wallColor: THREE.Color;
  readonly roofColor: THREE.Color;
}

interface FieldInstance {
  readonly position: THREE.Vector3;
  readonly rotation: number;
  readonly width: number;
  readonly depth: number;
  readonly color: THREE.Color;
}

const WALL_LIGHT = new THREE.Color(0xd7ceb5);
const WALL_DARK = new THREE.Color(0xb7a989);
const FIELD_GREEN = new THREE.Color(0x8fa861);
const FIELD_GOLD = new THREE.Color(0xc5ad61);

export function addSettlements(scene: THREE.Scene): void {
  const buildings: BuildingInstance[] = [];
  const fields: FieldInstance[] = [];

  for (const nation of NATIONS) {
    collectSettlement(nation.capital, nation.color, buildings, fields);
    addTerritoryLabel(scene, nation.name, nation.capital.position, nation.color);
  }

  addFieldInstances(scene, fields);
  addBuildingInstances(scene, buildings);
  addCapitalKeeps(scene);
}

function collectSettlement(
  settlement: StrategicSettlement,
  territoryColor: number,
  buildings: BuildingInstance[],
  fields: FieldInstance[],
): void {
  const [cx, cz] = settlement.position;
  const capital = settlement.kind === 'capital';
  const buildingCount = capital ? 12 : 5;
  const radius = capital ? 7.2 : 4.4;
  const tint = new THREE.Color(territoryColor);

  for (let i = 0; i < buildingCount; i += 1) {
    const angle = deterministic01(cx, cz, 300 + i) * Math.PI * 2;
    const minDistance = capital ? 3.8 : 1.2;
    const distance = minDistance
      + Math.sqrt(deterministic01(cx, cz, 340 + i)) * (radius - minDistance);
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance * 0.82;
    if (!isLandAt(x, z)) continue;

    const width = (capital ? 1.35 : 1.1) + deterministic01(x, z, 370 + i) * 0.85;
    const depth = 1.05 + deterministic01(x, z, 390 + i) * 0.75;
    const height = (capital ? 1.6 : 1.3) + deterministic01(x, z, 410 + i) * 1.05;

    const wallColor = WALL_LIGHT.clone().lerp(
      WALL_DARK,
      deterministic01(x, z, 430 + i) * 0.48,
    );
    wallColor.lerp(tint, 0.08);

    const roofColor = new THREE.Color(0x8b674c).lerp(
      tint,
      0.24 + deterministic01(x, z, 435 + i) * 0.08,
    );

    buildings.push({
      position: new THREE.Vector3(x, terrainHeight(x, z), z),
      rotation: angle + deterministic01(x, z, 450 + i) * 0.8,
      width,
      depth,
      height,
      wallColor,
      roofColor,
    });
  }

  const fieldCount = capital ? 8 : 3;
  for (let i = 0; i < fieldCount; i += 1) {
    const angle = (i / fieldCount) * Math.PI * 2 + deterministic01(cx, cz, 500 + i) * 0.62;
    const distance = (capital ? 8.5 : 5.2) + deterministic01(cx, cz, 520 + i) * (capital ? 8 : 3.6);
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance * 0.78;
    if (!isLandAt(x, z)) continue;

    fields.push({
      position: new THREE.Vector3(x, terrainHeight(x, z) + 0.14, z),
      rotation: angle + deterministic01(x, z, 540 + i) * 0.5,
      width: 4.2 + deterministic01(x, z, 560 + i) * 4.8,
      depth: 2.0 + deterministic01(x, z, 580 + i) * 2.8,
      color: FIELD_GREEN.clone().lerp(FIELD_GOLD, deterministic01(x, z, 600 + i) * 0.82),
    });
  }
}

function addBuildingInstances(scene: THREE.Scene, buildings: readonly BuildingInstance[]): void {
  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  const roofGeometry = new THREE.ConeGeometry(0.76, 0.72, 4);
  roofGeometry.rotateY(Math.PI / 4);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  });

  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, buildings.length);
  const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, buildings.length);
  bodies.name = 'stylized-house-bodies';
  roofs.name = 'stylized-house-roofs';

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  buildings.forEach((building, index) => {
    quaternion.setFromAxisAngle(yAxis, building.rotation);

    position.set(
      building.position.x,
      building.position.y + building.height * 0.5,
      building.position.z,
    );
    scale.set(building.width, building.height, building.depth);
    matrix.compose(position, quaternion, scale);
    bodies.setMatrixAt(index, matrix);
    bodies.setColorAt(index, building.wallColor);

    position.set(
      building.position.x,
      building.position.y + building.height + 0.31,
      building.position.z,
    );
    scale.set(building.width * 0.96, 0.86 + building.height * 0.14, building.depth * 0.96);
    matrix.compose(position, quaternion, scale);
    roofs.setMatrixAt(index, matrix);
    roofs.setColorAt(index, building.roofColor);
  });

  bodies.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  roofs.castShadow = true;
  roofs.receiveShadow = true;
  scene.add(bodies, roofs);
}

function addFieldInstances(scene: THREE.Scene, fields: readonly FieldInstance[]): void {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, fields.length);
  mesh.name = 'stylized-farm-fields';

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
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function addCapitalKeeps(scene: THREE.Scene): void {
  const keepGeometry = new THREE.BoxGeometry(1, 1, 1);
  const keepMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
  });
  const towerGeometry = new THREE.CylinderGeometry(0.78, 0.9, 4.0, 6);
  const towerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  const roofGeometry = new THREE.ConeGeometry(1.18, 1.5, 6);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
  });

  const keeps = new THREE.InstancedMesh(
    keepGeometry,
    keepMaterial,
    NATIONS.length,
  );
  const towers = new THREE.InstancedMesh(
    towerGeometry,
    towerMaterial,
    NATIONS.length * 4,
  );
  const roofs = new THREE.InstancedMesh(
    roofGeometry,
    roofMaterial,
    NATIONS.length * 4,
  );
  keeps.name = 'stylized-capital-keeps';
  towers.name = 'stylized-capital-towers';
  roofs.name = 'stylized-capital-roofs';

  const matrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const keepScale = new THREE.Vector3(5.4, 3.2, 4.6);
  const wallBase = new THREE.Color(0xd9d3bd);
  let towerIndex = 0;

  NATIONS.forEach((territory, territoryIndex) => {
    const [x, z] = territory.capital.position;
    const baseY = terrainHeight(x, z);
    const territoryColor = new THREE.Color(territory.color);
    const wallColor = wallBase.clone().lerp(territoryColor, 0.10);

    matrix.compose(
      new THREE.Vector3(x, baseY + 1.6, z),
      identity,
      keepScale,
    );
    keeps.setMatrixAt(territoryIndex, matrix);
    keeps.setColorAt(territoryIndex, wallColor);

    const offsets = [
      [-2.3, -1.95],
      [2.3, -1.95],
      [-2.3, 1.95],
      [2.3, 1.95],
    ] as const;

    for (const [dx, dz] of offsets) {
      const tx = x + dx;
      const tz = z + dz;
      const ty = terrainHeight(tx, tz);

      matrix.compose(
        new THREE.Vector3(tx, ty + 2.0, tz),
        identity,
        new THREE.Vector3(1, 1, 1),
      );
      towers.setMatrixAt(towerIndex, matrix);
      towers.setColorAt(towerIndex, wallColor);

      matrix.compose(
        new THREE.Vector3(tx, ty + 4.75, tz),
        identity,
        new THREE.Vector3(1, 1, 1),
      );
      roofs.setMatrixAt(towerIndex, matrix);
      roofs.setColorAt(towerIndex, territoryColor);
      towerIndex += 1;
    }
  });

  for (const mesh of [keeps, towers, roofs]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  scene.add(keeps, towers, roofs);
}

function addTerritoryLabel(scene: THREE.Scene, name: string, [x, z]: XZ, color: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return;

  const radius = 24;
  const left = 22;
  const top = 20;
  const width = canvas.width - 44;
  const height = canvas.height - 40;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  context.roundRect(left, top, width, height, radius);
  context.fillStyle = 'rgba(28, 42, 45, 0.78)';
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.stroke();

  context.fillStyle = '#fffaf0';
  context.font = '700 42px Inter, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, canvas.width * 0.5, canvas.height * 0.52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.position.set(x, terrainHeight(x, z) + 11.5, z);
  sprite.scale.set(18, 4.5, 1);
  sprite.renderOrder = 8;
  scene.add(sprite);
}
