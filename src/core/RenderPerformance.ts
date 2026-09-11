import * as THREE from 'three';

const SAMPLE_SIZE = 120;
const MIN_PIXEL_RATIO = 1;
const MAX_PIXEL_RATIO = 2;

export class RenderPerformance {
  private readonly intervals: number[] = [];
  private lastTimestamp: number | null = null;
  private pixelRatio: number;
  private framesSinceAdjustment = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
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

    if (this.intervals.length < 60 || this.framesSinceAdjustment < 120) return;
    this.framesSinceAdjustment = 0;
    this.adjustPixelRatio();
  }

  get estimatedRefreshHz(): number {
    if (this.intervals.length < 20) return 60;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const fastInterval = sorted[Math.floor(sorted.length * 0.2)];
    return Math.round(Math.min(120, Math.max(60, 1000 / fastInterval)));
  }

  private adjustPixelRatio(): void {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length * 0.65)];
    const refreshHz = this.estimatedRefreshHz >= 90 ? 120 : 60;
    const budget = 1000 / refreshHz;

    let next = this.pixelRatio;
    if (typical > budget * 1.28) {
      next -= 0.15;
    } else if (typical < budget * 1.08) {
      next += 0.08;
    }

    next = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, Math.max(MIN_PIXEL_RATIO, next));
    if (Math.abs(next - this.pixelRatio) < 0.05) return;

    this.pixelRatio = next;
    this.renderer.setPixelRatio(this.pixelRatio);
  }
}
