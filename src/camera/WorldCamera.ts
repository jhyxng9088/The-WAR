import * as THREE from 'three';
import { WORLD_HALF_DEPTH, WORLD_HALF_WIDTH } from '../world/WorldField';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const FOV = 34;
const DEFAULT_DISTANCE = 190;
const MIN_DISTANCE = 52;
const MAX_DISTANCE = 380;
const DEFAULT_YAW = 0.67;
const DEFAULT_PITCH = 1.07;
const MIN_PITCH = 0.48;
const MAX_PITCH = 1.24;
const PAN_OVERSCAN = 96;

export interface SurfaceCoverage {
  width: number;
  depth: number;
}

export class WorldCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.2, 980);

  private readonly target = new THREE.Vector3(0, 1.5, -10);
  private readonly raycaster = new THREE.Raycaster();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly panRight = new THREE.Vector3();
  private readonly panForward = new THREE.Vector3();
  private distance = DEFAULT_DISTANCE;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;

  constructor() {
    this.syncPosition();
  }

  static requiredSurfaceCoverage(): SurfaceCoverage {
    return {
      width: (WORLD_HALF_WIDTH + 270) * 2,
      depth: (WORLD_HALF_DEPTH + 270) * 2,
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

  panScreen(deltaX: number, deltaY: number, viewportHeight: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || viewportHeight <= 0) return;

    const radians = THREE.MathUtils.degToRad(FOV * 0.5);
    const worldPerPixel = (
      2 * this.distance * Math.tan(radians)
      / viewportHeight
      / Math.max(0.42, Math.sin(this.pitch))
    );

    this.panRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.panForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.target.addScaledVector(this.panRight, -deltaX * worldPerPixel);
    this.target.addScaledVector(this.panForward, deltaY * worldPerPixel);
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
    const maxTargetX = WORLD_HALF_WIDTH + PAN_OVERSCAN;
    const maxTargetZ = WORLD_HALF_DEPTH + PAN_OVERSCAN;
    const nextX = THREE.MathUtils.clamp(this.target.x, -maxTargetX, maxTargetX);
    const nextZ = THREE.MathUtils.clamp(this.target.z, -maxTargetZ, maxTargetZ);
    if (nextX === this.target.x && nextZ === this.target.z) {
      this.syncPosition();
      return;
    }
    this.target.x = nextX;
    this.target.z = nextZ;
    this.syncPosition();
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
