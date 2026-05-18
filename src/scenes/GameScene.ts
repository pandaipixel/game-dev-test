import Phaser from "phaser";
import type { BallColor, GameConfig, LaneDef, PathData, Stage } from "../types";
import { SFX, TEX } from "../types";
import { generatePath } from "../path/pathGenerators";

interface GameData {
  cfg: GameConfig;
  pathData: PathData;     // legacy fallback if no stage is supplied
  stage?: Stage;
}

interface ChainBall {
  sprite: Phaser.GameObjects.Image;
  color: BallColor;
  d: number; // arc-length distance along the path
  glow?: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface PathSample { d: number; x: number; y: number; }

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  color: BallColor;
  vx: number;
  vy: number;
  bounces: number;
  isArrow: boolean;
  isBomb: boolean;
}

/**
 * One independent chain lane. A stage can have one or many. Each lane has its
 * own path, sample table, spawn timer, and chain — but they all share the
 * global chain speed and the same shooter.
 */
interface Lane {
  path: Phaser.Curves.Spline;
  samples: PathSample[];
  pathLen: number;
  chain: ChainBall[];        // index 0 = tail (smallest d); last = leader
  spawnTimer: number;
}

export class GameScene extends Phaser.Scene {
  private cfg!: GameConfig;
  private lanes: Lane[] = [];
  private chainSpeed = 0;

  private shooter!: Phaser.GameObjects.Image;
  private nextColor!: BallColor;
  private nextIsArrow = false;
  private nextIsBomb = false;
  private loadedBall!: Phaser.GameObjects.Image;
  private loadedPinkGlow?: Phaser.GameObjects.Particles.ParticleEmitter;
  private loadedBombGlow?: Phaser.GameObjects.Particles.ParticleEmitter;
  private reloadAccum = 0;

  private projectiles: Projectile[] = [];
  private readonly maxBounces = 3;

  private aimGuide!: Phaser.GameObjects.Graphics;
  private aimArrow!: Phaser.GameObjects.Graphics;
  private lastAimX = 0;
  private lastAimY = 0;

  private rubyScore = 0;
  private powerupCharges = 0;
  private bombCharges = 0;
  private matchStreak = 0;
  private matchesTowardTimeBonus = 0;
  private powerupHud!: Phaser.GameObjects.Container;
  private powerupCountText!: Phaser.GameObjects.Text;
  private bombCountText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private streakOverlay!: Phaser.GameObjects.Container;
  private streakText!: Phaser.GameObjects.Text;
  private finalRushGlow!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private timeRemainingMs = 0;
  private finalRushActive = false;
  private baseChainSpeed = 0;
  private gameOver = false;
  private restartData!: GameData;
  private bgm?: Phaser.Sound.BaseSound;

  constructor() {
    super("Game");
  }

  create(data: GameData) {
    this.cfg = data.cfg;
    this.restartData = data;
    this.lanes = [];
    this.rubyScore = 0;
    this.powerupCharges = 0;
    this.bombCharges = 0;
    this.matchStreak = 0;
    this.matchesTowardTimeBonus = 0;
    this.gameOver = false;

    // Resolve the stage: lane paths + optional per-stage overrides.
    const ov = data.stage?.overrides;
    this.baseChainSpeed = ov?.chainSpeedPxPerSec ?? this.cfg.chain.speedPxPerSec;
    this.chainSpeed = this.baseChainSpeed;
    this.timeRemainingMs = (ov?.timeLimitSec ?? this.cfg.game.timeLimitSec) * 1000;
    this.finalRushActive = false;

    // Background
    if (this.textures.exists(TEX.background)) {
      this.add.image(this.scale.width / 2, this.scale.height / 2, TEX.background)
        .setDisplaySize(this.scale.width, this.scale.height);
    }

    // Build every lane from the stage definition
    const laneDefs = this.resolveStageLanes(data);
    for (const def of laneDefs) {
      const lanePoints: { x: number; y: number }[] =
        def.generator ? generatePath(def.generator) : (def.points ?? []);
      const pts = lanePoints.flatMap((p) => [p.x, p.y]);
      const path = new Phaser.Curves.Spline(pts);
      const samples = this.buildSamples(path, 400);
      const lane: Lane = {
        path,
        samples,
        pathLen: samples[samples.length - 1].d,
        chain: [],
        spawnTimer: 0,
      };
      this.lanes.push(lane);

      // Draw the path groove for this lane
      const g = this.add.graphics();
      g.lineStyle(this.cfg.balls.radius * 2 + 4, 0x000000, 0.25);
      path.draw(g, 128);
      const g2 = this.add.graphics();
      g2.lineStyle(2, 0xffffff, 0.08);
      path.draw(g2, 128);
    }

    // Aim guide — dotted line trajectory preview (drawn behind the shooter)
    this.aimGuide = this.add.graphics();
    // Aim arrow — small yellow chevron that always shows the current aim
    // direction on top of the loaded ball, independent of powerup state.
    this.aimArrow = this.add.graphics().setDepth(11);
    this.lastAimX = this.cfg.shooter.x;
    this.lastAimY = this.cfg.shooter.y - 100; // default: pointing up

    // Shooter
    this.shooter = this.add.image(this.cfg.shooter.x, this.cfg.shooter.y, TEX.shooter);
    this.nextColor = this.pickColor();
    this.nextIsArrow = false;
    this.loadedBall = this.add.image(this.cfg.shooter.x, this.cfg.shooter.y, TEX.ball(this.nextColor.id));
    this.sizeBall(this.loadedBall);
    this.pickNextShooterBall(); // rolls for arrow powerup on the first load
    this.aimAt(this.lastAimX, this.lastAimY); // draw the directional arrow at default angle

    // Initial chain — force-spawn the starting buffer for each lane
    for (const lane of this.lanes) {
      for (let i = 0; i < this.cfg.chain.startCount; i++) {
        this.spawnChainBall(lane, true);
      }
    }

    // HUD — Pandai brand styling
    const t = this.cfg.theme;
    this.add.graphics()
      .fillStyle(Phaser.Display.Color.HexStringToColor(t.brand.brick).color, 0.85)
      .fillRoundedRect(12, 10, 220, 44, 12);
    this.scoreText = this.add.text(28, 18, "0  RUBY", {
      fontFamily: t.fonts.display, fontSize: "22px", fontStyle: "800",
      color: t.brand.yellow,
    }).setLetterSpacing(2);

    // Powerup pill — two slots: arrow (matched pinks) + bomb (3-match streak).
    this.powerupHud = this.add.container(12, 64);
    const puBg = this.add.graphics();
    puBg.fillStyle(Phaser.Display.Color.HexStringToColor(t.brand.brick).color, 0.85);
    puBg.fillRoundedRect(0, 0, 240, 36, 10);

    const arrowIcon = this.add.image(22, 18, TEX.arrow).setDisplaySize(22, 22);
    this.powerupCountText = this.add.text(48, 18, "x 0", {
      fontFamily: t.fonts.display, fontSize: "18px", fontStyle: "800",
      color: t.brand.yellow,
    }).setOrigin(0, 0.5).setLetterSpacing(2);

    // Subtle divider between the two slots
    const divider = this.add.graphics();
    divider.lineStyle(1, Phaser.Display.Color.HexStringToColor(t.brand.white).color, 0.3);
    divider.beginPath();
    divider.moveTo(118, 8);
    divider.lineTo(118, 28);
    divider.strokePath();

    const bombIcon = this.add.image(140, 18, TEX.bomb).setDisplaySize(24, 24);
    this.bombCountText = this.add.text(166, 18, "x 0", {
      fontFamily: t.fonts.display, fontSize: "18px", fontStyle: "800",
      color: t.brand.yellow,
    }).setOrigin(0, 0.5).setLetterSpacing(2);

    this.powerupHud.add([puBg, arrowIcon, this.powerupCountText, divider, bombIcon, this.bombCountText]);
    this.updatePowerupHud();
    this.comboText = this.add.text(this.scale.width / 2, 90, "", {
      fontFamily: t.fonts.display, fontSize: "32px", fontStyle: "800",
      color: t.brand.yellow, stroke: t.brand.brick, strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setLetterSpacing(2);

    // Streak overlay — celebratory banner shown each time the +Ns time bonus triggers.
    this.streakOverlay = this.add.container(this.scale.width / 2, this.scale.height / 2 - 40).setAlpha(0);
    const streakBg = this.add.graphics();
    streakBg.fillStyle(Phaser.Display.Color.HexStringToColor(t.brand.brick).color, 0.92);
    streakBg.fillRoundedRect(-220, -50, 440, 100, 20);
    streakBg.lineStyle(3, Phaser.Display.Color.HexStringToColor(t.brand.yellow).color, 0.9);
    streakBg.strokeRoundedRect(-220, -50, 440, 100, 20);
    this.streakText = this.add.text(0, 0, "", {
      fontFamily: t.fonts.display, fontSize: "30px", fontStyle: "800",
      color: t.brand.yellow, stroke: t.brand.black, strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5).setLetterSpacing(2);
    this.streakOverlay.add([streakBg, this.streakText]);
    this.streakOverlay.setDepth(20);

    // Final rush edge glow — invisible until the speed surge starts, then it
    // stays on for the rest of the round, gently pulsing.
    this.finalRushGlow = this.add.graphics().setDepth(14).setAlpha(0);
    this.drawFinalRushGlow();

    // Timer pill (top-right) — mirrors the score pill
    const timerW = 160;
    const timerX = this.scale.width - timerW - 12;
    this.add.graphics()
      .fillStyle(Phaser.Display.Color.HexStringToColor(t.brand.brick).color, 0.85)
      .fillRoundedRect(timerX, 10, timerW, 44, 12);
    this.timerText = this.add.text(timerX + timerW / 2, 32, "", {
      fontFamily: t.fonts.display, fontSize: "22px", fontStyle: "800",
      color: t.brand.yellow,
    }).setOrigin(0.5).setLetterSpacing(2);
    this.updateTimerText();

    // Speed-up over time
    this.time.addEvent({
      delay: this.cfg.chain.speedupEveryMs,
      loop: true,
      callback: () => {
        this.chainSpeed *= this.cfg.chain.speedupFactor;
      },
    });

    // Audio — background music for the gameplay session
    if (this.cache.audio.has(SFX.bgm)) {
      this.bgm = this.sound.add(SFX.bgm, {
        loop: true,
        volume: this.cfg.audio.bgmVolume,
      });
      this.bgm.play();
    }

    // Mute toggle (top-right corner)
    this.createMuteButton();

    // Clean up audio when the scene shuts down (e.g. on restart)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bgm?.stop();
      this.bgm?.destroy();
    });

    // Input — touch devices get a hold-and-release model so the player can
    // refine aim with their finger before releasing. Mouse devices keep
    // hover-to-aim + click-to-fire which is the desktop standard.
    const isTouchPrimary =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    if (isTouchPrimary) {
      let holding = false;
      this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
        holding = true;
        this.aimAt(p.worldX, p.worldY);
      });
      this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
        if (holding) this.aimAt(p.worldX, p.worldY);
      });
      this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
        if (holding) {
          holding = false;
          this.fire(p.worldX, p.worldY);
        }
      });
      this.input.on("pointerupoutside", () => { holding = false; });
    } else {
      this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.aimAt(p.worldX, p.worldY));
      this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.fire(p.worldX, p.worldY));
    }
    this.input.keyboard?.on("keydown-R", () => {
      if (this.gameOver) this.scene.restart(this.restartData);
    });
  }

  update(_t: number, dtMs: number) {
    if (this.gameOver) return;
    const dt = dtMs / 1000;

    // Countdown — game ends when time runs out
    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - dtMs);
    this.updateTimerText();
    if (this.timeRemainingMs <= 0) {
      this.triggerGameOver("TIME UP");
      return;
    }

    // Final rush — boost chain speed once we enter the last minute
    const rushThresholdMs = this.cfg.game.finalRushAtSecRemaining * 1000;
    if (!this.finalRushActive && this.timeRemainingMs <= rushThresholdMs) {
      this.finalRushActive = true;
      this.chainSpeed *= this.cfg.game.finalRushSpeedFactor;
      this.triggerFinalRushVisuals();
    }

    // Drive each lane independently
    for (const lane of this.lanes) {
      // Spawn timer
      lane.spawnTimer += dtMs;
      if (lane.spawnTimer >= this.cfg.chain.spawnIntervalMs) {
        lane.spawnTimer = 0;
        this.spawnChainBall(lane);
      }

      // Advance chain
      for (const b of lane.chain) b.d += this.chainSpeed * dt;
      // Enforce spacing from leader backward
      for (let i = lane.chain.length - 2; i >= 0; i--) {
        const min = lane.chain[i + 1].d - this.cfg.balls.spacing;
        if (lane.chain[i].d > min) lane.chain[i].d = min;
      }
      this.syncChainPositions(lane);

      // Game over: any lane's leader past its path end
      const leader = lane.chain[lane.chain.length - 1];
      if (leader && leader.d >= lane.pathLen) {
        this.triggerGameOver("CHAIN COMPLETE");
        return;
      }
    }

    // Reload progress
    this.reloadAccum = Math.min(this.cfg.shooter.reloadMs, this.reloadAccum + dtMs);

    // Projectile motion — iterate in reverse so removal during the loop is safe.
    // Multiple projectiles can be in flight simultaneously; the shooter's reload
    // cooldown is the only firing constraint.
    const r = this.cfg.balls.radius;
    const w = this.scale.width;
    const h = this.scale.height;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;

      let bounced = false;
      if (p.sprite.x < r && p.vx < 0) { p.sprite.x = r; p.vx *= -1; bounced = true; }
      else if (p.sprite.x > w - r && p.vx > 0) { p.sprite.x = w - r; p.vx *= -1; bounced = true; }
      if (p.sprite.y < r && p.vy < 0) { p.sprite.y = r; p.vy *= -1; bounced = true; }
      else if (p.sprite.y > h - r && p.vy > 0) { p.sprite.y = h - r; p.vy *= -1; bounced = true; }

      if (bounced) {
        p.bounces += 1;
        if (p.bounces > this.maxBounces) {
          p.sprite.destroy();
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Chain collision — if consumed, remove from the array
      if (!this.checkProjectileChainHit(p)) {
        this.projectiles.splice(i, 1);
      }
    }

    // Aim preview — animated dotted line
    this.drawAimGuide();
  }

  // -------------------- chain --------------------

  private spawnChainBall(lane: Lane, force: boolean = false) {
    // Gate runtime spawns: skip if the tail is still buffered far behind the path entry.
    // Without this, the off-screen tail keeps growing forever and "appears" after each match
    // when the rear segment slams forward to close the gap.
    if (
      !force &&
      lane.chain.length > 0 &&
      lane.chain[0].d < -this.cfg.balls.spacing
    ) {
      return;
    }

    const color = this.pickColor();
    const sprite = this.add.image(-100, -100, TEX.ball(color.id));
    this.sizeBall(sprite);
    const tailD = lane.chain.length > 0 ? lane.chain[0].d - this.cfg.balls.spacing : 0;
    const ball: ChainBall = { sprite, color, d: tailD };

    // Attach a particle glow if this is the powerup color so it stands out in the chain.
    if (color.id === this.cfg.shooter.powerupColorId) {
      ball.glow = this.add.particles(0, 0, TEX.rubySpark, {
        follow: sprite,
        speed: { min: 18, max: 55 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 620,
        frequency: 70,
        quantity: 1,
        angle: { min: 0, max: 360 },
        tint: [0xff6ec7, 0xffa6e1, 0xff3e9e, 0xffffff],
        blendMode: "ADD",
      });
    }

    lane.chain.unshift(ball);
    this.syncOneBall(lane, ball);
  }

  private sizeBall(img: Phaser.GameObjects.Image) {
    const d = this.cfg.balls.radius * 2;
    img.setDisplaySize(d, d);
  }

  private syncChainPositions(lane: Lane) {
    for (const b of lane.chain) this.syncOneBall(lane, b);
  }

  private syncOneBall(lane: Lane, b: ChainBall) {
    if (b.d < 0) {
      // still emerging from the hole — park off-screen at start
      const p = lane.samples[0];
      b.sprite.setPosition(p.x, p.y).setVisible(b.d > -this.cfg.balls.radius);
      return;
    }
    const s = this.sampleAtLane(lane, b.d);
    b.sprite.setPosition(s.x, s.y).setVisible(true);
  }

  // -------------------- shooter / projectile --------------------

  private aimAt(x: number, y: number) {
    const ang = Math.atan2(y - this.shooter.y, x - this.shooter.x);
    this.shooter.setRotation(ang + Math.PI / 2);
    this.lastAimX = x;
    this.lastAimY = y;
    this.drawAimArrow(ang);
  }

  /**
   * Always-on directional indicator — a small yellow chevron drawn just outside
   * the loaded ball in the aim direction, so the player can see exactly where
   * the shot will go even without the arrow-powerup aim guide.
   */
  private drawAimArrow(ang: number) {
    const g = this.aimArrow;
    g.clear();
    const r = this.cfg.balls.radius;
    const offset = r * 1.9;        // distance from shooter center
    const len = 14;                // arrow length
    const halfWidth = 8;           // arrow back-half width
    const cx = this.shooter.x + Math.cos(ang) * offset;
    const cy = this.shooter.y + Math.sin(ang) * offset;
    const tipX = cx + Math.cos(ang) * len;
    const tipY = cy + Math.sin(ang) * len;
    const backX = cx - Math.cos(ang) * (len * 0.25);
    const backY = cy - Math.sin(ang) * (len * 0.25);
    // Perpendicular for back corners
    const perpX = -Math.sin(ang);
    const perpY = Math.cos(ang);
    const leftX = backX + perpX * halfWidth;
    const leftY = backY + perpY * halfWidth;
    const rightX = backX - perpX * halfWidth;
    const rightY = backY - perpY * halfWidth;

    const yellow = Phaser.Display.Color.HexStringToColor(this.cfg.theme.brand.yellow).color;
    const brick = Phaser.Display.Color.HexStringToColor(this.cfg.theme.brand.brick).color;

    g.fillStyle(yellow, 1);
    g.lineStyle(2, brick, 1);
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(leftX, leftY);
    g.lineTo(rightX, rightY);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private pickNextShooterBall() {
    // Bomb has priority over arrow. Bomb gets a full texture swap so the player
    // sees a literal bomb — it's a destruction tool, not a normal shot.
    // Arrow keeps the colored ball visible (so the player still sees their next
    // color) and only adds a pink glow + aim guide.
    this.nextIsBomb = this.bombCharges > 0;
    this.nextIsArrow = !this.nextIsBomb && this.powerupCharges > 0;
    this.nextColor = this.pickColor();

    if (this.nextIsBomb) {
      this.loadedBall.setTexture(TEX.bomb);
    } else {
      this.loadedBall.setTexture(TEX.ball(this.nextColor.id));
    }
    this.loadedBall.setRotation(0);
    this.sizeBall(this.loadedBall);
    this.updateLoadedBallGlow();
  }

  /**
   * Pink sparks while an arrow charge is loaded; red sparks for the bomb.
   * Glow follows the loaded ball sprite automatically.
   */
  private updateLoadedBallGlow() {
    // Pink glow (arrow powerup)
    if (this.nextIsArrow && !this.loadedPinkGlow) {
      this.loadedPinkGlow = this.add.particles(0, 0, TEX.rubySpark, {
        follow: this.loadedBall,
        speed: { min: 30, max: 90 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 520,
        frequency: 45,
        quantity: 1,
        angle: { min: 0, max: 360 },
        tint: [0xff6ec7, 0xffa6e1, 0xff3e9e, 0xffffff],
        blendMode: "ADD",
      });
    } else if (!this.nextIsArrow && this.loadedPinkGlow) {
      this.loadedPinkGlow.destroy();
      this.loadedPinkGlow = undefined;
    }

    // Red sparks (bomb powerup)
    if (this.nextIsBomb && !this.loadedBombGlow) {
      this.loadedBombGlow = this.add.particles(0, 0, TEX.rubySpark, {
        follow: this.loadedBall,
        speed: { min: 60, max: 160 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 450,
        frequency: 30,
        quantity: 2,
        angle: { min: 0, max: 360 },
        tint: [0xff2030, 0xff5060, 0xff9090, 0xffd900],
        blendMode: "ADD",
      });
    } else if (!this.nextIsBomb && this.loadedBombGlow) {
      this.loadedBombGlow.destroy();
      this.loadedBombGlow = undefined;
    }
  }

  private updatePowerupHud() {
    this.powerupCountText.setText(`x ${this.powerupCharges}`);
    this.bombCountText.setText(`x ${this.bombCharges}`);
    const anyCharges = this.powerupCharges > 0 || this.bombCharges > 0;
    this.powerupHud.setAlpha(anyCharges ? 1 : 0.55);
  }

  private drawAimGuide() {
    this.aimGuide.clear();
    // Powerup-only: only show the guide when an arrow is loaded.
    // (Always visible now — even while other shots are in flight.)
    if (!this.nextIsArrow) return;

    const r = this.cfg.balls.radius;
    const w = this.scale.width;
    const h = this.scale.height;
    const t = this.cfg.theme;

    let x = this.shooter.x;
    let y = this.shooter.y;
    const dirX = this.lastAimX - x;
    const dirY = this.lastAimY - y;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 1) return;
    let dx = dirX / len;
    let dy = dirY / len;

    // Start the guide just outside the shooter so it doesn't sit on top of it
    x += dx * (r + 14);
    y += dy * (r + 14);

    const dotR = 3;
    const dotSpacing = 14;
    const maxTotalLen = 1100;
    let traveled = 0;
    // Animated phase — gives the dots a "marching" flow outward
    const phase = (this.time.now / 60) % dotSpacing;

    const yellow = Phaser.Display.Color.HexStringToColor(t.brand.yellow).color;
    const brick = Phaser.Display.Color.HexStringToColor(t.brand.brick).color;

    for (let bounce = 0; bounce <= this.maxBounces; bounce++) {
      // Distance to next wall along current direction
      let tEdge = Infinity;
      let axis: "x" | "y" | null = null;
      if (dx > 0) {
        const t1 = (w - r - x) / dx;
        if (t1 > 0 && t1 < tEdge) { tEdge = t1; axis = "x"; }
      } else if (dx < 0) {
        const t1 = (r - x) / dx;
        if (t1 > 0 && t1 < tEdge) { tEdge = t1; axis = "x"; }
      }
      if (dy > 0) {
        const t1 = (h - r - y) / dy;
        if (t1 > 0 && t1 < tEdge) { tEdge = t1; axis = "y"; }
      } else if (dy < 0) {
        const t1 = (r - y) / dy;
        if (t1 > 0 && t1 < tEdge) { tEdge = t1; axis = "y"; }
      }
      if (tEdge === Infinity) break;

      const segLen = Math.min(tEdge, maxTotalLen - traveled);
      // Draw dots along the segment with animated phase offset
      let d = dotSpacing - phase;
      while (d < segLen) {
        const px = x + dx * d;
        const py = y + dy * d;
        const fadeT = (traveled + d) / maxTotalLen;
        const colorTween = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(yellow),
          Phaser.Display.Color.IntegerToColor(brick),
          100,
          Math.floor(fadeT * 100),
        );
        const col = Phaser.Display.Color.GetColor(colorTween.r, colorTween.g, colorTween.b);
        this.aimGuide.fillStyle(col, 1 - fadeT * 0.7);
        this.aimGuide.fillCircle(px, py, dotR);
        d += dotSpacing;
      }

      traveled += segLen;
      x += dx * segLen;
      y += dy * segLen;
      if (traveled >= maxTotalLen) break;

      // Reflect
      if (axis === "x") dx = -dx;
      else if (axis === "y") dy = -dy;
    }
  }

  private fire(x: number, y: number) {
    // Snap aim to the fire location so touch taps look right on mobile.
    this.aimAt(x, y);
    // No projectile-in-flight gate — players can rapid-fire as long as the
    // shooter has finished its reload cooldown.
    if (this.reloadAccum < this.cfg.shooter.reloadMs) return;
    this.reloadAccum = 0;

    const ang = Math.atan2(y - this.shooter.y, x - this.shooter.x);
    const sp = this.cfg.shooter.projectileSpeedPxPerSec;
    // Bomb gets its own texture; arrow keeps the color texture (powerup is conveyed
    // via the pink glow + aim guide, not a swapped sprite).
    const texKey = this.nextIsBomb ? TEX.bomb : TEX.ball(this.nextColor.id);
    const sprite = this.add.image(this.shooter.x, this.shooter.y, texKey);
    this.sizeBall(sprite);
    this.projectiles.push({
      sprite,
      color: this.nextColor,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      bounces: 0,
      isArrow: this.nextIsArrow,
      isBomb: this.nextIsBomb,
    });

    // Spend the right charge
    if (this.nextIsBomb && this.bombCharges > 0) {
      this.bombCharges -= 1;
    } else if (this.nextIsArrow && this.powerupCharges > 0) {
      this.powerupCharges -= 1;
    }
    this.updatePowerupHud();

    // Pick what loads next (priority: bomb > arrow > normal color)
    this.pickNextShooterBall();

    this.playSfx(SFX.ballRelease);
  }

  /**
   * Check whether the given projectile has collided with any chain ball.
   * Returns `true` if the projectile is still flying, `false` if it was
   * consumed (inserted or exploded) and should be removed from the pool.
   */
  private checkProjectileChainHit(p: Projectile): boolean {
    const r2 = this.cfg.balls.radius * 2;
    const r2Sq = r2 * r2;
    const { x: px, y: py } = p.sprite;

    let hitLane: Lane | null = null;
    let hitIdx = -1;
    let bestSq = Infinity;
    for (const lane of this.lanes) {
      for (let i = 0; i < lane.chain.length; i++) {
        const cb = lane.chain[i];
        if (cb.d < 0) continue;
        const dx = cb.sprite.x - px;
        const dy = cb.sprite.y - py;
        const sq = dx * dx + dy * dy;
        if (sq < r2Sq && sq < bestSq) {
          bestSq = sq;
          hitLane = lane;
          hitIdx = i;
        }
      }
    }
    if (!hitLane || hitIdx === -1) return true;

    if (p.isBomb) {
      this.bombExplodeChainFront(hitLane, p);
    } else {
      // Arrow shots stack like any normal ball. The powerup's only effect is
      // the aim guide + pink chamber glow.
      this.insertProjectileInto(hitLane, hitIdx, p);
    }
    return false;
  }

  /**
   * Bomb powerup: detonates on contact with a chain ball, destroying the
   * N front-most balls of THAT lane (closest to the path end / danger zone).
   */
  private bombExplodeChainFront(lane: Lane, p: Projectile) {
    const count = Math.min(
      this.cfg.shooter.bombExplosionCount,
      lane.chain.length,
    );
    if (count > 0) {
      const removed = lane.chain.splice(lane.chain.length - count, count);
      for (const b of removed) {
        this.popEffect(b.sprite.x, b.sprite.y, b.color.hex);
        this.rubyExplosion(b.sprite.x, b.sprite.y);
        b.glow?.destroy();
        b.sprite.destroy();
      }
    }

    // Big boom at the projectile impact + camera shake for impact
    this.bigBombBurst(p.sprite.x, p.sprite.y);
    this.cameras.main.shake(220, 0.008);
    this.playSfx(SFX.ballMerge);
    this.playSfx(SFX.timeBonus);

    p.sprite.destroy();
    // Caller (`checkProjectileChainHit`) splices this projectile from the pool.

    // Bomb counts toward a successful "match" event for the streak too
    this.matchStreak += 1;
    this.flashCombo(`BOOM!  -${count}`);
    this.updatePowerupHud();
  }

  private bigBombBurst(x: number, y: number) {
    const emitter = this.add.particles(x, y, TEX.rubySpark, {
      speed: { min: 200, max: 520 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 600, max: 1100 },
      gravityY: 280,
      tint: [0xff2030, 0xff5060, 0xff9090, 0xffd900, 0xffffff],
      blendMode: "ADD",
      emitting: false,
    });
    emitter.explode(36);
    this.time.delayedCall(1300, () => emitter.destroy());
  }

  private insertProjectileInto(lane: Lane, hitIdx: number, p: Projectile) {
    const projColor = p.color;
    const projPos = { x: p.sprite.x, y: p.sprite.y };

    // Estimate projectile's d on path via nearest sample (in this lane)
    let nearestD = lane.chain[hitIdx].d;
    let bestSq = Infinity;
    for (const s of lane.samples) {
      const dx = s.x - projPos.x;
      const dy = s.y - projPos.y;
      const sq = dx * dx + dy * dy;
      if (sq < bestSq) { bestSq = sq; nearestD = s.d; }
    }

    // Insert before or after hit ball based on d comparison
    let insertAt = hitIdx;
    if (nearestD > lane.chain[hitIdx].d) insertAt = hitIdx + 1;

    // Push all balls from insertAt forward by spacing
    for (let i = insertAt; i < lane.chain.length; i++) {
      lane.chain[i].d += this.cfg.balls.spacing;
    }
    const newD = (insertAt > 0 ? lane.chain[insertAt - 1].d : -this.cfg.balls.spacing)
      + this.cfg.balls.spacing;

    const sprite = p.sprite;
    const newBall: ChainBall = { sprite, color: projColor, d: newD };
    lane.chain.splice(insertAt, 0, newBall);

    this.syncChainPositions(lane);
    // The projectile sprite has been adopted by the chain — caller removes it from pool.

    // Match check around insertAt
    this.resolveMatchesAt(lane, insertAt, 1);
  }

  // -------------------- matching --------------------

  private resolveMatchesAt(lane: Lane, idx: number, cascadeLevel: number) {
    if (idx < 0 || idx >= lane.chain.length) return;
    const color = lane.chain[idx].color.id;

    let left = idx;
    while (left - 1 >= 0 && lane.chain[left - 1].color.id === color) left--;
    let right = idx;
    while (right + 1 < lane.chain.length && lane.chain[right + 1].color.id === color) right++;

    const runLen = right - left + 1;
    if (runLen < 3) return;

    const removed = lane.chain.splice(left, runLen);
    const matchedColor = removed[0].color.id;
    for (const b of removed) {
      this.popEffect(b.sprite.x, b.sprite.y, b.color.hex);
      this.rubyExplosion(b.sprite.x, b.sprite.y);
      b.glow?.destroy();
      b.sprite.destroy();
    }

    // Powerup award: matching the powerup color refreshes the arrow charges to
    // the configured per-match value (lasts that many fires).
    if (matchedColor === this.cfg.shooter.powerupColorId) {
      this.powerupCharges = Math.max(
        this.powerupCharges,
        this.cfg.shooter.powerupChargesPerMatch,
      );
      this.flashCombo("POWERUP READY");
      // Swap the loaded ball to apply the pink glow + aim guide immediately
      this.pickNextShooterBall();
    }

    // Bomb award: every N successful matches in sequence grants a bomb charge.
    this.matchStreak += 1;
    if (this.matchStreak >= this.cfg.shooter.bombMatchesPerCharge) {
      this.matchStreak = 0;
      this.bombCharges += 1;
      this.flashCombo("BOMB READY");
      this.pickNextShooterBall();
    }
    this.updatePowerupHud();

    // Close the gap by pushing the FRONT segment back (chain retreats from the
    // danger zone on every match — prevents pile-up at the front). Each ball
    // that moves back gets a quick squash-bounce pulse for visual feedback.
    const gap = runLen * this.cfg.balls.spacing;
    for (let i = left; i < lane.chain.length; i++) {
      lane.chain[i].d -= gap;
      this.pulseBall(lane.chain[i].sprite);
    }
    this.syncChainPositions(lane);

    // Score
    const base = runLen * this.cfg.scoring.perBallRuby + this.cfg.scoring.comboBonusRuby;
    const mult = Math.pow(this.cfg.scoring.cascadeMultiplier, cascadeLevel - 1);
    const gained = Math.round(base * mult);
    this.rubyScore += gained;
    this.scoreText.setText(`${this.rubyScore}  RUBY`);

    this.playSfx(SFX.ballMerge);

    // Time bonus only triggers every Nth match — surfaced via the streak
    // overlay banner. Combo text stays focused on score.
    this.matchesTowardTimeBonus += 1;
    if (this.matchesTowardTimeBonus >= this.cfg.scoring.matchesPerTimeBonus) {
      const threshold = this.cfg.scoring.matchesPerTimeBonus;
      const bonusSeconds = this.cfg.scoring.timeBonusSec;
      this.matchesTowardTimeBonus = 0;
      this.timeRemainingMs = Math.min(
        this.cfg.game.timeLimitSec * 1000,
        this.timeRemainingMs + bonusSeconds * 1000,
      );
      this.updateTimerText();
      this.playSfx(SFX.timeBonus);
      const sLabel = bonusSeconds === 1 ? "SECOND" : "SECONDS";
      this.showStreakOverlay(`${threshold} STREAKS!  +${bonusSeconds} ${sLabel}`);
    }

    this.flashCombo(
      cascadeLevel > 1
        ? `CASCADE x${cascadeLevel}   +${gained}`
        : `+${gained} RUBY`,
    );

    // Cascade: did the new neighbors (left-1 and left, after splice) form a fresh match?
    if (left - 1 >= 0 && left < lane.chain.length) {
      if (lane.chain[left - 1].color.id === lane.chain[left].color.id) {
        this.resolveMatchesAt(lane, left, cascadeLevel + 1);
      }
    }
  }

  /**
   * Quick squash-bounce on a ball sprite — used to visualize chain motion
   * (e.g. balls retreating after a successful match). Uses scale instead of
   * position so syncChainPositions doesn't overwrite the animation each frame.
   */
  private pulseBall(sprite: Phaser.GameObjects.Image) {
    const peakScaleX = sprite.scaleX * 1.18;
    const peakScaleY = sprite.scaleY * 0.85;
    this.tweens.add({
      targets: sprite,
      scaleX: peakScaleX,
      scaleY: peakScaleY,
      duration: 90,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  /**
   * Paint the four edge-glow bands with linear gradient fades.
   * Each edge is a thin band of brand red that fades to transparent inward.
   */
  private drawFinalRushGlow() {
    const g = this.finalRushGlow;
    const w = this.scale.width;
    const h = this.scale.height;
    const band = 110;
    const red = 0xff1a2e;
    g.clear();
    // Left edge: full red on the left, transparent on the right
    g.fillGradientStyle(red, red, red, red, 0.6, 0, 0.6, 0);
    g.fillRect(0, 0, band, h);
    // Right edge: mirrored
    g.fillGradientStyle(red, red, red, red, 0, 0.6, 0, 0.6);
    g.fillRect(w - band, 0, band, h);
    // Top edge: full on top, fading down
    g.fillGradientStyle(red, red, red, red, 0.6, 0.6, 0, 0);
    g.fillRect(0, 0, w, band);
    // Bottom edge: mirrored
    g.fillGradientStyle(red, red, red, red, 0, 0, 0.6, 0.6);
    g.fillRect(0, h - band, w, band);
  }

  /**
   * Final-rush trigger: a one-shot full-screen red flash + a persistent
   * edge glow that stays for the rest of the round + a banner.
   */
  private triggerFinalRushVisuals() {
    // Urgent alarm — plays once when the speed surge starts
    this.playSfx(SFX.warningTime);

    // 1. Reveal the edge glow, then loop a gentle pulse for the rest of the game
    this.tweens.add({
      targets: this.finalRushGlow,
      alpha: 1,
      duration: 400,
      onComplete: () => {
        this.tweens.add({
          targets: this.finalRushGlow,
          alpha: 0.55,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });

    // 2. Full-screen red flash — 3 pulses, then self-destructs
    const flash = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0xff1a2e,
    ).setAlpha(0).setDepth(13);
    this.tweens.add({
      targets: flash,
      alpha: 0.45,
      duration: 150,
      yoyo: true,
      repeat: 2,
      onComplete: () => flash.destroy(),
    });

    // 3. Banner — reuses the streak overlay container, red text for urgency
    this.showStreakOverlay("!! FINAL RUSH !!", "#ff5060");
  }

  /**
   * Big celebratory banner — appears center-screen each time a milestone hits
   * (e.g. the streak time-bonus). Pops in with overshoot, holds, then fades.
   */
  private showStreakOverlay(text: string, color?: string) {
    this.streakText.setText(text);
    this.streakText.setColor(color ?? this.cfg.theme.brand.yellow);
    const c = this.streakOverlay;
    this.tweens.killTweensOf(c);
    c.setAlpha(0).setScale(0.5);
    this.tweens.add({
      targets: c,
      alpha: 1,
      scale: 1.1,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: c, scale: 1.0, duration: 80 });
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: c,
            alpha: 0,
            scale: 0.95,
            duration: 400,
            ease: "Cubic.easeIn",
          });
        });
      },
    });
  }

  private flashCombo(msg: string) {
    this.comboText.setText(msg);
    this.comboText.setAlpha(1).setScale(0.8);
    this.tweens.add({
      targets: this.comboText,
      scale: 1.2,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
    });
  }

  private popEffect(x: number, y: number, hex: string) {
    const color = Phaser.Display.Color.HexStringToColor(hex).color;
    const circle = this.add.circle(x, y, this.cfg.balls.radius, color, 0.8);
    this.tweens.add({
      targets: circle,
      radius: this.cfg.balls.radius * 2.5,
      alpha: 0,
      duration: 350,
      onComplete: () => circle.destroy(),
    });
  }

  private rubyExplosion(x: number, y: number) {
    const emitter = this.add.particles(x, y, TEX.rubySpark, {
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: { min: 420, max: 720 },
      gravityY: 240,
      tint: [0xff3a4f, 0xaf1726, 0xff6b7f, 0xffd6dc],
      blendMode: "ADD",
      emitting: false,
    });
    emitter.explode(14);
    this.time.delayedCall(800, () => emitter.destroy());
  }

  // -------------------- util --------------------

  private pickColor(): BallColor {
    const cs = this.cfg.balls.colors;
    return cs[Math.floor(Math.random() * cs.length)];
  }

  /**
   * Expand the selected stage into one or more lane definitions.
   * Priority: `stage.lanes[]` > `stage.generator` > `stage.points` > legacy `pathData`.
   */
  private resolveStageLanes(data: GameData): LaneDef[] {
    const stage = data.stage;
    if (stage?.lanes && stage.lanes.length > 0) return stage.lanes;
    if (stage?.generator) return [{ generator: stage.generator }];
    if (stage?.points) return [{ points: stage.points }];
    return [{ points: data.pathData.points }];
  }

  private playSfx(key: string) {
    if (!this.cache.audio.has(key)) return;
    this.sound.play(key, { volume: this.cfg.audio.sfxVolume });
  }

  private createMuteButton(): Phaser.GameObjects.Container {
    const t = this.cfg.theme;
    const size = 36;
    const x = this.scale.width - size / 2 - 12;
    const y = 80; // sits just below the timer pill

    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    const drawBg = (color: string) => {
      bg.clear();
      bg.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 0.85);
      bg.fillCircle(0, 0, size / 2);
      bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(t.brand.white).color, 0.4);
      bg.strokeCircle(0, 0, size / 2 - 1);
    };
    drawBg(t.brand.brick);

    const icon = this.add.graphics();
    const drawIcon = (muted: boolean) => {
      icon.clear();
      const col = Phaser.Display.Color.HexStringToColor(t.brand.yellow).color;
      icon.fillStyle(col, 1);
      // speaker body
      icon.fillTriangle(-8, 0, -2, -6, -2, 6);
      icon.fillRect(-10, -3, 4, 6);
      if (muted) {
        // X over the speaker
        icon.lineStyle(2.5, Phaser.Display.Color.HexStringToColor(t.brand.white).color, 1);
        icon.beginPath();
        icon.moveTo(2, -6);
        icon.lineTo(10, 6);
        icon.moveTo(10, -6);
        icon.lineTo(2, 6);
        icon.strokePath();
      } else {
        // sound waves
        icon.lineStyle(2, col, 1);
        icon.beginPath();
        icon.arc(0, 0, 7, -0.6, 0.6);
        icon.strokePath();
        icon.beginPath();
        icon.arc(0, 0, 11, -0.6, 0.6);
        icon.strokePath();
      }
    };
    drawIcon(this.sound.mute);

    const hit = this.add
      .zone(0, 0, size, size)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    hit.on("pointerover", () => drawBg(t.brand.red));
    hit.on("pointerout", () => drawBg(t.brand.brick));
    hit.on("pointerup", () => {
      this.sound.mute = !this.sound.mute;
      drawIcon(this.sound.mute);
    });

    c.add([bg, icon, hit]);
    return c;
  }

  private updateTimerText() {
    const totalSec = Math.ceil(this.timeRemainingMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    this.timerText.setText(`${mm}:${ss.toString().padStart(2, "0")}`);
    // Recolor as time runs low — yellow → red in the final rush window
    const lowThresholdMs = this.cfg.game.finalRushAtSecRemaining * 1000;
    this.timerText.setColor(
      this.timeRemainingMs <= lowThresholdMs
        ? this.cfg.theme.brand.white
        : this.cfg.theme.brand.yellow,
    );
  }

  private buildSamples(path: Phaser.Curves.Spline, n: number): PathSample[] {
    const out: PathSample[] = [];
    let d = 0;
    let prev = path.getPoint(0);
    out.push({ d: 0, x: prev.x, y: prev.y });
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = path.getPoint(t);
      d += Phaser.Math.Distance.Between(prev.x, prev.y, p.x, p.y);
      out.push({ d, x: p.x, y: p.y });
      prev = p;
    }
    return out;
  }

  private sampleAtLane(lane: Lane, d: number): PathSample {
    const samples = lane.samples;
    if (d <= 0) return samples[0];
    if (d >= lane.pathLen) return samples[samples.length - 1];
    let lo = 0, hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].d <= d) lo = mid; else hi = mid;
    }
    const a = samples[lo], b = samples[hi];
    const t = (d - a.d) / (b.d - a.d || 1);
    return { d, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private triggerGameOver(reason: string) {
    this.gameOver = true;
    const { width, height } = this.scale;
    const t = this.cfg.theme;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
      .setInteractive({ useHandCursor: true });

    this.add.text(width / 2, height / 2 - 90, reason, {
      fontFamily: t.fonts.display, fontSize: "20px", fontStyle: "700",
      color: t.brand.yellow,
    }).setOrigin(0.5).setLetterSpacing(4);
    this.add.text(width / 2, height / 2 - 40, "GAME OVER", {
      fontFamily: t.fonts.display, fontSize: "64px", fontStyle: "800",
      color: t.brand.red, stroke: t.brand.black, strokeThickness: 6,
    }).setOrigin(0.5).setLetterSpacing(2);
    this.add.text(width / 2, height / 2 + 30, `${this.rubyScore} RUBY EARNED`, {
      fontFamily: t.fonts.display, fontSize: "26px", fontStyle: "700",
      color: t.brand.yellow,
    }).setOrigin(0.5).setLetterSpacing(2);
    this.add.text(width / 2, height / 2 + 85, "TAP OR PRESS  R  TO RESTART", {
      fontFamily: t.fonts.body, fontSize: "14px", fontStyle: "600",
      color: t.brand.white,
    }).setOrigin(0.5).setAlpha(0.6).setLetterSpacing(3);

    overlay.on("pointerup", () => this.scene.restart(this.restartData));
  }
}
