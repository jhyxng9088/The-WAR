import * as THREE from 'three';
import { WorldCamera } from '../camera/WorldCamera';

type PointerState = { x: number; y: number };

const PAN_RESPONSE = 1.16;
const PINCH_RESPONSE = 1.08;
const WHEEL_RESPONSE = 0.00145;

export class WorldInput {
  private readonly pointers = new Map<number, PointerState>();
  private lastPinchDistance: number | null = null;

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
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.updatePinchBaseline();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;

    const rect = this.canvas.getBoundingClientRect();
    if (this.pointers.size === 1) {
      const before = this.camera.groundPoint(previous.x, previous.y, rect);
      const after = this.camera.groundPoint(event.clientX, event.clientY, rect);
      if (before && after) this.camera.panGround(before.sub(after).multiplyScalar(PAN_RESPONSE));
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      return;
    }

    if (this.pointers.size === 2) {
      const oldCenter = this.getPointerCenter();
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const newCenter = this.getPointerCenter();

      if (oldCenter && newCenter) {
        const beforePan = this.camera.groundPoint(oldCenter.x, oldCenter.y, rect);
        const afterPan = this.camera.groundPoint(newCenter.x, newCenter.y, rect);
        if (beforePan && afterPan) this.camera.panGround(beforePan.sub(afterPan).multiplyScalar(PAN_RESPONSE));
      }

      const distance = this.getPinchDistance();
      if (distance !== null && this.lastPinchDistance !== null && this.lastPinchDistance > 0) {
        const anchor = newCenter ? this.camera.groundPoint(newCenter.x, newCenter.y, rect) : null;
        const ratio = distance / this.lastPinchDistance;
        this.camera.zoomBy(Math.pow(ratio, PINCH_RESPONSE));
        if (anchor && newCenter) {
          const afterZoom = this.camera.groundPoint(newCenter.x, newCenter.y, rect);
          if (afterZoom) this.camera.panGround(anchor.sub(afterZoom));
        }
      }
      this.lastPinchDistance = distance;
      return;
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.updatePinchBaseline();
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

  private updatePinchBaseline(): void {
    this.lastPinchDistance = this.pointers.size === 2 ? this.getPinchDistance() : null;
  }

  private getPinchDistance(): number | null {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private getPointerCenter(): PointerState | null {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  }
}
