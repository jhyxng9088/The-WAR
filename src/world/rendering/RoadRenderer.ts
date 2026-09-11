import * as THREE from 'three';
import { createRibbonGeometry, type RibbonSample } from '../../rendering/geometry/createRibbonGeometry';
import { terrainHeight } from '../WorldField';
import { STRATEGIC_ROADS, type StrategicRoad } from '../StrategicWorld';

const ROAD_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x8e8065,
  transparent: true,
  opacity: 0.58,
  depthWrite: false,
});

export function addRoads(scene: THREE.Scene): void {
  for (const road of STRATEGIC_ROADS) addRoad(scene, road);
}

function addRoad(scene: THREE.Scene, road: StrategicRoad): void {
  const [sx, sz] = road.from;
  const [ex, ez] = road.to;
  const dx = ex - sx;
  const dz = ez - sz;
  const length = Math.max(1, Math.hypot(dx, dz));
  const nx = -dz / length;
  const nz = dx / length;
  const midpoint = new THREE.Vector3(
    (sx + ex) * 0.5 + nx * length * road.bend * 0.09,
    0,
    (sz + ez) * 0.5 + nz * length * road.bend * 0.09,
  );
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(sx, 0, sz),
    midpoint,
    new THREE.Vector3(ex, 0, ez),
  );

  const samples: RibbonSample[] = [];
  const count = 42;
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const point = curve.getPoint(t);
    samples.push({
      position: new THREE.Vector3(point.x, terrainHeight(point.x, point.z) + 0.072, point.z),
      width: THREE.MathUtils.lerp(0.15, 0.1, Math.abs(t - 0.5) * 2),
    });
  }

  const mesh = new THREE.Mesh(createRibbonGeometry(samples), ROAD_MATERIAL);
  mesh.renderOrder = 4;
  scene.add(mesh);
}
