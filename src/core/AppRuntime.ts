import { StrategyCameraRig } from "../camera/StrategyCameraRig";
import { MapGestureController } from "../input/MapGestureController";
import { TerritoryState } from "../territory/TerritoryState";
import {
  createTerritoryView,
  type TerritoryView,
} from "../territory/TerritoryView";
import {
  createWorldScene,
  type WorldSceneHandle,
} from "../world/createWorldScene";
import { GameLoop } from "./GameLoop";
import { ViewportController } from "./ViewportController";
import { DiagnosticsOverlay } from "./diagnostics/DiagnosticsOverlay";
import { RendererShell } from "./rendering/RendererShell";
import { TerritoryHud } from "../ui/TerritoryHud";

export class AppRuntime {
  private readonly viewportElement: HTMLDivElement;
  private readonly renderer: RendererShell;
  private readonly world: WorldSceneHandle;
  private readonly camera: StrategyCameraRig;
  private readonly territory = new TerritoryState();
  private readonly territoryView: TerritoryView;
  private readonly territoryHud: TerritoryHud;
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
    this.world = createWorldScene();
    this.camera = new StrategyCameraRig({
      worldWidth: this.world.width,
      worldDepth: this.world.depth,
    });
    this.territoryView = createTerritoryView(
      this.world.scene,
      this.territory,
    );
    this.territoryHud = new TerritoryHud(this.root);
    this.territoryHud.sync(this.territory);

    this.diagnostics = new DiagnosticsOverlay(
      this.root,
      "STAGE 2 · TERRITORY",
    );
    this.diagnostics.setContext(
      "Stage 2-H · refined borders · Region control readout",
    );

    this.viewport = new ViewportController(
      this.viewportElement,
      (snapshot) => {
        this.renderer.resize(
          snapshot.width,
          snapshot.height,
          snapshot.pixelRatio,
        );
        this.camera.resize(snapshot.width, snapshot.height);
        this.territoryView.resize(snapshot.width, snapshot.height);
        this.diagnostics.setViewport(snapshot);
      },
    );

    this.gestures = new MapGestureController(this.renderer.canvas, {
      pan: (deltaX, deltaY) => this.camera.pan(deltaX, deltaY),
      zoom: (scale, clientX, clientY, rect) =>
        this.camera.zoomByScale(
          scale,
          clientX,
          clientY,
          rect,
        ),
      rotate: (deltaRadians) => this.camera.rotate(deltaRadians),
      tilt: (deltaPixels) => this.camera.tilt(deltaPixels),
      tap: (clientX, clientY) => this.handleMapTap(clientX, clientY),
      activity: (label) => this.diagnostics.setGesture(label),
    });

    this.loop = new GameLoop((deltaSeconds) => {
      const completed = this.territory.update(deltaSeconds);
      this.territoryView.sync(this.territory);
      this.territoryHud.sync(this.territory);

      if (completed) {
        this.diagnostics.setGesture(
          "Territory claimed · keep expanding before rivals reach you",
        );
      }

      this.diagnostics.frame(deltaSeconds);
      this.renderer.render(this.world.scene, this.camera.camera);
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
    this.territoryHud.dispose();
    this.territoryView.dispose();
    this.world.dispose();
    this.renderer.dispose();
    this.root.replaceChildren();
  }

  private handleMapTap(clientX: number, clientY: number): void {
    const point = this.camera.screenToGround(
      clientX,
      clientY,
      this.renderer.canvas.getBoundingClientRect(),
    );

    if (!point) return;

    const result = this.territory.tapWorld(point.x, point.z);
    this.territoryView.sync(this.territory);
    this.territoryHud.sync(this.territory);
    this.diagnostics.setGesture(result);
  }
}
