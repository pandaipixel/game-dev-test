import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { StartScene } from "./scenes/StartScene";
import { GameScene } from "./scenes/GameScene";

fetch("./config.json")
  .then((r) => r.json())
  .then((cfg) => {
    const game = new Phaser.Game({
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

    // Hide the loading splash once Phaser's core systems are up.
    game.events.once(Phaser.Core.Events.READY, () => {
      document.getElementById("loading")?.remove();
    });
  });
