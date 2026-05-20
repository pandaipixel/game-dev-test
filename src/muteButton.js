// Shared mute toggle.
//
// State handling: Phaser's WebAudio `sound.mute` getter is unreliable (it
// reads a gain-node value back), so we never read it — we track the state
// ourselves. localStorage persists it across reloads when available, but a
// module-level `muteState` is the in-session source of truth: sandboxed
// webviews (e.g. VS Code's Simple Browser) and private mode make
// localStorage *throw*, so every access is guarded.
import { PALETTE } from './config.js';

const MUTE_KEY = 'flying-ruby:muted';

// in-session source of truth; mirrors localStorage when that is available
let muteState = false;

// Refresh muteState from localStorage. If storage is unavailable the call
// throws — we swallow it and keep whatever muteState already held.
function loadMuteState() {
  try { muteState = window.localStorage.getItem(MUTE_KEY) === '1'; }
  catch { /* storage blocked — keep the in-memory value */ }
  return muteState;
}

export function isMuted() {
  return muteState;
}

function setMuted(scene, muted) {
  muteState = muted;
  try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); }
  catch { /* storage blocked — state still held in memory for the session */ }
  scene.sound.mute = muted; // write-only — drives the master gain node
}

// Sync the game's global sound manager with the saved preference.
export function applyMutePreference(scene) {
  scene.sound.mute = loadMuteState();
}

// Adds a speaker on/off toggle at (x, y). The tap target is padded well
// beyond the icon so it is easy to hit with a mouse or finger. Returns the
// button container (e.g. so a scene can exclude it from other input).
export function addMuteButton(scene, x, y) {
  scene.sound.mute = loadMuteState();

  const R = 20;       // visual background radius
  const HIT_R = 34;   // generous tap radius

  const btn = scene.add.container(x, y).setDepth(1000).setScrollFactor(0);

  const bg = scene.add.graphics();
  bg.fillStyle(PALETTE.navy, 0.62);
  bg.fillCircle(0, 0, R);
  bg.lineStyle(2, PALETTE.yellow, 0.65);
  bg.strokeCircle(0, 0, R);
  btn.add(bg);

  // speaker — body + cone, always shown
  const speaker = scene.add.graphics();
  speaker.fillStyle(PALETTE.yellow, 1);
  speaker.fillPoints([
    { x: -11, y: -4 }, { x: -6, y: -4 }, { x: -1, y: -9 },
    { x: -1, y: 9 }, { x: -6, y: 4 }, { x: -11, y: 4 },
  ], true);
  btn.add(speaker);

  // sound waves — shown when NOT muted
  const waves = scene.add.graphics();
  waves.lineStyle(2.4, PALETTE.yellow, 1);
  waves.beginPath(); waves.arc(2, 0, 6, -1.05, 1.05); waves.strokePath();
  waves.beginPath(); waves.arc(2, 0, 11, -0.95, 0.95); waves.strokePath();
  btn.add(waves);

  // red "x" — shown when muted
  const cross = scene.add.graphics();
  cross.lineStyle(3, PALETTE.ruby, 1);
  cross.beginPath(); cross.moveTo(3, -7);  cross.lineTo(13, 7); cross.strokePath();
  cross.beginPath(); cross.moveTo(13, -7); cross.lineTo(3, 7);  cross.strokePath();
  btn.add(cross);

  const render = (muted) => {
    waves.setVisible(!muted);
    cross.setVisible(muted);
  };
  render(isMuted());

  btn.setSize(HIT_R * 2, HIT_R * 2);
  btn.setInteractive(
    new Phaser.Geom.Circle(0, 0, HIT_R),
    Phaser.Geom.Circle.Contains,
  );
  btn.on('pointerover', () => scene.input.setDefaultCursor('pointer'));
  btn.on('pointerout',  () => scene.input.setDefaultCursor('default'));
  btn.on('pointerdown', () => {
    const next = !isMuted();
    setMuted(scene, next);
    render(next);
    scene.tweens.add({
      targets: btn, scale: 0.86, duration: 90, yoyo: true, ease: 'Sine.easeOut',
    });
  });

  return btn;
}
