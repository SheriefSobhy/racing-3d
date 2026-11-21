// Game audio: engine and effects are synthesised with Web Audio (no files);
// music is one streamed MP3 ("Pure Raceway" by MintoDog, CC0).
const MUSIC_URL = import.meta.env.BASE_URL + 'assets/audio/music.mp3';
const GEARS = 6;

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.wasBoosting = false;
    this.paused = false;
  }

  /** Must be called from a user gesture (tap / key): browsers only allow audio after one. */
  unlock() {
    try {
      if (!this.ctx) this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.syncMusic();
    } catch {
      /* Web Audio unavailable: play silently */
    }
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = gain(ctx, 1, comp);
    this.sfx = gain(ctx, 0, this.master);
    this.musicBus = gain(ctx, 0, this.master);

    // White-noise buffer shared by every noise-based sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine: two detuned saw/square oscillators through a speed-dependent low-pass.
    this.engGain = gain(ctx, 0, this.sfx);
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip();
    shaper.connect(this.engGain);
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 3;
    this.engFilter.connect(shaper);
    this.osc1 = osc(ctx, 'sawtooth', 60, gain(ctx, 0.5, this.engFilter));
    this.osc2 = osc(ctx, 'square', 30, gain(ctx, 0.35, this.engFilter));
    this.osc3 = osc(ctx, 'sawtooth', 60.7, gain(ctx, 0.3, this.engFilter));

    // Continuous noise layers (gain 0 until needed).
    this.wind = this.noiseLoop('lowpass', 500, 0.7);
    this.drift = this.noiseLoop('bandpass', 1700, 7);
    this.drift2 = this.noiseLoop('bandpass', 2900, 9);
    this.scrape = this.noiseLoop('bandpass', 3600, 1.4);
    this.boost = this.noiseLoop('bandpass', 1100, 0.8);

    this.music = new Audio(MUSIC_URL);
    this.music.loop = true;
    this.music.preload = 'auto';
    ctx.createMediaElementSource(this.music).connect(this.musicBus);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.ctx.suspend();
        this.music.pause();
      } else {
        this.ctx.resume();
        this.syncMusic();
      }
    });
    this.apply();
  }

  noiseLoop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = gain(ctx, 0, this.sfx);
    src.connect(f).connect(g);
    src.start(0, Math.random() * 2);
    return { g, f };
  }

  /** Apply volume / mute settings. */
  apply() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(s.muted ? 0 : (s.sfx / 100) * 0.9, t, 0.03);
    const mv = s.muted ? 0 : (s.music / 100) * 0.5 * (this.paused ? 0.45 : 1);
    this.musicBus.gain.setTargetAtTime(mv, t, 0.05);
    this.syncMusic();
  }

  syncMusic() {
    if (!this.music || document.hidden) return;
    const want = !this.settings.muted && this.settings.music > 0 && this.ctx.state !== 'closed';
    if (want && this.music.paused) this.music.play().catch(() => {});
    else if (!want && !this.music.paused) this.music.pause();
  }

  setPaused(p) {
    this.paused = p;
    this.apply();
  }

  /** Per frame. p = player while racing, or null (menus): engine and loops fade out. */
  update(p) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc = 0.06) => param.setTargetAtTime(v, t, tc);
    if (!p || !p.spec) {
      for (const l of [this.wind, this.drift, this.drift2, this.scrape, this.boost]) set(l.g.gain, 0, 0.08);
      set(this.engGain.gain, 0, 0.15);
      this.wasBoosting = false;
      return;
    }
    const ratio = Math.min(1.35, p.v / p.spec.maxSpeed);
    // Simple gearbox: rpm climbs in each gear, then drops on the shift.
    const gp = Math.min(GEARS - 0.001, ratio * (GEARS - 0.6));
    const frac = gp - Math.floor(gp);
    const rpm = Math.floor(gp) === 0 ? 0.25 + frac * 0.75 : 0.45 + frac * 0.55;
    const f = 42 + rpm * 120 + (p.boosting ? 14 : 0);
    set(this.osc1.frequency, f, 0.03);
    set(this.osc2.frequency, f * 0.5, 0.03);
    set(this.osc3.frequency, f * 1.012, 0.03);
    set(this.engFilter.frequency, 380 + rpm * 1400 + (p.boosting ? 700 : 0), 0.05);
    set(this.engGain.gain, p.v > 0.5 ? 0.16 + rpm * 0.1 : 0.05, 0.08);

    set(this.wind.g.gain, Math.min(0.22, ratio * ratio * 0.2), 0.2);
    const drifting = p.drifting ? 0.11 : 0;
    set(this.drift.g.gain, drifting, 0.05);
    set(this.drift2.g.gain, drifting * 0.6, 0.05);
    set(this.drift.f.frequency, 1500 + Math.sin(t * 23) * 180, 0.02);
    set(this.scrape.g.gain, p.scraping ? 0.16 : 0, 0.04);
    set(this.boost.g.gain, p.boosting ? 0.12 : 0, 0.08);
    if (p.boosting && !this.wasBoosting) this.whoosh(300, 2200, 0.45, 0.35);
    this.wasBoosting = p.boosting;
  }

  // ---------- One-shot effects ----------
  ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  tone(freq, start, dur, type = 'sine', vol = 0.2, endFreq = freq) {
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const g = gain(ctx, 0, this.sfx);
    const o = osc(ctx, type, freq, g, t);
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.stop(t + dur + 0.02);
  }

  noiseHit(type, f0, f1, dur, vol, q = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = gain(ctx, 0, this.sfx);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  whoosh(f0, f1, dur, vol) {
    if (this.ready()) this.noiseHit('bandpass', f0, f1, dur, vol, 1.2);
  }

  crash() {
    if (!this.ready()) return;
    this.noiseHit('lowpass', 2400, 120, 0.7, 0.9, 0.7);
    this.noiseHit('bandpass', 3200, 1800, 0.25, 0.4, 3);
    this.tone(70, 0, 0.45, 'sine', 0.7, 35);
    this.tone(180, 0.02, 0.18, 'square', 0.12, 90);
  }

  coin() {
    if (!this.ready()) return;
    this.tone(1318.5, 0, 0.09, 'square', 0.06);
    this.tone(1975.5, 0.07, 0.16, 'square', 0.06);
  }

  nearMiss(combo = 1) {
    if (!this.ready()) return;
    this.noiseHit('bandpass', 500, 3500, 0.28, 0.35, 1.5);
    const base = 660 * Math.pow(2, Math.min(combo - 1, 5) / 12);
    this.tone(base, 0.05, 0.14, 'triangle', 0.12);
    this.tone(base * 1.5, 0.11, 0.18, 'triangle', 0.1);
  }

  nitroPickup() {
    if (!this.ready()) return;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, i * 0.05, 0.14, 'square', 0.06));
  }

  driftScore() {
    if (!this.ready()) return;
    this.tone(880, 0, 0.12, 'triangle', 0.12);
    this.tone(1174.7, 0.08, 0.2, 'triangle', 0.12);
  }

  go() {
    if (!this.ready()) return;
    this.tone(523.3, 0, 0.16, 'square', 0.08);
    this.tone(1046.5, 0.16, 0.35, 'square', 0.09);
  }

  click() {
    if (this.ready()) this.tone(1200, 0, 0.04, 'triangle', 0.08, 900);
  }
}

function gain(ctx, v, dest) {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

function osc(ctx, type, freq, dest, start = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(dest);
  o.start(start);
  return o;
}

function softClip() {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  return c;
}
