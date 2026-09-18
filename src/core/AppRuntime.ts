import { StrategyCameraRig } from "../camera/StrategyCameraRig";
import { MapGestureController } from "../input/MapGestureController";
import { GameLoop } from "./GameLoop";
import { ViewportController } from "./ViewportController";
import { DiagnosticsOverlay } from "./diagnostics/DiagnosticsOverlay";
import { createFoundationScene } from "./diagnostics/FoundationScene";
import { RendererShell } from "./rendering/RendererShell";

export class AppRuntime {
  private readonly viewportElement: HTMLDivElement;
  private readonly renderer: RendererShell;
  private readonly camera = new StrategyCameraRig();
  private readonly foundation = createFoundationScene();
  private readonly diagnostics: DiagnosticsOverlay;
  private readonly viewport: ViewportController;
  private readonly gestures: MapGestureController;
  private readonly loop: GameLoop;
  private running = false;

  public constructor(private readonly root: HTMLElement) {
    this.root.className = "app-shell";
    this.viewportElement = document.createElement("div");
    this.viewportElement.className = "game-viewport";
    this.root.append(this.viewportElement);

    this.renderer = new RendererShell(this.viewportElement);
    this.diagnostics = new DiagnosticsOverlay(this.root);

    this.viewport = new ViewportController(this.viewportElement, (snapshot) => {
      this.renderer.resize(snapshot.width, snapshot.height, snapshot.pixelRatio);
      this.camera.resize(snapshot.width, snapshot.height);
      this.diagnostics.setViewport(snapshot);
    });

    this.gestures = new MapGestureController(this.renderer.canvas, {
      pan: (deltaX, deltaY) => this.camera.pan(deltaX, deltaY),
      zoom: (scale, clientX, clientY, rect) => this.camera.zoomByScale(scale, clientX, clientY, rect),
      rotate: (deltaRadians) => this.camera.rotate(deltaRadians),
      tilt: (deltaPixels) => this.camera.tilt(deltaPixels),
      tap: () => undefined,
      activity: (label) => this.diagnostics.setGesture(label),
    });

    this.loop = new GameLoop((deltaSeconds) => {
      this.diagnostics.frame(deltaSeconds);
      this.renderer.render(this.foundation.scene, this.camera.camera);
    });
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.viewport.start();
    this.gestures.start();
    this.loop.start();
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    this.loop.stop();
    this.gestures.stop();
    this.viewport.stop();
    this.diagnostics.dispose();
    this.foundation.dispose();
    this.renderer.dispose();
    this.root.replaceChildren();
  }
}
