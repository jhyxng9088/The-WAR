import * as THREE from 'three';
import { SEA_LEVEL, WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const CAMERA_DIRECTION = new THREE.Vector3(0.28, 0.92, 0.29).normalize();
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const FOV = 32;
const DEFAULT_DISTANCE = 390;
const MIN_DISTANCE = 50;
const MAX_DISTANCE = 520;
const MAX_SUPPORTED_ASPECT = 2.75;
const SURFACE_GUARD_BAND = 34;
const MIN_STRATEGIC_PAN = 14;
const VIEW_KEEP_FRACTION = 0.72;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

interface GroundHalfExtents {
  x: number;
  z: number;
}

export class WorldCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.25, 1400);

  private readonly target = new THREE.Vector3(0, 0.35, 0);
  private readonly raycaster = new THREE.Raycaster();
  private distance = DEFAULT_DISTANCE;

  constructor() {
    this.syncPosition();
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    const target = new THREE.Vector3(0, SEA_LEVEL, 0);
    const probe = new THREE.PerspectiveCamera(FOV, MAX_SUPPORTED_ASPECT, 0.25, 1400);
    probe.position.copy(target).addScaledVector(CAMERA_DIRECTION, MAX_DISTANCE);
    probe.lookAt(target);
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);

    const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEA_LEVEL);
    const raycaster = new THREE.Raycaster();
    let viewHalfX = 0;
    let viewHalfZ = 0;

    for (const ndcX of [-1, 1]) {
      for (const ndcY of [-1, 1]) {
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), probe);
        const point = raycaster.ray.intersectPlane(seaPlane, new THREE.Vector3());
        if (!point) continue;
        viewHalfX = Math.max(viewHalfX, Math.abs(point.x - target.x));
        viewHalfZ = Math.max(viewHalfZ, Math.abs(point.z - target.z));
      }
    }

    return {
      width: (WORLD_HALF_WIDTH + viewHalfX + SURFACE_GUARD_BAND) * 2,
      depth: (WORLD_HALF_DEPTH + viewHalfZ + SURFACE_GUARD_BAND) * 2,
    };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.clampTargetToVisibleWorld();
  }

  panGround(delta: THREE.Vector3): void {
    this.target.x += delta.x;
    this.target.z += delta.z;
    this.clampTargetToVisibleWorld();
  }

  zoomBy(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.distance = THREE.MathUtils.clamp(this.distance / scale, MIN_DISTANCE, MAX_DISTANCE);
    this.syncPosition();
    this.clampTargetToVisibleWorld();
  }

  groundPoint(clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 | null {
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(ndc, this.camera);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(GROUND, point) ? point : null;
  }

  private clampTargetToVisibleWorld(): void {
    this.syncPosition();
    const extents = this.currentGroundHalfExtents();
    const keptX = Math.min(extents.x * VIEW_KEEP_FRACTION, WORLD_HALF_WIDTH - MIN_STRATEGIC_PAN);
    const keptZ = Math.min(extents.z * VIEW_KEEP_FRACTION, WORLD_HALF_DEPTH - MIN_STRATEGIC_PAN);
    const maxTargetX = Math.max(MIN_STRATEGIC_PAN, WORLD_HALF_WIDTH - keptX);
    const maxTargetZ = Math.max(MIN_STRATEGIC_PAN, WORLD_HALF_DEPTH - keptZ);

    const nextX = THREE.MathUtils.clamp(this.target.x, -maxTargetX, maxTargetX);
    const nextZ = THREE.MathUtils.clamp(this.target.z, -maxTargetZ, maxTargetZ);
    if (nextX === this.target.x && nextZ === this.target.z) return;

    this.target.x = nextX;
    this.target.z = nextZ;
    this.syncPosition();
  }

  private currentGroundHalfExtents(): GroundHalfExtents {
    let halfX = 0;
    let halfZ = 0;

    for (const ndcX of [-1, 1]) {
      for (const ndcY of [-1, 1]) {
        this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
        const point = this.raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
        if (!point) continue;
        halfX = Math.max(halfX, Math.abs(point.x - this.target.x));
        halfZ = Math.max(halfZ, Math.abs(point.z - this.target.z));
      }
    }

    return { x: halfX, z: halfZ };
  }

  private syncPosition(): void {
    this.camera.position.copy(this.target).addScaledVector(CAMERA_DIRECTION, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }
}
