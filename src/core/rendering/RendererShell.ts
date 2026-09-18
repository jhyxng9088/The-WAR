import { SRGBColorSpace, Scene, WebGLRenderer, type Camera } from "three";

export class RendererShell {
  public readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;

  public constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "game-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "THE WAR map viewport");
    container.append(this.canvas);
  }

  public resize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  public render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  public dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
