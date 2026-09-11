import * as THREE from 'three';
import { WorldCamera } from '../camera/WorldCamera';

type PointerState = { x: number; y: number };

const PINCH_RESPONSE = 1.18;
const WHEEL_RESPONSE = 0.00155;

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

    if (this.pointers.size === 1) {
      const rect = this.canvas.getBoundingClientRect();
      const before = this.camera.groundPoint(previous.x, previous.y, rect);
      const after = this.camera.groundPoint(event.clientX, event.clientY, rect);

      if (before && after) {
        this.camera.panGround(before.sub(after));
      }
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2) {
      const distance = this.getPinchDistance();
      if (distance !== null && this.lastPinchDistance !== null && this.lastPinchDistance > 0) {
        const ratio = distance / this.lastPinchDistance;
        this.camera.zoomBy(Math.pow(ratio, PINCH_RESPONSE));
      }
      this.lastPinchDistance = distance;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.updatePinchBaseline();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const scale = Math.exp(-event.deltaY * WHEEL_RESPONSE);
    this.camera.zoomBy(scale);
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
}
