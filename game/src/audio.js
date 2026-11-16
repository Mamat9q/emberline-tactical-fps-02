// Every sound is synthesized with WebAudio: no audio files, no network. A shared
// noise buffer feeds the gunshots and the explosion; short oscillators do the beeps,
// the hit tick and the round stingers. Created lazily on the first user gesture.
let context = null;
let master = null;
let noiseBuffer = null;

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
  return true;
}

function noiseBurst(duration, filterType, frequency, gainValue, decay = 0.001) {
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
  gain.connect(master);
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
  step() {
    noiseBurst(0.05, 'lowpass', 400, 0.05);
  },
};
