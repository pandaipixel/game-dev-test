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
};

export const PALETTE_CSS = {
  navy:       '#020d26',
  royalBlue:  '#1535a8',
  darkRed:    '#a21520',
  ruby:       '#b81c26',
  yellow:     '#fdd83d',
  orange:     '#ffb800',
  white:      '#ffffff',
};

export const GAME = {
  width:  480,
  height: 854,

  // 3 minute round timer
  roundDurationMs: 3 * 60 * 1000,

  // gameplay tuning
  gravity:          1200,
  flapVelocity:     -380,
  rubySpawnEveryMs: 2200,
  rubyValue:        1,
};

// Difficulty ramp. Over the round, pipes get faster, the gap narrows, and
// pairs spawn more often. Each value is linearly interpolated from `start`
// to `end` as the timer elapses. The ramp finishes at `rampCompleteAt` (a
// fraction of the round) so the final stretch plays at a steady maximum.
export const DIFFICULTY = {
  rampCompleteAt:   0.85,
  pipeSpeed:        { start: 180,  end: 315  }, // px/sec
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

export const FONTS = {
  // System font stack — works without bundling a font file
  ui:    '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
};
