import * as THREE from 'three';
import {
  WORLD_HEIGHTMAP_HEIGHT,
  WORLD_HEIGHTMAP_U8,
  WORLD_HEIGHTMAP_WIDTH,
} from '../assets/world/AuthoredWorldHeightmap';
import { createTerrainSurfaceMaterial } from '../world/rendering/TerrainSurfaceMaterial';
import './terrain-editor.css';

type EditorMode = 'view' | 'sculpt';
type SculptTool = 'raise' | 'lower' | 'smooth' | 'flatten';

interface PointerState {
  x: number;
  y: number;
}

interface ViewGesture {
  midpointX: number;
  midpointY: number;
  distance: number;
  angle: number;
}

const DATA_SIZE = 257;
const MESH_SEGMENTS = 128;
const WORLD_SIZE = 220;
const MIN_CAMERA_DISTANCE = 58;
const MAX_CAMERA_DISTANCE = 360;
const MIN_CAMERA_PITCH = 0.48;
const MAX_CAMERA_PITCH = 1.24;
const TILT_RESPONSE = 0.0022;
const TILT_ZOOM_DEADZONE = 0.025;
const TILT_TWIST_DEADZONE = 0.035;
const MAX_UNDO = 18;
const WATER_COLOR = 0x467683;
const VIEW_GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class TerrainEditor {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.2, 900);
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly heights = new Float32Array(DATA_SIZE * DATA_SIZE);
  private readonly originalHeights = new Float32Array(DATA_SIZE * DATA_SIZE);
  private readonly undoStack: Float32Array[] = [];
  private readonly redoStack: Float32Array[] = [];
  private readonly pointers = new Map<number, PointerState>();

  private terrain: THREE.Mesh;
  private water: THREE.Mesh;
  private brushRing: THREE.Mesh;
  private frameId: number | null = null;
  private resizeFrameId: number | null = null;
  private geometryDirty = true;
  private mode: EditorMode = 'sculpt';
  private tool: SculptTool = 'raise';
  private heightScale = 8;
  private seaLevel = 0.085;
  private brushRadius = 10;
  private brushStrength = 0.022;
  private flattenTarget = 0.5;
  private cameraYaw = 0.67;
  private cameraPitch = 1.07;
  private cameraDistance = 190;
  private previousSinglePointer: PointerState | null = null;
  private previousViewGesture: ViewGesture | null = null;
  private strokeSnapshotTaken = false;
  private readonly uiRoot: HTMLDivElement;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene.background = new THREE.Color(0x43565f);
    this.scene.fog = new THREE.Fog(0x43565f, 250, 540);

    this.seedFromCurrentWorld();
    this.terrain = this.createTerrain();
    this.water = this.createWater();
    this.brushRing = this.createBrushRing();
    this.scene.add(this.terrain, this.water, this.brushRing);
    this.addLighting();
    this.syncCamera();

    this.uiRoot = this.createUi();
    document.querySelector('#app')?.appendChild(this.uiRoot);
    this.bindUi();
    this.bindInput();
    this.resize();
    this.updateTerrainGeometry();

    window.addEventListener('resize', this.queueResize, { passive: true });
    window.addEventListener('orientationchange', this.queueResize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.queueResize, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.queueResize, { passive: true });
  }

  start(): void {
    if (this.frameId !== null) return;
    const render = (): void => {
      if (this.geometryDirty) this.updateTerrainGeometry();
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(render);
    };
    this.frameId = requestAnimationFrame(render);
  }

  dispose(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    if (this.resizeFrameId !== null) cancelAnimationFrame(this.resizeFrameId);
    this.frameId = null;
    this.resizeFrameId = null;
    this.unbindInput();
    window.removeEventListener('resize', this.queueResize);
    window.removeEventListener('orientationchange', this.queueResize);
    window.visualViewport?.removeEventListener('resize', this.queueResize);
    window.visualViewport?.removeEventListener('scroll', this.queueResize);
    this.uiRoot.remove();
    this.renderer.dispose();
  }

  private seedFromCurrentWorld(): void {
    const source = decodeBase64(WORLD_HEIGHTMAP_U8);
    for (let y = 0; y < DATA_SIZE; y += 1) {
      const v = y / (DATA_SIZE - 1);
      for (let x = 0; x < DATA_SIZE; x += 1) {
        const u = x / (DATA_SIZE - 1);
        const value = bilinearSampleBytes(source, WORLD_HEIGHTMAP_WIDTH, WORLD_HEIGHTMAP_HEIGHT, u, v) / 255;
        const index = y * DATA_SIZE + x;
        this.heights[index] = value;
        this.originalHeights[index] = value;
      }
    }
  }

  private createTerrain(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, MESH_SEGMENTS, MESH_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const material = createTerrainSurfaceMaterial({
      detailRepeat: 17,
      normalStrength: 0.12,
      roughness: 0.9,
      minHeight: 0.8,
      maxHeight: 6.4,
      seaLevel: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private createWater(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE * 1.45, WORLD_SIZE * 1.45, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: WATER_COLOR,
      roughness: 0.42,
      metalness: 0,
      transparent: true,
      opacity: 0.94,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0;
    mesh.renderOrder = -1;
    return mesh;
  }

  private createBrushRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.92, 1, 64);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xf2d57c,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 12;
    return mesh;
  }

  private addLighting(): void {
    const sky = new THREE.HemisphereLight(0xdbe4df, 0x5b5548, 2.0);
    const sun = new THREE.DirectionalLight(0xffefd7, 2.55);
    sun.position.set(-90, 150, 95);
    const fill = new THREE.DirectionalLight(0xa8bec8, 0.52);
    fill.position.set(120, 60, -110);
    this.scene.add(sky, sun, fill);
  }

  private createUi(): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'terrain-editor-ui';
    root.innerHTML = `
      <div class="terrain-editor-topbar">
        <div class="terrain-editor-title">
          <strong>TERRAIN LAB</strong>
          <span>THE WAR</span>
        </div>
        <div class="terrain-editor-actions">
          <label class="terrain-editor-button terrain-editor-file">
            Heightmap
            <input id="terrain-file" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <button id="terrain-reset" class="terrain-editor-button" type="button">원본 복원</button>
          <button id="terrain-export" class="terrain-editor-button terrain-editor-primary" type="button">PNG 저장</button>
        </div>
      </div>

      <div class="terrain-editor-mode" role="group" aria-label="Terrain editor mode">
        <button data-mode="view" type="button">VIEW</button>
        <button data-mode="sculpt" class="is-active" type="button">SCULPT</button>
      </div>

      <div class="terrain-editor-panel">
        <div class="terrain-editor-tools" role="group" aria-label="Sculpt tool">
          <button data-tool="raise" class="is-active" type="button">올리기</button>
          <button data-tool="lower" type="button">내리기</button>
          <button data-tool="smooth" type="button">부드럽게</button>
          <button data-tool="flatten" type="button">평탄화</button>
        </div>
        <div class="terrain-editor-sliders">
          <label>
            <span>브러시 <output id="brush-size-output">10</output></span>
            <input id="brush-size" type="range" min="3" max="28" step="1" value="10" />
          </label>
          <label>
            <span>강도 <output id="brush-strength-output">22</output></span>
            <input id="brush-strength" type="range" min="4" max="60" step="1" value="22" />
          </label>
          <label>
            <span>산 높이 <output id="height-scale-output">8.0</output></span>
            <input id="height-scale" type="range" min="3" max="20" step="0.5" value="8" />
          </label>
          <label>
            <span>해수면 <output id="sea-level-output">8.5%</output></span>
            <input id="sea-level" type="range" min="0" max="30" step="0.5" value="8.5" />
          </label>
        </div>
        <div class="terrain-editor-history">
          <button id="terrain-undo" type="button">되돌리기</button>
          <button id="terrain-redo" type="button">다시하기</button>
          <span id="terrain-status">현재 맵 불러옴 · 257² height data</span>
        </div>
      </div>

      <div class="terrain-editor-hint">VIEW: 한 손가락 이동 · 두 손가락 비틀기 회전 · 핀치 줌 · 두 손가락 위/아래 기울기 · SCULPT: 한 손가락 지형 편집</div>
    `;
    return root;
  }

  private bindUi(): void {
    const fileInput = this.uiRoot.querySelector<HTMLInputElement>('#terrain-file');
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void this.loadHeightmap(file);
      fileInput.value = '';
    });

    this.uiRoot.querySelector('#terrain-reset')?.addEventListener('click', () => {
      this.pushUndoSnapshot();
      this.heights.set(this.originalHeights);
      this.redoStack.length = 0;
      this.markGeometryDirty('원본 heightmap으로 복원');
    });

    this.uiRoot.querySelector('#terrain-export')?.addEventListener('click', () => this.exportHeightmap());
    this.uiRoot.querySelector('#terrain-undo')?.addEventListener('click', () => this.undo());
    this.uiRoot.querySelector('#terrain-redo')?.addEventListener('click', () => this.redo());

    this.uiRoot.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (mode !== 'view' && mode !== 'sculpt') return;
        this.mode = mode;
        this.brushRing.visible = false;
        this.uiRoot.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });

    this.uiRoot.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool;
        if (tool !== 'raise' && tool !== 'lower' && tool !== 'smooth' && tool !== 'flatten') return;
        this.tool = tool;
        this.mode = 'sculpt';
        this.uiRoot.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('is-active', item === button));
        this.uiRoot.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', (item as HTMLElement).dataset.mode === 'sculpt'));
      });
    });

    this.bindRange('brush-size', 'brush-size-output', (value) => {
      this.brushRadius = value;
      this.brushRing.scale.setScalar(this.brushRadius);
      return value.toFixed(0);
    });
    this.bindRange('brush-strength', 'brush-strength-output', (value) => {
      this.brushStrength = value / 1000;
      return value.toFixed(0);
    });
    this.bindRange('height-scale', 'height-scale-output', (value) => {
      this.heightScale = value;
      this.markGeometryDirty();
      return value.toFixed(1);
    });
    this.bindRange('sea-level', 'sea-level-output', (value) => {
      this.seaLevel = value / 100;
      this.markGeometryDirty();
      return `${value.toFixed(1)}%`;
    });
  }

  private bindRange(
    inputId: string,
    outputId: string,
    onValue: (value: number) => string,
  ): void {
    const input = this.uiRoot.querySelector<HTMLInputElement>(`#${inputId}`);
    const output = this.uiRoot.querySelector<HTMLOutputElement>(`#${outputId}`);
    input?.addEventListener('input', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      const display = onValue(value);
      if (output) output.value = display;
    });
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', this.preventContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInput(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private readonly preventContextMenu = (event: Event): void => event.preventDefault();

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.previousSinglePointer = { x: event.clientX, y: event.clientY };
    this.previousViewGesture = this.pointers.size >= 2 ? this.currentViewGesture() : null;
    this.strokeSnapshotTaken = false;

    if (this.mode === 'sculpt' && this.pointers.size === 1) {
      const hit = this.terrainPoint(event.clientX, event.clientY);
      if (!hit) return;
      this.flattenTarget = this.normalizedHeightAtWorld(hit.x, hit.z);
      this.beginStroke();
      this.applyBrush(hit.x, hit.z);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this.mode === 'sculpt' && this.pointers.size <= 1) {
      const hit = this.terrainPoint(event.clientX, event.clientY);
      if (hit) {
        this.brushRing.visible = true;
        this.brushRing.position.set(hit.x, hit.y + 0.12, hit.z);
        this.brushRing.scale.setScalar(this.brushRadius);
        if ((event.buttons & 1) !== 0 || event.pointerType === 'touch') {
          if (this.pointers.has(event.pointerId)) {
            this.beginStroke();
            this.applyBrush(hit.x, hit.z);
          }
        }
      } else {
        this.brushRing.visible = false;
      }
      return;
    }

    this.brushRing.visible = false;
    if (this.pointers.size >= 2) {
      this.handleTwoPointerView();
      return;
    }

    if (this.mode === 'view' && this.pointers.size === 1) this.handleSinglePointerView(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.previousSinglePointer = null;
    this.previousViewGesture = this.pointers.size >= 2 ? this.currentViewGesture() : null;
    this.strokeSnapshotTaken = false;
    if (this.pointers.size === 0 && this.mode === 'sculpt') this.brushRing.visible = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const anchor = this.viewGroundPoint(event.clientX, event.clientY);
    this.cameraDistance = THREE.MathUtils.clamp(
      this.cameraDistance * Math.exp(event.deltaY * 0.0012),
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE,
    );
    this.syncCamera();
    if (!anchor) return;
    const after = this.viewGroundPoint(event.clientX, event.clientY);
    if (after) {
      this.target.x += anchor.x - after.x;
      this.target.z += anchor.z - after.z;
      this.clampTarget();
      this.syncCamera();
    }
  };

  private handleSinglePointerView(clientX: number, clientY: number): void {
    const previous = this.previousSinglePointer;
    this.previousSinglePointer = { x: clientX, y: clientY };
    if (!previous) return;

    const before = this.viewGroundPoint(previous.x, previous.y);
    const after = this.viewGroundPoint(clientX, clientY);
    if (!before || !after) return;
    this.target.x += before.x - after.x;
    this.target.z += before.z - after.z;
    this.clampTarget();
    this.syncCamera();
  }

  private handleTwoPointerView(): void {
    const next = this.currentViewGesture();
    const previous = this.previousViewGesture;
    this.previousViewGesture = next;
    if (!next || !previous) return;

    const anchor = this.viewGroundPoint(previous.midpointX, previous.midpointY);
    const angleDelta = shortestAngle(next.angle - previous.angle);
    const ratio = previous.distance > 0 ? next.distance / previous.distance : 1;
    const zoomMotion = Math.abs(Math.log(Math.max(0.0001, ratio)));
    const twistMotion = Math.abs(angleDelta);
    const centerDy = next.midpointY - previous.midpointY;

    this.cameraYaw -= angleDelta;
    if (zoomMotion < TILT_ZOOM_DEADZONE && twistMotion < TILT_TWIST_DEADZONE) {
      this.cameraPitch = THREE.MathUtils.clamp(
        this.cameraPitch + centerDy * TILT_RESPONSE,
        MIN_CAMERA_PITCH,
        MAX_CAMERA_PITCH,
      );
    }

    if (Number.isFinite(ratio) && ratio > 0) {
      this.cameraDistance = THREE.MathUtils.clamp(
        this.cameraDistance / ratio,
        MIN_CAMERA_DISTANCE,
        MAX_CAMERA_DISTANCE,
      );
    }
    this.syncCamera();

    if (anchor) {
      const after = this.viewGroundPoint(next.midpointX, next.midpointY);
      if (after) {
        this.target.x += anchor.x - after.x;
        this.target.z += anchor.z - after.z;
        this.clampTarget();
        this.syncCamera();
      }
    }
  }

  private currentViewGesture(): ViewGesture | null {
    const points = Array.from(this.pointers.values());
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    return {
      midpointX: (a.x + b.x) * 0.5,
      midpointY: (a.y + b.y) * 0.5,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  private beginStroke(): void {
    if (this.strokeSnapshotTaken) return;
    this.pushUndoSnapshot();
    this.redoStack.length = 0;
    this.strokeSnapshotTaken = true;
  }

  private applyBrush(worldX: number, worldZ: number): void {
    const centerX = ((worldX / WORLD_SIZE) + 0.5) * (DATA_SIZE - 1);
    const centerY = ((worldZ / WORLD_SIZE) + 0.5) * (DATA_SIZE - 1);
    const radiusSamples = (this.brushRadius / WORLD_SIZE) * (DATA_SIZE - 1);
    const minX = Math.max(0, Math.floor(centerX - radiusSamples));
    const maxX = Math.min(DATA_SIZE - 1, Math.ceil(centerX + radiusSamples));
    const minY = Math.max(0, Math.floor(centerY - radiusSamples));
    const maxY = Math.min(DATA_SIZE - 1, Math.ceil(centerY + radiusSamples));
    const source = this.tool === 'smooth' ? this.heights.slice() : this.heights;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance > radiusSamples) continue;
        const falloff = Math.pow(1 - distance / Math.max(0.0001, radiusSamples), 1.65);
        const index = y * DATA_SIZE + x;
        const current = this.heightAtIndex(index);
        let next = current;

        if (this.tool === 'raise') next = current + this.brushStrength * falloff;
        if (this.tool === 'lower') next = current - this.brushStrength * falloff;
        if (this.tool === 'flatten') {
          next = THREE.MathUtils.lerp(current, this.flattenTarget, Math.min(0.5, this.brushStrength * 10) * falloff);
        }
        if (this.tool === 'smooth') {
          const average = neighborAverage(source, x, y, DATA_SIZE);
          next = THREE.MathUtils.lerp(current, average, Math.min(0.72, this.brushStrength * 14) * falloff);
        }

        this.heights[index] = THREE.MathUtils.clamp(next, 0, 1);
      }
    }

    this.markGeometryDirty();
  }

  private terrainPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    return hit?.point ?? null;
  }

  private viewGroundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.raycaster.ray.intersectPlane(VIEW_GROUND, new THREE.Vector3());
  }

  private clampTarget(): void {
    const clamp = WORLD_SIZE * 0.43;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -clamp, clamp);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -clamp, clamp);
  }

  private normalizedHeightAtWorld(x: number, z: number): number {
    const u = THREE.MathUtils.clamp(x / WORLD_SIZE + 0.5, 0, 1);
    const v = THREE.MathUtils.clamp(z / WORLD_SIZE + 0.5, 0, 1);
    return bilinearSampleFloat(this.heights, DATA_SIZE, DATA_SIZE, u, v);
  }

  private updateTerrainGeometry(): void {
    this.geometryDirty = false;
    const geometry = this.terrain.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const normalized = this.normalizedHeightAtWorld(x, z);
      positions.setY(i, (normalized - this.seaLevel) * this.heightScale);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  private pushUndoSnapshot(): void {
    this.undoStack.push(this.heights.slice());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  private undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.heights.slice());
    this.heights.set(previous);
    this.markGeometryDirty('되돌림');
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.heights.slice());
    this.heights.set(next);
    this.markGeometryDirty('다시 적용');
  }

  private async loadHeightmap(file: File): Promise<void> {
    const status = this.uiRoot.querySelector<HTMLElement>('#terrain-status');
    if (status) status.textContent = 'Heightmap 읽는 중…';

    try {
      const image = await loadImageFromFile(file);
      const surface = document.createElement('canvas');
      surface.width = DATA_SIZE;
      surface.height = DATA_SIZE;
      const context = surface.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.drawImage(image, 0, 0, DATA_SIZE, DATA_SIZE);
      const pixels = context.getImageData(0, 0, DATA_SIZE, DATA_SIZE).data;

      for (let i = 0; i < this.heights.length; i += 1) {
        const pixel = i * 4;
        const r = pixels[pixel] ?? 0;
        const g = pixels[pixel + 1] ?? 0;
        const b = pixels[pixel + 2] ?? 0;
        const value = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        this.heights[i] = value;
        this.originalHeights[i] = value;
      }

      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.markGeometryDirty(`${file.name} · 257²로 작업 중`);
    } catch (error) {
      if (status) status.textContent = `불러오기 실패: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }

  private exportHeightmap(): void {
    const surface = document.createElement('canvas');
    surface.width = DATA_SIZE;
    surface.height = DATA_SIZE;
    const context = surface.getContext('2d');
    if (!context) return;
    const image = context.createImageData(DATA_SIZE, DATA_SIZE);
    for (let i = 0; i < this.heights.length; i += 1) {
      const value = Math.round(THREE.MathUtils.clamp(this.heightAtIndex(i), 0, 1) * 255);
      const pixel = i * 4;
      image.data[pixel] = value;
      image.data[pixel + 1] = value;
      image.data[pixel + 2] = value;
      image.data[pixel + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    surface.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `the-war-heightmap-${Date.now()}.png`);
      this.setStatus('PNG 저장 준비 완료');
    }, 'image/png');
  }

  private markGeometryDirty(status?: string): void {
    this.geometryDirty = true;
    if (status) this.setStatus(status);
  }

  private setStatus(text: string): void {
    const status = this.uiRoot.querySelector<HTMLElement>('#terrain-status');
    if (status) status.textContent = text;
  }

  private heightAtIndex(index: number): number {
    return this.heights[index] ?? 0;
  }

  private syncCamera(): void {
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    const y = Math.sin(this.cameraPitch) * this.cameraDistance;
    const x = Math.sin(this.cameraYaw) * horizontal;
    const z = Math.cos(this.cameraYaw) * horizontal;
    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
  }

  private readonly queueResize = (): void => {
    if (this.resizeFrameId !== null) return;
    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = null;
      this.resize();
    });
  };

  private resize(): void {
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
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bilinearSampleBytes(
  values: Uint8Array,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  const x = THREE.MathUtils.clamp(u, 0, 1) * (width - 1);
  const y = THREE.MathUtils.clamp(v, 0, 1) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = values[y0 * width + x0] ?? 0;
  const b = values[y0 * width + x1] ?? 0;
  const c = values[y1 * width + x0] ?? 0;
  const d = values[y1 * width + x1] ?? 0;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

function bilinearSampleFloat(
  values: Float32Array,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  const x = THREE.MathUtils.clamp(u, 0, 1) * (width - 1);
  const y = THREE.MathUtils.clamp(v, 0, 1) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = values[y0 * width + x0] ?? 0;
  const b = values[y0 * width + x1] ?? 0;
  const c = values[y1 * width + x0] ?? 0;
  const d = values[y1 * width + x1] ?? 0;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

function neighborAverage(values: Float32Array, x: number, y: number, width: number): number {
  let total = 0;
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const sx = THREE.MathUtils.clamp(x + ox, 0, width - 1);
      const sy = THREE.MathUtils.clamp(y + oy, 0, width - 1);
      total += values[sy * width + sx] ?? 0;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('이미지를 읽을 수 없어.'));
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function shortestAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
