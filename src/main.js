import { GAME, PALETTE_CSS } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { StartScene } from './scenes/StartScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

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
    height: GAME.height,
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
