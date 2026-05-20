import { PALETTE } from '../config.js';
import { applyMutePreference } from '../muteButton.js';

// BootScene preloads any assets the game needs and then hands off to StartScene.
// For now we generate placeholder textures at runtime so the game runs before
// real art arrives in /assets.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // images — WebP (lossless): smaller than PNG, broadly supported
    this.load.image('pbot',   'assets/sprites/pbot.webp');
    this.load.image('ruby',   'assets/sprites/ruby.webp');
    this.load.image('logo',   'assets/sprites/game_logo.webp');
    this.load.image('magnet', 'assets/sprites/magnet.webp');
    this.load.image('bg',     'assets/backgrounds/bg.webp');
    // sound effects — AAC/m4a: ~10x smaller than WAV, plays everywhere
    this.load.audio('on-hit',     'sfx/on-hit.m4a');
    this.load.audio('on-hit-2',   'sfx/on-hit-2.m4a');
    this.load.audio('collect',    'sfx/collect.m4a');
    this.load.audio('jump',       'sfx/jump.m4a');
    this.load.audio('game-start', 'sfx/game-start.m4a');
    this.load.audio('game-over',  'sfx/game-over.m4a');
    // background music
    this.load.audio('start-bgm',  'bgm/start-bgm.m4a');
    this.load.audio('game-bgm',   'bgm/game-bgm.m4a');
  }

  create() {
    this._buildPlaceholderTextures();

    // honour the player's saved mute preference before any scene plays audio
    applyMutePreference(this);

    // Dev hook: ?scene=GameScene or ?scene=GameOverScene jumps straight to
    // a scene, with sensible mock data for GameOver. Default is StartScene.
    const params = new URLSearchParams(window.location.search);
    const target = params.get('scene') || 'StartScene';
    const payload = target === 'GameOverScene'
      ? { score: 12, timeUsedMs: 95000, cause: 'time' }
      : undefined;
    this.scene.start(target, payload);
  }

  // --- placeholder texture factory ---------------------------------------
  // These are simple shape-based textures so we can build & test gameplay
  // before final art is dropped into /assets. They share the names that the
  // final image files will use, so swapping later is a one-line change in
  // BootScene.preload().
  _buildPlaceholderTextures() {
    this._makePipe();
    this._makeStar();
    this._makeSparkle();
  }

  // A 4-point star sparkle, shared by the start screen and the magnet
  // power-up. Generated once here so every scene can use the 'sparkle' key.
  _makeSparkle() {
    const s = 32;
    const c = s / 2;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const pts = [];
    for (let i = 0; i < 8; i += 1) {
      const ang = (Math.PI / 4) * i - Math.PI / 2;
      const rad = (i % 2 === 0) ? c : c * 0.34;
      pts.push({ x: c + Math.cos(ang) * rad, y: c + Math.sin(ang) * rad });
    }
    g.fillStyle(0xffffff, 1);
    g.fillPoints(pts, true);
    g.generateTexture('sparkle', s, s);
    g.destroy();
  }

  _makePipe() {
    // A vertical obstacle. Stored as a 64x600 texture; instances are cropped
    // or tiled by the GameScene as needed.
    const w = 64;
    const h = 600;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(PALETTE.royalBlue, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(PALETTE.navy, 1);
    g.fillRect(2, 0, 6, h); // left shadow stripe
    g.fillStyle(PALETTE.yellow, 0.4);
    g.fillRect(w - 8, 0, 4, h); // right highlight
    g.generateTexture('pipe', w, h);
    g.destroy();
  }

  _makeStar() {
    const s = 8;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(PALETTE.yellow, 1);
    g.fillCircle(s / 2, s / 2, s / 2);
    g.generateTexture('star', s, s);
    g.destroy();
  }
}
