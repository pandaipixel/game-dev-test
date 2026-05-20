import { GAME, DIFFICULTY, MAGNET, PALETTE, PALETTE_CSS, FONTS } from '../config.js';
import { addMuteButton } from '../muteButton.js';

const FLOOR_HEIGHT       = 80;
const HUD_HEIGHT         = 70;
const PBOT_SCALE         = 0.20;
const PBOT_START_X       = 130;
const PIPE_MIN_TOP       = 90;    // min y for bottom edge of top pipe
const PIPE_BOTTOM_MARGIN = 60;    // min px between pipe gap and the floor

// Rubies are drawn at an explicit display size so they render correctly
// regardless of the source PNG's resolution.
const RUBY_SIZE          = 44;    // gameplay ruby pickup, px
const HUD_RUBY_SIZE      = 34;    // ruby icon in the HUD, px
const MAGNET_SIZE        = 58;    // magnet power-up bubble, px

// Parallax: the scenery drifts left at this fraction of the (ramping)
// pipe speed — slower than the obstacles, so it reads as distant depth.
const BG_SCROLL_FACTOR   = 0.35;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.score          = 0;
    this.started        = false;
    this.gameOver       = false;
    this.timeRemainingMs = GAME.roundDurationMs;
    this.elapsedMs      = 0;
    this.magnetActive   = false;
    this.powerups       = [];   // active magnet bubbles on screen

    this._drawBackground();
    this._createFloorAndCeiling();
    this._createPbot();
    this._createGroups();
    this._createHud();
    this._createPrompt();

    // game music — loops for the whole round, stops when the scene ends
    this.gameBgm = this.sound.add('game-bgm', { loop: true, volume: 0.45 });
    this.gameBgm.play();
    this.events.once('shutdown', () => this.gameBgm.stop());

    // mute toggle, created before input so the flap handler can skip it
    this.muteBtn = addMuteButton(this, this.scale.width - 30, HUD_HEIGHT / 2);

    this._bindInput();
  }

  update(_, deltaMs) {
    if (this.gameOver) return;

    if (this.started) {
      this.elapsedMs       += deltaMs;
      this.timeRemainingMs -= deltaMs;
      if (this.timeRemainingMs <= 0) {
        this.timeRemainingMs = 0;
        this._endRound('time');
      }
      this._updateHud();

      // parallax scroll — scenery drifts left, speeding up with the ramp.
      // tilePositionX is in texture px, so divide the desired screen-px
      // movement by tileScaleX.
      const bgSpeed = this._ramp(DIFFICULTY.pipeSpeed) * BG_SCROLL_FACTOR;
      this.bg.tilePositionX += bgSpeed * (deltaMs / 1000) / this.bg.tileScaleX;

      // tilt pbot toward velocity for a satisfying arc
      const vy = this.pbot.body.velocity.y;
      const target = Phaser.Math.Clamp(vy * 0.08, -25, 70);
      this.pbot.angle += (target - this.pbot.angle) * 0.1;

      // cleanup off-screen obstacles + rubies
      this.pipes.children.iterate((p) => {
        if (p && p.x < -100) p.destroy();
      });
      this.rubies.children.iterate((r) => {
        if (r && r.x < -40) r.destroy();
      });

      this._updatePowerups(deltaMs);
      this._updateMagnetPull();
    }
  }

  // ---------------------------------------------------------------------
  _drawBackground() {
    const { width, height } = this.scale;
    const src = this.textures.get('bg').getSourceImage();

    // Build a horizontally-tileable texture once: the source image plus a
    // mirrored copy beside it. Mirroring yields a perfectly seam-free loop
    // from any image (the bg art isn't authored to tile) and keeps the
    // pixel art crisp — unlike an edge blend.
    if (!this.textures.exists('bg-loop')) {
      const sw = src.width;
      const sh = src.height;
      const canvas = this.textures.createCanvas('bg-loop', sw * 2, sh);
      const ctx = canvas.context;
      ctx.drawImage(src, 0, 0);
      ctx.save();
      ctx.translate(sw * 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0); // mirrored copy fills [sw, 2*sw]
      ctx.restore();
      canvas.refresh();
    }

    // Scrolling background. tileScale fits the texture to the screen
    // height; the same factor on X preserves the art's aspect ratio.
    this.bg = this.add.tileSprite(width / 2, height / 2, width, height, 'bg-loop')
      .setTileScale(height / src.height);

    // subtle dim so gameplay elements pop against the busy bg
    this.add.rectangle(width / 2, height / 2, width, height, PALETTE.navy, 0.28);
  }

  _createFloorAndCeiling() {
    const { width, height } = this.scale;

    // visual floor band + frosty edge highlight
    this.floor = this.add.rectangle(width / 2, height - FLOOR_HEIGHT / 2,
      width, FLOOR_HEIGHT, PALETTE.navy, 0.55);
    this.add.rectangle(width / 2, height - FLOOR_HEIGHT, width, 4,
      PALETTE.yellow, 0.7);

    // give the floor visual a static physics body for collision
    this.physics.add.existing(this.floor, true);

    // invisible ceiling just to prevent pbot escaping up
    this.ceiling = this.add.rectangle(width / 2, -10, width, 20, 0x000000, 0);
    this.physics.add.existing(this.ceiling, true);
  }

  _createPbot() {
    this.pbot = this.physics.add.image(PBOT_START_X, this.scale.height * 0.45, 'pbot')
      .setScale(PBOT_SCALE);

    // tighter hitbox than the full sprite to keep collisions feeling fair
    // (pbot.png is 432x578; central body roughly fills the middle 70%).
    this.pbot.body.setSize(280, 380);
    this.pbot.body.setOffset(76, 90);
    this.pbot.body.setCollideWorldBounds(false);
    this.pbot.body.allowGravity = false; // turned on at first flap
  }

  _createGroups() {
    this.pipes  = this.physics.add.group({ allowGravity: false, immovable: true });
    this.rubies = this.physics.add.group({ allowGravity: false });

    this.physics.add.collider(this.pbot, this.pipes,   (_p, pillar) => this._onHitPillar(pillar));
    this.physics.add.collider(this.pbot, this.floor,   () => this._endRound('crash'));
    this.physics.add.collider(this.pbot, this.ceiling, () => this._endRound('crash'));
    this.physics.add.overlap (this.pbot, this.rubies,  (_p, r) => this._collectRuby(r));
  }

  _createHud() {
    const { width } = this.scale;

    // translucent HUD strip
    this.add.rectangle(width / 2, HUD_HEIGHT / 2, width, HUD_HEIGHT,
      PALETTE.navy, 0.65).setDepth(50);

    // ruby icon + count (left)
    this.add.image(28, HUD_HEIGHT / 2, 'ruby')
      .setDisplaySize(HUD_RUBY_SIZE, HUD_RUBY_SIZE).setDepth(51);
    this.rubyText = this.add.text(50, HUD_HEIGHT / 2, '0', {
      fontFamily: FONTS.ui,
      fontSize:   '28px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
    }).setOrigin(0, 0.5).setDepth(51);

    // timer (right) — inset to leave the corner free for the mute button
    this.add.text(width - 58, HUD_HEIGHT / 2 - 13, 'TIME', {
      fontFamily: FONTS.ui,
      fontSize:   '11px',
      color:      PALETTE_CSS.white,
    }).setOrigin(1, 0.5).setAlpha(0.7).setDepth(51);
    this.timeText = this.add.text(width - 58, HUD_HEIGHT / 2 + 8, '3:00', {
      fontFamily: FONTS.ui,
      fontSize:   '26px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
    }).setOrigin(1, 0.5).setDepth(51);
  }

  _updateHud() {
    this.rubyText.setText(String(this.score));

    const totalSec = Math.ceil(this.timeRemainingMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = (totalSec % 60).toString().padStart(2, '0');
    this.timeText.setText(`${mm}:${ss}`);
    this.timeText.setColor(totalSec <= 10 ? PALETTE_CSS.ruby : PALETTE_CSS.yellow);
  }

  _createPrompt() {
    const { width, height } = this.scale;
    this.promptContainer = this.add.container(width / 2, height * 0.65);

    const plaque = this.add.graphics();
    plaque.fillStyle(PALETTE.navy, 0.7);
    plaque.fillRoundedRect(-150, -40, 300, 80, 16);
    plaque.lineStyle(2, PALETTE.yellow, 0.7);
    plaque.strokeRoundedRect(-150, -40, 300, 80, 16);
    this.promptContainer.add(plaque);

    const heading = this.add.text(0, -14, 'TAP TO FLY', {
      fontFamily: FONTS.ui,
      fontSize:   '22px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
    }).setOrigin(0.5);
    const sub = this.add.text(0, 14, 'avoid obstacles  •  grab rubies', {
      fontFamily: FONTS.ui,
      fontSize:   '12px',
      color:      PALETTE_CSS.white,
    }).setOrigin(0.5).setAlpha(0.9);
    this.promptContainer.add([heading, sub]);

    this.tweens.add({
      targets: this.promptContainer,
      alpha: { from: 1, to: 0.55 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // gentle bob for pbot while waiting to start
    this.idleBob = this.tweens.add({
      targets: this.pbot,
      y: this.pbot.y - 14,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _bindInput() {
    // a tap anywhere flaps — except on the mute button, which has its own
    // handler and should not also start the round / flap the mascot
    this.input.on('pointerdown', (_pointer, currentlyOver) => {
      if (currentlyOver.includes(this.muteBtn)) return;
      this._handleInput();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this._handleInput());
    this.input.keyboard?.on('keydown-UP',    () => this._handleInput());
  }

  _handleInput() {
    if (this.gameOver) return;
    if (!this.started) this._startRound();
    this._flap();
  }

  _startRound() {
    this.started = true;
    if (this.idleBob) this.idleBob.stop();
    this.tweens.add({
      targets: this.promptContainer,
      alpha: 0, duration: 200,
      onComplete: () => this.promptContainer.destroy(),
    });

    this.pbot.body.allowGravity = true;
    this.physics.world.gravity.y = GAME.gravity;

    // the ruby spawner stays a steady loop; the pipe spawner reschedules
    // itself each time so its interval can tighten as difficulty ramps
    this.rubyTimer = this.time.addEvent({
      delay: GAME.rubySpawnEveryMs,
      loop:  true,
      callback: () => this._spawnSoloRuby(),
    });

    // magnet power-up — each roll has MAGNET.spawnChance to spawn a bubble
    this.magnetTimer = this.time.addEvent({
      delay: MAGNET.spawnEveryMs,
      loop:  true,
      callback: () => this._maybeSpawnMagnet(),
    });

    // first pair immediately so the player has something to dodge,
    // then the ramping spawn loop takes over
    this._spawnPipePair();
    this._scheduleNextPipe();
  }

  // --- difficulty ramp ----------------------------------------------------
  // 0 → 1 progress through the difficulty ramp. The ramp finishes a little
  // before the round ends (DIFFICULTY.rampCompleteAt) so the final stretch
  // plays at a steady maximum difficulty.
  _rampProgress() {
    const rampMs = GAME.roundDurationMs * DIFFICULTY.rampCompleteAt;
    return Phaser.Math.Clamp(this.elapsedMs / rampMs, 0, 1);
  }

  // Current value of a { start, end } difficulty range for this moment.
  _ramp(range) {
    return Phaser.Math.Linear(range.start, range.end, this._rampProgress());
  }

  // Schedules the next pipe pair using the current (ramping) spawn interval,
  // then re-arms itself — so the delay shrinks as the round progresses.
  _scheduleNextPipe() {
    if (this.gameOver) return;
    this.pipeTimer = this.time.delayedCall(
      this._ramp(DIFFICULTY.pipeSpawnEveryMs),
      () => {
        this._spawnPipePair();
        this._scheduleNextPipe();
      },
    );
  }

  _flap() {
    if (this.gameOver) return;
    this.pbot.body.setVelocityY(GAME.flapVelocity);
    this.sound.play('jump', { volume: 0.4 });
    // small squash for feel
    this.tweens.add({
      targets: this.pbot,
      scaleX: PBOT_SCALE * 1.08,
      scaleY: PBOT_SCALE * 0.92,
      duration: 80, yoyo: true, ease: 'Sine.easeOut',
    });
  }

  _spawnPipePair() {
    if (this.gameOver) return;
    const { width } = this.scale;

    // gap, speed and (via _scheduleNextPipe) spawn rate all ramp with time
    const gap   = this._ramp(DIFFICULTY.pipeGap);
    const speed = this._ramp(DIFFICULTY.pipeSpeed);

    const pipeH  = this.scale.height; // 'pipe' texture is world-height tall
    const maxTop = this.scale.height - FLOOR_HEIGHT - gap - PIPE_BOTTOM_MARGIN;
    const gapTop = Phaser.Math.Between(PIPE_MIN_TOP, maxTop);

    // Top pipe positioned so its bottom edge sits at gapTop
    const top = this.pipes.create(width + 40, gapTop, 'pipe')
      .setOrigin(0.5, 1)
      .setDepth(10);
    top.body.setVelocityX(-speed);
    top.body.setAllowGravity(false);
    top.body.setImmovable(true);
    // hitbox matches visible texture
    top.body.setSize(64, pipeH);
    top.body.setOffset(0, 0);

    const bottom = this.pipes.create(width + 40, gapTop + gap, 'pipe')
      .setOrigin(0.5, 0)
      .setDepth(10);
    bottom.body.setVelocityX(-speed);
    bottom.body.setAllowGravity(false);
    bottom.body.setImmovable(true);
    bottom.body.setSize(64, pipeH);
    bottom.body.setOffset(0, 0);

    // 60% chance of a ruby in the gap — jitter is scaled to the gap so the
    // ruby never overlaps a pillar, even at the narrowest setting
    if (Math.random() < 0.6) {
      const jitter = Math.max(0, Math.min(40, gap / 2 - 28));
      const rubyY  = gapTop + gap / 2 + Phaser.Math.Between(-jitter, jitter);
      this._spawnRubyAt(width + 40, rubyY, speed);
    }
  }

  _spawnSoloRuby() {
    if (this.gameOver) return;
    const { width, height } = this.scale;
    const y = Phaser.Math.Between(
      HUD_HEIGHT + 60,
      height - FLOOR_HEIGHT - 60,
    );
    this._spawnRubyAt(width + 20, y, this._ramp(DIFFICULTY.pipeSpeed));
  }

  _spawnRubyAt(x, y, speed) {
    const ruby = this.rubies.create(x, y, 'ruby').setDepth(11);
    ruby.setDisplaySize(RUBY_SIZE, RUBY_SIZE);
    ruby.body.setVelocityX(-speed);
    ruby.body.setAllowGravity(false);
    // circular hitbox covering the gem, in texture-space units — the body
    // scales with the sprite, so this stays correct at any RUBY_SIZE
    const r = ruby.width * 0.36;
    ruby.body.setCircle(r, ruby.width / 2 - r, ruby.height / 2 - r);
    this.tweens.add({
      targets: ruby,
      angle: 360,
      duration: 1600,
      repeat: -1,
      ease: 'Linear',
    });
    this.tweens.add({
      targets: ruby,
      y: y - 8,
      duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _collectRuby(ruby) {
    if (!ruby.active) return;
    this.score += GAME.rubyValue;
    this.sound.play('collect', { volume: 0.55 });
    // sparkle pop
    const pop = this.add.image(ruby.x, ruby.y, 'ruby').setDepth(20);
    pop.setDisplaySize(RUBY_SIZE, RUBY_SIZE);
    this.tweens.add({
      targets: pop,
      scale: pop.scaleX * 2.2, alpha: 0,
      duration: 300, ease: 'Cubic.easeOut',
      onComplete: () => pop.destroy(),
    });
    // floating "+1"
    const plus = this.add.text(ruby.x, ruby.y, '+1', {
      fontFamily: FONTS.ui,
      fontSize:   '18px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
      stroke:     PALETTE_CSS.darkRed,
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(21);
    this.tweens.add({
      targets: plus,
      y: ruby.y - 40, alpha: 0,
      duration: 600, ease: 'Cubic.easeOut',
      onComplete: () => plus.destroy(),
    });

    ruby.destroy();
  }

  // --- magnet power-up ----------------------------------------------------
  _maybeSpawnMagnet() {
    if (this.gameOver) return;
    if (Math.random() < MAGNET.spawnChance) this._spawnMagnet();
  }

  // A magnet "bubble" drifts in from the right like a ruby. It is a plain
  // container (moved manually in _updatePowerups) so its bob never fights a
  // physics body; pickup is a simple distance check against the player.
  _spawnMagnet() {
    const { width, height } = this.scale;
    const y = Phaser.Math.Between(HUD_HEIGHT + 80, height - FLOOR_HEIGHT - 80);

    const bubble = this.add.container(width + 50, y).setDepth(12);
    bubble.baseY = y;
    bubble.bobPhase = 0;

    // soft glow — flat-alpha rings, no blur, so it keeps the pixel style
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.yellow, 0.16); glow.fillCircle(0, 0, MAGNET_SIZE * 0.74);
    glow.fillStyle(PALETTE.yellow, 0.22); glow.fillCircle(0, 0, MAGNET_SIZE * 0.56);
    bubble.add(glow);

    const orb = this.add.image(0, 0, 'magnet').setDisplaySize(MAGNET_SIZE, MAGNET_SIZE);
    bubble.add(orb);

    // four twinkling sparkles framing the bubble for visibility
    const ring = MAGNET_SIZE * 0.62;
    for (let i = 0; i < 4; i += 1) {
      const ang = (Math.PI / 2) * i - Math.PI / 4;
      const spark = this.add.image(Math.cos(ang) * ring, Math.sin(ang) * ring, 'sparkle')
        .setTint(PALETTE.yellow).setScale(0).setAlpha(0);
      bubble.add(spark);
      this.tweens.add({
        targets: spark,
        alpha: { from: 0, to: 1 },
        scale: { from: 0, to: 0.55 },
        angle: 90,
        duration: 600,
        delay: i * 200,
        hold: 90,
        yoyo: true,
        repeat: -1,
        repeatDelay: 480,
        ease: 'Sine.easeInOut',
      });
    }

    this.powerups.push(bubble);
  }

  _destroyBubble(bubble) {
    this.tweens.killTweensOf(bubble);
    bubble.list.forEach((child) => this.tweens.killTweensOf(child));
    bubble.destroy();
  }

  // moves bubbles left, bobs them, and handles pickup / off-screen exit
  _updatePowerups(deltaMs) {
    const speed = this._ramp(DIFFICULTY.pipeSpeed);
    for (let i = this.powerups.length - 1; i >= 0; i -= 1) {
      const bubble = this.powerups[i];
      bubble.x -= speed * (deltaMs / 1000);
      bubble.bobPhase += deltaMs / 1000;
      bubble.y = bubble.baseY + Math.sin(bubble.bobPhase * 2.4) * 8;

      if (Phaser.Math.Distance.Between(bubble.x, bubble.y,
        this.pbot.x, this.pbot.y) < 48) {
        this.powerups.splice(i, 1);
        this._collectMagnet(bubble);
      } else if (bubble.x < -80) {
        this.powerups.splice(i, 1);
        this._destroyBubble(bubble);
      }
    }
  }

  _collectMagnet(bubble) {
    this.sound.play('collect', { volume: 0.6 });

    // expanding ring + floating label where the bubble was
    const ring = this.add.circle(bubble.x, bubble.y, MAGNET_SIZE * 0.5, 0xffffff, 0)
      .setStrokeStyle(4, PALETTE.yellow, 0.9).setDepth(22);
    this.tweens.add({
      targets: ring,
      scale: 2.4, alpha: 0,
      duration: 380, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const label = this.add.text(bubble.x, bubble.y, 'MAGNET!', {
      fontFamily: FONTS.ui,
      fontSize:   '18px',
      fontStyle:  'bold',
      color:      PALETTE_CSS.yellow,
      stroke:     PALETTE_CSS.navy,
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(23);
    this.tweens.add({
      targets: label,
      y: label.y - 46, alpha: 0,
      duration: 750, ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });

    this._destroyBubble(bubble);
    this._activateMagnet();
  }

  _activateMagnet() {
    this.magnetActive = true;
    // collecting again tops the timer back up (capped at MAGNET.durationMs)
    if (this.magnetEndEvent) this.magnetEndEvent.remove();
    this.magnetEndEvent = this.time.delayedCall(
      MAGNET.durationMs, () => this._deactivateMagnet(),
    );
    this._showMagnetAura();
  }

  _deactivateMagnet() {
    this.magnetActive = false;
    this.magnetEndEvent = null;
    // release rubies still in flight so they resume scrolling off-screen
    const speed = this._ramp(DIFFICULTY.pipeSpeed);
    this.rubies.children.iterate((r) => {
      if (r && r.magnetized) {
        r.magnetized = false;
        if (r.body) r.body.setVelocity(-speed, 0);
      }
    });
    this._hideMagnetAura();
  }

  // while the magnet is active, every ruby homes in on the player
  _updateMagnetPull() {
    if (!this.magnetActive) return;
    this.magnetAura.setPosition(this.pbot.x, this.pbot.y);
    this.rubies.children.iterate((r) => {
      if (!r) return;
      if (!r.magnetized) {
        r.magnetized = true;
        this.tweens.killTweensOf(r); // drop bob/spin so velocity controls it
      }
      this.physics.moveToObject(r, this.pbot, MAGNET.pullSpeed);
    });
  }

  _showMagnetAura() {
    if (this.magnetAura) return; // already active — timer was just refreshed
    const aura = this.add.graphics().setDepth(9);
    aura.lineStyle(4, PALETTE.yellow, 0.85);
    aura.strokeCircle(0, 0, 46);
    aura.lineStyle(3, PALETTE.orange, 0.5);
    aura.strokeCircle(0, 0, 57);
    aura.setPosition(this.pbot.x, this.pbot.y);
    this.magnetAura = aura;
    this.magnetAuraTween = this.tweens.add({
      targets: aura,
      alpha: { from: 0.9, to: 0.35 },
      scale: { from: 0.9, to: 1.12 },
      duration: 460,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _hideMagnetAura() {
    if (this.magnetAuraTween) { this.magnetAuraTween.stop(); this.magnetAuraTween = null; }
    if (this.magnetAura) { this.magnetAura.destroy(); this.magnetAura = null; }
  }

  _onHitPillar(pillar) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.sound.play('on-hit', { volume: 0.7 });
    this.sound.play('on-hit-2', { volume: 0.5 }); // death sound, kept quieter

    this._freezeGameplay();
    this.pbot.body.enable = false;
    this.pbot.setDepth(150);

    const impactX = this.pbot.x;
    const impactY = this.pbot.y;

    // Phase 1 — instant impact: white flash + first shake
    this.cameras.main.flash(100, 255, 255, 255);
    this.cameras.main.shake(420, 0.018);

    // Phase 2 — pillar flashes white then cracks appear, then it shatters
    pillar.setTintFill(0xffffff);
    const pillarCracks = this._drawPillarCracks(pillar, impactX, impactY);
    this.time.delayedCall(120, () => {
      pillar.clearTint();
      pillarCracks.destroy();
      this._shatterPillar(pillar);
    });

    // Phase 3 — pbot flies toward the camera with an afterimage trail
    this.time.delayedCall(180, () => this._mascotFliesIntoScreen());

    // Phase 4 — full-screen glass cracks when pbot "hits the screen"
    this.time.delayedCall(880, () => {
      this.cameras.main.shake(520, 0.03);
      this._drawScreenCracks(this.scale.width / 2, this.scale.height / 2);
      this.pbot.setTintFill(0xffffff);
      this.time.delayedCall(90, () => this.pbot.setTint(0xff7766));
    });

    // Final hand-off
    this.time.delayedCall(1900, () => {
      this.scene.start('GameOverScene', {
        score:      this.score,
        timeUsedMs: this.elapsedMs,
        cause:      'crash',
      });
    });
  }

  _freezeGameplay() {
    if (this.pipeTimer) this.pipeTimer.remove();
    if (this.rubyTimer) this.rubyTimer.remove();
    if (this.magnetTimer) this.magnetTimer.remove();
    if (this.magnetEndEvent) this.magnetEndEvent.remove();
    this.magnetActive = false;
    this._hideMagnetAura();
    this.pipes.children.iterate((p) => {
      if (p && p.body) p.body.setVelocity(0, 0);
    });
    this.rubies.children.iterate((r) => {
      if (r && r.body) r.body.setVelocity(0, 0);
    });
    this.physics.world.gravity.y = 0;
    if (this.pbot.body) {
      this.pbot.body.allowGravity = false;
      this.pbot.body.setVelocity(0, 0);
    }
  }

  _drawPillarCracks(pillar, impactX, impactY) {
    const g = this.add.graphics().setDepth(12);
    g.lineStyle(2, PALETTE.white, 0.95);

    for (let i = 0; i < 5; i += 1) {
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const len   = Phaser.Math.Between(50, 110);
      g.beginPath();
      g.moveTo(impactX, impactY);
      const segs = 4;
      for (let s = 1; s <= segs; s += 1) {
        const t = s / segs;
        const x = impactX + Math.cos(angle) * len * t + Phaser.Math.Between(-7, 7);
        const y = impactY + Math.sin(angle) * len * t + Phaser.Math.Between(-7, 7);
        g.lineTo(x, y);
      }
      g.strokePath();
    }
    return g;
  }

  _shatterPillar(pillar) {
    const isTop = pillar.originY === 1;
    const px = pillar.x;
    const py = pillar.y;
    const pillarLen = 600;

    pillar.setVisible(false);
    if (pillar.body) pillar.body.enable = false;

    // 8 debris chunks spread along the original pillar extent
    for (let i = 0; i < 8; i += 1) {
      const along = Phaser.Math.FloatBetween(0, 1);
      const chunkY = isTop
        ? py - pillarLen * along
        : py + pillarLen * along;
      const chunkX = px + Phaser.Math.Between(-18, 18);

      const chunk = this.add.rectangle(
        chunkX, chunkY,
        Phaser.Math.Between(18, 32),
        Phaser.Math.Between(18, 32),
        PALETTE.royalBlue,
      ).setDepth(14);
      chunk.setStrokeStyle(1, PALETTE.navy);

      this.physics.add.existing(chunk);
      chunk.body.setVelocity(
        Phaser.Math.Between(-280, 280),
        Phaser.Math.Between(-420, -120),
      );
      chunk.body.setGravityY(900);
      chunk.body.setAngularVelocity(Phaser.Math.Between(-360, 360));

      this.tweens.add({
        targets: chunk,
        alpha: 0,
        delay: 700,
        duration: 600,
        onComplete: () => chunk.destroy(),
      });
    }

    // small icy puff at the original pillar's mid-band
    for (let i = 0; i < 14; i += 1) {
      const puff = this.add.image(px + Phaser.Math.Between(-30, 30),
                                  py + (isTop ? -50 : 50) + Phaser.Math.Between(-40, 40),
                                  'star')
        .setScale(Phaser.Math.FloatBetween(0.8, 2))
        .setTint(PALETTE.white)
        .setDepth(15);
      this.tweens.add({
        targets: puff,
        x: puff.x + Phaser.Math.Between(-120, 120),
        y: puff.y + Phaser.Math.Between(-100, 100),
        alpha: 0,
        scale: 0,
        duration: Phaser.Math.Between(500, 900),
        ease: 'Cubic.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  _mascotFliesIntoScreen() {
    const targetX = this.scale.width / 2;
    const targetY = this.scale.height / 2;
    const finalScale = PBOT_SCALE * 3.5; // ~0.7

    // afterimage trail — 7 fading copies along the path
    let i = 0;
    this.time.addEvent({
      delay: 55,
      repeat: 7,
      callback: () => {
        const trail = this.add.image(this.pbot.x, this.pbot.y, 'pbot')
          .setScale(this.pbot.scaleX)
          .setAngle(this.pbot.angle)
          .setAlpha(0.45)
          .setTint(PALETTE.ruby)
          .setDepth(149);
        this.tweens.add({
          targets: trail,
          alpha: 0,
          duration: 350,
          onComplete: () => trail.destroy(),
        });
        i += 1;
      },
    });

    // the actual fly-in: scale up, rotate, drift to centre
    this.tweens.add({
      targets: this.pbot,
      x: targetX,
      y: targetY,
      scaleX: finalScale,
      scaleY: finalScale,
      angle: '+=540',
      duration: 700,
      ease: 'Cubic.easeOut',
    });
  }

  _drawScreenCracks(cx, cy) {
    const cracks = this.add.graphics().setDepth(200).setScrollFactor(0);

    // big radial cracks
    cracks.lineStyle(3, PALETTE.white, 0.95);
    const numMain = 12;
    for (let i = 0; i < numMain; i += 1) {
      const angle = (i / numMain) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.18, 0.18);
      const len   = Phaser.Math.Between(320, 560);
      cracks.beginPath();
      cracks.moveTo(cx, cy);
      const segs = 6;
      for (let s = 1; s <= segs; s += 1) {
        const t = s / segs;
        const x = cx + Math.cos(angle) * len * t + Phaser.Math.Between(-14, 14);
        const y = cy + Math.sin(angle) * len * t + Phaser.Math.Between(-14, 14);
        cracks.lineTo(x, y);
      }
      cracks.strokePath();

      // optional branch
      if (Math.random() < 0.55) {
        const branchT = Phaser.Math.FloatBetween(0.3, 0.7);
        const bx = cx + Math.cos(angle) * len * branchT;
        const by = cy + Math.sin(angle) * len * branchT;
        const ba = angle + Phaser.Math.FloatBetween(-1.2, 1.2);
        const bl = Phaser.Math.Between(60, 140);
        cracks.lineStyle(2, PALETTE.white, 0.8);
        cracks.beginPath();
        cracks.moveTo(bx, by);
        cracks.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl);
        cracks.strokePath();
        cracks.lineStyle(3, PALETTE.white, 0.95);
      }
    }

    // concentric impact rings
    cracks.lineStyle(4, PALETTE.white, 0.9);
    cracks.strokeCircle(cx, cy, 30);
    cracks.lineStyle(2, PALETTE.white, 0.5);
    cracks.strokeCircle(cx, cy, 56);

    // animate cracks fading in
    cracks.setAlpha(0);
    this.tweens.add({
      targets: cracks,
      alpha: 1,
      duration: 80,
      ease: 'Linear',
    });

    // dim the whole frame as cracks settle
    const dim = this.add.rectangle(this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height, PALETTE.navy, 0)
      .setDepth(199).setScrollFactor(0);
    this.tweens.add({
      targets: dim,
      alpha: 0.35,
      duration: 600,
      delay: 300,
    });
  }

  _endRound(cause) {
    if (this.gameOver) return;
    this.gameOver = true;

    // death by floor/ceiling (out of frame) — not by running the clock out
    if (cause === 'crash') this.sound.play('on-hit-2', { volume: 0.5 });

    this._freezeGameplay();

    // brief death animation, then go to game over
    this.cameras.main.shake(220, 0.008);
    this.tweens.add({
      targets: this.pbot,
      angle: '+=30',
      alpha: 0.5,
      duration: 400,
      ease: 'Cubic.easeIn',
    });

    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', {
        score:      this.score,
        timeUsedMs: this.elapsedMs,
        cause,
      });
    });
  }
}
