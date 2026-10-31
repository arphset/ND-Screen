// Н23. Тихая чиптюн-музыка. По умолчанию выключена. Web Audio: мелодия квадратной волной через фильтр
// и мягкий бас треугольной. У каждого раздела своя короткая пентатоническая петля (зерно = название раздела).
window.ND = window.ND || {};

ND.music = (function () {
  const PENTA = [0, 2, 4, 7, 9];
  const ROOTS = [57, 60, 62, 55, 64]; // A3, C4, D4, G3, E4
  const BPM = 76, STEP = 60 / BPM / 2; // восьмые
  let ctx = null, master = null, timer = null, next = 0, step = 0, loop = null, vol = 0.5, cur = null;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  // петля 16 восьмых: мелодия (null — пауза) и бас по четвертям
  function makeLoop(seed) {
    const r = ND.lab ? ND.lab.rng(seed) : Math.random;
    const root = ROOTS[seed % ROOTS.length];
    let deg = 2;
    const mel = [];
    for (let i = 0; i < 16; i++) {
      if (r() < 0.38) { mel.push(null); continue; }
      deg = Math.max(0, Math.min(9, deg + Math.round((r() - 0.5) * 3)));
      mel.push(root + 12 + PENTA[deg % 5] + 12 * Math.floor(deg / 5));
    }
    const prog = [0, 5, 3, 4].map((d) => root - 12 + [0, 2, 4, 7, 9, 12][d]);
    return { mel, bass: prog };
  }
  function note(t, f, dur, type, gain, cutoff) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let out = g;
    if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff; g.connect(lp); out = lp; }
    o.connect(g); out.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function tick() {
    while (next < ctx.currentTime + 0.25) {
      const i = step % 16, m = loop.mel[i];
      if (m != null) note(next, hz(m), STEP * 1.6, "square", 0.05, 1400);
      if (i % 4 === 0) note(next, hz(loop.bass[(step / 4) % 4 | 0]), STEP * 3.6, "triangle", 0.09);
      next += STEP; step++;
    }
  }
  const supported = () => typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
  function play(sec) {
    if (!supported()) return false;
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); }
    if (ctx.state === "suspended") ctx.resume();
    master.gain.value = 0.25 * vol;
    if (cur === sec && timer) return true;
    cur = sec; loop = makeLoop(hash(sec)); step = 0; next = ctx.currentTime + 0.1;
    if (!timer) timer = setInterval(tick, 100);
    return true;
  }
  function stop() { if (timer) clearInterval(timer); timer = null; cur = null; if (ctx && ctx.state === "running") ctx.suspend(); }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = 0.25 * vol; }
  return { play, stop, setVolume, supported, makeLoop, hash, playing: () => !!timer };
})();
