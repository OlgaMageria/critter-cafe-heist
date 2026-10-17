// Little synthesized sound effects (Web Audio, no sound files). Muted by default and kept quiet,
// so they never fight with the Meet call. The 🔇 / 🔊 button turns them on; the choice is remembered.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SFX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  let on = !!(store && store.getItem('cch_sound') === '1');
  let ac = null, master = null;

  function ctx() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
    return ac;
  }
  function ready() {
    if (!on) return null;
    const a = ctx();
    if (a && a.state === 'suspended') a.resume();
    return a;
  }

  // one note: frequency (Hz), length (s), wave, volume, optional slide to another frequency, start delay
  function tone(f, len, type, vol, to, delay) {
    const a = ready(); if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.05);
  }
  // a burst of filtered noise (rustles, hisses, whooshes, thuds)
  function noise(len, vol, freq, q, delay, sweepTo) {
    const a = ready(); if (!a) return;
    const t = a.currentTime + (delay || 0);
    const n = Math.floor(a.sampleRate * len);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q || 1;
    f.frequency.setValueAtTime(freq || 1000, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + len);
    const g = a.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + len + 0.05);
  }
  const arp = (notes, step, type, vol) => notes.forEach((f, i) => tone(f, step * 1.6, type, vol, null, i * step));

  const SOUNDS = {
    note: () => { noise(0.12, 0.25, 3000, 2); tone(880, 0.08, 'triangle', 0.15, null, 0.08); tone(1175, 0.1, 'triangle', 0.15, null, 0.15); },
    found: () => { arp([523, 659, 784, 1047, 1319], 0.08, 'triangle', 0.25); noise(0.5, 0.06, 6000, 3, 0.3); },
    wrong: () => { tone(140, 0.3, 'square', 0.18, 55); noise(0.25, 0.4, 300, 1); },
    key: () => tone(1250, 0.05, 'square', 0.07),
    badcode: () => { tone(150, 0.16, 'sawtooth', 0.18); tone(150, 0.22, 'sawtooth', 0.18, null, 0.2); },
    unlock: () => { noise(0.05, 0.4, 2500, 4); tone(784, 0.15, 'triangle', 0.2, null, 0.08); tone(1175, 0.3, 'triangle', 0.2, null, 0.2); },
    out: () => { noise(0.4, 0.25, 600, 1, 0, 3500); tone(523, 0.18, 'triangle', 0.18, 1046, 0.15); },
    spotted: () => { tone(620, 0.35, 'sine', 0.25, 980); tone(980, 0.3, 'sine', 0.2, 520, 0.3); noise(0.2, 0.08, 4000, 2, 0.05); },
    lost: () => { tone(700, 0.15, 'sine', 0.14, 560); tone(560, 0.2, 'sine', 0.14, 760, 0.18); },
    pounce: () => { noise(0.45, 0.5, 5000, 0.8, 0, 1800); tone(90, 0.4, 'square', 0.25, 45, 0.05); },
    win: () => arp([523, 659, 784, 1047, 784, 1047, 1319], 0.11, 'triangle', 0.25),
    lose: () => { arp([392, 370, 349], 0.28, 'sawtooth', 0.12); tone(330, 0.9, 'sawtooth', 0.12, 220, 0.84); },
    tick: () => tone(1500, 0.04, 'square', 0.06),
    heart: () => { tone(70, 0.12, 'sine', 0.5, 45); tone(65, 0.14, 'sine', 0.4, 42, 0.16); },
    react: () => tone(900, 0.07, 'sine', 0.08, 1300),
    start: () => arp([392, 523, 659], 0.09, 'triangle', 0.18)
  };

  function play(name) { if (on && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) {} } }
  function setOn(v) {
    on = !!v;
    try { store && store.setItem('cch_sound', on ? '1' : '0'); } catch (e) {}
    if (on) { ready(); play('react'); }
  }
  return { play, setOn, isOn: () => on, names: Object.keys(SOUNDS) };
});
