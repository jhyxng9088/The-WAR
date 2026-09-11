import * as THREE from 'three';
import { SEA_LEVEL, WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const CAMERA_OFFSET = new THREE.Vector3(18, 16.5, 21);
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const PAN_MARGIN_X = 7;
const PAN_MARGIN_Z = 6;
const VIEW_HEIGHT = 18;
const MIN_ZOOM = 0.52;
const MAX_ZOOM = 3.3;
const MAX_SUPPORTED_ASPECT = 2.5;
const SURFACE_GUARD_BAND = 8;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

export class WorldCamera {
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 180);

  private readonly target = new THREE.Vector3(0, 0.7, 1.4);
  private readonly raycaster = new THREE.Raycaster();

  constructor() {
    this.camera.position.copy(this.target).add(CAMERA_OFFSET);
    this.camera.lookAt(this.target);
    this.camera.zoom = 1;
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    const target = new THREE.Vector3(0, 0.7, 1.4);
    const halfHeight = VIEW_HEIGHT / 2;
    const halfWidth = halfHeight * MAX_SUPPORTED_ASPECT;
    const probe = new THREE.OrthographicCamera(
      -halfWidth,
      halfWidth,
      halfHeight,
      -halfHeight,
      0.1,
      180,
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

    const targetHalfX = WORLD_HALF_WIDTH - PAN_MARGIN_X;
    const targetHalfZ = WORLD_HALF_DEPTH - PAN_MARGIN_Z;

    return {
      width: (targetHalfX + viewHalfX + SURFACE_GUARD_BAND) * 2,
      depth: (targetHalfZ + viewHalfZ + SURFACE_GUARD_BAND) * 2,
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
  }

  panGround(delta: THREE.Vector3): void {
    this.target.x = THREE.MathUtils.clamp(
      this.target.x + delta.x,
      -WORLD_HALF_WIDTH + PAN_MARGIN_X,
      WORLD_HALF_WIDTH - PAN_MARGIN_X,
    );
    this.target.z = THREE.MathUtils.clamp(
      this.target.z + delta.z,
      -WORLD_HALF_DEPTH + PAN_MARGIN_Z,
      WORLD_HALF_DEPTH - PAN_MARGIN_Z,
    );
    this.syncPosition();
  }

  zoomBy(scale: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * scale, MIN_ZOOM, MAX_ZOOM);
    this.camera.updateProjectionMatrix();
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

  private syncPosition(): void {
    this.camera.position.copy(this.target).add(CAMERA_OFFSET);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
