import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

export class StrategyCameraRig {
  public readonly camera = new PerspectiveCamera(42, 1, 0.5, 12000);
  private readonly target = new Vector3(0, 0, 0);
  private readonly raycaster = new Raycaster();
  private viewportHeight = 1;
  private yaw = 0;
  private elevation = MathUtils.degToRad(58);
  private distance = 260;

  public constructor() { this.applyPose(); }

  public resize(width: number, height: number): void {
    this.viewportHeight = Math.max(height, 1);
    this.camera.aspect = Math.max(width, 1) / this.viewportHeight;
    this.camera.updateProjectionMatrix();
  }

  public pan(deltaX: number, deltaY: number): void {
    const worldHeight = 2 * this.distance * Math.tan(MathUtils.degToRad(this.camera.fov * 0.5));
    const unitsPerPixel = worldHeight / this.viewportHeight;
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const forward = new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.target.addScaledVector(right, -deltaX * unitsPerPixel);
    this.target.addScaledVector(forward, deltaY * unitsPerPixel);
    this.clampTarget();
    this.applyPose();
  }

  public zoomByScale(scale: number, clientX?: number, clientY?: number, rect?: DOMRect): void {
    const safeScale = MathUtils.clamp(scale, 0.5, 2);
    const anchorBefore =
      clientX !== undefined && clientY !== undefined && rect
        ? this.groundPointFromClient(clientX, clientY, rect)
        : null;

    this.distance = MathUtils.clamp(this.distance / safeScale, 38, 1600);
    this.applyPose();

    if (anchorBefore && clientX !== undefined && clientY !== undefined && rect) {
      const anchorAfter = this.groundPointFromClient(clientX, clientY, rect);
      if (anchorAfter) {
        this.target.add(anchorBefore.sub(anchorAfter));
        this.clampTarget();
        this.applyPose();
      }
    }
  }

  public rotate(deltaRadians: number): void {
    this.yaw -= deltaRadians;
    this.applyPose();
  }

  public tilt(deltaPixels: number): void {
    this.elevation = MathUtils.clamp(
      this.elevation + MathUtils.degToRad(deltaPixels * 0.11),
      MathUtils.degToRad(28),
      MathUtils.degToRad(82),
    );
    this.applyPose();
  }

  private groundPointFromClient(clientX: number, clientY: number, rect: DOMRect): Vector3 | null {
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const result = new Vector3();
    return this.raycaster.ray.intersectPlane(GROUND_PLANE, result);
  }

  private clampTarget(): void {
    this.target.x = MathUtils.clamp(this.target.x, -2400, 2400);
    this.target.z = MathUtils.clamp(this.target.z, -2400, 2400);
    this.target.y = 0;
  }

  private applyPose(): void {
    const horizontalDistance = Math.cos(this.elevation) * this.distance;
    const height = Math.sin(this.elevation) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      height,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
