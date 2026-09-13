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
  // The editor is installable as a standalone PWA. Keep runtime requests
  // network-first so a new GitHub Pages deploy cannot mix an old cached shell
  // with new hashed bundles.
  if ('serviceWorker' in navigator) {
    const serviceWorkerUrl = new URL('sw.js', window.location.href);
    void navigator.serviceWorker.register(serviceWorkerUrl, { scope: './' }).catch((error: unknown) => {
      console.warn('Terrain Lab service worker registration failed.', error);
    });
  }
}
