import * as THREE from 'three';
import { WorldCamera } from '../camera/WorldCamera';
import { WorldInput } from '../input/WorldInput';
import { createPrototypeWorld } from '../world/createPrototypeWorld';
import { RenderPerformance } from './RenderPerformance';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: WorldCamera;
  private readonly input: WorldInput;
  private readonly performance: RenderPerformance;
  private frameId: number | null = null;
  private resizeFrameId: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene.background = new THREE.Color(0x35494f);
    this.scene.fog = new THREE.Fog(0x35494f, 250, 620);

    this.camera = new WorldCamera();
    this.input = new WorldInput(canvas, this.camera);
    this.performance = new RenderPerformance(this.renderer);

    void createPrototypeWorld(this.scene);
    this.resize();

    window.addEventListener('resize', this.queueResize, { passive: true });
    window.addEventListener('orientationchange', this.queueResize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.queueResize, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.queueResize, { passive: true });
  }

  start(): void {
    if (this.frameId !== null) return;
    const render = (timestamp: number): void => {
      this.performance.sample(timestamp);
      this.renderer.render(this.scene, this.camera.camera);
      this.frameId = requestAnimationFrame(render);
    };
    this.frameId = requestAnimationFrame(render);
  }

  dispose(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    if (this.resizeFrameId !== null) cancelAnimationFrame(this.resizeFrameId);
    this.frameId = null;
    this.resizeFrameId = null;
    this.input.dispose();
    window.removeEventListener('resize', this.queueResize);
    window.removeEventListener('orientationchange', this.queueResize);
    window.visualViewport?.removeEventListener('resize', this.queueResize);
    window.visualViewport?.removeEventListener('scroll', this.queueResize);
    this.renderer.dispose();
  }

  private readonly queueResize = (): void => {
    if (this.resizeFrameId !== null) return;
    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = null;
      this.resize();
    });
  };

  private readonly resize = (): void => {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth ?? this.canvas.clientWidth));
    const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight ?? this.canvas.clientHeight));
    const offsetLeft = Math.round(viewport?.offsetLeft ?? 0);
    const offsetTop = Math.round(viewport?.offsetTop ?? 0);
    const host = this.canvas.parentElement;
    if (host) {
      host.style.inset = 'auto';
      host.style.left = `${offsetLeft}px`;
      host.style.top = `${offsetTop}px`;
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
    }
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.renderer.setSize(width, height, false);
    this.camera.resize(width, height);
  };
}
