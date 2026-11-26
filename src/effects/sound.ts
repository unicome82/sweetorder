import summerDay from '../assets/audio/bgm-summer-day.mp3?url';
import dreamyFlashback from '../assets/audio/bgm-dreamy-flashback.mp3?url';
import dreamCulture from '../assets/audio/bgm-dream-culture.mp3?url';

// Menus (start and stage select) play one track, the game screen another.
export type MusicScene = 'menu' | 'game' | 'bonus';
const sceneTracks: Record<MusicScene, string> = { menu: summerDay, game: dreamyFlashback, bonus: dreamCulture };
export const MUSIC_CREDIT = '"Summer Day", "Dreamy Flashback", "Dream Culture" Kevin MacLeod (incompetech.com) · CC BY 4.0';

const preferenceKey = 'sweet-order-sound';
const volumeKeys = { sfx: 'sweet-order-sfx-volume', music: 'sweet-order-music-volume' } as const;
const defaultVolumes = { sfx: 0.8, music: 0.45 } as const;
const masterVolume = 0.6;
const silence = 0.0001;

export type VolumeKind = keyof typeof volumeKeys;
export type MusicMood = 'normal' | 'muted' | 'urgent';

export function readSoundPreference() {
  try {
    return localStorage.getItem(preferenceKey) !== 'off';
  } catch {
    return true;
  }
}

function readVolume(kind: VolumeKind) {
  try {
    const saved = Number.parseFloat(localStorage.getItem(volumeKeys[kind]) ?? '');
    if (Number.isFinite(saved)) return Math.min(1, Math.max(0, saved));
  } catch {
    // Fall back to the default level.
  }
  return defaultVolumes[kind];
}

// A tone is one pitched voice; partials add the bell/marimba colour on top of the body pitch.
type Overtone = readonly [ratio: number, weight: number, tail: number];
interface Tone {
  at: number; freq: number; dur: number; level: number;
  attack?: number; to?: number; wave?: OscillatorType; partials?: readonly Overtone[];
}
// A noise burst is filtered white noise: clicks, knocks, whooshes.
interface Noise {
  at: number; freq: number; dur: number; level: number;
  attack?: number; to?: number; q?: number; filter?: BiquadFilterType;
}
interface Cue { tones?: Tone[]; noises?: Noise[]; echo?: boolean }

const bell: readonly Overtone[] = [[1, 1, 1], [2, 0.22, 0.52], [2.76, 0.09, 0.28]];
const marimba: readonly Overtone[] = [[1, 1, 1], [4, 0.14, 0.22], [9.2, 0.03, 0.08]];
const pure: readonly Overtone[] = [[1, 1, 1]];

// Rising pentatonic steps: consecutive deliveries climb so a streak sounds like progress.
const deliverySteps = [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77];
const semitone = 2 ** (1 / 12);

const cueBuilders = {
  // A dessert set down on the tray: a short wooden knock with a tiny body, slightly detuned per tap.
  select: (): Cue => {
    const v = 0.96 + Math.random() * 0.08;
    return {
      tones: [
        { at: 0, freq: 340 * v, to: 230 * v, dur: 0.06, level: 0.28, attack: 0.0015, partials: pure },
        { at: 0, freq: 760 * v, dur: 0.035, level: 0.07, attack: 0.001, partials: [[1, 1, 1], [2.4, 0.3, 0.5]] },
      ],
      noises: [{ at: 0, freq: 1500, dur: 0.018, level: 0.3, attack: 0.0006, q: 1.1 }],
    };
  },
  // Wooden contact plus a marimba note that climbs with the delivery streak.
  delivery: (step: number): Cue => ({
    tones: [{ at: 0.004, freq: deliverySteps[Math.min(step, deliverySteps.length - 1)]!, dur: 0.3, level: 0.16, attack: 0.002, partials: marimba }],
    noises: [{ at: 0, freq: 310, dur: 0.05, level: 0.5, attack: 0.0015 }, { at: 0, freq: 1120, dur: 0.016, level: 0.22, attack: 0.0006 }],
  }),
  order: (step: number): Cue => {
    const lift = semitone ** (Math.min(step, 6) * 2);
    return {
      tones: [
        { at: 0.03, freq: 523.25 * lift, dur: 0.24, level: 0.13, partials: bell },
        { at: 0.03, freq: 659.25 * lift, dur: 0.24, level: 0.09, partials: bell },
        { at: 0.03, freq: 783.99 * lift, dur: 0.27, level: 0.07, partials: bell },
        { at: 0.09, freq: 2093 * lift, dur: 0.18, level: 0.025, partials: pure },
      ],
      noises: [{ at: 0, freq: 1800, dur: 0.08, level: 0.075, attack: 0.015 }],
    };
  },
  // Short, dull thunk: clearly "not now" without sounding like a failure.
  denied: (): Cue => ({
    tones: [{ at: 0, freq: 190, to: 120, dur: 0.11, level: 0.3, attack: 0.002, partials: pure }],
    noises: [{ at: 0, freq: 420, dur: 0.045, level: 0.3, attack: 0.001, filter: 'lowpass', q: 0.7 }],
  }),
  // Happy customer walking off: soft whoosh and a tiny two-note sparkle for the hearts.
  departure: (): Cue => ({
    tones: [
      { at: 0.02, freq: 1567.98, dur: 0.16, level: 0.05, partials: pure },
      { at: 0.09, freq: 2093, dur: 0.2, level: 0.045, partials: pure },
    ],
    noises: [{ at: 0, freq: 1700, to: 430, dur: 0.24, level: 0.22, attack: 0.05 }],
  }),
  // Interface buttons: a soft, dry tock.
  tap: (): Cue => ({
    tones: [{ at: 0, freq: 640, to: 470, dur: 0.06, level: 0.22, attack: 0.001, partials: pure }],
    noises: [{ at: 0, freq: 2000, dur: 0.012, level: 0.1, attack: 0.0005 }],
  }),
  // Tray emptied: a falling swish followed by plates clinking away.
  clearTray: (): Cue => ({
    tones: [
      { at: 0.06, freq: 2637, dur: 0.09, level: 0.07, partials: bell },
      { at: 0.12, freq: 2349.3, dur: 0.09, level: 0.065, partials: bell },
      { at: 0.18, freq: 1975.5, dur: 0.12, level: 0.065, partials: bell },
    ],
    noises: [{ at: 0, freq: 2600, to: 420, dur: 0.3, level: 0.34, attack: 0.02, q: 0.8 }],
  }),
  pause: (): Cue => ({
    tones: [
      { at: 0, freq: 659.25, dur: 0.16, level: 0.11, partials: bell },
      { at: 0.08, freq: 523.25, dur: 0.22, level: 0.1, partials: bell },
    ],
  }),
  resume: (): Cue => ({
    tones: [
      { at: 0, freq: 523.25, dur: 0.14, level: 0.1, partials: bell },
      { at: 0.07, freq: 783.99, dur: 0.2, level: 0.11, partials: bell },
    ],
  }),
  // Last seconds: a clock tick, brighter with a low pulse in the final three seconds.
  tick: (): Cue => ({
    tones: [{ at: 0, freq: 1250, dur: 0.035, level: 0.12, attack: 0.001, partials: pure }],
    noises: [{ at: 0, freq: 2600, dur: 0.01, level: 0.09, attack: 0.0005 }],
  }),
  tickUrgent: (): Cue => ({
    tones: [
      { at: 0, freq: 1568, dur: 0.05, level: 0.16, attack: 0.001, partials: pure },
      { at: 0, freq: 220, to: 160, dur: 0.12, level: 0.2, attack: 0.002, partials: pure },
    ],
    noises: [{ at: 0, freq: 3000, dur: 0.012, level: 0.1, attack: 0.0005 }],
  }),
  // +5 seconds joining the clock: one bright ding per second, each a step higher; the fifth rings longer with a sparkle.
  timeAdd: (step: number): Cue => {
    const freq = 783.99 * semitone ** (Math.min(step, 4) * 2);
    const last = step >= 4;
    return {
      tones: [
        { at: 0, freq, dur: last ? 0.42 : 0.14, level: last ? 0.12 : 0.1, attack: 0.002, partials: bell },
        ...(last ? [{ at: 0.05, freq: freq * 2, dur: 0.3, level: 0.035, attack: 0.003, partials: pure }] : []),
      ],
      noises: [{ at: 0, freq: 5200, dur: 0.012, level: 0.05, attack: 0.0005 }],
    };
  },
  // A star slips away: a falling glassy arpeggio.
  starLost: (): Cue => ({
    tones: [
      { at: 0, freq: 1567.98, dur: 0.32, level: 0.09, partials: bell },
      { at: 0.09, freq: 1174.66, dur: 0.34, level: 0.085, partials: bell },
      { at: 0.18, freq: 880, dur: 0.5, level: 0.09, partials: bell },
    ],
    noises: [{ at: 0, freq: 3200, to: 900, dur: 0.36, level: 0.06, attack: 0.03 }],
  }),
  blocked: (): Cue => ({
    tones: [
      { at: 0, freq: 146.83, dur: 0.86, level: 0.15, attack: 0.04, partials: bell },
      { at: 0, freq: 220, dur: 0.78, level: 0.11, attack: 0.04, partials: bell },
      { at: 0.055, freq: 349.23, dur: 0.63, level: 0.16, attack: 0.025, partials: bell },
      { at: 0.34, freq: 293.66, dur: 0.81, level: 0.16, attack: 0.035, partials: bell },
    ],
    noises: [{ at: 0, freq: 330, dur: 0.1, level: 0.19, attack: 0.012 }],
    echo: true,
  }),
  failed: (): Cue => ({
    tones: [
      { at: 0, freq: 130.81, dur: 1.3, level: 0.14, attack: 0.055, partials: bell },
      { at: 0, freq: 196, dur: 1.25, level: 0.095, attack: 0.055, partials: bell },
      { at: 0.035, freq: 523.25, dur: 0.87, level: 0.14, attack: 0.03, partials: bell },
      { at: 0.32, freq: 466.16, dur: 0.85, level: 0.13, attack: 0.032, partials: bell },
      { at: 0.66, freq: 392, dur: 1.1, level: 0.15, attack: 0.04, partials: bell },
      { at: 0.66, freq: 164.81, dur: 1.06, level: 0.115, attack: 0.06, partials: bell },
      { at: 0.66, freq: 261.63, dur: 1.02, level: 0.085, attack: 0.055, partials: bell },
    ],
    echo: true,
  }),
  // Queue reward picked up: a bright two-step sparkle.
  reward: (): Cue => ({
    tones: [
      { at: 0, freq: 1046.5, dur: 0.22, level: 0.1, attack: 0.005, partials: bell },
      { at: 0.07, freq: 1567.98, dur: 0.3, level: 0.1, attack: 0.005, partials: bell },
      { at: 0.14, freq: 2093, dur: 0.45, level: 0.08, attack: 0.006, partials: bell },
      { at: 0.2, freq: 3135.96, dur: 0.3, level: 0.025, attack: 0.004, partials: pure },
    ],
    noises: [{ at: 0.1, freq: 8000, dur: 0.25, level: 0.04, attack: 0.02, q: 0.8, filter: 'highpass' }],
    echo: true,
  }),
  // Stage opening: a quick sparkling C–E–G–C climb.
  stageStart: (): Cue => ({
    tones: [
      { at: 0, freq: 523.25, dur: 0.32, level: 0.11, attack: 0.008, partials: bell },
      { at: 0.08, freq: 659.25, dur: 0.32, level: 0.115, attack: 0.008, partials: bell },
      { at: 0.16, freq: 783.99, dur: 0.34, level: 0.12, attack: 0.008, partials: bell },
      { at: 0.26, freq: 1046.5, dur: 0.75, level: 0.14, attack: 0.01, partials: bell },
      { at: 0.26, freq: 523.25, dur: 0.7, level: 0.07, attack: 0.02, partials: bell },
      { at: 0.34, freq: 2093, dur: 0.4, level: 0.035, attack: 0.006, partials: pure },
      { at: 0.42, freq: 2637.02, dur: 0.35, level: 0.025, attack: 0.006, partials: pure },
    ],
    noises: [{ at: 0.24, freq: 7000, dur: 0.3, level: 0.06, attack: 0.02, q: 0.8, filter: 'highpass' }],
    echo: true,
  }),
  // Bonus stage opening: sparkling "twinkle-twinkle" runs that swap between a low and a high
  // register, then play together over a long, full chord.
  bonusStart: (): Cue => {
    const run = (at: number, notes: number[], level: number, partials: readonly Overtone[]) =>
      notes.map((freq, index) => ({ at: at + index * 0.04, freq, dur: 0.26, level, attack: 0.004, partials }));
    const low = [261.63, 329.63, 392, 523.25, 659.25];
    const high = [1046.5, 1318.51, 1567.98, 2093, 2637.02];
    return {
      tones: [
        ...run(0, low, 0.11, marimba),
        ...run(0.24, high, 0.06, bell),
        ...run(0.5, low.map(freq => freq * 1.5), 0.1, marimba),
        ...run(0.74, high.map(freq => freq * 0.75), 0.06, bell),
        // Both registers together, landing on the chord.
        ...run(1.0, low, 0.08, marimba),
        ...run(1.0, high, 0.045, bell),
        { at: 1.2, freq: 130.81, dur: 1.4, level: 0.09, attack: 0.03, partials: bell },
        { at: 1.2, freq: 261.63, dur: 1.35, level: 0.09, attack: 0.02, partials: bell },
        { at: 1.2, freq: 329.63, dur: 1.3, level: 0.085, attack: 0.02, partials: bell },
        { at: 1.2, freq: 392, dur: 1.3, level: 0.085, attack: 0.02, partials: bell },
        { at: 1.2, freq: 1046.5, dur: 1.3, level: 0.08, attack: 0.015, partials: bell },
        ...[3135.96, 2637.02, 2093, 2637.02, 3135.96, 4186.01].map((freq, index) => ({
          at: 1.3 + index * 0.09, freq, dur: 0.3, level: 0.022, attack: 0.004, partials: pure,
        })),
      ],
      noises: [
        { at: 0.2, freq: 8000, dur: 0.5, level: 0.035, attack: 0.05, q: 0.7, filter: 'highpass' },
        { at: 1.15, freq: 7500, dur: 0.9, level: 0.06, attack: 0.04, q: 0.7, filter: 'highpass' },
      ],
      echo: true,
    };
  },
  clear: (): Cue => ({
    tones: [
      { at: 0, freq: 440, dur: 0.54, level: 0.115, attack: 0.012, partials: bell },
      { at: 0.14, freq: 554.37, dur: 0.62, level: 0.12, attack: 0.015, partials: bell },
      { at: 0.29, freq: 329.63, dur: 0.86, level: 0.1, attack: 0.045, partials: bell },
      { at: 0.29, freq: 554.37, dur: 0.85, level: 0.085, attack: 0.035, partials: bell },
      { at: 0.29, freq: 659.25, dur: 0.88, level: 0.15, attack: 0.02, partials: bell },
      { at: 0.29, freq: 880, dur: 0.77, level: 0.075, attack: 0.024, partials: bell },
    ],
    echo: true,
  }),
} satisfies Record<string, (step: number) => Cue>;

export type SoundName = keyof typeof cueBuilders;
export const soundNames = Object.keys(cueBuilders) as SoundName[];

// How long a pause between deliveries may be before the rising streak starts over.
const STREAK_GAP = 1.4;
// A sound held back while audio resumes is dropped if the resume took longer than this.
const STALE_SOUND_MS = 250;
const minimumGap: Partial<Record<SoundName, number>> = { select: 0.035, denied: 0.18, tap: 0.04 };

let audio: AudioContext | undefined;
let output: GainNode | undefined;
// Fades everything out before the page is hidden and back in once audio runs again, so leaving and returning to the
// app doesn't cut the sound off mid-wave or start it with a click.
let wake: GainNode | undefined;
let sfxBus: GainNode | undefined;
let musicBus: GainNode | undefined;
let moodGain: GainNode | undefined;
let music: HTMLAudioElement | undefined;
let musicRouted = false;
let noise: AudioBuffer | undefined;
let resuming: Promise<void> | undefined;
let soundEnabled = readSoundPreference();
const volumes: Record<VolumeKind, number> = { sfx: readVolume('sfx'), music: readVolume('music') };
let mood: MusicMood = 'normal';
let scene: MusicScene = 'menu';
const lastPlayed = new Map<SoundName, number>();
let streak = 0;
let streakAt = -Infinity;

export function readVolumes(): Record<VolumeKind, number> {
  return { ...volumes };
}

function ramp(param: AudioParam, value: number, smoothing = 0.02) {
  if (audio) param.setTargetAtTime(value, audio.currentTime, smoothing);
}

function musicLevel() {
  return mood === 'muted' ? 0 : volumes.music;
}

function syncMusic() {
  if (!music) return;
  // Routed music only plays while Web Audio runs: an element playing into a suspended or interrupted context
  // stutters and then catches up in a burst when the context comes back.
  const wanted = soundEnabled && volumes.music > 0 && !document.hidden && (!musicRouted || audio?.state === 'running');
  // Without Web Audio routing, fall back to the element volume (ignored on iOS).
  if (!musicRouted) music.volume = Math.min(1, musicLevel() * masterVolume);
  music.playbackRate = mood === 'urgent' ? 1.06 : 1;
  if (wanted && music.paused) void music.play().catch(() => undefined);
  else if (!wanted && !music.paused) music.pause();
}

export function saveSoundPreference(enabled: boolean) {
  soundEnabled = enabled;
  try {
    localStorage.setItem(preferenceKey, enabled ? 'on' : 'off');
  } catch {
    // The preference can still be changed for the current session.
  }
  if (output) ramp(output.gain, enabled ? masterVolume : 0, 0.008);
  syncMusic();
}

// The level a channel returns to when unmuted; kept so muting doesn't lose the slider position.
const unmuteKeys = { sfx: 'sweet-order-sfx-unmute', music: 'sweet-order-music-unmute' } as const;
const DEFAULT_UNMUTE_LEVEL = 0.6;

/** Mutes one channel (remembering its level) or brings it back to that level. */
export function toggleVolumeMute(kind: VolumeKind) {
  if (volumes[kind] > 0) {
    try { localStorage.setItem(unmuteKeys[kind], String(volumes[kind])); } catch { /* the default level is used */ }
    setVolume(kind, 0);
    return;
  }
  let level = DEFAULT_UNMUTE_LEVEL;
  try {
    const saved = Number.parseFloat(localStorage.getItem(unmuteKeys[kind]) ?? '');
    if (saved > 0 && saved <= 1) level = saved;
  } catch { /* the default level is used */ }
  setVolume(kind, level);
}

export function setVolume(kind: VolumeKind, value: number) {
  volumes[kind] = Math.min(1, Math.max(0, value));
  try {
    localStorage.setItem(volumeKeys[kind], String(volumes[kind]));
  } catch {
    // The level still applies for the current session.
  }
  if (kind === 'sfx' && sfxBus) ramp(sfxBus.gain, volumes.sfx);
  if (kind === 'music' && musicBus) ramp(musicBus.gain, volumes.music);
  syncMusic();
}

// Silence the music under game popups; speed it up slightly in the last seconds.
export function setMusicMood(next: MusicMood) {
  if (mood === next) return;
  mood = next;
  // Popups silence the music with a short fade; it keeps playing underneath and fades back in.
  if (moodGain) ramp(moodGain.gain, next === 'muted' ? 0 : 1, next === 'muted' ? 0.06 : 0.2);
  syncMusic();
}

export function setMusicScene(next: MusicScene) {
  if (next === scene) return;
  scene = next;
  if (!music) return;
  music.pause();
  music.src = sceneTracks[next];
  music.currentTime = 0;
  syncMusic();
}

function startMusic(context: AudioContext) {
  if (music || typeof Audio === 'undefined') return;
  music = new Audio(sceneTracks[scene]);
  music.loop = true;
  music.preload = 'auto';
  music.preservesPitch = true;
  // Rebuilt after the app was in the background: carry on where the track was.
  if (musicResume?.scene === scene) music.currentTime = musicResume.time;
  musicResume = undefined;
  try {
    moodGain = context.createGain();
    moodGain.gain.value = mood === 'muted' ? 0 : 1;
    context.createMediaElementSource(music).connect(moodGain).connect(musicBus!);
    musicRouted = true;
  } catch {
    musicRouted = false;
  }
}

// iOS (Safari and home-screen apps) doesn't bring Web Audio back cleanly from the background: a context still
// playing as the app is frozen beeps, one the system interrupted crackles or never resumes. There the whole audio
// setup is closed when the app is hidden and built afresh on the first tap after returning.
const rebuildAfterHide = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
// Returning elsewhere: fade the sound in, and start the music a moment later (it crackles if it starts while the
// audio device is still waking up).
const WAKE_FADE_IN = 0.25;
const MUSIC_AFTER_WAKE_MS = 200;
// A resume() that hasn't answered after this long is treated as stuck: the next tap rebuilds audio from scratch.
const RESUME_TIMEOUT_MS = 600;
let resumeStartedAt = 0;
let musicTimer: ReturnType<typeof setTimeout> | undefined;
let musicResume: { scene: MusicScene; time: number } | undefined;
let listening = false;
const TEARDOWN_AFTER_HIDE_MS = 80;
let teardownTimer: ReturnType<typeof setTimeout> | undefined;
// Whether the fade-in has run for the current waking; reset when hidden or rebuilt.
let awake = false;

function fadeIn() {
  if (awake || !audio || !wake || document.hidden || audio.state !== 'running') return;
  awake = true;
  const now = audio.currentTime;
  wake.gain.cancelScheduledValues(now);
  wake.gain.setValueAtTime(0, now);
  wake.gain.setTargetAtTime(1, now + 0.05, WAKE_FADE_IN / 3);
  clearTimeout(musicTimer);
  musicTimer = setTimeout(syncMusic, MUSIC_AFTER_WAKE_MS);
}

function tryResume() {
  if (!audio || audio.state === 'running' || resuming) return;
  const context = audio;
  resumeStartedAt = performance.now();
  resuming = context.resume().catch(() => undefined).finally(() => {
    if (audio !== context) return;
    resuming = undefined;
    fadeIn();
  });
}

function onHide() {
  awake = false;
  if (audio && wake) {
    const now = audio.currentTime;
    wake.gain.cancelScheduledValues(now);
    wake.gain.setValueAtTime(0, now);
  }
  clearTimeout(musicTimer);
  syncMusic();
  // Close a moment later, once the silence has actually been played out: closing at once can freeze the device
  // on the last loud fragment. If the app is frozen first, the return below closes it instead.
  if (rebuildAfterHide && audio && !teardownTimer) teardownTimer = setTimeout(teardown, TEARDOWN_AFTER_HIDE_MS);
}

function onVisibility() {
  if (document.hidden) { onHide(); return; }
  if (teardownTimer) teardown();
  // iOS waits for the next tap (unlockSound) to build audio again.
  if (!audio) return;
  if (audio.state === 'running') fadeIn();
  // Some browsers refuse this without a tap; the next tap's unlockSound tries again.
  else tryResume();
}

/** Closes the audio context and its music element; the next unlockSound builds them again. */
function teardown() {
  clearTimeout(teardownTimer);
  teardownTimer = undefined;
  const old = audio;
  if (music) {
    if (music.currentTime > 0) musicResume = { scene, time: music.currentTime };
    music.pause();
    music.removeAttribute('src');
    music.load();
  }
  clearTimeout(musicTimer);
  music = undefined;
  musicRouted = false;
  moodGain = undefined;
  audio = output = wake = sfxBus = musicBus = undefined;
  noise = undefined;
  resuming = undefined;
  awake = false;
  if (old && old.state !== 'closed') void old.close().catch(() => undefined);
}

function createAudio() {
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  const context = new Context();
  audio = context;
  awake = false;
  output = context.createGain();
  output.gain.value = soundEnabled ? masterVolume : 0;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 8;
  // Silent until fadeIn: anything the music element pushed while audio was starting stays unheard.
  wake = context.createGain();
  wake.gain.value = 0;
  output.connect(wake).connect(limiter).connect(context.destination);
  // Whenever the context comes back (resumed here, after a tap, or by the system after an interruption),
  // fade in and restart the music; when it stops, stop the music too.
  context.addEventListener('statechange', () => {
    if (context !== audio) return;
    if (context.state === 'running') fadeIn();
    else { awake = false; syncMusic(); }
  });
  sfxBus = context.createGain();
  sfxBus.gain.value = volumes.sfx;
  sfxBus.connect(output);
  musicBus = context.createGain();
  musicBus.gain.value = volumes.music;
  musicBus.connect(output);
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', onVisibility);
    // Fires on some iOS versions where visibilitychange comes late.
    window.addEventListener('pagehide', onHide);
  }
}

export function unlockSound() {
  try {
    // On supporting browsers, ambient audio follows the device's silent switch.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'ambient') session.type = 'ambient';
    // A context that won't run (closed, interrupted for good, or a resume that never answered) is replaced,
    // inside this tap so the new one is allowed to start.
    const stuck = audio && audio.state !== 'running'
      && (audio.state === 'closed' || !resuming || performance.now() - resumeStartedAt > RESUME_TIMEOUT_MS);
    if (stuck) teardown();
    const fresh = !audio;
    if (!audio) createAudio();
    if (!audio) return;
    tryResume();
    fadeIn();
    // Media playback must start inside the user gesture that called this. A new element starts here even before
    // the context runs (it stays silent until fadeIn); otherwise iOS would block starting it later.
    startMusic(audio);
    if (fresh && music && musicRouted && music.paused && soundEnabled && volumes.music > 0 && !document.hidden) {
      void music.play().catch(() => undefined);
    } else {
      syncMusic();
    }
  } catch {
    // Audio may be unavailable in the current browser or device.
  }
}

function envelope(context: AudioContext, target: AudioNode, start: number, end: number, level: number, attack: number) {
  const node = context.createGain();
  node.gain.setValueAtTime(0, start);
  node.gain.linearRampToValueAtTime(level, start + attack);
  node.gain.exponentialRampToValueAtTime(silence, end);
  node.connect(target);
  return node;
}

function playTone(context: AudioContext, target: AudioNode, time: number, voice: Tone) {
  const { at, freq, dur, level, attack = 0.002, to, wave = 'sine', partials = bell } = voice;
  const start = time + at;
  for (const [ratio, weight, tail] of partials) {
    const end = start + dur * tail;
    const tone = context.createOscillator();
    const gain = envelope(context, target, start, end, level * weight, Math.min(attack, dur * tail * 0.5));
    tone.type = wave;
    tone.frequency.setValueAtTime(freq * ratio, start);
    if (to !== undefined) tone.frequency.exponentialRampToValueAtTime(to * ratio, end);
    tone.connect(gain);
    tone.start(start);
    tone.stop(end + 0.01);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }
}

function playNoise(context: AudioContext, target: AudioNode, time: number, voice: Noise) {
  const { at, freq, dur, level, attack = 0.002, to, q = 0.65, filter: kind = 'bandpass' } = voice;
  if (!noise) {
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  }
  const start = time + at;
  const end = start + dur;
  const source = context.createBufferSource();
  source.buffer = noise;
  const filter = context.createBiquadFilter();
  filter.type = kind;
  filter.frequency.setValueAtTime(freq, start);
  if (to !== undefined) filter.frequency.exponentialRampToValueAtTime(to, end);
  filter.Q.value = q;
  const gain = envelope(context, target, start, end, level, attack);
  source.connect(filter).connect(gain);
  source.start(start);
  source.stop(end + 0.01);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}

/** Schedules a cue on any context; also used to render previews offline. */
export function renderCue(context: BaseAudioContext, target: AudioNode, sound: SoundName, start: number, step = 0) {
  const cue = cueBuilders[sound](step);
  for (const voice of cue.tones ?? []) {
    playTone(context as AudioContext, target, start, voice);
    if (cue.echo) {
      playTone(context as AudioContext, target, start, { ...voice, at: voice.at + 0.13, dur: voice.dur * 0.86, level: voice.level * 0.16 });
      playTone(context as AudioContext, target, start, { ...voice, at: voice.at + 0.29, dur: voice.dur * 0.74, level: voice.level * 0.085 });
    }
  }
  for (const voice of cue.noises ?? []) playNoise(context as AudioContext, target, start, voice);
}

function nextStep(sound: SoundName, now: number) {
  if (sound !== 'delivery' && sound !== 'order') return 0;
  streak = now - streakAt < STREAK_GAP ? streak + 1 : 0;
  streakAt = now;
  return streak;
}

/** step: picks a note on a climbing cue (delivery, order and timeAdd); by default delivery and order follow the streak. */
export function playSound(sound: SoundName, delayMs = 0, step?: number) {
  if (!soundEnabled || !audio || !output || !sfxBus || document.hidden) return;
  if (audio.state !== 'running') {
    // A sound asked for while audio wakes up plays only if it is still current: otherwise everything held back
    // while returning to the app would sound at once.
    const pendingResume = resuming;
    const askedAt = performance.now();
    if (pendingResume) void pendingResume.then(() => {
      if (audio?.state === 'running' && performance.now() - askedAt < STALE_SOUND_MS) playSound(sound, delayMs, step);
    });
    return;
  }
  const now = audio.currentTime;
  const gap = minimumGap[sound];
  if (gap !== undefined) {
    if (now - (lastPlayed.get(sound) ?? -Infinity) < gap) return;
    lastPlayed.set(sound, now);
  }
  try {
    renderCue(audio, sfxBus, sound, now + delayMs / 1000, step ?? nextStep(sound, now));
  } catch {
    // Playback can fail when the browser suspends or loses its audio device.
  }
}
