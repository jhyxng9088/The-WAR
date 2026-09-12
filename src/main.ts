import './styles.css';
import { Game } from './core/Game';
import { WORLD_HEIGHTMAP_STORAGE_KEY } from './world/WorldHeightmapStore';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('THE WAR canvas was not found.');
}

const isTerrainEditor = window.location.pathname.includes('/terrain-editor');

if (isTerrainEditor) {
  document.documentElement.classList.add('terrain-editor-active');
  document.body.classList.add('terrain-editor-active');
  installTerrainEditorPlatformGuards();

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

function installTerrainEditorPlatformGuards(): void {
  const blockNativeZoom: EventListener = (event) => event.preventDefault();
  const blockNativePinch = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  // Safari can still invoke page-level gesture zoom outside the canvas even
  // when the viewport meta tag and canvas touch-action are already locked.
  // Keep those native gestures disabled while TerrainEditor owns its own
  // two-pointer map zoom.
  for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(eventName, blockNativeZoom, { passive: false });
  }
  document.addEventListener('touchmove', blockNativePinch, { passive: false });
  document.addEventListener('dblclick', blockNativeZoom, { passive: false });

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
