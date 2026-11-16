// --- Monsoon Depot tuning (named constants, one place) ---
// Rev 3 — SOUND-DRIVEN GAMEPLAY: footsteps are directional (distance
// attenuation + stereo pan by the listener's frame), rain ambience MASKS
// them, and the plant/defuse channel beeps louder as you get closer.
export const STEP_BASE_GAIN = 0.05; // a step at the listener's own feet
export const STEP_MAX_DIST = 28; // beyond this a footstep is inaudible
export const STEP_REF_DIST = 2; // inside this, no distance falloff
export const RAIN_MASK_DB = 6; // rain ducks every footstep by 6 dB (~x0.5)
export const RAIN_AMBIENCE_GAIN = 0.05; // looped rain noise under everything
export const RAIN_AMBIENCE_FREQ = 2800; // bandpass centre for rain hiss
export const PLANT_BEEP_INTERVAL = 0.5; // seconds between plant beeps
export const PLANT_BEEP_BASE_FREQ = 700; // rises with plant progress
export const PLANT_BEEP_FREQ_RISE = 600; // +Hz at progress 1.0
export const PLANT_BEEP_MAX_DIST = 30; // beyond this the beep is a whisper
export const DEFUSE_BEEP_FREQ = 520; // defuse telegraphs lower than plant

// Every sound is synthesized with WebAudio: no audio files, no network. A shared
// noise buffer feeds the gunshots and the explosion; short oscillators do the beeps,
// the hit tick and the round stingers. Created lazily on the first user gesture.
let context = null;
let master = null;
let noiseBuffer = null;
let lastPlantBeepAt = 0;
let lastDefuseBeepAt = 0;

function ensure() {
  if (context) {
    if (context.state === 'suspended') context.resume();
    return true;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = 0.5;
  master.connect(context.destination);
  noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  // Quiet dusk wind: looped filtered noise, barely there.
  const wind = context.createBufferSource();
  wind.buffer = noiseBuffer;
  wind.loop = true;
  const windFilter = context.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 220;
  const windGain = context.createGain();
  windGain.gain.value = 0.03;
  wind.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  wind.start();
  // Monsoon rain: looped filtered noise, always on once audio unlocks —
  // the hiss that masks footsteps (see step(): RAIN_MASK_DB).
  const rain = context.createBufferSource();
  rain.buffer = noiseBuffer;
  rain.loop = true;
  rain.playbackRate.value = 1.7;
  const rainFilter = context.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = RAIN_AMBIENCE_FREQ;
  rainFilter.Q.value = 0.6;
  const rainGain = context.createGain();
  rainGain.gain.value = RAIN_AMBIENCE_GAIN;
  rain.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(master);
  rain.start();
  return true;
}

function noiseBurst(duration, filterType, frequency, gainValue, decay = 0.001, pan = null) {
  if (!ensure()) return;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(decay, now + duration);
  source.connect(filter);
  filter.connect(gain);
  // Directional sounds pan through a StereoPanner; flat sounds (gunshots,
  // the player's own steps) connect straight to master as before.
  if (pan !== null && context.createStereoPanner) {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.connect(panner);
    panner.connect(master);
  } else {
    gain.connect(master);
  }
  source.start(now);
  source.stop(now + duration + 0.02);
}

function tone(frequency, duration, type, gainValue, slideTo = null) {
  if (!ensure()) return;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  const now = context.currentTime;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

const SHOTS = {
  p2000: () => { noiseBurst(0.09, 'bandpass', 1400, 0.5); tone(190, 0.07, 'square', 0.16, 70); },
  vk9: () => { noiseBurst(0.07, 'bandpass', 1800, 0.42); tone(240, 0.05, 'square', 0.12, 90); },
  ar77: () => { noiseBurst(0.12, 'bandpass', 1100, 0.55); tone(150, 0.1, 'square', 0.2, 55); },
  longshot: () => { noiseBurst(0.22, 'lowpass', 900, 0.7); tone(110, 0.18, 'sawtooth', 0.22, 40); },
  m870: () => { noiseBurst(0.16, 'lowpass', 700, 0.65); tone(120, 0.12, 'sawtooth', 0.2, 45); },
  bot: () => { noiseBurst(0.1, 'bandpass', 1000, 0.3); tone(140, 0.08, 'square', 0.1, 60); },
};

export const audio = {
  unlock() {
    ensure();
  },
  shot(id) {
    (SHOTS[id] || SHOTS.bot)();
  },
  dryFire() {
    tone(900, 0.04, 'square', 0.08);
  },
  reload() {
    tone(500, 0.05, 'square', 0.1);
    setTimeout(() => tone(700, 0.05, 'square', 0.1), 260);
  },
  hit(kill) {
    tone(kill ? 1560 : 1180, 0.06, 'sine', 0.22);
    if (kill) setTimeout(() => tone(1560, 0.09, 'sine', 0.2), 70);
  },
  hurt() {
    tone(220, 0.12, 'sawtooth', 0.16, 110);
  },
  explosion() {
    noiseBurst(0.9, 'lowpass', 320, 0.9);
    tone(70, 0.7, 'sine', 0.5, 28);
  },
  beep() {
    tone(880, 0.09, 'sine', 0.2);
  },
  // Plant telegraph: a beep every PLANT_BEEP_INTERVAL while the channel
  // runs, rising in pitch as the plant completes and louder the closer
  // the listener stands (distance 0 = the planter themself). Throttled
  // inside: callers may call this every frame, at most one beep per
  // interval actually sounds. No-op before the first user gesture.
  plantBeep(progress, distance = 0) {
    if (!ensure()) return;
    const now = context.currentTime;
    if (now - lastPlantBeepAt < PLANT_BEEP_INTERVAL) return;
    lastPlantBeepAt = now;
    const closeness = Math.max(0.12, 1 - Math.max(0, distance) / PLANT_BEEP_MAX_DIST);
    tone(PLANT_BEEP_BASE_FREQ + Math.max(0, Math.min(1, progress)) * PLANT_BEEP_FREQ_RISE, 0.09, 'sine', 0.26 * closeness);
  },
  // Defuse telegraph: same cadence as the plant beep, lower pitch, so a
  // listener can tell plant from defuse by ear alone.
  defuseBeep(progress, distance = 0) {
    if (!ensure()) return;
    const now = context.currentTime;
    if (now - lastDefuseBeepAt < PLANT_BEEP_INTERVAL) return;
    lastDefuseBeepAt = now;
    const closeness = Math.max(0.12, 1 - Math.max(0, distance) / PLANT_BEEP_MAX_DIST);
    tone(DEFUSE_BEEP_FREQ + Math.max(0, Math.min(1, progress)) * 300, 0.09, 'sine', 0.26 * closeness);
  },
  step(sourcePos = null, listenerPos = null, listenerYaw = 0) {
    // Directional footstep: gain falls linearly with distance (full
    // inside STEP_REF_DIST, silent past STEP_MAX_DIST) and pans left/right
    // by where the step falls in the listener's frame; the rain masks
    // every step by RAIN_MASK_DB. Called with no arguments it is the
    // player's own step (distance 0, pan 0) at the masked gain.
    let gain = STEP_BASE_GAIN;
    let pan = 0;
    if (sourcePos && listenerPos) {
      const dx = sourcePos.x - listenerPos.x;
      const dz = sourcePos.z - listenerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > STEP_MAX_DIST) return; // inaudible — don't spend a node
      const falloff = dist <= STEP_REF_DIST ? 1 : 1 - (dist - STEP_REF_DIST) / (STEP_MAX_DIST - STEP_REF_DIST);
      gain *= Math.max(0, falloff);
      // Right vector of the listener: (cos yaw, -sin yaw) in world x/z.
      const rightX = Math.cos(listenerYaw);
      const rightZ = -Math.sin(listenerYaw);
      pan = dist > 0.01 ? (dx * rightX + dz * rightZ) / dist : 0;
    }
    gain *= 10 ** (-RAIN_MASK_DB / 20);
    noiseBurst(0.05, 'lowpass', 400, Math.max(0.002, gain), 0.001, pan);
  },
  plantDone() {
    tone(660, 0.1, 'sine', 0.22);
    setTimeout(() => tone(990, 0.14, 'sine', 0.22), 120);
  },
  pulse() {
    tone(440, 0.5, 'sine', 0.16, 880);
  },
  roundWin() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.2), i * 110));
  },
  roundLose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.18), i * 120));
  },
  buy() {
    tone(990, 0.06, 'sine', 0.16);
    setTimeout(() => tone(1320, 0.08, 'sine', 0.16), 60);
  },
};
