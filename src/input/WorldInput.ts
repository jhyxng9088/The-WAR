import { WorldCamera } from '../camera/WorldCamera';
import {
  TouchGestureIntent,
  type TouchGestureSample,
  TOUCH_ROTATE_RESPONSE,
  TOUCH_ZOOM_RESPONSE,
} from './TouchGestureIntent';

type PointerState = { x: number; y: number };

const WHEEL_RESPONSE = 0.00135;

export class WorldInput {
  private readonly pointers = new Map<number, PointerState>();
  private readonly touchGesture = new TouchGestureIntent();

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

    if (this.pointers.size === 2) {
      this.touchGesture.begin(this.getTwoPointerGesture());
    } else if (this.pointers.size > 2) {
      this.touchGesture.reset();
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previousPointer = this.pointers.get(event.pointerId);
    if (!previousPointer) return;
    event.preventDefault();

    const rect = this.canvas.getBoundingClientRect();

    if (this.pointers.size === 1) {
      const deltaX = event.clientX - previousPointer.x;
      const deltaY = event.clientY - previousPointer.y;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.camera.panScreen(deltaX, deltaY, rect.height);
      return;
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size !== 2) return;

    const sample = this.getTwoPointerGesture();
    if (!sample) return;
    const delta = this.touchGesture.update(sample);
    if (!delta) return;

    if (delta.mode === 'zoom') {
      const anchor = this.camera.groundPoint(sample.centerX, sample.centerY, rect);
      this.camera.zoomBy(Math.pow(delta.scale, TOUCH_ZOOM_RESPONSE));
      if (anchor) {
        const after = this.camera.groundPoint(sample.centerX, sample.centerY, rect);
        if (after) this.camera.panGround(anchor.sub(after));
      }
      return;
    }

    if (delta.mode === 'rotate') {
      const anchor = this.camera.groundPoint(sample.centerX, sample.centerY, rect);
      this.camera.rotateBy(-delta.angleDelta * TOUCH_ROTATE_RESPONSE, 0);
      if (anchor) {
        const after = this.camera.groundPoint(sample.centerX, sample.centerY, rect);
        if (after) this.camera.panGround(anchor.sub(after));
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);

    if (this.pointers.size === 2) {
      this.touchGesture.begin(this.getTwoPointerGesture());
    } else {
      this.touchGesture.reset();
    }
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

  private getTwoPointerGesture(): TouchGestureSample | null {
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
