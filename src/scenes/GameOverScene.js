import { PALETTE, PALETTE_CSS, FONTS } from '../config.js';
import { addMuteButton } from '../muteButton.js';

const BEST_KEY = 'flying-ruby:best';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.score      = data?.score ?? 0;
    this.timeUsedMs = data?.timeUsedMs ?? 0;
    this.cause      = data?.cause ?? 'crash'; // 'crash' | 'time'

    // load + update best score — guarded, since sandboxed webviews and
    // private mode can make localStorage throw
    let prev = 0;
    try { prev = Number(window.localStorage.getItem(BEST_KEY) ?? 0); }
    catch { /* storage unavailable */ }
    this.previousBest = prev;
    this.isNewBest = this.score > prev;
    if (this.isNewBest) {
      try { window.localStorage.setItem(BEST_KEY, String(this.score)); }
      catch { /* storage unavailable — best score just won't persist */ }
    }
  }

  create() {
    const { width, height } = this.scale;

    this._drawBackground(width, height);
    this._drawHeader(width, height);
    this._drawScorePanel(width, height);
    this._drawButtons(width, height);

    // game-over sting
    this.sound.play('game-over', { volume: 0.7 });

    addMuteButton(this, width - 34, 38);
  }

  // ---------------------------------------------------------------------
  _drawBackground(width, height) {
    const bg = this.add.image(width / 2, height / 2, 'bg');
    const tex = this.textures.get('bg').getSourceImage();
    const scale = Math.max(width / tex.width, height / tex.height);
    bg.setScale(scale);

    // heavier dim for game over so the results panel pops
    this.add.rectangle(width / 2, height / 2, width, height, PALETTE.navy, 0.6);
  }

  _drawHeader(width, height) {
    const cx = width / 2;
    const isTimeUp = this.cause === 'time';
    const heading  = isTimeUp ? "TIME'S UP!" : 'GAME OVER';
    const color    = isTimeUp ? PALETTE_CSS.yellow : PALETTE_CSS.ruby;
    const strokeC  = isTimeUp ? PALETTE_CSS.darkRed : PALETTE_CSS.yellow;

    const title = this.add.text(cx, height * 0.18, heading, {
      fontFamily: FONTS.ui,
      fontSize:   '56px',
      fontStyle:  'bold',
      color,
      stroke:     strokeC,
      strokeThickness: 8,
    }).setOrigin(0.5);

    // entrance pop
    title.setScale(0.6);
    this.tweens.add({
      targets: title,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    const subtitle = isTimeUp
      ? 'You flew the full 3:00 round!'
      : 'pbot took a tumble.';
    this.add.text(cx, height * 0.18 + 50, subtitle, {
      fontFamily: FONTS.ui,
      fontSize:   '14px',
      color:      PALETTE_CSS.white,
    }).setOrigin(0.5).setAlpha(0.85);
  }

  _drawScorePanel(width, height) {
    const cx = width / 2;
    const py = height * 0.45;
    const pw = 320;
    const ph = 240;

    const panel = this.add.graphics();
    panel.fillStyle(PALETTE.navy, 0.78);
    panel.fillRoundedRect(cx - pw / 2, py - ph / 2, pw, ph, 18);
    panel.lineStyle(3, PALETTE.yellow, 0.55);
    panel.strokeRoundedRect(cx - pw / 2, py - ph / 2, pw, ph, 18);

    // "RUBIES" label
    this.add.text(cx, py - 80, 'RUBIES COLLECTED', {
      fontFamily: FONTS.ui,
      fontSize:   '13px',
      color:      PALETTE_CSS.white,
    }).setOrigin(0.5).setAlpha(0.75);

    // big score with ruby icon
    const scoreRow = this.add.container(cx, py - 38);
    const ruby = this.add.image(-58, 0, 'ruby').setDisplaySize(56, 56);
    const num  = this.add.text(0, 0, String(this.score), {
      fontFamily: FONTS.ui,
      fontSize:   '64px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
      stroke:     PALETTE_CSS.darkRed,
      strokeThickness: 6,
    }).setOrigin(0, 0.5);
    scoreRow.add([ruby, num]);

    // animate the count up from 0
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: this.score,
      duration: Math.min(900, 200 + this.score * 60),
      ease: 'Cubic.easeOut',
      onUpdate: () => num.setText(String(Math.floor(counter.v))),
    });

    // best
    this.add.text(cx, py + 28, 'BEST', {
      fontFamily: FONTS.ui,
      fontSize:   '12px',
      color:      PALETTE_CSS.white,
    }).setOrigin(0.5).setAlpha(0.7);

    const bestNow = this.isNewBest ? this.score : this.previousBest;
    this.add.text(cx, py + 50, String(bestNow), {
      fontFamily: FONTS.ui,
      fontSize:   '28px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
    }).setOrigin(0.5);

    if (this.isNewBest) {
      const badge = this.add.text(cx, py + 88, 'NEW BEST!', {
        fontFamily: FONTS.ui,
        fontSize:   '14px',
        fontStyle:  'bold',
        color:      PALETTE_CSS.ruby,
        stroke:     PALETTE_CSS.yellow,
        strokeThickness: 3,
      }).setOrigin(0.5);
      this.tweens.add({
        targets: badge,
        scale: { from: 1, to: 1.15 },
        duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else {
      // time stats fallback
      const totalSec = Math.floor(this.timeUsedMs / 1000);
      const mm = Math.floor(totalSec / 60);
      const ss = (totalSec % 60).toString().padStart(2, '0');
      this.add.text(cx, py + 88, `Time flown: ${mm}:${ss}`, {
        fontFamily: FONTS.ui,
        fontSize:   '13px',
        color:      PALETTE_CSS.white,
      }).setOrigin(0.5).setAlpha(0.7);
    }
  }

  _drawButtons(width, height) {
    const cx = width / 2;
    const by = height * 0.78;

    this._makeButton(cx, by, 220, 64, 'PLAY AGAIN',
      PALETTE.yellow, PALETTE_CSS.darkRed, PALETTE.darkRed,
      () => this.scene.start('GameScene'));

    this._makeButton(cx, by + 96, 200, 52, 'HOME',
      PALETTE.navy, PALETTE_CSS.yellow, PALETTE.yellow,
      () => this.scene.start('StartScene'),
      /* outlined */ true);
  }

  _makeButton(x, y, w, h, label, fillColor, textColor, borderColor, onClick, outlined = false) {
    const btn = this.add.container(x, y);

    if (!outlined) {
      const shadow = this.add.graphics();
      shadow.fillStyle(PALETTE.darkRed, 0.5);
      shadow.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 22);
      btn.add(shadow);
    }

    const body = this.add.graphics();
    body.fillStyle(fillColor, outlined ? 0.6 : 1);
    body.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    body.lineStyle(outlined ? 2 : 4, borderColor, 1);
    body.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    btn.add(body);

    const text = this.add.text(0, 0, label, {
      fontFamily: FONTS.ui,
      fontSize:   outlined ? '20px' : '28px',
      fontStyle:  'bold',
      color:      textColor,
    }).setOrigin(0.5);
    btn.add(text);

    // Hit area — padded beyond the visual button so edge clicks/taps still
    // register. Vertical pad stays modest so the two stacked buttons (96px
    // apart) keep a clear gap between their hit zones.
    const HIT_PAD_X = 44;
    const HIT_PAD_Y = 16;
    btn.setSize(w, h);
    btn.setInteractive(
      new Phaser.Geom.Rectangle(
        -w / 2 - HIT_PAD_X,
        -h / 2 - HIT_PAD_Y,
        w + HIT_PAD_X * 2,
        h + HIT_PAD_Y * 2,
      ),
      Phaser.Geom.Rectangle.Contains,
    );

    btn.on('pointerover', () => {
      this.input.setDefaultCursor('pointer');
      this.tweens.add({ targets: btn, scale: 1.05, duration: 120, ease: 'Sine.easeOut' });
    });
    btn.on('pointerout', () => {
      this.input.setDefaultCursor('default');
      this.tweens.add({ targets: btn, scale: 1.0, duration: 120, ease: 'Sine.easeOut' });
    });
    btn.on('pointerdown', () => {
      this.tweens.add({
        targets: btn, scale: 0.94, duration: 80, yoyo: true,
        onComplete: onClick,
      });
    });
  }
}
