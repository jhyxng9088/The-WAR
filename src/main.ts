import './styles.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('THE WAR canvas was not found.');
}

const game = new Game(canvas);
game.start();
