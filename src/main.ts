import './styles.css';
import { Game } from './core/Game';
import { WORLD_HEIGHTMAP_STORAGE_KEY } from './world/WorldHeightmapStore';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('THE WAR canvas was not found.');
}

const isTerrainEditor = window.location.pathname.includes('/terrain-editor');
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
  button.title = '같은 앱 컨텍스트에서 THE WAR 열기';
  button.addEventListener('click', () => {
    // Do not open a new tab/window here. Terrain Lab persists its heightmap in the
    // current web-app storage partition, so the production world must be entered
    // through the same browsing/app context to read the exact same override.
    window.location.assign(new URL('../', window.location.href).href);
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
  // Terrain Lab can still cache its own editor shell, but the manifest scope also
  // includes THE WAR so navigation through the editor's THE WAR button stays in
  // one standalone app/storage context on iOS instead of crossing PWA boundaries.
  if ('serviceWorker' in navigator) {
    const serviceWorkerUrl = new URL('sw.js', window.location.href);
    void navigator.serviceWorker.register(serviceWorkerUrl, { scope: './' }).catch((error: unknown) => {
      console.warn('Terrain Lab service worker registration failed.', error);
    });
  }
}
