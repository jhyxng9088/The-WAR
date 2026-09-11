import * as THREE from 'three';
import { WorldCamera } from '../camera/WorldCamera';
import { WorldInput } from '../input/WorldInput';
import { createPrototypeWorld } from '../world/createPrototypeWorld';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: WorldCamera;
  private readonly input: WorldInput;
  private frameId: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.background = new THREE.Color(0x88aebb);
    this.scene.fog = new THREE.Fog(0x88aebb, 36, 74);

    this.camera = new WorldCamera();
    this.input = new WorldInput(canvas, this.camera);

    createPrototypeWorld(this.scene);
    this.resize();

    window.addEventListener('resize', this.resize, { passive: true });
  }

  start(): void {
    if (this.frameId !== null) return;

    const render = (): void => {
      this.frameId = requestAnimationFrame(render);
      this.renderer.render(this.scene, this.camera.camera);
    };

    render();
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
