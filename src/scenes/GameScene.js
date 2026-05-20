import { GAME, DIFFICULTY, MAGNET, RUSH, PALETTE, PALETTE_CSS, FONTS } from '../config.js';
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

// Ruby pickup formations — offsets are built in _spawnFormation().
const LINE_SPACING       = 56;    // vertical gap between rubies in a line
const WAVE_LENGTH        = 184;   // horizontal span of an S-wave
const WAVE_AMPLITUDE     = 78;    // vertical swing of an S-wave
const CIRCLE_RADIUS      = 74;    // radius of a ruby ring

// Power Rush power-up.
const RUSH_BUBBLE_SIZE   = 68;    // pwr orb display size, px
const RUSH_SINE_WAVE     = 11;    // rubies per full cycle of the rush sine line
const RAINBOW            = [      // sparkle hues ringing the rush bubble
  0xff3b3b, 0xff9e2c, 0xffe23d, 0x4cd964, 0x34c5e8, 0x4b7bec, 0xc44cff,
];

// Parallax: the scenery drifts left at this fraction of the (ramping)
// pipe speed — slower than the obstacles, so it reads as distant depth.
const BG_SCROLL_FACTOR   = 0.35;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // A "continue" restarts this scene carrying the running score and the time
  // already flown. The 3-minute round duration is a budget shared across every
  // continue — each run begins with whatever time is left.
  init(data) {
    this.carriedScore  = data?.score      ?? 0;
    this.carriedTimeMs = data?.timeUsedMs ?? 0;
  }

  create() {
    this.score          = this.carriedScore;
    this.started        = false;
    this.gameOver       = false;
    this.timeRemainingMs = GAME.roundDurationMs - this.carriedTimeMs;
    this.elapsedMs      = 0;
    this.magnetActive   = false;
    this.magnetDue      = false; // a magnet roll succeeded; next lane spawns it
    this.powerups       = [];   // active power-up bubbles on screen
    this.rushActive     = false;
    this.rushDue        = false; // a rush roll succeeded; next lane spawns it
    this.rushTrailAcc   = 0;     // throttles the speed-trail during a rush

    this._drawBackground();
    this._createFloorAndCeiling();
    this._createPbot();
    this._createGroups();
    this._createHud();
    this._updateHud();   // show carried score + remaining budget before the tap
    this._createPrompt();

    // game music — loops for the whole round, stops when the scene ends
    this.gameBgm = this.sound.add('game-bgm', { loop: true, volume: 0.45 });
    this.gameBgm.play();
    // power-rush music — added now, played only while the power-up is active
    this.rushBgm = this.sound.add('pwr-bgm', { loop: true, volume: 0.5 });
    this.events.once('shutdown', () => { this.gameBgm.stop(); this.rushBgm.stop(); });

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
      // During a power rush the scenery races by at RUSH.bgScrollMultiplier x
      // its normal speed for a dramatic sense of velocity. tilePositionX is in
      // texture px, so divide the desired screen-px movement by tileScaleX.
      const bgBoost = this.rushActive ? RUSH.bgScrollMultiplier : 1;
      const bgSpeed = this._ramp(DIFFICULTY.pipeSpeed) * BG_SCROLL_FACTOR * bgBoost;
      this.bg.tilePositionX += bgSpeed * (deltaMs / 1000) / this.bg.tileScaleX;

      // tilt pbot toward velocity for a satisfying arc
      const vy = this.pbot.body.velocity.y;
      const target = Phaser.Math.Clamp(vy * 0.08, -25, 70);
      this.pbot.angle += (target - this.pbot.angle) * 0.1;

      // cleanup off-screen obstacles + rubies (kill tweens first so the
      // spin/bob loops don't outlive the sprite)
      this.pipes.children.iterate((p) => {
        if (p && p.x < -100) p.destroy();
      });
      this.rubies.children.iterate((r) => {
        if (r && r.x < -40) { this.tweens.killTweensOf(r); r.destroy(); }
      });

      this._updatePowerups(deltaMs);
      this._updateMagnetPull();

      // power-rush speed trail — faint red afterimages of pbot
      if (this.rushActive) {
        this.rushTrailAcc += deltaMs;
        if (this.rushTrailAcc >= 70) {
          this.rushTrailAcc = 0;
          this._spawnRushTrail();
        }
      }
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

    // Hitbox: pbot.webp is 432x578 with the character core spanning roughly
    // x[40,405], y[135,460] (centre ~222,297) — the two teal side-orbs are
    // decorative and excluded. The body is a slightly-inset rect centred on
    // that core, so collisions feel fair and ruby pickups still land cleanly.
    this.pbot.body.setSize(250, 300);
    this.pbot.body.setOffset(97, 147);
    this.pbot.body.setCollideWorldBounds(false);
    this.pbot.body.allowGravity = false; // turned on at first flap

    // sits above the scenery so the power-rush speed trail can render behind it
    this.pbot.setDepth(5);
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

    // Magnet power-up — each roll has MAGNET.spawnChance to arm a magnet; the
    // next between-columns lane slot then spawns the bubble (see
    // _spawnLaneCollectible), so it lands clear of the pillars.
    this.magnetTimer = this.time.addEvent({
      delay: MAGNET.spawnEveryMs,
      loop:  true,
      callback: () => {
        if (!this.gameOver && Math.random() < MAGNET.spawnChance) this.magnetDue = true;
      },
    });

    // Power Rush — rarer than the magnet; an armed roll spawns a pwr bubble
    // in the next lane. Suppressed while a rush is already running.
    this.rushTimer = this.time.addEvent({
      delay: RUSH.spawnEveryMs,
      loop:  true,
      callback: () => {
        if (!this.gameOver && !this.rushActive && Math.random() < RUSH.spawnChance) {
          this.rushDue = true;
        }
      },
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

  // World scroll speed right now: the difficulty ramp, boosted while a
  // power rush is active.
  _currentSpeed() {
    const base = this._ramp(DIFFICULTY.pipeSpeed);
    return this.rushActive ? base * RUSH.speedMultiplier : base;
  }

  // Schedules the next pipe pair using the current (ramping) spawn interval,
  // then re-arms itself — so the delay shrinks as the round progresses. A
  // "lane" collectible is also scheduled for the half-way point, so it drifts
  // in through the clear space between this pillar column and the next.
  _scheduleNextPipe() {
    if (this.gameOver) return;
    const delay = this._ramp(DIFFICULTY.pipeSpawnEveryMs);
    this.pipeTimer = this.time.delayedCall(delay, () => {
      this._spawnPipePair();
      this._scheduleNextPipe();
    });
    this.laneTimer = this.time.delayedCall(delay / 2, () => this._spawnLaneCollectible());
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

  // Spawns a pillar pair. Options:
  //   safe   — widest gap, centred on the player (used for the first pair
  //            after a power rush so the returning pillars can't clip pbot)
  //   dropIn — the pair drops into frame from off-screen rather than
  //            scrolling in from the right edge
  _spawnPipePair(opts = {}) {
    if (this.gameOver || this.rushActive) return;
    const { width } = this.scale;
    const speed  = this._currentSpeed();
    const pipeH  = this.scale.height; // 'pipe' texture is world-height tall

    // gap, speed and (via _scheduleNextPipe) spawn rate all ramp with time
    const gap    = opts.safe ? DIFFICULTY.pipeGap.start : this._ramp(DIFFICULTY.pipeGap);
    const maxTop = pipeH - FLOOR_HEIGHT - gap - PIPE_BOTTOM_MARGIN;
    const gapTop = opts.safe
      ? Phaser.Math.Clamp(this.pbot.y - gap / 2, PIPE_MIN_TOP, maxTop)
      : Phaser.Math.Between(PIPE_MIN_TOP, maxTop);

    // drop-in pairs land on-screen; normal pairs enter from the right edge
    const spawnX = opts.dropIn ? Math.round(width * 0.72) : width + 40;

    // top pipe positioned so its bottom edge sits at gapTop
    const top = this.pipes.create(spawnX, gapTop, 'pipe').setOrigin(0.5, 1).setDepth(10);
    this._initPillarBody(top, pipeH);

    const bottom = this.pipes.create(spawnX, gapTop + gap, 'pipe').setOrigin(0.5, 0).setDepth(10);
    this._initPillarBody(bottom, pipeH);

    if (opts.dropIn) {
      this._dropPillarIn(top,    gapTop,       speed);
      this._dropPillarIn(bottom, gapTop + gap, speed);
    } else {
      top.body.setVelocityX(-speed);
      bottom.body.setVelocityX(-speed);
      // reward placed inside the gap — always clear of both pillars
      this._spawnGapReward(gapTop, gap, speed);
    }
  }

  // Gives a pillar its static, full-height hitbox.
  _initPillarBody(pillar, pipeH) {
    pillar.body.setAllowGravity(false);
    pillar.body.setImmovable(true);
    pillar.body.setSize(64, pipeH);  // hitbox matches the visible texture
    pillar.body.setOffset(0, 0);
  }

  // Drops a single pillar into frame from off-screen, then re-arms its body
  // so it resumes the normal leftward scroll.
  _dropPillarIn(pillar, targetY, speed) {
    const pipeH = this.scale.height;
    pillar.body.enable = false;                       // no collisions mid-fall
    pillar.y = pillar.originY === 1 ? -80 : pipeH + 80;
    this.tweens.add({
      targets: pillar,
      y: targetY,
      duration: 540,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        if (!pillar.active) return;
        pillar.body.enable = true;
        pillar.body.reset(pillar.x, pillar.y);
        this._initPillarBody(pillar, pipeH);
        pillar.body.setVelocityX(-speed);
      },
    });
  }

  // --- collectible spawning ----------------------------------------------
  // Every collectible is placed either inside a pillar gap or in the clear
  // lane between two columns, so rubies and power-ups never overlap a pillar.

  // Reward that rides in the gap of a freshly spawned pillar pair: nothing,
  // a single ruby, or a compact vertical trio sized to fit the gap.
  // Odds tuned for ~0.35 rubies per gap (40% below the earlier density).
  _spawnGapReward(gapTop, gap, speed) {
    const roll = Math.random();
    if (roll < 0.79) return;                         // empty gap — a breather

    const cx = this.scale.width + 40;
    const cy = gapTop + gap / 2;

    if (roll < 0.93) {                               // single ruby
      this._spawnRubyAt(cx, cy, speed);
      return;
    }
    // vertical trio — spacing scaled so all three sit inside the gap
    const spacing = Math.min(LINE_SPACING, (gap - RUBY_SIZE - 24) / 2);
    for (let i = -1; i <= 1; i += 1) {
      this._spawnRubyAt(cx, cy + i * spacing, speed, false);
    }
  }

  // Collectible for the clear lane between two pillar columns: a magnet (if
  // one is armed), a single ruby, or a ruby formation.
  _spawnLaneCollectible() {
    if (this.gameOver || this.rushActive) return;
    const speed = this._currentSpeed();

    if (this.rushDue) {
      this.rushDue = false;
      this._spawnRush();
      return;
    }
    if (this.magnetDue) {
      this.magnetDue = false;
      this._spawnMagnet();
      return;
    }

    // Odds tuned for ~0.9 rubies per lane (40% below the earlier density) —
    // most lanes are now empty, with formations kept but made rarer.
    const roll = Math.random();
    if (roll < 0.73) return;                         // empty lane — a breather
    if (roll < 0.85) this._spawnRubyAt(this.scale.width + 30, this._laneY(RUBY_SIZE / 2), speed);
    else if (roll < 0.91) this._spawnFormation('line5',  speed);
    else if (roll < 0.96) this._spawnFormation('wave',   speed);
    else                  this._spawnFormation('circle', speed);
  }

  // A free vertical position for a lane collectible whose vertical half-size
  // is `halfExtent`, kept fully inside the playable band.
  _laneY(halfExtent) {
    const top = HUD_HEIGHT + 60 + halfExtent;
    const bot = this.scale.height - FLOOR_HEIGHT - 60 - halfExtent;
    return Phaser.Math.Between(top, Math.max(top, bot));
  }

  // Spawns a choreographed group of rubies. They all share one velocity, so
  // the shape holds together as it scrolls across the screen.
  //   line5  — vertical line of 5
  //   wave   — 5 rubies along an S-curve
  //   circle — ring of 6
  _spawnFormation(type, speed) {
    const W = this.scale.width;
    const offsets = [];
    let anchorX = W + 30;
    let halfH;

    if (type === 'line5') {
      for (let i = 0; i < 5; i += 1) offsets.push({ dx: 0, dy: (i - 2) * LINE_SPACING });
      halfH = 2 * LINE_SPACING;
    } else if (type === 'wave') {
      for (let i = 0; i < 5; i += 1) {
        const t = i / 4;
        offsets.push({ dx: t * WAVE_LENGTH, dy: Math.sin(t * Math.PI * 2) * WAVE_AMPLITUDE });
      }
      halfH = WAVE_AMPLITUDE;
    } else { // circle
      const n = 6;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        offsets.push({ dx: Math.cos(a) * CIRCLE_RADIUS, dy: Math.sin(a) * CIRCLE_RADIUS });
      }
      anchorX = W + 30 + CIRCLE_RADIUS; // so the leftmost ruby starts off-screen
      halfH = CIRCLE_RADIUS;
    }

    const anchorY = this._laneY(halfH + RUBY_SIZE / 2);
    offsets.forEach(({ dx, dy }) => {
      this._spawnRubyAt(anchorX + dx, anchorY + dy, speed, false);
    });
  }

  // Creates one ruby. `bob` adds a gentle vertical drift — left off for
  // formation rubies so the choreographed shape stays crisp.
  _spawnRubyAt(x, y, speed, bob = true) {
    const ruby = this.rubies.create(x, y, 'ruby').setDepth(11);
    ruby.setDisplaySize(RUBY_SIZE, RUBY_SIZE);
    ruby.body.setVelocityX(-speed);
    ruby.body.setAllowGravity(false);
    // Circular hitbox covering the gem, in texture-space units — the body
    // scales with the sprite, so this stays correct at any RUBY_SIZE. 0.46
    // of the texture width makes the pickup radius (~20px on screen) match
    // the visible gem, so a graze that touches the ruby always collects it.
    const r = ruby.width * 0.46;
    ruby.body.setCircle(r, ruby.width / 2 - r, ruby.height / 2 - r);
    this.tweens.add({
      targets: ruby,
      angle: 360,
      duration: 1600,
      repeat: -1,
      ease: 'Linear',
    });
    if (bob) {
      this.tweens.add({
        targets: ruby,
        y: y - 8,
        duration: 900,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
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

    this.tweens.killTweensOf(ruby); // drop the spin/bob loop before destroying
    ruby.destroy();
  }

  // --- magnet power-up ----------------------------------------------------
  // A magnet "bubble" drifts in from the right like a ruby. It is a plain
  // container (moved manually in _updatePowerups) so its bob never fights a
  // physics body; pickup is a simple distance check against the player.
  _spawnMagnet() {
    const { width, height } = this.scale;
    const y = Phaser.Math.Between(HUD_HEIGHT + 80, height - FLOOR_HEIGHT - 80);

    const bubble = this.add.container(width + 50, y).setDepth(12);
    bubble.kind       = 'magnet';
    bubble.baseY      = y;
    bubble.bobPhase   = 0;
    bubble.grabRadius = MAGNET_SIZE * 0.55;

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

  // Destroys a power-up bubble, killing every tween on it and its (possibly
  // nested) children first so no loop outlives the container.
  _destroyBubble(bubble) {
    const killDeep = (obj) => {
      this.tweens.killTweensOf(obj);
      if (obj.list) obj.list.forEach(killDeep);
    };
    killDeep(bubble);
    bubble.destroy();
  }

  // moves bubbles left, bobs them, and handles pickup / off-screen exit
  _updatePowerups(deltaMs) {
    const speed = this._currentSpeed();
    const body  = this.pbot.body;

    for (let i = this.powerups.length - 1; i >= 0; i -= 1) {
      const bubble = this.powerups[i];
      bubble.x -= speed * (deltaMs / 1000);
      bubble.bobPhase += deltaMs / 1000;
      bubble.y = bubble.baseY + Math.sin(bubble.bobPhase * 2.4) * 8;

      // pickup test: the bubble (a circle of grabRadius) vs pbot's actual
      // body rect, so any visible touch collects it — a plain centre-distance
      // check missed grabs where the player's edge clearly overlapped it.
      const grab = bubble.grabRadius;
      const hit = body
        && bubble.x > body.left   - grab && bubble.x < body.right  + grab
        && bubble.y > body.top    - grab && bubble.y < body.bottom + grab;
      if (hit) {
        this.powerups.splice(i, 1);
        if (bubble.kind === 'rush') this._collectRush(bubble);
        else                        this._collectMagnet(bubble);
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
    const speed = this._currentSpeed();
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

  // --- power rush power-up ------------------------------------------------
  // Spawns the "pwr" bubble: a glossy orb wrapped in a pulsing red ruby glow
  // and a slowly-spinning ring of rainbow sparkles.
  _spawnRush() {
    const { width, height } = this.scale;
    const y = Phaser.Math.Between(HUD_HEIGHT + 95, height - FLOOR_HEIGHT - 95);

    const bubble = this.add.container(width + 60, y).setDepth(13);
    bubble.kind       = 'rush';
    bubble.baseY      = y;
    bubble.bobPhase   = 0;
    bubble.grabRadius = RUSH_BUBBLE_SIZE * 0.55;

    // red ruby-style glow — concentric rings that pulse
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.ruby, 0.16); glow.fillCircle(0, 0, RUSH_BUBBLE_SIZE * 0.98);
    glow.fillStyle(PALETTE.ruby, 0.26); glow.fillCircle(0, 0, RUSH_BUBBLE_SIZE * 0.74);
    glow.fillStyle(0xff5566,     0.34); glow.fillCircle(0, 0, RUSH_BUBBLE_SIZE * 0.56);
    bubble.add(glow);
    this.tweens.add({
      targets: glow,
      scale: { from: 0.82, to: 1.18 },
      alpha: { from: 1, to: 0.5 },
      duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // the power-up orb
    bubble.add(this.add.image(0, 0, 'pwr').setDisplaySize(RUSH_BUBBLE_SIZE, RUSH_BUBBLE_SIZE));

    // a slowly-spinning ring of rainbow sparkles
    const ring  = this.add.container(0, 0);
    const ringR = RUSH_BUBBLE_SIZE * 0.66;
    RAINBOW.forEach((color, i) => {
      const ang = (Math.PI * 2 / RAINBOW.length) * i;
      const spark = this.add.image(Math.cos(ang) * ringR, Math.sin(ang) * ringR, 'sparkle')
        .setTint(color).setScale(0).setAlpha(0);
      ring.add(spark);
      this.tweens.add({
        targets: spark,
        alpha: { from: 0, to: 1 },
        scale: { from: 0, to: 0.62 },
        duration: 520, delay: i * 120, hold: 80,
        yoyo: true, repeat: -1, repeatDelay: 340, ease: 'Sine.easeInOut',
      });
    });
    this.tweens.add({ targets: ring, angle: 360, duration: 4600, repeat: -1, ease: 'Linear' });
    bubble.add(ring);

    this.powerups.push(bubble);
  }

  _collectRush(bubble) {
    this.sound.play('pwr-up', { volume: 0.75 });

    const ring = this.add.circle(bubble.x, bubble.y, RUSH_BUBBLE_SIZE * 0.5, 0xffffff, 0)
      .setStrokeStyle(5, PALETTE.yellow, 0.95).setDepth(46);
    this.tweens.add({
      targets: ring, scale: 3.1, alpha: 0,
      duration: 460, ease: 'Cubic.easeOut', onComplete: () => ring.destroy(),
    });
    const label = this.add.text(bubble.x, bubble.y, 'POWER RUSH!', {
      fontFamily: FONTS.ui, fontSize: '24px', fontStyle: 'bold',
      color: PALETTE_CSS.yellow, stroke: PALETTE_CSS.darkRed, strokeThickness: 6,
    }).setOrigin(0.5).setDepth(47);
    this.tweens.add({
      targets: label, y: label.y - 58, alpha: 0,
      duration: 900, ease: 'Cubic.easeOut', onComplete: () => label.destroy(),
    });

    this._destroyBubble(bubble);
    this._activateRush();
  }

  _activateRush() {
    // re-collecting just refreshes the timer (a bubble can't spawn mid-rush,
    // but guard anyway)
    if (this.rushActive) {
      if (this.rushEndEvent) this.rushEndEvent.remove();
      this.rushEndEvent = this.time.delayedCall(RUSH.durationMs, () => this._endRush());
      return;
    }
    this.rushActive = true;

    // suspend the normal obstacle + lane flow for the duration
    if (this.pipeTimer) { this.pipeTimer.remove(); this.pipeTimer = null; }
    if (this.laneTimer) { this.laneTimer.remove(); this.laneTimer = null; }

    this._retractPillars();

    // music: duck the round track, bring in the rush track
    this.gameBgm.pause();
    this.rushBgm.play();

    this._startRushVisuals();
    this.cameras.main.flash(240, 255, 210, 90);

    // a sine line of rubies streamed evenly across the whole duration
    this.rushSinePhase = 0;
    this._spawnRushRuby();
    this.rushRubyTimer = this.time.addEvent({
      delay: RUSH.durationMs / RUSH.rubyCount,
      repeat: RUSH.rubyCount - 2,
      callback: () => this._spawnRushRuby(),
    });

    this.rushEndEvent = this.time.delayedCall(RUSH.durationMs, () => this._endRush());
  }

  _endRush() {
    if (!this.rushActive) return;
    this.rushActive   = false;
    this.rushEndEvent = null;
    if (this.rushRubyTimer) { this.rushRubyTimer.remove(); this.rushRubyTimer = null; }

    this._stopRushVisuals();

    // music back to normal
    this.rushBgm.stop();
    if (!this.gameOver) this.gameBgm.resume();

    // a clear-sky buffer, then the pillars drop back into frame
    this.rushRecoverEvent = this.time.delayedCall(RUSH.recoverDelayMs, () => {
      this.rushRecoverEvent = null;
      if (this.gameOver) return;
      this._spawnPipePair({ safe: true, dropIn: true });
      this._scheduleNextPipe();
    });
  }

  // Pulls every on-screen pillar out of frame — tops upward, bottoms down.
  _retractPillars() {
    const h = this.scale.height;
    this.pipes.children.iterate((p) => {
      if (!p) return;
      if (p.body) p.body.enable = false;          // no collisions while leaving
      this.tweens.killTweensOf(p);
      this.tweens.add({
        targets: p,
        y: p.originY === 1 ? -80 : h + 80,
        duration: 560,
        ease: 'Cubic.easeIn',
        onComplete: () => p.destroy(),
      });
    });
  }

  // One ruby on the power-rush sine line. Called on a fast timer — as each
  // ruby scrolls left the stream traces a flowing sine wave across the screen.
  _spawnRushRuby() {
    if (this.gameOver) return;
    const top = HUD_HEIGHT + 60;
    const bot = this.scale.height - FLOOR_HEIGHT - 60;
    const cy  = (top + bot) / 2;
    const amp = (bot - top) / 2 - RUBY_SIZE;
    const y   = cy + amp * Math.sin(this.rushSinePhase);
    this.rushSinePhase += (Math.PI * 2) / RUSH_SINE_WAVE;
    this._spawnRubyAt(this.scale.width + 30, y, this._currentSpeed(), false);
  }

  // faint red afterimage of pbot, spawned on a throttle while rushing
  _spawnRushTrail() {
    const ghost = this.add.image(this.pbot.x, this.pbot.y, 'pbot')
      .setScale(this.pbot.scaleX, this.pbot.scaleY)
      .setAngle(this.pbot.angle)
      .setAlpha(0.32)
      .setTint(0xff5a5a)
      .setDepth(4);
    this.tweens.add({
      targets: ghost, alpha: 0,
      duration: 300, onComplete: () => ghost.destroy(),
    });
  }

  _startRushVisuals() {
    const { width, height } = this.scale;
    // pulsing red edge-glow over the playfield
    this.rushOverlay = this.add.image(width / 2, height / 2, 'rush-vignette')
      .setDisplaySize(width, height).setDepth(44).setAlpha(0.6);
    this.rushOverlayTween = this.tweens.add({
      targets: this.rushOverlay,
      alpha: { from: 0.6, to: 1 },
      duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    // streaking speed lines
    this.speedLineTimer = this.time.addEvent({
      delay: 90, loop: true, callback: () => this._spawnSpeedLine(),
    });
  }

  _stopRushVisuals() {
    if (this.speedLineTimer)   { this.speedLineTimer.remove();  this.speedLineTimer = null; }
    if (this.rushOverlayTween) { this.rushOverlayTween.stop();  this.rushOverlayTween = null; }
    if (this.rushOverlay) {
      const overlay = this.rushOverlay;
      this.rushOverlay = null;
      this.tweens.add({
        targets: overlay, alpha: 0,
        duration: 350, onComplete: () => overlay.destroy(),
      });
    }
  }

  _spawnSpeedLine() {
    const { width, height } = this.scale;
    const y   = Phaser.Math.Between(HUD_HEIGHT + 16, height - FLOOR_HEIGHT - 16);
    const len = Phaser.Math.Between(46, 130);
    const line = this.add.rectangle(width + len, y, len, Phaser.Math.Between(2, 4),
      Phaser.Math.RND.pick([0xffffff, 0xfff0a8, 0xffd633]), 0.55)
      .setOrigin(0, 0.5).setDepth(45);
    this.tweens.add({
      targets: line,
      x: -len,
      alpha: 0,
      duration: Phaser.Math.Between(300, 480),
      ease: 'Sine.easeIn',
      onComplete: () => line.destroy(),
    });
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
        timeUsedMs: this.carriedTimeMs + this.elapsedMs,
        cause:      'crash',
      });
    });
  }

  _freezeGameplay() {
    if (this.pipeTimer) this.pipeTimer.remove();
    if (this.laneTimer) this.laneTimer.remove();
    if (this.magnetTimer) this.magnetTimer.remove();
    if (this.magnetEndEvent) this.magnetEndEvent.remove();
    this.magnetActive = false;
    this._hideMagnetAura();

    // tear down any in-progress power rush
    if (this.rushTimer) this.rushTimer.remove();
    if (this.rushRubyTimer) this.rushRubyTimer.remove();
    if (this.rushEndEvent) this.rushEndEvent.remove();
    if (this.rushRecoverEvent) this.rushRecoverEvent.remove();
    this.rushActive = false;
    this._stopRushVisuals();
    if (this.rushBgm && this.rushBgm.isPlaying) this.rushBgm.stop();
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
        Phaser.Math.RND.pick([PALETTE.goldLight, PALETTE.goldDark]),
      ).setDepth(14);
      chunk.setStrokeStyle(1, PALETTE.goldEdge);

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
        timeUsedMs: this.carriedTimeMs + this.elapsedMs,
        cause,
      });
    });
  }
}
