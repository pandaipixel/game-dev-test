import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { StartScene } from "./scenes/StartScene";
import { GameScene } from "./scenes/GameScene";

fetch("./config.json")
  .then((r) => r.json())
  .then((cfg) => {
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
  });
