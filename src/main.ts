import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { StartScene } from "./scenes/StartScene";
import { GameScene } from "./scenes/GameScene";

declare global {
  interface Window {
    __bootStatus?: (msg: string) => void;
  }
}

const status = (m: string) => window.__bootStatus?.(m);

status("fetching config");
fetch("./config.json")
  .then((r) => {
    if (!r.ok) throw new Error(`config.json HTTP ${r.status}`);
    return r.json();
  })
  .then((cfg) => {
    // Mobile overrides — touch-primary devices get a smaller design canvas
    // and chunkier balls so the play area feels reasonable on small screens.
    const isTouchPrimary =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isTouchPrimary && cfg.mobile) {
      const m = cfg.mobile;
      if (m.game) Object.assign(cfg.game, m.game);
      if (m.balls) Object.assign(cfg.balls, m.balls);
      if (m.shooter) Object.assign(cfg.shooter, m.shooter);
    }

    status("starting phaser");
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      backgroundColor: cfg.game.backgroundColor,
      // Responsive: render at the configured design resolution, then letterbox-scale
      // to fit the viewport on every device — preserves the path layout.
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: cfg.game.width,
        height: cfg.game.height,
        parent: "game",
      },
      input: {
        activePointers: 2, // allow at least one touch + UI tap
      },
      scene: [BootScene, StartScene, GameScene],
      render: { antialias: true },
      physics: { default: "arcade", arcade: { debug: false } },
    });

    // Loading splash is removed from inside StartScene.create() — i.e. only
    // once BootScene has finished downloading every asset and the start
    // screen is about to render. Removing it earlier (e.g. on Phaser READY)
    // leaves the player staring at a black canvas while the loader runs.
  })
  .catch((err) => {
    status("config fetch failed: " + (err?.message ?? err));
  });
