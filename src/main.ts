import './styles/app.css';
import { PathGame } from './app/PathGame';

declare global {
  interface Window {
    advanceTime?: (milliseconds: number) => void;
    render_game_to_text?: () => string;
    startPathGame?: () => void;
    jumpPathToObjective?: () => void;
    jumpPathToSand?: () => void;
    jumpPathToTraffic?: () => void;
    jumpPathToCityCenter?: () => void;
    jumpPathToProps?: () => void;
    jumpPathToFixture?: (fixtureId: string) => void;
    togglePathDebug?: () => boolean;
    getPathTuningDebug?: () => ReturnType<PathGame['getTuningDebug']>;
    getPathAudioDebug?: () => ReturnType<PathGame['getAudioDebug']>;
    setPathRenderDebugView?: (viewId: string) => ReturnType<PathGame['setRenderDebugView']>;
    getPathRenderDebug?: () => ReturnType<PathGame['getRenderDebugState']>;
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

window.jumpPathToSand = () => {
  game.jumpToSand();
};

window.jumpPathToTraffic = () => {
  game.jumpToTraffic();
};

window.jumpPathToCityCenter = () => {
  game.jumpToCityCenter();
};

window.jumpPathToProps = () => {
  game.jumpToProps();
};

window.jumpPathToFixture = (fixtureId: string) => {
  game.jumpToFixture(fixtureId);
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

window.togglePathDebug = () => {
  return game.toggleDebugPanel();
};

window.getPathTuningDebug = () => {
  return game.getTuningDebug();
};

window.setPathRenderDebugView = (viewId: string) => {
  return game.setRenderDebugView(viewId);
};

window.getPathRenderDebug = () => {
  return game.getRenderDebugState();
};

void game.boot().catch((error: unknown) => {
  console.error(error);
});
