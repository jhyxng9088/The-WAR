export type TouchGestureMode = 'pending' | 'zoom' | 'rotate' | 'tilt';

export interface TouchGestureSample {
  centerX: number;
  centerY: number;
  distance: number;
  angle: number;
}

export interface TouchGestureDelta {
  mode: Exclude<TouchGestureMode, 'pending'>;
  scale: number;
  angleDelta: number;
  verticalDelta: number;
}

export const TOUCH_ZOOM_RESPONSE = 1.0;
export const TOUCH_ROTATE_RESPONSE = 1.0;
export const TOUCH_TILT_RESPONSE = 0.0019;

const ZOOM_LOCK_THRESHOLD = 0.038;
const ROTATE_LOCK_THRESHOLD = 0.058;
const TILT_LOCK_THRESHOLD_PX = 16;
const TILT_VERTICAL_DOMINANCE = 1.25;
const TILT_MAX_ZOOM_DRIFT = 0.02;
const TILT_MAX_ROTATE_DRIFT = 0.03;
const MAX_ZOOM_STEP = 1.08;
const MAX_ROTATE_STEP = 0.085;
const MAX_TILT_STEP_PX = 10;

/**
 * Locks a two-finger gesture to one camera intent for the lifetime of that
 * gesture. This prevents a pinch from also rotating/tilting the camera, and
 * prevents a twist from accidentally zooming.
 */
export class TouchGestureIntent {
  private origin: TouchGestureSample | null = null;
  private previous: TouchGestureSample | null = null;
  private mode: TouchGestureMode = 'pending';

  begin(sample: TouchGestureSample | null): void {
    this.origin = sample ? { ...sample } : null;
    this.previous = sample ? { ...sample } : null;
    this.mode = 'pending';
  }

  reset(): void {
    this.origin = null;
    this.previous = null;
    this.mode = 'pending';
  }

  update(sample: TouchGestureSample): TouchGestureDelta | null {
    const previous = this.previous;
    if (!previous) {
      this.begin(sample);
      return null;
    }

    if (!this.origin) this.origin = { ...previous };
    if (this.mode === 'pending') this.mode = this.classify(sample);
    this.previous = { ...sample };
    if (this.mode === 'pending') return null;

    const rawScale = previous.distance > 0 ? sample.distance / previous.distance : 1;
    const scale = Number.isFinite(rawScale)
      ? clamp(rawScale, 1 / MAX_ZOOM_STEP, MAX_ZOOM_STEP)
      : 1;
    const angleDelta = clamp(
      shortestAngle(sample.angle - previous.angle),
      -MAX_ROTATE_STEP,
      MAX_ROTATE_STEP,
    );
    const verticalDelta = clamp(
      sample.centerY - previous.centerY,
      -MAX_TILT_STEP_PX,
      MAX_TILT_STEP_PX,
    );

    return {
      mode: this.mode,
      scale: this.mode === 'zoom' ? scale : 1,
      angleDelta: this.mode === 'rotate' ? angleDelta : 0,
      verticalDelta: this.mode === 'tilt' ? verticalDelta : 0,
    };
  }

  private classify(sample: TouchGestureSample): TouchGestureMode {
    const origin = this.origin;
    if (!origin || origin.distance <= 0) return 'pending';

    const zoomMotion = Math.abs(Math.log(Math.max(0.0001, sample.distance / origin.distance)));
    const rotateMotion = Math.abs(shortestAngle(sample.angle - origin.angle));
    const dx = sample.centerX - origin.centerX;
    const dy = sample.centerY - origin.centerY;

    const zoomScore = zoomMotion / ZOOM_LOCK_THRESHOLD;
    const rotateScore = rotateMotion / ROTATE_LOCK_THRESHOLD;
    const tiltEligible =
      Math.abs(dy) >= TILT_LOCK_THRESHOLD_PX
      && Math.abs(dy) >= Math.abs(dx) * TILT_VERTICAL_DOMINANCE
      && zoomMotion <= TILT_MAX_ZOOM_DRIFT
      && rotateMotion <= TILT_MAX_ROTATE_DRIFT;
    const tiltScore = tiltEligible ? Math.abs(dy) / TILT_LOCK_THRESHOLD_PX : 0;

    const strongest = Math.max(zoomScore, rotateScore, tiltScore);
    if (strongest < 1) return 'pending';
    if (tiltScore === strongest) return 'tilt';
    return zoomScore >= rotateScore ? 'zoom' : 'rotate';
  }
}

export function shortestAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
