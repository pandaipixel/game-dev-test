import Phaser from "phaser";
import type { GameConfig, PathData, StagesData } from "../types";
import { TEX } from "../types";

const bootStatus = (m: string) => window.__bootStatus?.(m);

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    bootStatus("loading config");
    this.load.json("config", "./config.json");
  }

  create() {
    bootStatus("loading assets");
    const cfg = this.cache.json.get("config") as GameConfig;

    // Register diagnostics BEFORE adding any files so we see every ADD.
    const inflight = new Set<string>();
    let total = 0;
    let loaded = 0;
    this.load.on(Phaser.Loader.Events.ADD, (_k: number, _t: string, key: string) => {
      total++;
      inflight.add(key);
    });
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      loaded++;
      inflight.delete(key);
      bootStatus(`loaded ${loaded}/${total}`);
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      inflight.delete(file.key);
      bootStatus(`ERROR loading ${file.key}: ${file.url}`);
    });

    // After 8s if we still haven't transitioned, surface whatever is in flight.
    this.time.delayedCall(8000, () => {
      if (this.scene.isActive("Boot")) {
        const stuck = Array.from(inflight).join(", ") || "(none)";
        bootStatus(`STUCK ${loaded}/${total} — waiting on: ${stuck}`);
      }
    });

    // Load path data + stages catalog + every configured image.
    this.load.json("path", `./${cfg.path.file}`);
    this.load.json("stages", "./stages.json");

    if (cfg.assets.background) {
      this.load.image(TEX.background, cfg.assets.background);
    }
    if (cfg.assets.startBackground) {
      this.load.image(TEX.startBackground, cfg.assets.startBackground);
    }
    if (cfg.assets.startBackgroundMobile) {
      this.load.image(TEX.startBackgroundMobile, cfg.assets.startBackgroundMobile);
    }
    if (cfg.assets.logo) {
      this.load.image(TEX.logo, cfg.assets.logo);
    }
    if (cfg.assets.bombImage) {
      this.load.image(TEX.bomb, cfg.assets.bombImage);
    }
    if (cfg.assets.startButton) {
      this.load.image(TEX.startButton, cfg.assets.startButton);
    }
    if (cfg.shooter.sprite) {
      this.load.image(TEX.shooter, cfg.shooter.sprite);
    }
    for (const c of cfg.balls.colors) {
      if (c.sprite) this.load.image(TEX.ball(c.id), c.sprite);
    }

    // Audio is intentionally NOT loaded here — streams in via StartScene.

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      bootStatus("preparing scene");
      this.generateMissingTextures(cfg);
      const pathData = this.cache.json.get("path") as PathData;
      const stagesData = this.cache.json.get("stages") as StagesData;
      this.scene.start("Start", { cfg, pathData, stagesData });
    });
    this.load.start();
  }

  /**
   * For any sprite not provided in config, generate a simple texture so the
   * game runs out of the box. Drop a PNG into /public/assets and point the
   * config at it to override.
   */
  private generateMissingTextures(cfg: GameConfig) {
    const r = cfg.balls.radius;

    for (const c of cfg.balls.colors) {
      const key = TEX.ball(c.id);
      if (this.textures.exists(key)) continue;
      const g = this.add.graphics({ x: 0, y: 0 });
      const color = Phaser.Display.Color.HexStringToColor(c.hex).color;
      g.fillStyle(color, 1);
      g.fillCircle(r, r, r);
      // highlight
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(r - r * 0.35, r - r * 0.35, r * 0.3);
      // rim
      g.lineStyle(2, 0x000000, 0.35);
      g.strokeCircle(r, r, r - 1);
      g.generateTexture(key, r * 2, r * 2);
      g.destroy();
    }

    // Arrow powerup texture — yellow chevron arrow pointing forward (up).
    // Rotated at runtime to match shooter aim direction.
    if (!this.textures.exists(TEX.arrow)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      const size = r * 2;
      const cx = size / 2;
      // Outer glow halo
      g.fillStyle(0xffd633, 0.35);
      g.fillCircle(cx, cx, size / 2);
      // Arrow head (triangle)
      g.fillStyle(0xffd633, 1);
      g.fillTriangle(cx, 2, 4, size / 2, size - 4, size / 2);
      // Arrow shaft
      g.fillStyle(0xaf1726, 1);
      g.fillRoundedRect(cx - 4, size / 2, 8, size / 2 - 4, 2);
      // White outline on head for definition
      g.lineStyle(2, 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(cx, 2);
      g.lineTo(4, size / 2);
      g.lineTo(size - 4, size / 2);
      g.closePath();
      g.strokePath();
      g.generateTexture(TEX.arrow, size, size);
      g.destroy();
    }

    // Ruby spark particle — small 4-point diamond used by the match burst effect.
    if (!this.textures.exists(TEX.rubySpark)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(6, 0, 12, 6, 6, 12);
      g.fillTriangle(6, 0, 0, 6, 6, 12);
      g.generateTexture(TEX.rubySpark, 12, 12);
      g.destroy();
    }

    if (!this.textures.exists(TEX.shooter)) {
      const g = this.add.graphics({ x: 0, y: 0 });
      const size = r * 2.2;
      g.fillStyle(0x2b2b3d, 1);
      g.fillCircle(size / 2, size / 2, size / 2);
      g.fillStyle(0xe63946, 1);
      g.fillRect(size / 2 - 4, 0, 8, size / 2);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeCircle(size / 2, size / 2, size / 2 - 1);
      g.generateTexture(TEX.shooter, size, size);
      g.destroy();
    }
  }
}
