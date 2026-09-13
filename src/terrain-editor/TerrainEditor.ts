import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import {
  WORLD_HEIGHTMAP_HEIGHT,
  WORLD_HEIGHTMAP_U8,
  WORLD_HEIGHTMAP_WIDTH,
} from '../assets/world/AuthoredWorldHeightmap';
import {
  SEA_LEVEL,
  TERRAIN_SEGMENTS_X,
  TERRAIN_SEGMENTS_Z,
  WORLD_DEPTH,
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  WORLD_WIDTH,
  reloadWorldHeightmapFromStorage,
  terrainHeightFromRawValue,
} from '../world/WorldField';
import {
  clearWorldHeightmapOverride,
  decodeHeightmapBase64,
  readWorldHeightmapOverride,
  sampleHeightmapBytesBilinear,
  writeWorldHeightmapOverride,
} from '../world/WorldHeightmapStore';
import { addWorldLighting } from '../world/rendering/LightingRenderer';
import { clearTerrainBlendControlMapCache } from '../world/rendering/TerrainBlendControlMap';
import { createWorldTerrainSurfaceMaterial } from '../world/rendering/WorldTerrainSurfaceMaterial';
import { createWorldWaterMaterial, updateWorldWaterTime } from '../world/rendering/WorldWaterMaterial';
import './terrain-editor.css';

type EditorMode = 'view' | 'sculpt';
type SculptTool = 'raise' | 'lower' | 'smooth' | 'flatten';

const DATA_SIZE = 257;
const MAX_UNDO = 18;
const DEFAULT_CAMERA_DISTANCE = 360;
const DEFAULT_CAMERA_YAW = 0.67;
const DEFAULT_CAMERA_PITCH = 1.07;
const VIEW_MIN_DISTANCE = 30;
const VIEW_MAX_DISTANCE = 520;
const VIEW_MIN_POLAR_ANGLE = 0.3;
const VIEW_MAX_POLAR_ANGLE = 0.9;
const VIEW_MAX_TARGET_RADIUS = 560;
const WATER_OVERSCAN = 720;

export class TerrainEditor {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.2, 1400);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly heights = new Float32Array(DATA_SIZE * DATA_SIZE);
  private readonly originalHeights = new Float32Array(DATA_SIZE * DATA_SIZE);
  private readonly undoStack: Float32Array[] = [];
  private readonly redoStack: Float32Array[] = [];
  private readonly viewControls: MapControls;

  private terrain: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private brushRing: THREE.Mesh;
  private frameId: number | null = null;
  private resizeFrameId: number | null = null;
  private geometryDirty = true;
  private mode: EditorMode = 'sculpt';
  private tool: SculptTool = 'raise';
  private brushRadius = 12;
  private brushStrength = 0.022;
  private flattenTarget = 0.5;
  private activeSculptPointerId: number | null = null;
  private strokeSnapshotTaken = false;
  private loadedSharedOverride = false;
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
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x34484f);
    this.scene.fog = new THREE.Fog(0x34484f, 390, 820);

    this.seedFromCurrentWorld();
    this.terrain = this.createTerrain();
    this.water = this.createWater();
    this.brushRing = this.createBrushRing();
    this.scene.add(this.terrain, this.water, this.brushRing);
    addWorldLighting(this.scene);

    this.positionInitialCamera();
    this.viewControls = this.createViewControls();

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
      updateWorldWaterTime(this.water.material, performance.now() * 0.001);
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
    this.viewControls.dispose();
    this.unbindInput();
    window.removeEventListener('resize', this.queueResize);
    window.removeEventListener('orientationchange', this.queueResize);
    window.visualViewport?.removeEventListener('resize', this.queueResize);
    window.visualViewport?.removeEventListener('scroll', this.queueResize);
    this.terrain.geometry.dispose();
    this.terrain.material.dispose();
    this.water.geometry.dispose();
    this.water.material.dispose();
    this.brushRing.geometry.dispose();
    (this.brushRing.material as THREE.Material).dispose();
    this.uiRoot.remove();
    this.renderer.dispose();
  }

  private seedFromCurrentWorld(): void {
    const authored = decodeHeightmapBase64(WORLD_HEIGHTMAP_U8);
    fillResampledHeightmap(
      this.originalHeights,
      authored,
      WORLD_HEIGHTMAP_WIDTH,
      WORLD_HEIGHTMAP_HEIGHT,
    );

    const shared = readWorldHeightmapOverride();
    this.loadedSharedOverride = shared !== null;
    if (shared) {
      fillResampledHeightmap(this.heights, shared.bytes, shared.width, shared.height);
      return;
    }

    this.heights.set(this.originalHeights);
  }

  private createTerrain(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.PlaneGeometry(
      WORLD_WIDTH,
      WORLD_DEPTH,
      TERRAIN_SEGMENTS_X,
      TERRAIN_SEGMENTS_Z,
    );
    geometry.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, this.createTerrainMaterial());
    mesh.receiveShadow = true;
    return mesh;
  }

  private createTerrainMaterial(): THREE.MeshStandardMaterial {
    return createWorldTerrainSurfaceMaterial({
      detailRepeat: 32,
      roughness: 0.9,
      seaLevel: SEA_LEVEL,
      controlMapSize: 512,
      anisotropy: 4,
    });
  }

  private createWater(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
    const geometry = new THREE.PlaneGeometry(
      WORLD_WIDTH + WATER_OVERSCAN * 2,
      WORLD_DEPTH + WATER_OVERSCAN * 2,
      1,
      1,
    );
    geometry.rotateX(-Math.PI / 2);
    const material = this.createWaterMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = SEA_LEVEL + 0.006;
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createWaterMaterial(): THREE.MeshStandardMaterial {
    return createWorldWaterMaterial({
      controlMapSize: 512,
      roughness: 0.48,
    });
  }

  private createBrushRing(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.92, 1, 64);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xf2d57c,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 12;
    return mesh;
  }

  private positionInitialCamera(): void {
    const horizontal = Math.cos(DEFAULT_CAMERA_PITCH) * DEFAULT_CAMERA_DISTANCE;
    this.camera.position.set(
      Math.sin(DEFAULT_CAMERA_YAW) * horizontal,
      Math.sin(DEFAULT_CAMERA_PITCH) * DEFAULT_CAMERA_DISTANCE,
      Math.cos(DEFAULT_CAMERA_YAW) * horizontal,
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
  }

  private createViewControls(): MapControls {
    const controls = new MapControls(this.camera, this.canvas);
    controls.target.set(0, 0, 0);
    controls.cursor.set(0, 0, 0);
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.enableDamping = false;
    controls.minDistance = VIEW_MIN_DISTANCE;
    controls.maxDistance = VIEW_MAX_DISTANCE;
    controls.minPolarAngle = VIEW_MIN_POLAR_ANGLE;
    controls.maxPolarAngle = VIEW_MAX_POLAR_ANGLE;
    controls.maxTargetRadius = VIEW_MAX_TARGET_RADIUS;
    controls.panSpeed = 1.0;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.65;
    controls.enabled = false;
    controls.update();
    return controls;
  }

  private createUi(): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'terrain-editor-ui';
    const initialStatus = this.loadedSharedOverride
      ? 'THE WAR WorldField 불러옴 · 지형/산맥/해수면 1:1'
      : '기본 WorldField 불러옴 · 수정 시 THE WAR에 자동 반영';
    root.innerHTML = `
      <div class="terrain-editor-topbar">
        <div class="terrain-editor-title">
          <strong>TERRAIN LAB</strong>
          <span>THE WAR · WORLD FIELD</span>
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
            <span>브러시 <output id="brush-size-output">12</output></span>
            <input id="brush-size" type="range" min="3" max="45" step="1" value="12" />
          </label>
          <label>
            <span>강도 <output id="brush-strength-output">22</output></span>
            <input id="brush-strength" type="range" min="4" max="60" step="1" value="22" />
          </label>
        </div>
        <div class="terrain-editor-history">
          <button id="terrain-undo" type="button">되돌리기</button>
          <button id="terrain-redo" type="button">다시하기</button>
          <span id="terrain-status">${initialStatus}</span>
        </div>
      </div>

      <div class="terrain-editor-hint">VIEW: 한 손가락 이동 · 두 손가락 회전 · 핀치 확대/축소 · SCULPT: 한 손가락 지형 편집</div>
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
      clearWorldHeightmapOverride();
      this.loadedSharedOverride = false;
      reloadWorldHeightmapFromStorage();
      this.refreshWorldMaterials();
      this.markGeometryDirty('원본 WorldField로 복원 · THE WAR에도 반영됨');
    });

    this.uiRoot.querySelector('#terrain-export')?.addEventListener('click', () => this.exportHeightmap());
    this.uiRoot.querySelector('#terrain-undo')?.addEventListener('click', () => this.undo());
    this.uiRoot.querySelector('#terrain-redo')?.addEventListener('click', () => this.redo());

    this.uiRoot.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (mode !== 'view' && mode !== 'sculpt') return;
        this.setMode(mode);
        this.uiRoot.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });

    this.uiRoot.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool;
        if (tool !== 'raise' && tool !== 'lower' && tool !== 'smooth' && tool !== 'flatten') return;
        this.tool = tool;
        this.setMode('sculpt');
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
  }

  private setMode(mode: EditorMode): void {
    this.mode = mode;
    this.viewControls.enabled = mode === 'view';
    this.brushRing.visible = false;
    if (mode === 'view') this.activeSculptPointerId = null;
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
  }

  private unbindInput(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
  }

  private readonly preventContextMenu = (event: Event): void => event.preventDefault();

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.mode !== 'sculpt' || this.activeSculptPointerId !== null) return;

    event.preventDefault();
    this.activeSculptPointerId = event.pointerId;
    this.strokeSnapshotTaken = false;
    this.canvas.setPointerCapture(event.pointerId);

    const hit = this.terrainPoint(event.clientX, event.clientY);
    if (!hit) return;
    this.flattenTarget = this.normalizedHeightAtWorld(hit.x, hit.z);
    this.beginStroke();
    this.applyBrush(hit.x, hit.z);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.mode !== 'sculpt') {
      this.brushRing.visible = false;
      return;
    }

    if (this.activeSculptPointerId !== null && event.pointerId !== this.activeSculptPointerId) return;

    const hit = this.terrainPoint(event.clientX, event.clientY);
    if (!hit) {
      this.brushRing.visible = false;
      return;
    }

    this.brushRing.visible = true;
    this.brushRing.position.set(hit.x, hit.y + 0.12, hit.z);
    this.brushRing.scale.setScalar(this.brushRadius);

    if (this.activeSculptPointerId === event.pointerId) {
      event.preventDefault();
      this.beginStroke();
      this.applyBrush(hit.x, hit.z);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.activeSculptPointerId !== event.pointerId) return;

    const shouldPersist = this.strokeSnapshotTaken;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.activeSculptPointerId = null;

    if (shouldPersist) this.persistWorldHeightmap('WorldField 저장 완료 · THE WAR와 동일');
    this.strokeSnapshotTaken = false;
    this.brushRing.visible = false;
  };

  private beginStroke(): void {
    if (this.strokeSnapshotTaken) return;
    this.pushUndoSnapshot();
    this.redoStack.length = 0;
    this.strokeSnapshotTaken = true;
  }

  private applyBrush(worldX: number, worldZ: number): void {
    const centerX = ((worldX + WORLD_HALF_WIDTH) / WORLD_WIDTH) * (DATA_SIZE - 1);
    const centerY = ((WORLD_HALF_DEPTH - worldZ) / WORLD_DEPTH) * (DATA_SIZE - 1);
    const sampleWorldX = WORLD_WIDTH / (DATA_SIZE - 1);
    const sampleWorldZ = WORLD_DEPTH / (DATA_SIZE - 1);
    const radiusX = this.brushRadius / sampleWorldX;
    const radiusY = this.brushRadius / sampleWorldZ;
    const minX = Math.max(0, Math.floor(centerX - radiusX));
    const maxX = Math.min(DATA_SIZE - 1, Math.ceil(centerX + radiusX));
    const minY = Math.max(0, Math.floor(centerY - radiusY));
    const maxY = Math.min(DATA_SIZE - 1, Math.ceil(centerY + radiusY));
    const source = this.tool === 'smooth' ? this.heights.slice() : this.heights;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x - centerX) * sampleWorldX;
        const dz = (y - centerY) * sampleWorldZ;
        const distance = Math.hypot(dx, dz);
        if (distance > this.brushRadius) continue;
        const falloff = Math.pow(1 - distance / Math.max(0.0001, this.brushRadius), 1.65);
        const index = y * DATA_SIZE + x;
        const current = this.heightAtIndex(index);
        let next = current;

        if (this.tool === 'raise') next = current + this.brushStrength * falloff;
        if (this.tool === 'lower') next = current - this.brushStrength * falloff;
        if (this.tool === 'flatten') {
          next = THREE.MathUtils.lerp(
            current,
            this.flattenTarget,
            Math.min(0.5, this.brushStrength * 10) * falloff,
          );
        }
        if (this.tool === 'smooth') {
          const average = neighborAverage(source, x, y, DATA_SIZE);
          next = THREE.MathUtils.lerp(
            current,
            average,
            Math.min(0.72, this.brushStrength * 14) * falloff,
          );
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

  private normalizedHeightAtWorld(x: number, z: number): number {
    const u = THREE.MathUtils.clamp((x + WORLD_HALF_WIDTH) / WORLD_WIDTH, 0, 1);
    const v = THREE.MathUtils.clamp((WORLD_HALF_DEPTH - z) / WORLD_DEPTH, 0, 1);
    return bilinearSampleFloat(this.heights, DATA_SIZE, DATA_SIZE, u, v);
  }

  private updateTerrainGeometry(): void {
    this.geometryDirty = false;
    const positions = this.terrain.geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const raw = this.normalizedHeightAtWorld(x, z);
      positions.setY(i, terrainHeightFromRawValue(x, z, raw));
    }
    positions.needsUpdate = true;
    this.terrain.geometry.computeVertexNormals();
    this.terrain.geometry.computeBoundingBox();
    this.terrain.geometry.computeBoundingSphere();
  }

  private refreshWorldMaterials(): void {
    clearTerrainBlendControlMapCache();

    const previousTerrain = this.terrain.material;
    const previousWater = this.water.material;
    this.terrain.material = this.createTerrainMaterial();
    this.water.material = this.createWaterMaterial();
    previousTerrain.dispose();
    previousWater.dispose();
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
    this.markGeometryDirty();
    this.persistWorldHeightmap('되돌림 · THE WAR WorldField에 반영됨');
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.heights.slice());
    this.heights.set(next);
    this.markGeometryDirty();
    this.persistWorldHeightmap('다시 적용 · THE WAR WorldField에 반영됨');
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
        this.heights[i] = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      }

      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.markGeometryDirty();
      this.persistWorldHeightmap(`${file.name} · 257² · THE WAR WorldField에 반영됨`);
    } catch (error) {
      if (status) status.textContent = `불러오기 실패: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }

  private exportHeightmap(): void {
    this.persistWorldHeightmap();
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
      this.setStatus('PNG 저장 준비 완료 · THE WAR 공유맵도 최신 상태');
    }, 'image/png');
  }

  private persistWorldHeightmap(status?: string): void {
    const saved = writeWorldHeightmapOverride(this.heights, DATA_SIZE, DATA_SIZE);
    if (!saved) {
      this.setStatus('THE WAR 저장 실패 · 브라우저 저장공간을 확인해줘');
      return;
    }

    const shared = readWorldHeightmapOverride();
    if (shared) {
      fillResampledHeightmap(this.heights, shared.bytes, shared.width, shared.height);
    }

    reloadWorldHeightmapFromStorage();
    this.refreshWorldMaterials();
    this.geometryDirty = true;
    this.loadedSharedOverride = true;
    if (status) this.setStatus(status);
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

function fillResampledHeightmap(
  target: Float32Array,
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
): void {
  for (let y = 0; y < DATA_SIZE; y += 1) {
    const v = y / (DATA_SIZE - 1);
    for (let x = 0; x < DATA_SIZE; x += 1) {
      const u = x / (DATA_SIZE - 1);
      target[y * DATA_SIZE + x] = sampleHeightmapBytesBilinear(
        source,
        sourceWidth,
        sourceHeight,
        u,
        v,
      ) / 255;
    }
  }
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
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, tx),
    THREE.MathUtils.lerp(c, d, tx),
    ty,
  );
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
