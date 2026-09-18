import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { WorldCamera } from '../camera/WorldCamera';

const MIN_DISTANCE = 85;
const MAX_DISTANCE = 1350;
const MIN_POLAR_ANGLE = 0.30;
const MAX_POLAR_ANGLE = 0.92;
const MAX_TARGET_RADIUS = 980;

export class WorldInput {
  private readonly controls: MapControls;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    camera: WorldCamera,
  ) {
    const controls = new MapControls(camera.camera, canvas);
    controls.target.copy(camera.target);
    controls.cursor.set(0, camera.target.y, 0);

    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.16;

    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.minPolarAngle = MIN_POLAR_ANGLE;
    controls.maxPolarAngle = MAX_POLAR_ANGLE;
    controls.maxTargetRadius = MAX_TARGET_RADIUS;

    controls.panSpeed = 1.0;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.62;

    controls.update();
    this.controls = controls;
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
