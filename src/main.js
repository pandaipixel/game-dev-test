import { GAME, PALETTE_CSS } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { StartScene } from './scenes/StartScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

// The game has a fixed design width (GAME.width). Its height is sized to the
// device's aspect ratio so Phaser's FIT mode fills the whole screen with no
// letterbox bars. Clamped so it is never shorter than the original design
// height (short/wide screens like desktop keep the full layout) and never
// absurdly tall on pathological viewports.
const MAX_HEIGHT = 1400;
const aspectHeight = Math.round(GAME.width * window.innerHeight / window.innerWidth);
const gameHeight = Math.max(GAME.height, Math.min(MAX_HEIGHT, aspectHeight));

const config = {
  type: Phaser.AUTO,
  parent: 'game-canvas-wrap',
  backgroundColor: PALETTE_CSS.navy,
  // Crisp nearest-neighbor scaling for pixel-art sprites (pbot et al.)
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:  GAME.width,
    height: gameHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, StartScene, GameScene, GameOverScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
