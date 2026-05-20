import { PALETTE, PALETTE_CSS, FONTS } from '../config.js';
import { addMuteButton } from '../muteButton.js';

export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
  }

  create() {
    const { width, height } = this.scale;

    this._drawBackground(width, height);
    this._drawLogo(width, height);
    this._drawMascot(width, height);
    this._drawPlayButton(width, height);

    // start-screen music — loops until the player leaves for the game
    this.startBgm = this.sound.add('start-bgm', { loop: true, volume: 0.5 });
    this.startBgm.play();
    this.events.once('shutdown', () => this.startBgm.stop());

    addMuteButton(this, width - 34, 38);
  }

  // ---------------------------------------------------------------------
  // Background — bg.png, cover-fit. No dimming overlay: the logo, button
  // and stroked tagline read cleanly against the art on their own.
  _drawBackground(width, height) {
    const bg = this.add.image(width / 2, height / 2, 'bg');
    const tex = this.textures.get('bg').getSourceImage();
    const scale = Math.max(width / tex.width, height / tex.height);
    bg.setScale(scale);
  }

  // Game logo — replaces the old text title. Bobs slowly up and down and
  // is framed by a few twinkling sparkles.
  _drawLogo(width, height) {
    const cx = width / 2;
    const logoY = height * 0.215;

    const group = this.add.container(cx, logoY);

    const logo = this.add.image(0, 0, 'logo');
    logo.setScale(290 / logo.width); // ~290px wide, aspect preserved
    group.add(logo);

    this._addSparkles(group, logo.displayWidth, logo.displayHeight);

    // slow, smooth up-and-down bob
    this.tweens.add({
      targets: group,
      y: logoY - 14,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // tagline below the logo — stroked + shadowed so it reads on the
    // detailed background without a dimming overlay
    this.add.text(cx, height * 0.42, 'Tap to fly  •  Collect rubies  •  Beat 3:00', {
      fontFamily: FONTS.ui,
      fontSize:   '16px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.white,
      stroke:     PALETTE_CSS.navy,
      strokeThickness: 5,
    }).setOrigin(0.5).setShadow(0, 2, PALETTE_CSS.navy, 4, false, true);
  }

  // A handful of star sparkles around the logo, twinkling on a stagger.
  // Added to the logo's container so they bob along with it.
  _addSparkles(group, lw, lh) {
    // the 'sparkle' texture is generated once in BootScene

    // positions are fractions of the logo size, relative to its centre
    const spots = [
      { x: -0.52, y: -0.30, s: 1.0 },
      { x:  0.50, y: -0.40, s: 1.2 },
      { x:  0.56, y:  0.22, s: 0.85 },
      { x: -0.48, y:  0.30, s: 1.0 },
      { x:  0.12, y: -0.52, s: 0.7 },
      { x: -0.10, y:  0.50, s: 0.8 },
    ];
    const tints = [PALETTE.white, PALETTE.yellow, PALETTE.orange];

    spots.forEach((p, i) => {
      const spark = this.add.image(p.x * lw, p.y * lh, 'sparkle')
        .setTint(tints[i % tints.length])
        .setScale(0)
        .setAlpha(0);
      group.add(spark);
      this.tweens.add({
        targets: spark,
        alpha: { from: 0, to: 1 },
        scale: { from: 0, to: 0.5 * p.s },
        angle: 90,
        duration: 720,
        delay: i * 360,
        hold: 110,
        yoyo: true,
        repeat: -1,
        repeatDelay: 850 + i * 170,
        ease: 'Sine.easeInOut',
      });
    });
  }

  // pbot mascot — central, bobs gently and tilts.
  _drawMascot(width, height) {
    const cx = width / 2;
    const my = height * 0.5;

    const pbot = this.add.image(cx, my, 'pbot').setScale(0.32);
    this.tweens.add({
      targets: pbot,
      y: my - 18,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: pbot,
      angle: { from: -6, to: 6 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // orbiting ruby teaser
    const ruby = this.add.image(cx + 100, my + 30, 'ruby').setDisplaySize(72, 72);
    this.tweens.add({
      targets: ruby,
      x: cx - 100,
      y: my + 10,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: ruby,
      angle: 360,
      duration: 3000,
      repeat: -1,
      ease: 'Linear',
    });
  }

  // PLAY button — Pandai Design System 1.5 "Start Game" Enabled Large.
  // Figma: https://www.figma.com/design/Y0DLhf2MGdGwG0jyjN7EbQ?node-id=1390-11
  _drawPlayButton(width, height) {
    const cx = width / 2;
    const by = height * 0.76;

    const SPEC = {
      W: 280,
      totalH: 64,
      innerH: 56,
      cornerOuter: 32,
      cornerInner: 28,
      // Enabled state colors (Figma node 1390:12)
      base:        0xde9d00,
      innerTop:    0xffe258,
      innerBot:    0xffba0a,
      innerBorder: 0xffd633,
      text:        '#de0909',
      iconL:       0xde0909,
      iconRTop:    0xfe0601,
      iconRBot:    0x00193b,
      iconRBorder: 0xffd633,
    };

    const btn = this.add.container(cx, by);

    // Outer "base" — the mustard shadow that gives the 3D look.
    const base = this.add.graphics();
    base.fillStyle(SPEC.base, 1);
    base.fillRoundedRect(-SPEC.W / 2, -SPEC.totalH / 2, SPEC.W, SPEC.totalH, SPEC.cornerOuter);
    btn.add(base);

    // Inner button — yellow vertical gradient, sits flush with the top of
    // the base so 8px of mustard is visible underneath as the "shadow".
    const innerTop = -SPEC.totalH / 2;
    const inner = this.add.graphics();
    inner.fillGradientStyle(
      SPEC.innerTop, SPEC.innerTop,
      SPEC.innerBot, SPEC.innerBot,
      1, 1, 1, 1,
    );
    inner.fillRoundedRect(-SPEC.W / 2, innerTop, SPEC.W, SPEC.innerH, SPEC.cornerInner);
    inner.lineStyle(1, SPEC.innerBorder, 1);
    inner.strokeRoundedRect(-SPEC.W / 2, innerTop, SPEC.W, SPEC.innerH, SPEC.cornerInner);
    btn.add(inner);

    // Inner content layout: [pad] [iconL 32] [text] [iconR 32] [pad]
    const innerCenterY = innerTop + SPEC.innerH / 2;
    const padX = 16;
    const iconSize = 32;
    const leftIconX  = -SPEC.W / 2 + padX + iconSize / 2;
    const rightIconX =  SPEC.W / 2 - padX - iconSize / 2;

    const leftIcon = this._drawBarChartIcon(SPEC.iconL, iconSize);
    leftIcon.setPosition(leftIconX, innerCenterY);
    btn.add(leftIcon);

    // Text centred between the two icons
    const textX = (leftIconX + iconSize / 2 + rightIconX - iconSize / 2) / 2;
    const label = this.add.text(textX, innerCenterY, 'Start Game', {
      fontFamily: '"Poppins", "Segoe UI", Tahoma, sans-serif',
      fontSize:   '28px',
      fontStyle:  'bold',
      color:      SPEC.text,
    }).setOrigin(0.5);
    btn.add(label);

    const rightIcon = this._drawArrowCircleIcon(
      SPEC.iconRTop, SPEC.iconRBot, SPEC.iconRBorder, iconSize,
    );
    rightIcon.setPosition(rightIconX, innerCenterY);
    btn.add(rightIcon);

    // Hit area — padded well beyond the visual button so clicks and taps
    // near (or just outside) the edges still register, on mouse and touch.
    const HIT_PAD_X = 48;
    const HIT_PAD_Y = 30;
    btn.setSize(SPEC.W, SPEC.totalH);
    btn.setInteractive(
      new Phaser.Geom.Rectangle(
        -SPEC.W / 2 - HIT_PAD_X,
        -SPEC.totalH / 2 - HIT_PAD_Y,
        SPEC.W + HIT_PAD_X * 2,
        SPEC.totalH + HIT_PAD_Y * 2,
      ),
      Phaser.Geom.Rectangle.Contains,
    );

    btn.on('pointerover', () => {
      this.input.setDefaultCursor('pointer');
      this.tweens.add({ targets: btn, scale: 1.03, duration: 120, ease: 'Sine.easeOut' });
    });
    btn.on('pointerout', () => {
      this.input.setDefaultCursor('default');
      this.tweens.add({ targets: btn, scale: 1.0, duration: 120, ease: 'Sine.easeOut' });
    });
    btn.on('pointerdown', () => {
      // play the start jingle; GameScene then brings in the game music
      this.sound.play('game-start', { volume: 0.7 });
      // Tactile press — shift the whole button down so the mustard base appears at top,
      // mirroring the Figma "Pressed" state's pt-[8px] flip.
      this.tweens.add({
        targets: btn,
        scale: 0.97,
        y: by + 4,
        duration: 80,
        yoyo: true,
        onComplete: () => this.scene.start('GameScene'),
      });
    });
  }

  _drawBarChartIcon(color, size) {
    const g = this.add.graphics();
    const barW = size * 0.18;
    const gap  = size * 0.07;
    const heights = [size * 0.45, size * 0.65, size * 0.85];
    g.fillStyle(color, 1);
    for (let i = 0; i < 3; i += 1) {
      const x = -size / 2 + size * 0.15 + i * (barW + gap);
      const h = heights[i];
      g.fillRect(x, size / 2 - h, barW, h);
    }
    return g;
  }

  _drawArrowCircleIcon(topColor, botColor, borderColor, size) {
    const r = size / 2;
    const g = this.add.graphics();
    g.fillGradientStyle(topColor, topColor, botColor, botColor, 1, 1, 1, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(1, borderColor, 1);
    g.strokeCircle(0, 0, r);
    // chevron right ›
    g.lineStyle(2.5, PALETTE.white, 1);
    g.beginPath();
    g.moveTo(-size * 0.12, -size * 0.20);
    g.lineTo( size * 0.14,  0);
    g.lineTo(-size * 0.12,  size * 0.20);
    g.strokePath();
    return g;
  }

}
