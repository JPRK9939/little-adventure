// Fully synthesized audio (no audio files): music tracks, sound effects and "babble" voices.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() { this.ctx = null; this.mv = .7; this.fv = .8; this.active = []; this.current = null; this.pending = null; this.loops = {}; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = this.mv * .9;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5500;
    this.music.connect(tone); tone.connect(this.master);
    this.fx = c.createGain(); this.fx.gain.value = this.fv; this.fx.connect(this.master);
    this.dly = c.createDelay(1); const fb = c.createGain(), dOut = c.createGain();
    this.dly.delayTime.value = .33; fb.gain.value = .3; dOut.gain.value = .35;
    this.dly.connect(fb); fb.connect(this.dly); this.dly.connect(dOut); dOut.connect(this.music);
    this.nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.crackBuf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const cd = this.crackBuf.getChannelData(0); for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * .01 + (Math.random() < .0008 ? (Math.random() * 2 - 1) * .5 : 0);
    setInterval(() => this._tick(), 50);
    if (this.pending) { const p = this.pending; this.pending = null; this.play(p); }
  }
  setMusicVolume(v) { this.mv = v; if (this.ctx) this.music.gain.setTargetAtTime(v * .9, this.ctx.currentTime, .05); }
  setFxVolume(v) { this.fv = v; if (this.ctx) this.fx.gain.setTargetAtTime(v, this.ctx.currentTime, .05); }

  /* ---------- building blocks ---------- */
  osc(type, f, t, dur, peak, dest, { a = .01, glide = null, detune = 0 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    o.detune.value = detune;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05); return g;
  }
  noise(t, dur, peak, dest, { type = 'bandpass', freq = 1000, q = 1, a = .005, glide = null } = {}) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nb; f.type = type; f.frequency.setValueAtTime(freq, t); if (glide) f.frequency.exponentialRampToValueAtTime(glide, t + dur); f.Q.value = q;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
  }
  // instruments
  keys(d, m, t, dur, v) { this.osc('sine', mtof(m), t, dur, v, d, { a: .03, detune: rnd(-4, 4) }); this.osc('triangle', mtof(m) * 2, t, dur * .6, v * .12, d, { a: .02 }); }
  pluck(d, m, t, v, dur = .7, echo = true) { const g = this.osc('sine', mtof(m), t, dur, v, d, { a: .004 }); this.osc('sine', mtof(m) * 3, t, dur * .3, v * .15, d, { a: .002 }); if (echo) g.connect(this.dly); }
  pad(d, m, t, dur, v) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(.6, dur * .4)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    for (const dt of [-7, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + .05); }
    f.connect(g); g.connect(d);
  }
  bass(d, m, t, dur, v, type = 'triangle') {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = type === 'triangle' ? 500 : 650;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + dur + .05);
  }
  lead(d, m, t, dur, v, type = 'square', echo = false) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = 2600;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .01); g.gain.setValueAtTime(v * .8, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(d); if (echo) g.connect(this.dly); o.start(t); o.stop(t + dur + .05);
  }
  kick(d, t, v = .5) { this.osc('sine', 110, t, .32, v, d, { a: .002, glide: 40 }); }
  snare(d, t, v = .16) { this.noise(t, .18, v, d, { freq: 1800 }); this.osc('triangle', 220, t, .08, v * .4, d, { a: .002 }); }
  hat(d, t, v = .04, open = false) { this.noise(t, open ? .2 : .045, v, d, { type: 'highpass', freq: 7000 }); }
  tom(d, m, t, v = .25) { this.osc('sine', mtof(m), t, .25, v, d, { a: .003, glide: mtof(m) * .6 }); }

  /* ---------- music ---------- */
  play(name) {
    if (!this.ctx) { this.pending = name; return; }
    if (this.current && this.current.name === name && !this.current.dead) return;
    this.stopMusic(1.4);
    const def = TRACKS[name]; if (!def) return;
    const c = this.ctx, out = c.createGain();
    out.gain.setValueAtTime(.0001, c.currentTime); out.gain.exponentialRampToValueAtTime(def.vol || 1, c.currentTime + (def.fadeIn || 1.2));
    out.connect(this.music);
    if (def.crackle) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.crackBuf; s.loop = true; f.type = 'highpass'; f.frequency.value = 900; g.gain.value = .5;
      s.connect(f); f.connect(g); g.connect(out); s.start(); out._crackle = s;
    }
    const tr = { name, def, out, step: 0, next: c.currentTime + .08, dead: false };
    this.active.push(tr); this.current = tr;
  }
  stopMusic(fade = 1.2) {
    if (!this.ctx || !this.current) { this.pending = null; return; }
    const c = this.ctx, tr = this.current;
    tr.dead = true; tr.deadAt = c.currentTime + fade + .3;
    tr.out.gain.cancelScheduledValues(c.currentTime); tr.out.gain.setValueAtTime(Math.max(.0001, tr.out.gain.value), c.currentTime);
    tr.out.gain.exponentialRampToValueAtTime(.0001, c.currentTime + fade);
    this.current = null;
  }
  _tick() {
    const c = this.ctx;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const tr = this.active[i];
      if (tr.dead) { if (c.currentTime > tr.deadAt) { try { tr.out._crackle && tr.out._crackle.stop(); } catch (e) {} tr.out.disconnect(); this.active.splice(i, 1); } continue; }
      if (tr.next < c.currentTime - .5) tr.next = c.currentTime + .05;
      const st = 60 / tr.def.bpm / 4, sw = tr.def.swing || 0;
      while (tr.next < c.currentTime + .8) {
        try { tr.def.step(this, tr.out, tr.step, tr.next); } catch (e) { console.warn(e); }
        tr.next += st * (sw ? (tr.step % 2 ? 1 - sw : 1 + sw) : 1);
        tr.step = (tr.step + 1) % (16 * (tr.def.bars || 8));
      }
    }
  }

  /* ---------- sound effects ---------- */
  sfx(name, arg) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + .005, d = this.fx;
    const f = SFX[name]; if (f) f(this, d, t, arg);
  }
  voice(kind = 'dog') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + .005;
    if (kind === 'dog') { const f = rnd(720, 1050); this.osc('triangle', f, t, .07, .06, this.fx, { a: .006, glide: f * rnd(.85, 1.2) }); }
    else if (kind === 'girl') { const f = rnd(430, 640); this.osc('sine', f, t, .08, .07, this.fx, { a: .006, glide: f * rnd(.9, 1.15) }); }
    else { const f = rnd(160, 230); this.osc('sawtooth', f, t, .1, .03, this.fx, { a: .01, glide: f * .9 }); }
  }
  startLoop(name) {
    if (!this.ctx || this.loops[name]) return;
    const c = this.ctx;
    if (name === 'fire') {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.crackBuf; s.loop = true; s.playbackRate.value = 1.6;
      f.type = 'bandpass'; f.frequency.value = 1400; g.gain.value = 0; g.gain.linearRampToValueAtTime(1.6, c.currentTime + .5);
      const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = this.nb; n.loop = true; nf.type = 'lowpass'; nf.frequency.value = 500; ng.gain.value = .05;
      s.connect(f); f.connect(g); n.connect(nf); nf.connect(ng); ng.connect(g); g.connect(this.fx); s.start(); n.start();
      this.loops[name] = { stop: () => { g.gain.linearRampToValueAtTime(0, c.currentTime + .6); setTimeout(() => { try { s.stop(); n.stop(); } catch (e) {} }, 800); } };
    }
  }
  stopLoop(name) { if (this.loops[name]) { this.loops[name].stop(); delete this.loops[name]; } }
}

/* ---------------- sound effect recipes ---------------- */
let stepFoot = 0;
const SFX = {
  step(S, d, t, run) {
    stepFoot ^= 1;
    S.noise(t, .07, run ? .06 : .045, d, { type: 'lowpass', freq: 450 });
    const f0 = (stepFoot ? 560 : 470) * (run ? 1.12 : 1) * rnd(.98, 1.02);
    S.osc('sine', f0, t, .09, run ? .035 : .028, d, { a: .008, glide: f0 * .6 });
  },
  jump(S, d, t) { S.osc('square', 300, t, .14, .04, d, { glide: 760 }); },
  land(S, d, t) { S.noise(t, .12, .12, d, { type: 'lowpass', freq: 400 }); S.osc('sine', 130, t, .12, .12, d, { glide: 60 }); },
  bigLand(S, d, t) { S.noise(t, .4, .3, d, { type: 'lowpass', freq: 300 }); S.osc('sine', 110, t, .35, .35, d, { glide: 40 }); },
  ok(S, d, t) { S.osc('triangle', 880, t, .12, .06, d); S.osc('triangle', 1320, t + .08, .16, .06, d); },
  click(S, d, t) { S.osc('sine', 900, t, .05, .05, d); },
  dice(S, d, t) { for (let i = 0; i < 4; i++) S.osc('square', rnd(500, 900), t + i * .05, .04, .03, d); S.osc('triangle', 1180, t + .22, .14, .06, d); },
  wrong(S, d, t) { S.osc('square', 240, t, .14, .04, d, { glide: 190 }); S.osc('square', 200, t + .15, .2, .04, d, { glide: 150 }); },
  pickup(S, d, t) { [660, 880, 1100, 1320].forEach((f, i) => S.osc('triangle', f, t + i * .06, .18, .06, d)); },
  doll(S, d, t) { S.osc('sine', 520, t, .14, .08, d, { glide: 820 }); [1320, 1760, 2093].forEach((f, i) => S.osc('sine', f, t + .1 + i * .07, .2, .03, d)); },
  sprout(S, d, t) { const f = rnd(380, 520); S.osc('sine', f, t, .1, .035, d, { glide: f * 2.2 }); },
  whistle(S, d, t) { S.osc('sine', 1900, t, 1.5, .05, d, { a: .2, glide: 260 }); },
  boom(S, d, t) { S.osc('sine', 95, t, 1.1, .8, d, { a: .003, glide: 28 }); S.noise(t, 1.2, .45, d, { type: 'lowpass', freq: 320, glide: 80 }); },
  roar(S, d, t) {
    const c = S.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(70, t + 1.5); o2.frequency.setValueAtTime(56, t); o2.frequency.linearRampToValueAtTime(36, t + 1.5);
    lfo.frequency.value = 22; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(350, t + 1.5);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.32, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(d); [o, o2, lfo].forEach(x => { x.start(t); x.stop(t + 1.7); });
    S.noise(t, 1.4, .12, d, { freq: 500, q: .7 });
  },
  stomp(S, d, t) { S.osc('sine', 80, t, .28, .3, d, { glide: 38 }); S.noise(t, .2, .08, d, { type: 'lowpass', freq: 250 }); },
  swing(S, d, t) { S.noise(t, .2, .14, d, { freq: 700, glide: 2600, q: 1.4 }); },
  hit(S, d, t) { S.osc('square', 320, t, .14, .09, d, { a: .002, glide: 110 }); S.noise(t, .1, .2, d, { freq: 1400 }); S.osc('sine', 880, t + .03, .1, .05, d, { glide: 1400 }); },
  bonk(S, d, t) { SFX.hit(S, d, t); [1200, 1500, 1800].forEach((f, i) => S.osc('sine', f, t + .12 + i * .07, .14, .035, d)); },
  clank(S, d, t) { S.osc('triangle', 1250, t, .2, .06, d, { a: .002 }); S.osc('triangle', 1870, t, .14, .04, d, { a: .002 }); },
  bearHurt(S, d, t) { S.osc('sawtooth', 220, t, .32, .07, d, { glide: 120 }); },
  stun(S, d, t) { [1200, 1500, 1800, 1500, 1200].forEach((f, i) => S.osc('sine', f, t + i * .09, .12, .035, d)); },
  warn(S, d, t) { S.osc('sine', 880, t, .08, .05, d); S.osc('sine', 880, t + .13, .08, .05, d); },
  slam(S, d, t) { S.osc('sine', 80, t, .6, .6, d, { a: .002, glide: 30 }); S.noise(t, .5, .3, d, { type: 'lowpass', freq: 400, glide: 90 }); },
  charge(S, d, t) { S.noise(t, 1.0, .18, d, { type: 'lowpass', freq: 180, a: .1 }); S.osc('sawtooth', 60, t, .9, .06, d, { a: .1, glide: 90 }); },
  grab(S, d, t) { S.osc('triangle', 600, t, .12, .06, d, { glide: 950 }); S.osc('triangle', 900, t + .12, .14, .05, d, { glide: 500 }); },
  squeeze(S, d, t) { S.osc('triangle', 700, t, .2, .05, d, { glide: 420 }); S.noise(t, .15, .06, d, { freq: 900 }); },
  mash(S, d, t) { S.osc('square', rnd(900, 1200), t, .03, .025, d); },
  hurt(S, d, t) { S.osc('square', 520, t, .16, .05, d, { glide: 220 }); },
  throw(S, d, t) { S.noise(t, .35, .12, d, { freq: 500, glide: 1800, q: 1 }); },
  crash(S, d, t) { S.noise(t, .3, .3, d, { type: 'lowpass', freq: 1100, glide: 200 }); S.osc('sine', 90, t, .25, .25, d, { glide: 40 }); for (let i = 0; i < 4; i++) S.osc('square', rnd(300, 700), t + .05 + i * .04, .03, .02, d); },
  ingredient(S, d, t, i = 0) { const b = [660, 740, 830, 990][i] || 700; [b, b * 1.25, b * 1.5].forEach((f, k) => S.osc('triangle', f, t + k * .06, .16, .05, d)); },
  sandwich(S, d, t) { [523, 659, 784, 1047, 1319].forEach((f, i) => S.osc('triangle', f, t + i * .09, .3, .07, d)); },
  munch(S, d, t) { for (let i = 0; i < 3; i++) { S.noise(t + i * .16, .08, .14, d, { type: 'lowpass', freq: 900 }); S.osc('sine', 200, t + i * .16, .06, .04, d, { glide: 120 }); } },
  transform(S, d, t) {
    S.osc('sine', 300, t, 2.6, .06, d, { a: .4, glide: 1500 });
    for (let i = 0; i < 12; i++) S.osc('sine', rnd(1200, 2400), t + i * .2, .15, .025, d);
  },
  poof(S, d, t) { S.noise(t, .45, .25, d, { freq: 1200, glide: 300, q: .6 }); S.osc('sine', 660, t + .1, .3, .05, d, { glide: 1320 }); },
  pat(S, d, t) { S.noise(t, .06, .05, d, { type: 'lowpass', freq: 600 }); S.osc('sine', 420, t, .07, .03, d, { glide: 300 }); },
  whackHit(S, d, t) { SFX.hit(S, d, t); },
  whackGold(S, d, t) { [1047, 1319, 1568, 2093].forEach((f, i) => S.osc('triangle', f, t + i * .05, .18, .06, d)); },
  whackBoy(S, d, t) { S.osc('triangle', 700, t, .25, .07, d, { glide: 300 }); S.osc('square', 300, t + .12, .2, .04, d, { glide: 200 }); },
  miss(S, d, t) { S.noise(t, .12, .06, d, { freq: 1200, glide: 2400 }); },
  beep(S, d, t) { S.osc('square', 660, t, .12, .05, d); },
  go(S, d, t) { S.osc('square', 990, t, .3, .06, d); },
  gameover(S, d, t) { [660, 554, 440, 330].forEach((f, i) => S.osc('triangle', f, t + i * .22, .35, .07, d)); },
  heart(S, d, t) { S.osc('sine', 700, t, .12, .05, d, { glide: 1100 }); },
  flash(S, d, t) { [784, 988, 1175, 1568].forEach((f, i) => S.osc('sine', f, t + i * .05, .5, .05, d)); S.noise(t, .6, .06, d, { type: 'highpass', freq: 5000 }); },
};

/* ---------------- music tracks (16th-note step sequencers) ---------------- */
const CH = {
  C: [48, 52, 55, 59], Am: [45, 48, 52, 55], F: [41, 45, 48, 52], G: [43, 47, 50, 55],
  Fmaj7: [53, 57, 60, 64], Em7: [52, 55, 59, 62], Dm7: [50, 53, 57, 60], Cmaj7: [48, 52, 55, 59],
};
const lofi = (prog, bassRoots, opts = {}) => (S, o, s, t) => {
  const pos = s % 16, bar = Math.floor(s / 16), ci = bar % prog.length, ch = prog[ci], st = 60 / (opts.bpm || 76) / 4;
  if (pos === 0) { ch.forEach((n, i) => S.keys(o, n, t + i * .012, st * 15, .06)); S.bass(o, bassRoots[ci], t, st * 7, .26); }
  if (pos === 10) { ch.slice(1).forEach(n => S.keys(o, n, t, st * 5, .03)); S.bass(o, bassRoots[ci] + (bar % 2 ? 7 : 0), t, st * 5, .22); }
  if (pos === 0 || pos === 7 || (pos === 10 && bar % 2)) S.kick(o, t, .38);
  if (pos === 4 || pos === 12) S.snare(o, t, .1);
  if (pos % 2 === 0) S.hat(o, t, pos % 4 ? .018 : .032);
  if (bar % 2 === 1 && [2, 6, 9, 14].includes(pos) && Math.random() < .5) S.pluck(o, [72, 74, 76, 79, 81, 84][Math.random() * 6 | 0], t, .05);
};

const TRACKS = {
  title: {
    bpm: 84, bars: 4, vol: .9,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, ch = [CH.C, CH.Am, CH.F, CH.G][ci], st = 60 / 84 / 4;
      if (pos === 0) { ch.forEach(n => S.pad(o, n + 12, t, st * 16, .02)); S.bass(o, ch[0] - 12, t, st * 8, .16); }
      if (pos % 2 === 0) { const pat = [0, 2, 1, 3, 2, 1, 3, 2]; S.pluck(o, ch[pat[pos / 2]] + 24, t, .045, .6); }
    },
  },
  explore: {
    bpm: 64, bars: 4, vol: .9, fadeIn: 3,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, ch = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 55, 59]][ci], st = 60 / 64 / 4;
      if (pos === 0) { ch.forEach(n => S.pad(o, n, t, st * 17, .022)); S.osc('sine', mtof(ch[0] - 24), t, st * 16, .07, o, { a: .8 }); }
      if (pos % 4 === 2 && Math.random() < .32) S.pluck(o, [69, 72, 76, 79, 81][Math.random() * 5 | 0] + (Math.random() < .3 ? 12 : 0), t, .035, 1.2);
    },
  },
  companion: { bpm: 76, bars: 8, swing: .14, vol: .9, step: lofi([CH.Fmaj7, CH.Em7, CH.Dm7, CH.Cmaj7], [41, 40, 38, 36]) },
  credits: { bpm: 74, bars: 8, swing: .14, vol: .95, crackle: true, step: lofi([CH.Fmaj7, CH.Em7, CH.Dm7, CH.Cmaj7], [41, 40, 38, 36], { bpm: 74 }) },
  chase: {
    bpm: 150, bars: 4, vol: .85, fadeIn: .4,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, st = 60 / 150 / 4;
      const root = [45, 41, 43, 40][ci], arp = [[69, 72, 76, 81], [65, 69, 72, 77], [67, 71, 74, 79], [64, 68, 71, 76]][ci];
      if (pos % 2 === 0) S.bass(o, root - 12 + (pos % 4 ? 12 : 0), t, st * 1.8, .2, 'sawtooth');
      if (pos % 4 === 0) S.kick(o, t, .5);
      if (pos === 4 || pos === 12) S.snare(o, t, .15);
      S.hat(o, t, pos % 2 ? .015 : .03, pos === 14);
      if (pos % 2 === 0) S.lead(o, arp[[0, 1, 2, 1, 0, 1, 2, 3][pos / 2]], t, st * 1.2, .035, 'square');
      if (pos === 0 && ci === 3) S.noise(t, st * 16, .05, o, { freq: 400, glide: 4000, a: st * 14 });
    },
  },
  fight: {
    bpm: 128, bars: 4, vol: .85, fadeIn: .5,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, st = 60 / 128 / 4;
      const root = [38, 46, 48, 45][ci], ch = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]][ci];
      if (pos % 2 === 0) S.bass(o, root - 12 + (pos % 4 === 2 ? 12 : 0), t, st * 1.7, .22, 'sawtooth');
      if (pos === 0 || pos === 6 || pos === 8) S.kick(o, t, .5);
      if (pos === 4 || pos === 12) S.snare(o, t, .15);
      if (pos % 2 === 0) S.hat(o, t, .025);
      if (pos === 0 || pos === 10) ch.forEach(n => S.lead(o, n, t, st * 2, .018, 'sawtooth'));
      const mel = { 0: 2, 3: 1, 6: 0, 8: 1, 10: 2, 12: 3 };
      if (pos in mel) { const k = mel[pos]; S.lead(o, k === 3 ? ch[0] + 12 + 12 : ch[k] + 12, t, st * 2.2, .04, 'square'); }
      if (ci === 3 && pos >= 12) S.tom(o, 50 - (pos - 12) * 3, t, .2);
    },
  },
  rage: {
    bpm: 146, bars: 4, vol: .85, fadeIn: .4,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, st = 60 / 146 / 4;
      const root = [38, 38, 46, 45][ci], ch = [[62, 65, 69], [62, 65, 70], [58, 62, 65], [57, 61, 64]][ci];
      S.bass(o, root - 12 + (pos % 2 ? 12 : 0), t, st * .9, .17, 'sawtooth');
      if (pos % 4 === 0 || pos === 10) S.kick(o, t, .55);
      if (pos === 4 || pos === 12 || (ci === 3 && pos >= 12)) S.snare(o, t, .14);
      S.hat(o, t, pos % 2 ? .02 : .035);
      S.lead(o, ch[pos % 3] + 12 + (pos >= 8 ? 12 : 0), t, st * .9, .022, 'sawtooth');
      if (pos === 0 && ci === 0) S.noise(t, st * 16 * 2, .05, o, { freq: 300, glide: 3000, a: st * 24 });
    },
  },
  ending: {
    bpm: 96, bars: 4, vol: .9, fadeIn: 2.5,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, ch = [CH.C, CH.G, CH.Am, CH.F][ci], st = 60 / 96 / 4;
      if (pos === 0) { ch.forEach(n => S.pad(o, n + 12, t, st * 16, .022)); S.bass(o, ch[0] - 12, t, st * 6, .22); }
      if (pos === 8) S.bass(o, ch[0] - 12 + 7, t, st * 6, .18);
      if (pos % 2 === 0) S.pluck(o, ch[[0, 1, 2, 3, 2, 1, 2, 3][pos / 2]] + 24, t, .045, .5);
      if (pos === 0 || pos === 8) S.kick(o, t, .3);
      if (pos === 4 || pos === 12) S.snare(o, t, .06);
      if (pos % 2 === 1) S.noise(t, .05, .02, o, { type: 'highpass', freq: 6000 });
      if (s % 64 === 48 && pos === 0) [84, 88, 91, 96].forEach((n, i) => S.pluck(o, n, t + i * st * 2, .04, .8));
    },
  },
  whack: {
    bpm: 126, bars: 4, vol: .85,
    step(S, o, s, t) {
      const pos = s % 16, ci = Math.floor(s / 16) % 4, ch = [CH.C, CH.F, CH.G, CH.C][ci], st = 60 / 126 / 4;
      if (pos % 4 === 0) S.bass(o, ch[0] - 12 + (pos === 8 ? 7 : 0), t, st * 2.5, .22);
      if (pos === 0 || pos === 8) S.kick(o, t, .45);
      if (pos === 4 || pos === 12) S.snare(o, t, .12);
      if (pos % 2 === 0) S.hat(o, t, .025);
      if (pos % 2 === 0) S.lead(o, ch[[0, 1, 2, 3, 2, 1, 2, 3][pos / 2]] + 24, t, st * 1.4, .03, 'square');
    },
  },
};
