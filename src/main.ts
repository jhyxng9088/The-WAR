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
  installTerrainEditorGameLink(editor);
  editor.start();
} else {
  if (isTerrainEditorRoute) installTerrainEditorServiceWorker();
  installSharedTerrainReload();
  const game = new Game(canvas);
  game.start();
}

interface TerrainEditorPreviewController {
  dispose(): void;
}

function installSharedTerrainReload(): void {
  window.addEventListener('storage', (event) => {
    if (event.key !== WORLD_HEIGHTMAP_STORAGE_KEY || event.oldValue === event.newValue) return;
    window.location.reload();
  });
}

function installTerrainEditorGameLink(editor: TerrainEditorPreviewController): void {
  const actions = document.querySelector<HTMLElement>('.terrain-editor-actions');
  if (!actions || actions.querySelector('[data-open-world]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'terrain-editor-button';
  button.dataset.openWorld = '';
  button.textContent = 'THE WAR';
  button.title = '현재 Terrain Lab WorldField를 그대로 THE WAR에서 보기';
  button.addEventListener('click', () => {
    editor.dispose();
    document.documentElement.classList.remove('terrain-editor-active');
    document.body.classList.remove('terrain-editor-active');

    const playUrl = new URL(window.location.href);
    playUrl.search = '?play=1';
    playUrl.hash = '';
    window.history.replaceState(null, '', playUrl.href);

    installSharedTerrainReload();
    const game = new Game(canvas);
    game.start();
  });
  actions.prepend(button);
}

function installTouchPlatformGuards(): void {
  const blockNativeZoom: EventListener = (event) => event.preventDefault();
  for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(eventName, blockNativeZoom, { passive: false });
  }
  document.addEventListener('dblclick', blockNativeZoom, { passive: false });
}

function installTerrainEditorServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    const serviceWorkerUrl = new URL('sw.js', window.location.href);
    void navigator.serviceWorker.register(serviceWorkerUrl, { scope: './' }).catch((error: unknown) => {
      console.warn('Terrain Lab service worker registration failed.', error);
    });
  }
}
