import { PALETTE, PALETTE_CSS } from '../config.js';
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
    this.load.image('pwr',    'assets/sprites/pwr.webp');
    this.load.image('bg',     'assets/backgrounds/bg.webp');
    // sound effects — AAC/m4a: ~10x smaller than WAV, plays everywhere
    this.load.audio('on-hit',     'sfx/on-hit.m4a');
    this.load.audio('on-hit-2',   'sfx/on-hit-2.m4a');
    this.load.audio('collect',    'sfx/collect.m4a');
    this.load.audio('jump',       'sfx/jump.m4a');
    this.load.audio('game-start', 'sfx/game-start.m4a');
    this.load.audio('game-over',  'sfx/game-over.m4a');
    this.load.audio('pwr-up',     'sfx/pwr-up.m4a');
    // background music
    this.load.audio('start-bgm',  'bgm/start-bgm.m4a');
    this.load.audio('game-bgm',   'bgm/game-bgm.m4a');
    this.load.audio('pwr-bgm',    'bgm/pwr-up.m4a');
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
      ? { score: 12, timeUsedMs: 95000, cause: 'crash' }
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
    this._makeRushVignette();
  }

  // Red edge-glow used while the Power Rush power-up is active. A radial
  // gradient — clear in the middle so gameplay stays readable, deep red at
  // the edges so the screen "glows".
  _makeRushVignette() {
    const w = this.scale.width;
    const h = this.scale.height;
    const tex = this.textures.createCanvas('rush-vignette', w, h);
    const ctx = tex.context;
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, outer * 0.30, cx, cy, outer);
    grad.addColorStop(0.00, 'rgba(255, 45, 45, 0)');
    grad.addColorStop(0.60, 'rgba(255, 30, 30, 0.13)');
    grad.addColorStop(1.00, 'rgba(214, 16, 16, 0.66)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
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
    // A vertical obstacle. Sized as tall as the game world so a pipe always
    // spans from its gap edge to the top/bottom of the screen, whatever the
    // device aspect ratio works out to.
    //
    // Built as a Canvas texture (not Graphics + generateTexture): the 2D
    // canvas gradient bakes real per-pixel colour into the texture, whereas
    // Graphics.fillGradientStyle is dropped by generateTexture.
    const w = 64;
    const h = this.scale.height;
    const tex = this.textures.createCanvas('pipe', w, h);
    const ctx = tex.context;

    // Rounded-cylinder gold shading: dark gold at both edges brightening to a
    // highlight band ~42% across, so the pillar reads as a glossy gold tube.
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.00, PALETTE_CSS.goldEdge);
    grad.addColorStop(0.16, PALETTE_CSS.goldDark);
    grad.addColorStop(0.42, PALETTE_CSS.goldLight);
    grad.addColorStop(0.74, PALETTE_CSS.goldDark);
    grad.addColorStop(1.00, PALETTE_CSS.goldEdge);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // thin specular highlight down the brightest column
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.fillRect(Math.round(w * 0.42) - 2, 0, 2, h);

    tex.refresh();
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
