import './styles.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('THE WAR canvas was not found.');
}

const isTerrainEditor = window.location.pathname.includes('/terrain-editor');

if (isTerrainEditor) {
  document.body.classList.add('terrain-editor-active');
  const { TerrainEditor } = await import('./terrain-editor/TerrainEditor');
  const editor = new TerrainEditor(canvas);
  editor.start();
} else {
  const game = new Game(canvas);
  game.start();
}
