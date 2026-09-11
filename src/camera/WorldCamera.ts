import * as THREE from 'three';

const CAMERA_OFFSET = new THREE.Vector3(18, 24, 18);
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class WorldCamera {
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 120);

  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly raycaster = new THREE.Raycaster();
  private viewHeight = 22;

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
    this.target.x = THREE.MathUtils.clamp(this.target.x + delta.x, -8, 8);
    this.target.z = THREE.MathUtils.clamp(this.target.z + delta.z, -6, 6);
    this.syncPosition();
  }

  zoomBy(scale: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * scale, 0.72, 2.5);
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
