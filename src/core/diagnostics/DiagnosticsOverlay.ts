import type { ViewportSnapshot } from "../ViewportController";

export class DiagnosticsOverlay {
  private readonly badge: HTMLDivElement;
  private readonly metrics: HTMLSpanElement;
  private readonly context: HTMLSpanElement;
  private readonly gesture: HTMLSpanElement;
  private frameAccumulator = 0;
  private frameCount = 0;
  private fps = 0;
  private viewport: ViewportSnapshot | null = null;

  public constructor(root: HTMLElement, titleText: string) {
    this.badge = document.createElement("div");
    this.badge.className = "foundation-badge";

    const title = document.createElement("strong");
    title.textContent = titleText;

    this.context = document.createElement("span");
    this.context.className = "diagnostic-context";

    this.metrics = document.createElement("span");
    this.metrics.dataset.role = "metrics";
    this.metrics.textContent = "booting renderer…";

    this.badge.append(title, this.context, this.metrics);

    const hint = document.createElement("div");
    hint.className = "gesture-hint";
    this.gesture = document.createElement("span");
    this.gesture.textContent =
      "1-finger pan · pinch zoom · 2-finger rotate/tilt · double-tap-drag zoom";
    hint.append(this.gesture);

    root.append(this.badge, hint);
  }

  public setContext(label: string): void {
    this.context.textContent = label;
  }

  public setViewport(viewport: ViewportSnapshot): void {
    this.viewport = viewport;
    this.renderMetrics();
  }

  public setGesture(label: string): void {
    this.gesture.textContent = label;
  }

  public frame(deltaSeconds: number): void {
    this.frameAccumulator += deltaSeconds;
    this.frameCount += 1;

    if (this.frameAccumulator < 0.5) return;

    this.fps = Math.round(this.frameCount / this.frameAccumulator);
    this.frameAccumulator = 0;
    this.frameCount = 0;
    this.renderMetrics();
  }

  public dispose(): void {
    this.badge.remove();
    this.gesture.parentElement?.remove();
  }

  private renderMetrics(): void {
    if (!this.viewport) return;

    const { width, height, pixelRatio } = this.viewport;
    this.metrics.textContent =
      this.fps +
      " fps · " +
      width +
      "×" +
      height +
      " · DPR " +
      pixelRatio.toFixed(2);
  }
}
