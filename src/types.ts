import type { GeneratorParams, Point } from "./path/pathGenerators";

export interface BallColor {
  id: string;
  hex: string;
  sprite: string | null;
}

export interface PathData {
  description?: string;
  points: { x: number; y: number }[];
}

/**
 * Per-stage tuning that overrides the global config.json defaults.
 * Any field not set falls back to the cfg defaults.
 */
export interface StageOverrides {
  chainSpeedPxPerSec?: number;
  timeLimitSec?: number;
  startCount?: number;
  spawnIntervalMs?: number;
  finalRushAtSecRemaining?: number;
  finalRushSpeedFactor?: number;
}

/**
 * One traversable path. A Stage may declare a single path via `points`/
 * `generator`, OR multiple `lanes` (parallel chains). Each lane has its own
 * spawning, advancement, and game-over condition.
 */
export interface LaneDef {
  points?: Point[];
  generator?: GeneratorParams;
}

export interface Stage {
  id: string;
  name: string;
  description?: string;
  /** Hand-authored waypoints — used if `generator` and `lanes` are omitted. */
  points?: Point[];
  /** Parametric path: see src/path/pathGenerators.ts */
  generator?: GeneratorParams;
  /** Multiple parallel paths. Takes precedence over `points`/`generator`. */
  lanes?: LaneDef[];
  overrides?: StageOverrides;
}

export interface StagesData {
  stages: Stage[];
}

export interface ThemeConfig {
  brand: {
    red: string;
    brick: string;
    yellow: string;
    darkYellow: string;
    blue: string;
    black: string;
    white: string;
  };
  fonts: {
    display: string;
    body: string;
  };
}

export interface GameConfig {
  game: {
    width: number;
    height: number;
    backgroundColor: string;
    timeLimitSec: number;
    finalRushAtSecRemaining: number;
    finalRushSpeedFactor: number;
  };
  theme: ThemeConfig;
  balls: {
    radius: number;
    spacing: number;
    colors: BallColor[];
  };
  chain: {
    speedPxPerSec: number;
    spawnIntervalMs: number;
    startCount: number;
    speedupEveryMs: number;
    speedupFactor: number;
  };
  shooter: {
    x: number;
    y: number;
    sprite: string | null;
    projectileSpeedPxPerSec: number;
    reloadMs: number;
    arrowSpawnRate: number;
    powerupColorId: string;
    powerupChargesPerMatch: number;
    bombMatchesPerCharge: number;
    bombExplosionCount: number;
  };
  scoring: {
    perBallRuby: number;
    comboBonusRuby: number;
    cascadeMultiplier: number;
    matchesPerTimeBonus: number;
    timeBonusSec: number;
  };
  path: { file: string };
  assets: {
    background: string | null;
    startBackground: string | null;
    startBackgroundMobile: string | null;
    logo: string | null;
    bombImage: string | null;
    startButton: string | null;
  };
  audio: {
    bgm: string | null;
    ballMerge: string | null;
    ballRelease: string | null;
    timeBonus: string | null;
    warningTime: string | null;
    bgmVolume: number;
    sfxVolume: number;
  };
  /**
   * Per-field overrides applied at boot when the device is touch-primary
   * (`matchMedia("(hover: none) and (pointer: coarse)")`). Stage path
   * coordinates are auto-rescaled from the authored 1280x720 canvas to the
   * mobile canvas dimensions.
   */
  mobile?: {
    game?: { width?: number; height?: number };
    balls?: { radius?: number; spacing?: number };
    shooter?: { x?: number; y?: number };
  };
}

export const TEX = {
  ball: (id: string) => `ball-${id}`,
  shooter: "shooter",
  background: "background",
  startBackground: "start-background",
  startBackgroundMobile: "start-background-mobile",
  logo: "logo",
  rubySpark: "ruby-spark",
  arrow: "arrow-powerup",
  bomb: "bomb-powerup",
  startButton: "start-button",
};

export const SFX = {
  bgm: "bgm",
  ballMerge: "ball-merge",
  ballRelease: "ball-release",
  timeBonus: "time-bonus",
  warningTime: "warning-time",
};
