import Phaser from "phaser";
import { TEX } from "../types";

/**
 * Start button — uses the PNG asset at `assets/Button/start_button.png`
 * (loaded as TEX.startButton). Falls back to a simple rounded-rect text
 * button if the texture isn't loaded so the game still runs.
 *
 * Interactive states are conveyed via scale + tint (no texture swap), keeping
 * the visual close to the source PNG.
 */

const TARGET_WIDTH = 320; // displayed width on the start screen

export interface StartButtonOptions {
  x: number;
  y: number;
  label?: string;
  onClick: () => void;
}

export function createStartButton(
  scene: Phaser.Scene,
  opts: StartButtonOptions,
): Phaser.GameObjects.Container {
  const container = scene.add.container(opts.x, opts.y);

  if (scene.textures.exists(TEX.startButton)) {
    const btn = scene.add.image(0, 0, TEX.startButton).setOrigin(0.5);
    // Scale the PNG to a consistent display width while preserving aspect ratio
    const scale = TARGET_WIDTH / btn.width;
    btn.setScale(scale);
    const baseScale = scale;

    btn.setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => {
      scene.tweens.add({
        targets: btn,
        scale: baseScale * 1.05,
        duration: 120,
        ease: "Sine.easeOut",
      });
    });
    btn.on("pointerout", () => {
      btn.clearTint();
      scene.tweens.add({
        targets: btn,
        scale: baseScale,
        duration: 120,
        ease: "Sine.easeInOut",
      });
    });
    btn.on("pointerdown", () => {
      btn.setTint(0xcccccc);
      scene.tweens.add({
        targets: btn,
        scale: baseScale * 0.96,
        duration: 80,
        ease: "Sine.easeOut",
      });
    });
    btn.on("pointerup", () => {
      btn.clearTint();
      scene.tweens.add({
        targets: btn,
        scale: baseScale * 1.05,
        duration: 100,
        ease: "Sine.easeOut",
      });
      opts.onClick();
    });
    btn.on("pointerupoutside", () => {
      btn.clearTint();
      btn.setScale(baseScale);
    });

    container.add(btn);
    return container;
  }

  // Fallback — plain text button on a brick-red pill if the PNG isn't loaded.
  const w = TARGET_WIDTH;
  const h = 72;
  const bg = scene.add.graphics();
  bg.fillStyle(0xaf1726, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
  const text = scene.add
    .text(0, 0, opts.label ?? "Start Game", {
      fontFamily: "Poppins, system-ui, sans-serif",
      fontSize: "28px",
      fontStyle: "700",
      color: "#ffffff",
    })
    .setOrigin(0.5);
  const hit = scene.add
    .zone(0, 0, w, h)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  hit.on("pointerup", opts.onClick);
  container.add([bg, text, hit]);
  return container;
}
