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

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.scene.background = new THREE.Color(0x708b91);
    this.scene.fog = new THREE.Fog(0x708b91, 180, 460);

    this.camera = new WorldCamera();
    this.input = new WorldInput(canvas, this.camera);
    this.performance = new RenderPerformance(this.renderer);

    createPrototypeWorld(this.scene);
    this.resize();

    window.addEventListener('resize', this.resize, { passive: true });
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
    this.frameId = null;
    this.input.dispose();
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.resize(width, height);
  };
}
