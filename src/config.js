// Design tokens and gameplay constants for Flying Ruby.
// Color palette is sourced from the Pandai Design System 1.5 (Figma):
// https://www.figma.com/design/Y0DLhf2MGdGwG0jyjN7EbQ/Pandai-Design-System-1.5--WIP---BACKUP-?node-id=1390-161

export const PALETTE = {
  navy:       0x020d26,
  royalBlue:  0x1535a8,
  darkRed:    0xa21520,
  ruby:       0xb81c26,
  yellow:     0xfdd83d,
  orange:     0xffb800,
  white:      0xffffff,

  // Pillar gold — a gameplay obstacle color, not a brand token.
  goldLight:  0xffd633,
  goldDark:   0xd89900,
  goldEdge:   0x9a6e00,
};

export const PALETTE_CSS = {
  navy:       '#020d26',
  royalBlue:  '#1535a8',
  darkRed:    '#a21520',
  ruby:       '#b81c26',
  yellow:     '#fdd83d',
  orange:     '#ffb800',
  white:      '#ffffff',

  goldLight:  '#ffd633',
  goldDark:   '#d89900',
  goldEdge:   '#9a6e00',
};

export const GAME = {
  width:  480,
  height: 854,

  // 3 minute round timer
  roundDurationMs: 3 * 60 * 1000,

  // gameplay tuning
  gravity:      1200,
  flapVelocity: -380,
  rubyValue:    1,
};

// Difficulty ramp. Over the round, pipes get faster, the gap narrows, and
// pairs spawn more often. Each value is linearly interpolated from `start`
// to `end` as the timer elapses. The ramp finishes at `rampCompleteAt` (a
// fraction of the round) so the final stretch plays at a steady maximum.
export const DIFFICULTY = {
  rampCompleteAt:   0.85,
  pipeSpeed:        { start: 234,  end: 410  }, // px/sec (30% above the original pace)
  pipeGap:          { start: 230,  end: 160  }, // px between top/bottom pipe
  pipeSpawnEveryMs: { start: 1700, end: 1100 }, // delay between pipe pairs
};

// Magnet power-up: a bubble occasionally drifts in; collecting it pulls
// every on-screen ruby toward the player for a few seconds.
export const MAGNET = {
  spawnEveryMs: 8000,  // interval between spawn rolls
  spawnChance:  0.7,   // 7-in-10 chance a roll actually spawns a bubble
  durationMs:   5000,  // effect lasts up to 5s
  pullSpeed:    560,   // px/sec rubies fly toward the player
};

// Power Rush power-up: a 7s frenzy — the pillars retract out of frame, the
// game speeds up, and grids of rubies pour in.
export const RUSH = {
  spawnEveryMs:    21000,  // interval between rush spawn rolls
  spawnChance:     0.6,    // chance a roll arms a rush bubble
  durationMs:      7000,   // how long the effect lasts
  speedMultiplier: 1.6,    // +60% world speed (obstacles/rubies) while active
  bgScrollMultiplier: 10,  // background races by 10x its normal speed
  rubyCount:       50,     // rubies streamed along a sine wave over the effect
  recoverDelayMs:  1200,   // clear-sky buffer before pillars drop back in
};

export const FONTS = {
  // System font stack — works without bundling a font file
  ui:    '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
};
