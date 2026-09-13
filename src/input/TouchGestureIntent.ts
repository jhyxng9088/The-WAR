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
export const TOUCH_ROTATE_RESPONSE = -1.0;
export const TOUCH_TILT_RESPONSE = 0.0019;

const ZOOM_START_THRESHOLD = 0.014;
const ROTATE_START_THRESHOLD = 0.024;
const SWITCH_BIAS = 1.6;
const SWITCH_MIN_SCORE = 1.8;
const MAX_ZOOM_STEP = 1.12;
const MAX_ROTATE_STEP = 0.11;
const MAX_ZOOM_LOG_STEP = Math.log(MAX_ZOOM_STEP);

/**
 * Shared mobile strategy gesture recognizer.
 *
 * It keeps only a tiny opening dead-zone, emits the accumulated opening motion
 * instead of throwing it away, and can switch between zoom and rotation when
 * the competing motion becomes clearly dominant. Two-finger vertical motion is
 * intentionally not classified so it cannot steal pinch/twist input.
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

    const rawScale = previous.distance > 0 ? sample.distance / previous.distance : 1;
    const rawZoomLog = Number.isFinite(rawScale)
      ? clamp(Math.log(Math.max(0.0001, rawScale)), -MAX_ZOOM_LOG_STEP, MAX_ZOOM_LOG_STEP)
      : 0;
    const rawAngleDelta = clamp(
      shortestAngle(sample.angle - previous.angle),
      -MAX_ROTATE_STEP,
      MAX_ROTATE_STEP,
    );

    if (this.mode === 'pending') {
      const origin = this.origin;
      if (!origin || origin.distance <= 0) {
        this.previous = { ...sample };
        return null;
      }

      const totalZoomLog = clamp(
        Math.log(Math.max(0.0001, sample.distance / origin.distance)),
        -MAX_ZOOM_LOG_STEP,
        MAX_ZOOM_LOG_STEP,
      );
      const totalAngleDelta = clamp(
        shortestAngle(sample.angle - origin.angle),
        -MAX_ROTATE_STEP,
        MAX_ROTATE_STEP,
      );
      const zoomScore = Math.abs(totalZoomLog) / ZOOM_START_THRESHOLD;
      const rotateScore = Math.abs(totalAngleDelta) / ROTATE_START_THRESHOLD;

      if (Math.max(zoomScore, rotateScore) < 1) {
        this.previous = { ...sample };
        return null;
      }

      this.mode = zoomScore >= rotateScore ? 'zoom' : 'rotate';
      this.previous = { ...sample };
      this.origin = { ...sample };

      return {
        mode: this.mode,
        scale: this.mode === 'zoom' ? Math.exp(totalZoomLog) : 1,
        angleDelta: this.mode === 'rotate' ? totalAngleDelta : 0,
        verticalDelta: 0,
      };
    }

    const zoomScore = Math.abs(rawZoomLog) / ZOOM_START_THRESHOLD;
    const rotateScore = Math.abs(rawAngleDelta) / ROTATE_START_THRESHOLD;

    if (
      this.mode === 'zoom'
      && rotateScore >= SWITCH_MIN_SCORE
      && rotateScore > zoomScore * SWITCH_BIAS
    ) {
      this.mode = 'rotate';
    } else if (
      this.mode === 'rotate'
      && zoomScore >= SWITCH_MIN_SCORE
      && zoomScore > rotateScore * SWITCH_BIAS
    ) {
      this.mode = 'zoom';
    }

    this.previous = { ...sample };

    return {
      mode: this.mode,
      scale: this.mode === 'zoom' ? Math.exp(rawZoomLog) : 1,
      angleDelta: this.mode === 'rotate' ? rawAngleDelta : 0,
      verticalDelta: 0,
    };
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
