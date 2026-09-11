import * as THREE from 'three';
import { SLICE_HALF_DEPTH, SLICE_HALF_WIDTH } from '../world/vertical-slice/VerticalSliceAssets';

const CAMERA_DIRECTION = new THREE.Vector3(0.34, 0.82, 0.46).normalize();
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const FOV = 34;
const DEFAULT_DISTANCE = 148;
const MIN_DISTANCE = 55;
const MAX_DISTANCE = 205;
const EDGE_GUARD = 3;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

interface GroundHalfExtents {
  x: number;
  z: number;
}

export class WorldCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.2, 680);

  private readonly target = new THREE.Vector3(0, 1.5, -5);
  private readonly raycaster = new THREE.Raycaster();
  private distance = DEFAULT_DISTANCE;

  constructor() {
    this.syncPosition();
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    return {
      width: (SLICE_HALF_WIDTH + 108) * 2,
      depth: (SLICE_HALF_DEPTH + 108) * 2,
    };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.clampTargetToSlice();
  }

  panGround(delta: THREE.Vector3): void {
    this.target.x += delta.x;
    this.target.z += delta.z;
    this.clampTargetToSlice();
  }

  zoomBy(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.distance = THREE.MathUtils.clamp(this.distance / scale, MIN_DISTANCE, MAX_DISTANCE);
    this.syncPosition();
    this.clampTargetToSlice();
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

  private clampTargetToSlice(): void {
    this.syncPosition();
    const extents = this.currentGroundHalfExtents();
    const maxTargetX = Math.max(0, SLICE_HALF_WIDTH - extents.x - EDGE_GUARD);
    const maxTargetZ = Math.max(0, SLICE_HALF_DEPTH - extents.z - EDGE_GUARD);
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
