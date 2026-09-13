import './styles.css';
import { Game } from './core/Game';
import { WORLD_HEIGHTMAP_STORAGE_KEY } from './world/WorldHeightmapStore';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('THE WAR canvas was not found.');
}

const isTerrainEditorRoute = window.location.pathname.includes('/terrain-editor');
const isTerrainEditor = isTerrainEditorRoute && !new URLSearchParams(window.location.search).has('play');
installTouchPlatformGuards();

if (isTerrainEditor) {
  document.documentElement.classList.add('terrain-editor-active');
  document.body.classList.add('terrain-editor-active');
  installTerrainEditorServiceWorker();

  const { TerrainEditor } = await import('./terrain-editor/TerrainEditor');
  const editor = new TerrainEditor(canvas);
  installTerrainEditorGameLink();
  editor.start();
} else {
  if (isTerrainEditorRoute) installTerrainEditorServiceWorker();
  installSharedTerrainReload();
  const game = new Game(canvas);
  game.start();
}

function installSharedTerrainReload(): void {
  window.addEventListener('storage', (event) => {
    if (event.key !== WORLD_HEIGHTMAP_STORAGE_KEY || event.oldValue === event.newValue) return;
    // WorldField owns derived distance/control data at module startup. A clean reload
    // keeps every dependent system (terrain, forests, settlements and overlays) on
    // the exact same Terrain Lab heightmap rather than hot-swapping only the mesh.
    window.location.reload();
  });
}

function installTerrainEditorGameLink(): void {
  const actions = document.querySelector<HTMLElement>('.terrain-editor-actions');
  if (!actions || actions.querySelector('[data-open-world]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'terrain-editor-button';
  button.dataset.openWorld = '';
  button.textContent = 'THE WAR';
  button.title = '현재 Terrain Lab 저장소로 THE WAR 열기';
  button.addEventListener('click', () => {
    // Keep production THE WAR under /terrain-editor/ when launched from Terrain Lab.
    // This remains inside the already-installed editor PWA scope even on iOS, so
    // the game reads the exact localStorage partition that the editor just wrote.
    const playUrl = new URL(window.location.href);
    playUrl.search = '?play=1';
    playUrl.hash = '';
    window.location.assign(playUrl.href);
  });
  actions.prepend(button);
}

function installTouchPlatformGuards(): void {
  const blockNativeZoom: EventListener = (event) => event.preventDefault();

  // The canvas owns touch input with touch-action:none. Blocking document-level
  // touchmove competed with pointer-based camera controls on iPadOS, so only
  // suppress Safari's native page-zoom gestures here and leave the pointer stream
  // untouched for Three.js MapControls.
  for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(eventName, blockNativeZoom, { passive: false });
  }
  document.addEventListener('dblclick', blockNativeZoom, { passive: false });
}

function installTerrainEditorServiceWorker(): void {
  // Keep the editor shell network-first. The ?play=1 production view deliberately
  // stays under this same scope so an installed Terrain Lab never has to cross into
  // a separate browser/PWA storage context just to preview its edited WorldField.
  if ('serviceWorker' in navigator) {
    const serviceWorkerUrl = new URL('sw.js', window.location.href);
    void navigator.serviceWorker.register(serviceWorkerUrl, { scope: './' }).catch((error: unknown) => {
      console.warn('Terrain Lab service worker registration failed.', error);
    });
  }
}
