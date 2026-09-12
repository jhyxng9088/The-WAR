import * as THREE from 'three';
import { WorldCamera } from '../camera/WorldCamera';

type PointerState = { x: number; y: number };

type TwoPointerGesture = {
  centerX: number;
  centerY: number;
  distance: number;
  angle: number;
};

const PINCH_RESPONSE = 1.0;
const TWIST_RESPONSE = 1.0;
const TILT_RESPONSE = 0.0022;
const WHEEL_RESPONSE = 0.00135;
const TILT_ZOOM_DEADZONE = 0.025;
const TILT_TWIST_DEADZONE = 0.035;

export class WorldInput {
  private readonly pointers = new Map<number, PointerState>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: WorldCamera,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previousPointer = this.pointers.get(event.pointerId);
    if (!previousPointer) return;
    event.preventDefault();

    const rect = this.canvas.getBoundingClientRect();

    if (this.pointers.size === 1) {
      const before = this.camera.groundPoint(previousPointer.x, previousPointer.y, rect);
      const after = this.camera.groundPoint(event.clientX, event.clientY, rect);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (before && after) this.camera.panGround(before.sub(after));
      return;
    }

    if (this.pointers.size === 2) {
      const previousGesture = this.getTwoPointerGesture();
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const nextGesture = this.getTwoPointerGesture();
      if (!previousGesture || !nextGesture) return;

      const anchor = this.camera.groundPoint(previousGesture.centerX, previousGesture.centerY, rect);
      const angleDelta = shortestAngle(nextGesture.angle - previousGesture.angle);
      const ratio = previousGesture.distance > 0
        ? nextGesture.distance / previousGesture.distance
        : 1;
      const zoomMotion = Math.abs(Math.log(Math.max(0.0001, ratio)));
      const twistMotion = Math.abs(angleDelta);
      const centerDy = nextGesture.centerY - previousGesture.centerY;
      const pitchDelta = zoomMotion < TILT_ZOOM_DEADZONE && twistMotion < TILT_TWIST_DEADZONE
        ? centerDy * TILT_RESPONSE
        : 0;

      if (Math.abs(angleDelta) > 0.0005 || Math.abs(pitchDelta) > 0.0005) {
        this.camera.rotateBy(-angleDelta * TWIST_RESPONSE, pitchDelta);
      }

      if (Number.isFinite(ratio) && ratio > 0) {
        this.camera.zoomBy(Math.pow(ratio, PINCH_RESPONSE));
      }

      if (anchor) {
        const after = this.camera.groundPoint(nextGesture.centerX, nextGesture.centerY, rect);
        if (after) this.camera.panGround(anchor.sub(after));
      }
      return;
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const anchor = this.camera.groundPoint(event.clientX, event.clientY, rect);
    const scale = Math.exp(-event.deltaY * WHEEL_RESPONSE);
    this.camera.zoomBy(scale);
    if (!anchor) return;

    const after = this.camera.groundPoint(event.clientX, event.clientY, rect);
    if (after) this.camera.panGround(anchor.sub(after));
  };

  private getTwoPointerGesture(): TwoPointerGesture | null {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    return {
      centerX: (a.x + b.x) * 0.5,
      centerY: (a.y + b.y) * 0.5,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }
}

function shortestAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
