/**
 * Generative ambient soundscapes, synthesised live with the Web Audio API.
 * No audio files: works offline, never loops audibly, no licensing concerns.
 *
 * Each track is a function (ctx, out) → stop(). Random events are scheduled with
 * a generous look-ahead so they survive timer throttling in background tabs.
 */

import { SOUNDS } from '../shared/sounds.js';

const LOOKAHEAD = 1.5; // seconds of audio scheduled ahead of time

/** Loopable noise buffer: 'white' | 'pink' | 'brown'. */
function noiseBuffer(ctx, type = 'white', seconds = 6) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'pink') {
        // Paul Kellet's refined pink-noise filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    // Cross-fade the ends so the loop point is inaudible.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = d[i] * t + d[length - fade + i] * (1 - t);
    }
  }
  return buffer;
}

function noiseSource(ctx, type) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, type);
  src.loop = true;
  src.start();
  return src;
}

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = frequency; f.Q.value = Q;
  return f;
}

function gain(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Slow sine LFO driving an AudioParam around its current value. */
function lfo(ctx, param, rate, depth) {
  const osc = ctx.createOscillator();
  osc.frequency.value = rate;
  const amt = gain(ctx, depth);
  osc.connect(amt).connect(param);
  osc.start();
  return osc;
}

/** Simple synthetic reverb: exponentially decaying stereo noise impulse. */
function reverb(ctx, seconds = 3.5) {
  const conv = ctx.createConvolver();
  const length = ctx.sampleRate * seconds;
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  }
  conv.buffer = ir;
  return conv;
}

/** Run `scheduleUntil(time)` periodically so events are queued LOOKAHEAD seconds ahead. */
function scheduler(ctx, scheduleUntil) {
  const tick = () => scheduleUntil(ctx.currentTime + LOOKAHEAD);
  tick();
  const id = setInterval(tick, 250);
  return () => clearInterval(id);
}

const rand = (a, b) => a + Math.random() * (b - a);

/** Disconnects everything created by a track. */
function stopper(nodes, clears = []) {
  return () => {
    clears.forEach((c) => c());
    nodes.forEach((n) => { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} });
  };
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

function rain(ctx, out) {
  // Steady wash of rain: pink noise band-limited, plus a low rumble.
  const wash = noiseSource(ctx, 'pink');
  const hp = filter(ctx, 'highpass', 500);
  const lp = filter(ctx, 'lowpass', 7000);
  const washGain = gain(ctx, 0.55);
  wash.connect(hp).connect(lp).connect(washGain).connect(out);

  const rumble = noiseSource(ctx, 'brown');
  const rumbleLp = filter(ctx, 'lowpass', 300);
  const rumbleGain = gain(ctx, 0.35);
  rumble.connect(rumbleLp).connect(rumbleGain).connect(out);
  const wob = lfo(ctx, washGain.gain, 0.05, 0.08);

  // Individual drops: tiny filtered noise ticks.
  const dropBuf = noiseBuffer(ctx, 'white', 1);
  const dropsOut = gain(ctx, 0.5);
  dropsOut.connect(out);
  let next = ctx.currentTime;
  const stopSched = scheduler(ctx, (until) => {
    while (next < until) {
      const src = ctx.createBufferSource();
      src.buffer = dropBuf;
      const bp = filter(ctx, 'bandpass', rand(1800, 5500), rand(4, 10));
      const g = gain(ctx, 0);
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.8, 0.8);
      const peak = rand(0.05, 0.25);
      g.gain.setValueAtTime(0, next);
      g.gain.linearRampToValueAtTime(peak, next + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, next + rand(0.03, 0.08));
      src.connect(bp).connect(g).connect(pan).connect(dropsOut);
      src.start(next, rand(0, 0.9), 0.1);
      next += rand(0.015, 0.09);
    }
  });
  return stopper([wash, hp, lp, washGain, rumble, rumbleLp, rumbleGain, wob, dropsOut], [stopSched]);
}

function ocean(ctx, out) {
  // Swells: brown noise whose filter and level rise and fall like waves (~12s period).
  const body = noiseSource(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 600);
  const g = gain(ctx, 0.55);
  body.connect(lp).connect(g).connect(out);
  const l1 = lfo(ctx, lp.frequency, 0.08, 450);
  const l2 = lfo(ctx, g.gain, 0.08, 0.35);

  // Foam: pink noise, high-passed, swelling slightly after the body.
  const foam = noiseSource(ctx, 'pink');
  const hp = filter(ctx, 'highpass', 1800);
  const fg = gain(ctx, 0.12);
  foam.connect(hp).connect(fg).connect(out);
  const l3 = lfo(ctx, fg.gain, 0.08, 0.1);

  // A second, slower wave layer panned the other way for width.
  const body2 = noiseSource(ctx, 'brown');
  const lp2 = filter(ctx, 'lowpass', 500);
  const g2 = gain(ctx, 0.3);
  const pan = ctx.createStereoPanner();
  pan.pan.value = 0.5;
  body2.connect(lp2).connect(g2).connect(pan).connect(out);
  const l4 = lfo(ctx, g2.gain, 0.053, 0.25);
  return stopper([body, lp, g, l1, l2, foam, hp, fg, l3, body2, lp2, g2, pan, l4]);
}

function forest(ctx, out) {
  // Wind through leaves.
  const wind = noiseSource(ctx, 'pink');
  const bp = filter(ctx, 'bandpass', 700, 0.4);
  const wg = gain(ctx, 0.22);
  wind.connect(bp).connect(wg).connect(out);
  const l1 = lfo(ctx, bp.frequency, 0.03, 300);
  const l2 = lfo(ctx, wg.gain, 0.045, 0.1);

  // Birds: short frequency-swept sine chirps in small phrases, at random positions.
  const verb = reverb(ctx, 2.5);
  const wet = gain(ctx, 0.35);
  const birds = gain(ctx, 0.5);
  birds.connect(out);
  birds.connect(verb).connect(wet).connect(out);
  let next = ctx.currentTime + 1;
  const stopSched = scheduler(ctx, (until) => {
    while (next < until) {
      const base = rand(2200, 4200);
      const notes = Math.floor(rand(2, 6));
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.9, 0.9);
      pan.connect(birds);
      let t = next;
      for (let i = 0; i < notes; i++) {
        const o = ctx.createOscillator();
        const g = gain(ctx, 0);
        const dur = rand(0.05, 0.14);
        o.frequency.setValueAtTime(base * rand(0.9, 1.1), t);
        o.frequency.exponentialRampToValueAtTime(base * rand(1.15, 1.6), t + dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(rand(0.03, 0.08), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(pan);
        o.start(t); o.stop(t + dur + 0.02);
        t += dur + rand(0.03, 0.12);
      }
      next = t + rand(1.5, 6);
    }
  });
  return stopper([wind, bp, wg, l1, l2, verb, wet, birds], [stopSched]);
}

/** Soft piano-like voice: a few decaying harmonics. */
function pianoNote(ctx, dest, freq, time, velocity = 0.12, decay = 3.5) {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(velocity, time + 0.008);
  g.gain.exponentialRampToValueAtTime(velocity * 0.4, time + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  const lp = filter(ctx, 'lowpass', Math.min(5000, freq * 6));
  g.connect(lp).connect(dest);
  [[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]].forEach(([mult, amp]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult * (1 + (mult - 1) * 0.0008); // slight inharmonicity
    const og = gain(ctx, amp);
    o.connect(og).connect(g);
    o.start(time); o.stop(time + decay + 0.1);
  });
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function piano(ctx, out) {
  const verb = reverb(ctx, 4);
  const wet = gain(ctx, 0.55);
  const dry = gain(ctx, 0.6);
  const bus = gain(ctx, 1);
  bus.connect(dry).connect(out);
  bus.connect(verb).connect(wet).connect(out);
  // D major pentatonic across a few octaves — every combination sounds consonant.
  const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
  const bass = [38, 43, 45, 47];
  let next = ctx.currentTime + 0.3;
  let bar = 0;
  const stopSched = scheduler(ctx, (until) => {
    while (next < until) {
      if (bar % 4 === 0) pianoNote(ctx, bus, midi(bass[Math.floor(bar / 4) % bass.length]), next, 0.09, 6);
      const n = scale[Math.floor(Math.random() * scale.length)];
      pianoNote(ctx, bus, midi(n), next, rand(0.05, 0.11));
      if (Math.random() < 0.3) pianoNote(ctx, bus, midi(n - 5 + (Math.random() < 0.5 ? 0 : 12)), next + rand(0.02, 0.2), 0.05);
      next += rand(0.9, 2.6);
      bar++;
    }
  });
  return stopper([verb, wet, dry, bus], [stopSched]);
}

function lofi(ctx, out) {
  const bpm = 72;
  const beat = 60 / bpm;
  const master = gain(ctx, 0.9);
  const warm = filter(ctx, 'lowpass', 2400);
  master.connect(warm).connect(out);
  const verb = reverb(ctx, 2.5);
  const wet = gain(ctx, 0.25);
  master.connect(verb).connect(wet).connect(out);

  // Vinyl: low hiss + sparse crackle.
  const hiss = noiseSource(ctx, 'pink');
  const hissHp = filter(ctx, 'highpass', 3000);
  const hissG = gain(ctx, 0.025);
  hiss.connect(hissHp).connect(hissG).connect(out);
  const clickBuf = noiseBuffer(ctx, 'white', 1);

  // ii–V–I–vi in C with 7ths, voiced warm and low.
  const chords = [[50, 53, 57, 60], [43, 53, 55, 59], [48, 52, 55, 59], [45, 52, 55, 60]];
  let step = 0; // eighth notes
  let next = ctx.currentTime + 0.2;
  const eighth = beat / 2;

  const pad = (notes, t, len) => {
    notes.forEach((n, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = midi(n);
      o.detune.value = rand(-8, 8); // tape wobble
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.12 : 0.045, t + 0.08);
      g.gain.setTargetAtTime(0, t + len - 0.3, 0.25);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + len + 1);
    });
  };
  const kick = (t) => {
    const o = ctx.createOscillator();
    const g = gain(ctx, 0);
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.4);
  };
  const noiseHit = (t, freq, q, level, len) => {
    const s = ctx.createBufferSource();
    s.buffer = clickBuf;
    const f = filter(ctx, freq > 4000 ? 'highpass' : 'bandpass', freq, q);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.8, len + 0.05);
  };

  const stopSched = scheduler(ctx, (until) => {
    while (next < until) {
      const inBar = step % 8;
      const swing = inBar % 2 === 1 ? eighth * 0.16 : 0;
      const t = next + swing;
      if (inBar === 0) pad(chords[Math.floor(step / 8) % chords.length], t, beat * 4);
      if (inBar === 0 || inBar === 5) kick(t);
      if (inBar === 2 || inBar === 6) noiseHit(t, 1800, 0.8, 0.09, 0.18); // soft snare
      noiseHit(t, 8000, 0.7, inBar % 2 ? 0.02 : 0.035, 0.05); // hats
      if (Math.random() < 0.25) noiseHit(t + rand(0, eighth), 3000, 2, rand(0.01, 0.04), 0.01); // crackle
      next += eighth;
      step++;
    }
  });
  return stopper([master, warm, verb, wet, hiss, hissHp, hissG], [stopSched]);
}

function fireplace(ctx, out) {
  // Low roar of the flames: brown noise kept under ~200 Hz, breathing slowly.
  const roar = noiseSource(ctx, 'brown');
  const roarLp = filter(ctx, 'lowpass', 190);
  const roarG = gain(ctx, 0.55);
  roar.connect(roarLp).connect(roarG).connect(out);
  const l1 = lfo(ctx, roarG.gain, 0.11, 0.12);

  // Soft flicker: a quiet band of pink noise that wavers a little faster.
  const air = noiseSource(ctx, 'pink');
  const airBp = filter(ctx, 'bandpass', 900, 0.5);
  const airG = gain(ctx, 0.05);
  air.connect(airBp).connect(airG).connect(out);
  const l2 = lfo(ctx, airG.gain, 0.37, 0.02);

  // Crackles: tiny clicks in irregular clusters, the odd deeper pop, and now and then a hiss of sap.
  const clickBuf = noiseBuffer(ctx, 'white', 1);
  const crackle = gain(ctx, 0.6);
  crackle.connect(out);
  const hit = (t, type, freq, q, level, len, pan) => {
    const src = ctx.createBufferSource();
    src.buffer = clickBuf;
    const f = filter(ctx, type, freq, q);
    const g = gain(ctx, 0);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(p).connect(crackle);
    src.start(t, rand(0, 0.9), len + 0.02);
  };
  let next = ctx.currentTime + 0.3;
  const stopSched = scheduler(ctx, (until) => {
    while (next < until) {
      const pan = rand(-0.6, 0.6);
      const burst = Math.random() < 0.35 ? Math.floor(rand(2, 6)) : 1;
      let t = next;
      for (let i = 0; i < burst; i++) {
        hit(t, 'highpass', rand(1500, 4200), 0.7, rand(0.08, 0.3), rand(0.004, 0.012), pan + rand(-0.1, 0.1));
        t += rand(0.008, 0.05);
      }
      if (Math.random() < 0.06) hit(next + rand(0, 0.1), 'lowpass', rand(500, 900), 0.9, rand(0.25, 0.45), rand(0.05, 0.11), pan); // pop
      if (Math.random() < 0.012) hit(next, 'bandpass', rand(4500, 6500), 3, 0.025, rand(0.4, 0.9), pan); // sap hiss
      next = t + rand(0.04, 0.45);
    }
  });
  return stopper([roar, roarLp, roarG, l1, air, airBp, airG, l2, crackle], [stopSched]);
}

/** Per-track level so all six sit at a similar loudness (measured offline, K-weighted RMS; sparse
 * tracks like birdsong and piano get a little less boost, as they read louder than their average). */
const MAKERS = {
  rain: { make: rain, trim: 0.8 },
  forest: { make: forest, trim: 2.8 },
  ocean: { make: ocean, trim: 0.7 },
  fireplace: { make: fireplace, trim: 0.9 },
  piano: { make: piano, trim: 3 },
  lofi: { make: lofi, trim: 0.87 },
};
export const TRACKS = Object.fromEntries(Object.entries(SOUNDS).map(([id, meta]) => [id, { ...meta, ...MAKERS[id] }]));

/**
 * Player with fade in/out, cross-fades between tracks, a master volume and a sleep timer.
 * Never starts on its own. `onChange(fn)` reports every state change (play, pause, track,
 * timer), so the toolbar button can show whether sound is playing.
 */
export class AmbientPlayer {
  ctx = null;
  master = null;
  stopCurrent = null;
  track = null;
  playing = false;
  volume = 0.5;
  /** Sleep timer: when it ends (ms timestamp) and its length in minutes, or null / 0. */
  sleepAt = null;
  sleepMinutes = 0;
  #sleepTimer = null;
  #listeners = new Set();

  onChange(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #emit() { this.#listeners.forEach((fn) => fn(this)); }

  /** Stop (with a long, gentle fade) after `minutes`; 0 turns the timer off. */
  setSleep(minutes) {
    clearTimeout(this.#sleepTimer);
    this.sleepAt = minutes ? Date.now() + minutes * 60000 : null;
    this.sleepMinutes = minutes;
    if (minutes) this.#sleepTimer = setTimeout(() => { this.sleepAt = null; this.sleepMinutes = 0; this.pause(8); }, minutes * 60000);
    this.#emit();
  }

  /** Break dimming (1 = full, 0.4 = a Focus session break), separate from the volume. */
  duck = 1;
  duckNode = null;

  #ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' });
      this.master = gain(this.ctx, 0);
      this.duckNode = gain(this.ctx, this.duck);
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      this.master.connect(this.duckNode).connect(limiter).connect(this.ctx.destination);
    }
  }

  /** Dim or restore the sound (Focus session breaks) over `seconds`. */
  setDuck(level, seconds = 1.2) {
    this.duck = level;
    if (this.duckNode) {
      const g = this.duckNode.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + seconds);
    }
    this.#emit();
  }

  /** Plain state for other contexts (the offscreen document reports it to every tab). */
  snapshot() {
    return { playing: this.playing, track: this.track, volume: this.volume, duck: this.duck, sleepAt: this.sleepAt, sleepMinutes: this.sleepMinutes };
  }

  async play(track) {
    this.#ensure();
    await this.ctx.resume();
    if (track !== this.track || !this.stopCurrent) {
      this.#swap(track);
    }
    this.playing = true;
    this.#fadeTo(this.volume, 0.6);
    this.#emit();
  }

  #swap(track) {
    // Cross-fade: each track has its own bus, faded independently of the master volume.
    this.stopCurrent?.();
    this.track = track;
    const ctx = this.ctx;
    const bus = gain(ctx, 0);
    bus.connect(this.master);
    const level = TRACKS[track].trim ?? 1;
    bus.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.8);
    const stop = TRACKS[track].make(ctx, bus);
    this.stopCurrent = () => {
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + 0.6);
      setTimeout(() => { stop(); bus.disconnect(); }, 700);
    };
  }

  /** Fade out (0.6 s, or longer for the sleep timer) and suspend the audio. */
  pause(seconds = 0.6) {
    if (!this.ctx) return;
    this.playing = false;
    if (this.sleepAt) { clearTimeout(this.#sleepTimer); this.sleepAt = null; this.sleepMinutes = 0; }
    this.#fadeTo(0, seconds);
    setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, seconds * 1000 + 100);
    this.#emit();
  }

  setVolume(v) {
    this.volume = v;
    if (this.playing) this.#fadeTo(v, 0.15);
    this.#emit();
  }

  /** Pick a track: cross-fades when playing, otherwise just remembers it for the next play. */
  async setTrack(track) {
    if (this.playing) return this.play(track);
    this.track = track;
    this.stopCurrent?.(); this.stopCurrent = null;
    this.#emit();
  }

  #fadeTo(value, seconds) {
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    // Perceptual curve: squared slider value.
    g.linearRampToValueAtTime(value * value, now + seconds);
  }
}
