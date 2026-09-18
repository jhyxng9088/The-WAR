export type FrameHandler = (deltaSeconds: number, elapsedSeconds: number) => void;

export class GameLoop {
  private frameId: number | null = null;
  private previousTime = 0;
  private elapsedSeconds = 0;

  public constructor(private readonly onFrame: FrameHandler) {}

  public start(): void {
    if (this.frameId !== null) return;
    this.previousTime = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    if (this.frameId === null) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private readonly frame = (timestamp: number): void => {
    const rawDelta = (timestamp - this.previousTime) / 1000;
    const deltaSeconds = Math.min(Math.max(rawDelta, 0), 0.1);
    this.previousTime = timestamp;
    this.elapsedSeconds += deltaSeconds;
    this.onFrame(deltaSeconds, this.elapsedSeconds);
    this.frameId = requestAnimationFrame(this.frame);
  };
}
