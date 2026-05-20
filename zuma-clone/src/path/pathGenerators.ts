/**
 * Parametric path generators for the Zuma-style chain.
 * Each generator emits an array of {x, y} waypoints that Phaser's Spline
 * smooths into a curve. Designed so a stage can be described in 4–8 numbers
 * instead of 20+ hand-tweaked waypoints.
 */

export interface Point {
  x: number;
  y: number;
}

interface SpiralParams {
  type: "spiral";
  center: [number, number];
  startRadius: number;
  endRadius: number;
  turns: number;
  startAngleDeg?: number;    // default 180 (left side)
  clockwise?: boolean;       // default true
  samples?: number;          // default 24
  leadIn?: { from: [number, number]; to: [number, number]; steps?: number };
}

interface CircleParams {
  type: "circle";
  center: [number, number];
  radius: number;
  startAngleDeg?: number;    // default 0 (right side)
  arcDeg?: number;           // default 360
  clockwise?: boolean;       // default true
  samples?: number;          // default 24
  leadIn?: { from: [number, number]; to: [number, number]; steps?: number };
}

interface SerpentineParams {
  type: "serpentine";
  startX: number;
  endX: number;
  topY: number;
  bottomY: number;
  rows: number;              // 2 = simple S, 4+ = tight snake
  leadIn?: { from: [number, number]; to: [number, number]; steps?: number };
}

interface FigureEightParams {
  type: "figureEight";
  center: [number, number];
  lobeRadius: number;        // overall width per lobe
  samples?: number;          // default 36
  leadIn?: { from: [number, number]; to: [number, number]; steps?: number };
}

/**
 * Two concentric loops connected by a smooth inward transition — the classic
 * Zuma Deluxe stage shape. Outer ring traces most of the perimeter, then the
 * path tightens into the inner ring around the shooter.
 */
interface DoubleLoopParams {
  type: "doubleLoop";
  center: [number, number];
  outerRadius: number;
  innerRadius: number;
  startAngleDeg?: number;    // default 180 (left)
  clockwise?: boolean;       // default true
  loopExtraDeg?: number;     // extra degrees past 360° before transitioning, default 30
  transitionDeg?: number;    // angular span of the inward spiral, default 90
  outerSamples?: number;     // default 18
  innerSamples?: number;     // default 14
  leadIn?: { from: [number, number]; to: [number, number]; steps?: number };
}

export type GeneratorParams =
  | SpiralParams
  | CircleParams
  | SerpentineParams
  | FigureEightParams
  | DoubleLoopParams;

export function generatePath(params: GeneratorParams): Point[] {
  switch (params.type) {
    case "spiral":      return withLeadIn(params.leadIn, spiral(params));
    case "circle":      return withLeadIn(params.leadIn, circle(params));
    case "serpentine":  return withLeadIn(params.leadIn, serpentine(params));
    case "figureEight": return withLeadIn(params.leadIn, figureEight(params));
    case "doubleLoop":  return withLeadIn(params.leadIn, doubleLoop(params));
  }
}

// ---------- internals ----------

function withLeadIn(
  leadIn: GeneratorParams["leadIn"],
  body: Point[],
): Point[] {
  if (!leadIn) return body;
  const steps = leadIn.steps ?? 3;
  const lead: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    lead.push({
      x: Math.round(leadIn.from[0] + (leadIn.to[0] - leadIn.from[0]) * t),
      y: Math.round(leadIn.from[1] + (leadIn.to[1] - leadIn.from[1]) * t),
    });
  }
  return [...lead, ...body];
}

function spiral(p: SpiralParams): Point[] {
  const samples = p.samples ?? 24;
  const startAngle = ((p.startAngleDeg ?? 180) * Math.PI) / 180;
  const dir = p.clockwise === false ? -1 : 1;
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const theta = startAngle + dir * t * p.turns * 2 * Math.PI;
    const r = p.startRadius + t * (p.endRadius - p.startRadius);
    out.push({
      x: Math.round(p.center[0] + r * Math.cos(theta)),
      y: Math.round(p.center[1] + r * Math.sin(theta)),
    });
  }
  return out;
}

function circle(p: CircleParams): Point[] {
  const samples = p.samples ?? 24;
  const startAngle = ((p.startAngleDeg ?? 0) * Math.PI) / 180;
  const arc = ((p.arcDeg ?? 360) * Math.PI) / 180;
  const dir = p.clockwise === false ? -1 : 1;
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const theta = startAngle + dir * t * arc;
    out.push({
      x: Math.round(p.center[0] + p.radius * Math.cos(theta)),
      y: Math.round(p.center[1] + p.radius * Math.sin(theta)),
    });
  }
  return out;
}

function serpentine(p: SerpentineParams): Point[] {
  const out: Point[] = [];
  const rows = Math.max(2, p.rows);
  const yStep = (p.bottomY - p.topY) / (rows - 1);
  for (let row = 0; row < rows; row++) {
    const y = Math.round(p.topY + row * yStep);
    const leftToRight = row % 2 === 0;
    const x1 = leftToRight ? p.startX : p.endX;
    const x2 = leftToRight ? p.endX : p.startX;
    // 3 anchors per row → spline keeps the horizontal run straight
    out.push({ x: Math.round(x1), y });
    out.push({ x: Math.round((x1 + x2) / 2), y });
    out.push({ x: Math.round(x2), y });
  }
  return out;
}

function doubleLoop(p: DoubleLoopParams): Point[] {
  const out: Point[] = [];
  const dir = p.clockwise === false ? -1 : 1;
  const startTheta = ((p.startAngleDeg ?? 180) * Math.PI) / 180;
  const outerSamples = p.outerSamples ?? 18;
  const innerSamples = p.innerSamples ?? 14;
  const loopExtra = p.loopExtraDeg ?? 30;
  const transitionDeg = p.transitionDeg ?? 90;
  const outerSweepDeg = 360 + loopExtra - transitionDeg;

  // Outer loop — sweep outerSweepDeg degrees at outerRadius
  for (let i = 0; i <= outerSamples; i++) {
    const t = i / outerSamples;
    const theta = startTheta + (dir * t * outerSweepDeg * Math.PI) / 180;
    out.push({
      x: Math.round(p.center[0] + p.outerRadius * Math.cos(theta)),
      y: Math.round(p.center[1] + p.outerRadius * Math.sin(theta)),
    });
  }

  // Inward transition — radius shrinks from outer to inner over transitionDeg
  const transitionStart = startTheta + (dir * outerSweepDeg * Math.PI) / 180;
  const transitionSamples = 6;
  for (let i = 1; i <= transitionSamples; i++) {
    const t = i / transitionSamples;
    const theta = transitionStart + (dir * t * transitionDeg * Math.PI) / 180;
    const r = p.outerRadius + (p.innerRadius - p.outerRadius) * t;
    out.push({
      x: Math.round(p.center[0] + r * Math.cos(theta)),
      y: Math.round(p.center[1] + r * Math.sin(theta)),
    });
  }

  // Inner loop — sweep 360° at innerRadius
  const innerStart = transitionStart + (dir * transitionDeg * Math.PI) / 180;
  for (let i = 1; i <= innerSamples; i++) {
    const t = i / innerSamples;
    const theta = innerStart + (dir * t * 360 * Math.PI) / 180;
    out.push({
      x: Math.round(p.center[0] + p.innerRadius * Math.cos(theta)),
      y: Math.round(p.center[1] + p.innerRadius * Math.sin(theta)),
    });
  }

  return out;
}

function figureEight(p: FigureEightParams): Point[] {
  // Lemniscate of Bernoulli — parametric form
  const samples = p.samples ?? 36;
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * 2 * Math.PI;
    const denom = 1 + Math.sin(t) * Math.sin(t);
    const x = (p.lobeRadius * Math.cos(t)) / denom;
    const y = (p.lobeRadius * Math.sin(t) * Math.cos(t)) / denom;
    out.push({
      x: Math.round(p.center[0] + x),
      y: Math.round(p.center[1] + y),
    });
  }
  return out;
}
