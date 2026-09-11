import * as THREE from 'three';
import { SEA_LEVEL, WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const CAMERA_OFFSET = new THREE.Vector3(18, 18.8, 22.5);
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const VIEW_HEIGHT = 18;
const MIN_ZOOM = 0.24;
const MAX_ZOOM = 4.1;
const MAX_SUPPORTED_ASPECT = 2.75;
const SURFACE_GUARD_BAND = 18;
const WORLD_EDGE_GUARD = 5;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

interface GroundHalfExtents {
  x: number;
  z: number;
}

export class WorldCamera {
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 280);

  private readonly target = new THREE.Vector3(0, 0.8, 1.4);
  private readonly raycaster = new THREE.Raycaster();

  constructor() {
    this.camera.position.copy(this.target).add(CAMERA_OFFSET);
    this.camera.lookAt(this.target);
    this.camera.zoom = 1;
    this.camera.updateMatrixWorld(true);
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    const target = new THREE.Vector3(0, 0.8, 1.4);
    const halfHeight = VIEW_HEIGHT / 2;
    const halfWidth = halfHeight * MAX_SUPPORTED_ASPECT;
    const probe = new THREE.OrthographicCamera(
      -halfWidth,
      halfWidth,
      halfHeight,
      -halfHeight,
      0.1,
      280,
    );
    probe.position.copy(target).add(CAMERA_OFFSET);
    probe.lookAt(target);
    probe.zoom = MIN_ZOOM;
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
    const aspect = width / height;
    const halfHeight = VIEW_HEIGHT / 2;
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.clampTargetToVisibleWorld();
  }

  panGround(delta: THREE.Vector3): void {
    this.target.x += delta.x;
    this.target.z += delta.z;
    this.clampTargetToVisibleWorld();
  }

  zoomBy(scale: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * scale, MIN_ZOOM, MAX_ZOOM);
    this.camera.updateProjectionMatrix();
    this.clampTargetToVisibleWorld();
  }

  groundPoint(clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 | null {
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
    const maxTargetX = Math.max(0, WORLD_HALF_WIDTH - extents.x - WORLD_EDGE_GUARD);
    const maxTargetZ = Math.max(0, WORLD_HALF_DEPTH - extents.z - WORLD_EDGE_GUARD);

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
    this.camera.position.copy(this.target).add(CAMERA_OFFSET);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }
}
