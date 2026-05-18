import Phaser from "phaser";
import type { GameConfig, PathData, StagesData } from "../types";
import { TEX } from "../types";
import { createStartButton } from "../ui/StartButton";

interface StartData {
  cfg: GameConfig;
  pathData: PathData;
  stagesData: StagesData;
}

const STACK_GAP = 20;
const BUTTON_H = 74;
const BALL_SIZE = 48;
const BALL_GAP_X = 56;
const DEFAULT_STAGE_ID = "tight-coil";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("Start");
  }

  create(data: StartData) {
    const { width, height } = this.scale;
    const t = data.cfg.theme;
    const stage =
      data.stagesData.stages.find((s) => s.id === DEFAULT_STAGE_ID) ??
      data.stagesData.stages[0];

    // Backdrop — deep brand black + optional cover-scaled image + red vignette.
    // Picks the mobile-tuned background on touch-primary devices when available.
    this.add.rectangle(width / 2, height / 2, width, height, hex(t.brand.black));
    const isTouchPrimary =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const bgKey =
      isTouchPrimary && this.textures.exists(TEX.startBackgroundMobile)
        ? TEX.startBackgroundMobile
        : TEX.startBackground;
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(width / 2, height / 2, bgKey).setOrigin(0.5);
      const scale = Math.max(width / bg.width, height / bg.height);
      bg.setScale(scale);
    }
    const glow = this.add.graphics();
    glow.fillStyle(hex(t.brand.red), 0.18);
    glow.fillCircle(width / 2, height / 2 - 60, Math.max(width, height) * 0.55);

    // -------- measure pass --------
    const teaser = data.cfg.balls.colors.filter(
      (c) => c.id !== data.cfg.shooter.powerupColorId,
    );
    const teaserH = BALL_SIZE;

    let logoH: number;
    let logoScale = 1;
    if (this.textures.exists(TEX.logo)) {
      const tex = this.textures.get(TEX.logo).getSourceImage() as HTMLImageElement;
      const maxW = Math.min(width * 0.7, 640);
      const maxH = 180;
      logoScale = Math.min(maxW / tex.width, maxH / tex.height);
      logoH = tex.height * logoScale;
    } else {
      logoH = 84;
    }

    const subtitleText = this.add
      .text(0, 0, "MATCH 3+ TO BLAST FOR RUBY POINTS", {
        fontFamily: t.fonts.display, fontSize: "16px", fontStyle: "700",
        color: t.brand.yellow,
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(2);
    const subPadX = 18;
    const subPadY = 8;
    const subtitleH = subtitleText.height + subPadY * 2;

    // -------- layout pass --------
    const totalH =
      teaserH + STACK_GAP +
      logoH + STACK_GAP +
      subtitleH + STACK_GAP +
      BUTTON_H;
    let cursorY = Math.max(20, (height - totalH) / 2);

    // 1. Ball teaser row
    const teaserStartX = width / 2 - ((teaser.length - 1) * BALL_GAP_X) / 2;
    const ballCenterY = cursorY + BALL_SIZE / 2;
    teaser.forEach((c, i) => {
      const ball = this.add
        .image(teaserStartX + i * BALL_GAP_X, ballCenterY, TEX.ball(c.id))
        .setDisplaySize(BALL_SIZE, BALL_SIZE);
      this.tweens.add({
        targets: ball, y: ballCenterY - 10,
        duration: 600 + i * 80, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    });
    cursorY += teaserH + STACK_GAP;

    // 2. Logo (or text fallback)
    if (this.textures.exists(TEX.logo)) {
      this.add.image(width / 2, cursorY, TEX.logo).setOrigin(0.5, 0).setScale(logoScale);
    } else {
      this.add.text(width / 2, cursorY, "RUBY BLASTER", {
        fontFamily: t.fonts.display, fontSize: "72px", fontStyle: "800",
        color: t.brand.white, stroke: t.brand.brick, strokeThickness: 8,
      }).setOrigin(0.5, 0).setShadow(0, 6, t.brand.red, 12, true, true);
    }
    cursorY += logoH + STACK_GAP;

    // 3. Subtitle banner
    const bannerW = subtitleText.width + subPadX * 2;
    const banner = this.add.graphics();
    banner.fillStyle(hex(t.brand.brick), 0.85);
    banner.fillRoundedRect(width / 2 - bannerW / 2, cursorY, bannerW, subtitleH, 8);
    banner.lineStyle(1, hex(t.brand.red), 0.6);
    banner.strokeRoundedRect(width / 2 - bannerW / 2, cursorY, bannerW, subtitleH, 8);
    subtitleText.setPosition(width / 2, cursorY + subPadY);
    this.children.bringToTop(subtitleText);
    cursorY += subtitleH + STACK_GAP;

    // 4. Primary button — locked to the default stage for now
    createStartButton(this, {
      x: width / 2,
      y: cursorY + BUTTON_H / 2,
      label: "Start Game",
      onClick: () => this.scene.start("Game", { ...data, stage }),
    });

    // Footer hint
    this.add.text(width / 2, height - 40, "AIM WITH MOUSE  ·  CLICK TO BLAST", {
      fontFamily: t.fonts.body, fontSize: "12px", fontStyle: "600",
      color: t.brand.white,
    }).setOrigin(0.5).setAlpha(0.6).setLetterSpacing(2);
  }
}

function hex(s: string): number {
  return Phaser.Display.Color.HexStringToColor(s).color;
}
