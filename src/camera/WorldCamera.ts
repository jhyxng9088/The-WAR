import * as THREE from 'three';
import { WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const FOV = 34;
const DEFAULT_DISTANCE = 190;
const MIN_DISTANCE = 62;
const MAX_DISTANCE = 310;
const DEFAULT_YAW = 0.67;
const DEFAULT_PITCH = 1.07;
const MIN_PITCH = 0.48;
const MAX_PITCH = 1.24;
const EDGE_GUARD = 4;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

interface GroundHalfExtents {
  x: number;
  z: number;
}

export class WorldCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.2, 900);

  private readonly target = new THREE.Vector3(0, 1.5, -10);
  private readonly raycaster = new THREE.Raycaster();
  private readonly cameraDirection = new THREE.Vector3();
  private distance = DEFAULT_DISTANCE;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;

  constructor() {
    this.syncPosition();
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    return {
      width: (WORLD_HALF_WIDTH + 170) * 2,
      depth: (WORLD_HALF_DEPTH + 170) * 2,
    };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.clampTargetToWorld();
  }

  panGround(delta: THREE.Vector3): void {
    this.target.x += delta.x;
    this.target.z += delta.z;
    this.clampTargetToWorld();
  }

  rotateBy(yawDelta: number, pitchDelta: number): void {
    if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return;
    this.yaw += yawDelta;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitchDelta, MIN_PITCH, MAX_PITCH);
    this.syncPosition();
    this.clampTargetToWorld();
  }

  zoomBy(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.distance = THREE.MathUtils.clamp(this.distance / scale, MIN_DISTANCE, MAX_DISTANCE);
    this.syncPosition();
    this.clampTargetToWorld();
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

  private clampTargetToWorld(): void {
    this.syncPosition();
    const extents = this.currentGroundHalfExtents();
    const maxTargetX = Math.max(0, WORLD_HALF_WIDTH - extents.x - EDGE_GUARD);
    const maxTargetZ = Math.max(0, WORLD_HALF_DEPTH - extents.z - EDGE_GUARD);
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
    const horizontal = Math.cos(this.pitch);
    this.cameraDirection.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * horizontal,
    ).normalize();
    this.camera.position.copy(this.target).addScaledVector(this.cameraDirection, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }
}
