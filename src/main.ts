import './styles.css';
import { Game } from './core/Game';
import { hydrateCanonicalWorldMap } from './world/WorldMapRepository';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('THE WAR canvas was not found.');
}

const gameCanvas = canvas;
const isTerrainEditorRoute = window.location.pathname.includes('/terrain-editor');
const isTerrainEditor = isTerrainEditorRoute && !new URLSearchParams(window.location.search).has('play');
installTouchPlatformGuards();

// Every fresh app boot starts from the canonical remote world. Terrain Lab may layer
// a local draft on top after this point, but normal THE WAR never reads editor drafts.
await hydrateCanonicalWorldMap();

if (isTerrainEditor) {
  document.documentElement.classList.add('terrain-editor-active');
  document.body.classList.add('terrain-editor-active');
  installTerrainEditorServiceWorker();

  const { TerrainEditor } = await import('./terrain-editor/TerrainEditor');
  const editor = new TerrainEditor(gameCanvas);
  installTerrainEditorGameLink(editor);
  editor.start();
} else {
  if (isTerrainEditorRoute) installTerrainEditorServiceWorker();
  const game = new Game(gameCanvas);
  game.start();
}

interface TerrainEditorPreviewController {
  dispose(): void;
}

function installTerrainEditorGameLink(editor: TerrainEditorPreviewController): void {
  const actions = document.querySelector<HTMLElement>('.terrain-editor-actions');
  if (!actions || actions.querySelector('[data-open-world]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'terrain-editor-button';
  button.dataset.openWorld = '';
  button.textContent = 'THE WAR';
  button.title = '현재 Terrain Lab draft를 실제 게임 렌더러로 미리보기';
  button.addEventListener('click', () => {
    editor.dispose();
    document.documentElement.classList.remove('terrain-editor-active');
    document.body.classList.remove('terrain-editor-active');

    const playUrl = new URL(window.location.href);
    playUrl.search = '?play=1';
    playUrl.hash = '';
    window.history.replaceState(null, '', playUrl.href);

    // No reload here: the game consumes the exact in-memory WorldField draft that
    // Terrain Lab just authored. A fresh navigation still boots from Supabase canonical.
    const game = new Game(gameCanvas);
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
