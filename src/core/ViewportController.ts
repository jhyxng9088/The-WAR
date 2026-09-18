export interface ViewportSnapshot {
  width: number;
  height: number;
  pixelRatio: number;
}
type ViewportHandler = (snapshot: ViewportSnapshot) => void;

export class ViewportController {
  private abortController: AbortController | null = null;
  private scheduledFrame: number | null = null;
  private previous: ViewportSnapshot | null = null;

  public constructor(
    private readonly container: HTMLElement,
    private readonly onChange: ViewportHandler,
  ) {}

  public start(): void {
    if (this.abortController) return;
    const abortController = new AbortController();
    this.abortController = abortController;
    const options = { signal: abortController.signal };

    window.addEventListener("resize", this.scheduleMeasure, options);
    window.addEventListener("orientationchange", this.scheduleMeasure, options);
    document.addEventListener("visibilitychange", this.scheduleMeasure, options);
    window.visualViewport?.addEventListener("resize", this.scheduleMeasure, options);
    window.visualViewport?.addEventListener("scroll", this.scheduleMeasure, options);
    this.measure();
  }

  public stop(): void {
    this.abortController?.abort();
    this.abortController = null;
    if (this.scheduledFrame !== null) {
      cancelAnimationFrame(this.scheduledFrame);
      this.scheduledFrame = null;
    }
  }

  private readonly scheduleMeasure = (): void => {
    if (this.scheduledFrame !== null) return;
    this.scheduledFrame = requestAnimationFrame(() => {
      this.scheduledFrame = null;
      this.measure();
    });
  };

  private measure(): void {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));
    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const next = { width, height, pixelRatio };

    if (
      this.previous &&
      this.previous.width === next.width &&
      this.previous.height === next.height &&
      this.previous.pixelRatio === next.pixelRatio
    ) return;

    this.previous = next;
    this.container.style.width = width + "px";
    this.container.style.height = height + "px";
    document.documentElement.style.setProperty("--app-height", height + "px");
    this.onChange(next);
  }
}
