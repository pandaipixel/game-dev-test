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
        expandParent: false,
      },
      input: {
        activePointers: 2, // allow at least one touch + UI tap
      },
      scene: [BootScene, StartScene, GameScene],
      render: { antialias: true },
      physics: { default: "arcade", arcade: { debug: false } },
    });
  });
