import Phaser from "phaser";

/**
 * Pandai DS · "Button / Start" (Size=Large, node 1390:11).
 * Faithfully reproduces the Enabled / Hovered / Pressed visual states from Figma.
 *
 *  Layered structure (per Figma):
 *    [ shadow base ]    ← dark backplate, gives the 3D edge
 *    [    body    ]     ← gradient pill (yellow on enabled, red on hover/pressed)
 *    [icon] [label] [badge]
 *
 *  Pressed state shifts the body 8px down, exposing the shadow above instead of below.
 */

const W = 280;
const H = 66;
const SHADOW_GAP = 8;
const BODY_R = 33;     // matches Figma's "rounded-[50px]" relative to 66px height
const SHADOW_R = 38;   // matches Figma's "rounded-[38px]"

interface StateColors {
  shadow: string;
  bodyTop: string;
  bodyBot: string;
  border: string;
  text: string;
  badgeTop: string;
  badgeBot: string;
  badgeBorder: string;
  chevron: string;
}

const STATES: Record<"enabled" | "hovered" | "pressed", StateColors> = {
  enabled: {
    shadow: "#de9d00",
    bodyTop: "#ffe258",
    bodyBot: "#ffba0a",
    border: "#ffd633",
    text: "#de0909",
    badgeTop: "#fe0601",
    badgeBot: "#00193b",
    badgeBorder: "#ffd633",
    chevron: "#ffffff",
  },
  hovered: {
    shadow: "#640a19",
    bodyTop: "#cf1b27",
    bodyBot: "#821322",
    border: "#ffffff",
    text: "#ffd633",
    badgeTop: "#fe0601",
    badgeBot: "#00193b",
    badgeBorder: "#dc0833",
    chevron: "#ffffff",
  },
  pressed: {
    shadow: "#640a19",
    bodyTop: "#cf1b27",
    bodyBot: "#821322",
    border: "#ffffff",
    text: "#530209",
    badgeTop: "#7a1120",
    badgeBot: "#6d0e1d",
    badgeBorder: "#530209",
    chevron: "#530209",
  },
};

/**
 * Bake a vertical gradient with a rounded-rect mask to a Phaser texture (cached by key).
 * Uses the browser Canvas2D path so we get smooth, real gradients rather than stripe approximations.
 */
function bakeGradientTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  r: number,
  topHex: string,
  botHex: string,
  borderHex: string,
  borderPx = 1,
): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rr = (x: number, y: number, ww: number, hh: number, rad: number) => {
    const rc = Math.min(rad, ww / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rc, y);
    ctx.lineTo(x + ww - rc, y);
    ctx.quadraticCurveTo(x + ww, y, x + ww, y + rc);
    ctx.lineTo(x + ww, y + hh - rc);
    ctx.quadraticCurveTo(x + ww, y + hh, x + ww - rc, y + hh);
    ctx.lineTo(x + rc, y + hh);
    ctx.quadraticCurveTo(x, y + hh, x, y + hh - rc);
    ctx.lineTo(x, y + rc);
    ctx.quadraticCurveTo(x, y, x + rc, y);
    ctx.closePath();
  };

  rr(0, 0, w, h, r);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, topHex);
  grad.addColorStop(1, botHex);
  ctx.fillStyle = grad;
  ctx.fill();

  if (borderPx > 0) {
    rr(borderPx / 2, borderPx / 2, w - borderPx, h - borderPx, r);
    ctx.lineWidth = borderPx;
    ctx.strokeStyle = borderHex;
    ctx.stroke();
  }

  scene.textures.addCanvas(key, canvas);
}

function bakeAllTextures(scene: Phaser.Scene): void {
  for (const [stateName, c] of Object.entries(STATES)) {
    bakeGradientTexture(
      scene,
      `pandai-start-body-${stateName}`,
      W,
      H,
      BODY_R,
      c.bodyTop,
      c.bodyBot,
      c.border,
      1,
    );
    bakeGradientTexture(
      scene,
      `pandai-start-shadow-${stateName}`,
      W,
      H + SHADOW_GAP,
      SHADOW_R,
      c.shadow,
      c.shadow,
      c.shadow,
      0,
    );
    bakeGradientTexture(
      scene,
      `pandai-start-badge-${stateName}`,
      36,
      36,
      18,
      c.badgeTop,
      c.badgeBot,
      c.badgeBorder,
      1,
    );
  }
}

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
  bakeAllTextures(scene);

  const container = scene.add.container(opts.x, opts.y);

  // Layers — we keep references and just swap textures/positions on state change.
  const shadow = scene.add.image(0, 0, "pandai-start-shadow-enabled").setOrigin(0.5);
  const body = scene.add.image(0, 0, "pandai-start-body-enabled").setOrigin(0.5);

  // Label
  const text = scene.add
    .text(0, 0, opts.label ?? "Start Game", {
      fontFamily: "Poppins, system-ui, sans-serif",
      fontSize: "28px",
      fontStyle: "700",
      color: STATES.enabled.text,
    })
    .setOrigin(0.5)
    .setLetterSpacing(0.4);

  // Right badge: gradient circle with chevron
  const badgeX = W / 2 - 28;
  const badge = scene.add.image(badgeX, 0, "pandai-start-badge-enabled").setOrigin(0.5);

  // Chevron-right (Feather-style), bounding-box centered on the badge
  const chevron = scene.add.graphics();
  const drawChevron = (color: string) => {
    chevron.clear();
    chevron.lineStyle(2.5, Phaser.Display.Color.HexStringToColor(color).color, 1);
    chevron.beginPath();
    chevron.moveTo(badgeX - 4, -5);
    chevron.lineTo(badgeX + 4, 0);
    chevron.lineTo(badgeX - 4, 5);
    chevron.strokePath();
  };
  drawChevron(STATES.enabled.chevron);

  // Hit area covers the full button shape
  const hit = scene.add
    .zone(0, 0, W, H + SHADOW_GAP)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  container.add([shadow, body, text, badge, chevron, hit]);

  // State application
  const applyState = (state: keyof typeof STATES) => {
    const c = STATES[state];
    shadow.setTexture(`pandai-start-shadow-${state}`);
    body.setTexture(`pandai-start-body-${state}`);
    badge.setTexture(`pandai-start-badge-${state}`);

    // Enabled & Hovered: body raised, shadow shows on bottom edge
    // Pressed: body pushed down, shadow shows on top edge
    const yOff = state === "pressed" ? SHADOW_GAP / 2 : -SHADOW_GAP / 2;
    body.setY(yOff);
    text.setY(yOff);
    badge.setY(yOff);
    drawChevron(c.chevron);
    text.setColor(c.text);
  };
  applyState("enabled");

  // Interaction
  let isOver = false;
  hit.on("pointerover", () => {
    isOver = true;
    applyState("hovered");
  });
  hit.on("pointerout", () => {
    isOver = false;
    applyState("enabled");
  });
  hit.on("pointerdown", () => applyState("pressed"));
  hit.on("pointerup", () => {
    applyState(isOver ? "hovered" : "enabled");
    opts.onClick();
  });
  hit.on("pointerupoutside", () => applyState("enabled"));

  return container;
}
