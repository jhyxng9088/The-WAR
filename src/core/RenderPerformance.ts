import * as THREE from 'three';

const SAMPLE_SIZE = 90;
const MIN_PIXEL_RATIO = 1;
const MAX_PIXEL_RATIO = 1.5;
const ADJUST_EVERY_FRAMES = 90;

export class RenderPerformance {
  private readonly intervals: number[] = [];
  private lastTimestamp: number | null = null;
  private pixelRatio: number;
  private framesSinceAdjustment = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  sample(timestamp: number): void {
    if (this.lastTimestamp !== null) {
      const interval = timestamp - this.lastTimestamp;
      if (interval > 0 && interval < 60) {
        this.intervals.push(interval);
        if (this.intervals.length > SAMPLE_SIZE) this.intervals.shift();
      }
    }

    this.lastTimestamp = timestamp;
    this.framesSinceAdjustment += 1;

    if (this.intervals.length < 60 || this.framesSinceAdjustment < ADJUST_EVERY_FRAMES) return;
    this.framesSinceAdjustment = 0;
    this.adjustPixelRatio();
  }

  get estimatedRefreshHz(): number {
    if (this.intervals.length < 20) return 60;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const fastInterval = percentile(sorted, 0.2, 16.67);
    return Math.round(Math.min(120, Math.max(60, 1000 / fastInterval)));
  }

  private adjustPixelRatio(): void {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const typical = percentile(sorted, 0.65, 16.67);
    const refreshHz = this.estimatedRefreshHz >= 90 ? 120 : 60;
    const budget = 1000 / refreshHz;

    // Avoid the old up/down pixel-ratio oscillation. Reallocating the drawing
    // buffer while the user is moving the map causes a visible hitch on iPad.
    // Start sharp at 1.5x and only step down when sustained frame time is poor.
    if (typical <= budget * 1.2 || this.pixelRatio <= MIN_PIXEL_RATIO) return;

    const next = Math.min(
      window.devicePixelRatio || 1,
      MAX_PIXEL_RATIO,
      Math.max(MIN_PIXEL_RATIO, this.pixelRatio - 0.12),
    );
    if (Math.abs(next - this.pixelRatio) < 0.05) return;

    this.pixelRatio = next;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.intervals.length = 0;
  }
}

function percentile(sorted: readonly number[], fraction: number, fallback: number): number {
  if (sorted.length === 0) return fallback;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)));
  return sorted[index] ?? fallback;
}
