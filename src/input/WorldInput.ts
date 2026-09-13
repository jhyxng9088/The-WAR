import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { WorldCamera } from '../camera/WorldCamera';

const MIN_DISTANCE = 30;
const MAX_DISTANCE = 460;
const MIN_POLAR_ANGLE = 0.3;
const MAX_POLAR_ANGLE = 0.9;
const MAX_TARGET_RADIUS = 560;

export class WorldInput {
  private readonly controls: MapControls;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    camera: WorldCamera,
  ) {
    const controls = new MapControls(camera.camera, canvas);
    controls.target.copy(camera.target);
    controls.cursor.set(0, camera.target.y, 0);

    // Use Three.js' map-navigation preset instead of a home-grown gesture
    // classifier. This gives the standard bird's-eye map behavior:
    // one-finger pan, two-finger rotate + pinch zoom, mouse-wheel zoom.
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.enableDamping = false;

    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.minPolarAngle = MIN_POLAR_ANGLE;
    controls.maxPolarAngle = MAX_POLAR_ANGLE;
    controls.maxTargetRadius = MAX_TARGET_RADIUS;

    controls.panSpeed = 1.0;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.65;

    controls.update();
    this.controls = controls;
  }

  dispose(): void {
    this.controls.dispose();
  }
}
