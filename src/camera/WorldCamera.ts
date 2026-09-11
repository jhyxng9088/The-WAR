import * as THREE from 'three';
import { WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const CAMERA_OFFSET = new THREE.Vector3(18, 14, 21);
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const PAN_MARGIN_X = 7;
const PAN_MARGIN_Z = 6;

export class WorldCamera {
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 160);

  private readonly target = new THREE.Vector3(0, 0.7, 1.4);
  private readonly raycaster = new THREE.Raycaster();
  private readonly viewHeight = 18;

  constructor() {
    this.camera.position.copy(this.target).add(CAMERA_OFFSET);
    this.camera.lookAt(this.target);
    this.camera.zoom = 1;
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    const halfHeight = this.viewHeight / 2;
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
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * scale, 0.52, 3.3);
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
