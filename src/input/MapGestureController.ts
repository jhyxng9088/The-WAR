export interface MapGestureCallbacks {
  pan(deltaX: number, deltaY: number): void;
  zoom(scale: number, clientX: number, clientY: number, rect: DOMRect): void;
  rotate(deltaRadians: number): void;
  tilt(deltaPixels: number): void;
  tap(clientX: number, clientY: number): void;
  activity(label: string): void;
}

interface PointerPoint {
  x: number;
  y: number;
}

interface SingleGestureState {
  id: number;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  quickZoom: boolean;
}

interface MultiGestureState {
  distance: number;
  angle: number;
  centerX: number;
  centerY: number;
  firstX: number;
  firstY: number;
  secondX: number;
  secondY: number;
}

const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 30;
const PAN_THRESHOLD = 4;

export class MapGestureController {
  private abortController: AbortController | null = null;
  private readonly pointers = new Map<number, PointerPoint>();
  private single: SingleGestureState | null = null;
  private multi: MultiGestureState | null = null;
  private lastTapTime = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  public constructor(
    private readonly element: HTMLElement,
    private readonly callbacks: MapGestureCallbacks,
  ) {}

  public start(): void {
    if (this.abortController) return;

    const abortController = new AbortController();
    this.abortController = abortController;

    this.element.addEventListener("pointerdown", this.onPointerDown, {
      signal: abortController.signal,
    });
    this.element.addEventListener("pointermove", this.onPointerMove, {
      signal: abortController.signal,
    });
    this.element.addEventListener("pointerup", this.onPointerUp, {
      signal: abortController.signal,
    });
    this.element.addEventListener("pointercancel", this.onPointerCancel, {
      signal: abortController.signal,
    });
    this.element.addEventListener("wheel", this.onWheel, {
      passive: false,
      signal: abortController.signal,
    });
    this.element.addEventListener("dblclick", this.onDoubleClick, {
      signal: abortController.signal,
    });
    this.element.addEventListener("contextmenu", this.preventContextMenu, {
      signal: abortController.signal,
    });
  }

  public stop(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.pointers.clear();
    this.single = null;
    this.multi = null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (this.pointers.size === 1) {
      const sinceLastTap = performance.now() - this.lastTapTime;
      const fromLastTap = Math.hypot(
        event.clientX - this.lastTapX,
        event.clientY - this.lastTapY,
      );

      this.single = {
        id: event.pointerId,
        downX: event.clientX,
        downY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        quickZoom:
          sinceLastTap <= DOUBLE_TAP_MS &&
          fromLastTap <= DOUBLE_TAP_DISTANCE,
      };
      this.multi = null;
      return;
    }

    if (this.pointers.size === 2) {
      this.single = null;
      this.multi = this.readMultiState();
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;

    event.preventDefault();
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (this.pointers.size === 1 && this.single?.id === event.pointerId) {
      this.handleSingleMove(event);
      return;
    }

    if (this.pointers.size === 2) {
      this.handleMultiMove();
    }
  };

  private handleSingleMove(event: PointerEvent): void {
    const state = this.single;
    if (!state) return;

    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    const totalDistance = Math.hypot(
      event.clientX - state.downX,
      event.clientY - state.downY,
    );

    if (state.quickZoom && (state.moved || totalDistance > 2)) {
      this.callbacks.zoom(
        Math.exp(-deltaY * 0.012),
        event.clientX,
        event.clientY,
        this.element.getBoundingClientRect(),
      );
      this.callbacks.activity(
        "Apple Maps quick zoom · double-tap + vertical drag",
      );
      state.moved = true;
    } else if (state.moved || totalDistance >= PAN_THRESHOLD) {
      this.callbacks.pan(deltaX, deltaY);
      this.callbacks.activity("Apple Maps pan · 1-finger drag");
      state.moved = true;
    }

    state.lastX = event.clientX;
    state.lastY = event.clientY;
  }

  private handleMultiMove(): void {
    const previous = this.multi;
    const current = this.readMultiState();

    if (!previous || !current) {
      this.multi = current;
      return;
    }

    const distanceScale =
      previous.distance > 0 ? current.distance / previous.distance : 1;
    const angleDelta = normalizeAngle(current.angle - previous.angle);

    const firstDeltaX = current.firstX - previous.firstX;
    const firstDeltaY = current.firstY - previous.firstY;
    const secondDeltaX = current.secondX - previous.secondX;
    const secondDeltaY = current.secondY - previous.secondY;
    const averageDeltaX = (firstDeltaX + secondDeltaX) * 0.5;
    const averageDeltaY = (firstDeltaY + secondDeltaY) * 0.5;

    const pinchMagnitude = Math.abs(
      Math.log(Math.max(distanceScale, 0.0001)),
    );
    const rotationMagnitude = Math.abs(angleDelta);

    const sameVerticalDirection = firstDeltaY * secondDeltaY > 0;
    const verticalDominant =
      Math.abs(averageDeltaY) > Math.abs(averageDeltaX) * 1.12;
    const verticalMovement = Math.abs(averageDeltaY) > 0.18;
    const fingersMovingTogether =
      Math.abs(firstDeltaY - secondDeltaY) <
      Math.max(3.2, Math.abs(averageDeltaY) * 0.85);

    const looksLikeTilt =
      sameVerticalDirection &&
      verticalDominant &&
      verticalMovement &&
      fingersMovingTogether &&
      pinchMagnitude < 0.03 &&
      rotationMagnitude < 0.04;

    if (looksLikeTilt) {
      this.callbacks.tilt(averageDeltaY);
      this.callbacks.activity(
        "Apple Maps tilt · 2-finger vertical drag",
      );
    } else {
      if (pinchMagnitude > 0.0025) {
        this.callbacks.zoom(
          distanceScale,
          current.centerX,
          current.centerY,
          this.element.getBoundingClientRect(),
        );
        this.callbacks.activity("Apple Maps zoom · pinch");
      }

      if (rotationMagnitude > 0.0025) {
        this.callbacks.rotate(angleDelta);
        this.callbacks.activity("Apple Maps rotate · 2 fingers");
      }
    }

    this.multi = current;
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    event.preventDefault();

    const finishingSingle =
      this.pointers.size === 1 &&
      this.single?.id === event.pointerId &&
      this.pointers.has(event.pointerId);

    if (finishingSingle && this.single) {
      const state = this.single;

      if (!state.moved) {
        if (state.quickZoom) {
          this.callbacks.zoom(
            1.7,
            event.clientX,
            event.clientY,
            this.element.getBoundingClientRect(),
          );
          this.callbacks.activity("Apple Maps zoom · double tap");
          this.lastTapTime = -Infinity;
        } else {
          this.callbacks.tap(event.clientX, event.clientY);
          this.callbacks.activity("tap · reserved for selection");
          this.lastTapTime = performance.now();
          this.lastTapX = event.clientX;
          this.lastTapY = event.clientY;
        }
      }
    }

    this.releasePointer(event.pointerId);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.releasePointer(event.pointerId);
  };

  private releasePointer(pointerId: number): void {
    this.pointers.delete(pointerId);

    if (this.element.hasPointerCapture(pointerId)) {
      this.element.releasePointerCapture(pointerId);
    }

    if (this.pointers.size === 0) {
      this.single = null;
      this.multi = null;
      return;
    }

    if (this.pointers.size === 1) {
      const entry = this.pointers.entries().next().value as
        | [number, PointerPoint]
        | undefined;

      if (!entry) return;

      const [id, point] = entry;
      this.single = {
        id,
        downX: point.x,
        downY: point.y,
        lastX: point.x,
        lastY: point.y,
        moved: true,
        quickZoom: false,
      };
      this.multi = null;
    }
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();

    this.callbacks.zoom(
      Math.exp(-event.deltaY * 0.0015),
      event.clientX,
      event.clientY,
      this.element.getBoundingClientRect(),
    );
    this.callbacks.activity("zoom · wheel/trackpad");
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    event.preventDefault();

    this.callbacks.zoom(
      1.7,
      event.clientX,
      event.clientY,
      this.element.getBoundingClientRect(),
    );
    this.callbacks.activity("zoom · double click");
  };

  private readonly preventContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readMultiState(): MultiGestureState | null {
    const points = [...this.pointers.values()];
    const first = points[0];
    const second = points[1];

    if (!first || !second) return null;

    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;

    return {
      distance: Math.hypot(deltaX, deltaY),
      angle: Math.atan2(deltaY, deltaX),
      centerX: (first.x + second.x) * 0.5,
      centerY: (first.y + second.y) * 0.5,
      firstX: first.x,
      firstY: first.y,
      secondX: second.x,
      secondY: second.y,
    };
  }
}

function normalizeAngle(angle: number): number {
  let normalized = angle;

  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;

  return normalized;
}
