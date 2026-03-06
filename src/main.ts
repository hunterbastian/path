import './styles/app.css';
import { PathGame } from './app/PathGame';

declare global {
  interface Window {
    advanceTime?: (milliseconds: number) => void;
    render_game_to_text?: () => string;
    startPathGame?: () => void;
    jumpPathToObjective?: () => void;
    getPathAudioDebug?: () => ReturnType<PathGame['getAudioDebug']>;
  }
}

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing #app root element.');
}

const game = new PathGame(root);

window.startPathGame = () => {
  game.start();
};

window.jumpPathToObjective = () => {
  game.jumpToObjective();
};

window.advanceTime = (milliseconds: number) => {
  game.advanceTime(milliseconds);
};

window.render_game_to_text = () => {
  return game.renderGameToText();
};

window.getPathAudioDebug = () => {
  return game.getAudioDebug();
};

void game.boot().catch((error: unknown) => {
  console.error(error);
});
