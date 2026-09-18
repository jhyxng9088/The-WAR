import * as THREE from 'three';
import { TerritoryController } from './TerritoryController';

interface PointerStart {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

const TAP_DISTANCE_PX = 9;

export class TerritoryInput {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private pointerStart: PointerStart | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly terrain: THREE.Object3D,
    private readonly territory: TerritoryController,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary) return;
    this.pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.id !== event.pointerId || !event.isPrimary) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance > TAP_DISTANCE_PX) return;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit) {
      this.territory.clearSelection();
      return;
    }

    this.territory.selectWorldPosition(hit.point.x, hit.point.z);
  };

  private readonly onPointerCancel = (): void => {
    this.pointerStart = null;
  };
}
