// Firework sounds, played from real recordings you drop into resources/footer/sfx/.
//
// Synthesizing them from noise and sine waves never sounded like fireworks, so this uses recordings instead
// (CC0 ones from OpenGameArt are included). List the files in resources/footer/sfx/sfx.json:
//
//   { "launch": ["launch1.mp3"], "burst": ["burst1.mp3", "burst2.mp3"], "crackle": ["crackle1.mp3"] }
//
// Any group can be left empty or missing. With no files the footer is simply silent, apart from the song.
// Each play gets a random file, slight speed change, stereo position from where the firework is on screen,
// a bit of echo, and a delay that grows with distance (light is faster than sound).

const FOLDER = "resources/footer/sfx/";
const MASTER = 0.62;
const OCEAN_LEVEL = 0.2;
const PAPER = 0.67;

let ctx = null;
let master = null;
let reverb = null;
let allowed = true;
let armed = false;
let unlocked = false;
let library = { launch: [], burst: [], crackle: [], hover: [], click: [], pageflip: [] };
let ocean = null;
let wantOcean = false;

const range = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];

async function loadLibrary() {
  try {
    const res = await fetch(`${FOLDER}sfx.json`);
    if (!res.ok) return;
    const manifest = await res.json();
    const decode = async name => {
      try {
        const data = await (await fetch(FOLDER + name)).arrayBuffer();
        return await ctx.decodeAudioData(data);
      } catch {
        return null;
      }
    };
    for (const group of Object.keys(library)) {
      library[group] = (await Promise.all((manifest[group] || []).map(decode))).filter(Boolean);
    }
  } catch {
    // no sounds: stay quiet
  }
}

function buildContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  ctx = new AudioCtx();
  // A little extra low end: the recordings are thin, and distance keeps the bass but loses the top.
  const body = ctx.createBiquadFilter();
  body.type = "lowshelf";
  body.frequency.value = 150;
  body.gain.value = 5;
  body.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(body);

  // A dark, diffuse tail for a sense of open space around the sound.
  const length = Math.floor(ctx.sampleRate * 2.6);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    let y = 0;
    for (let i = 0; i < length; i++) {
      y += ((Math.random() * 2 - 1) - y) * 0.3;
      ch[i] = y * Math.pow(1 - i / length, 2.8);
    }
  }
  reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  reverb.connect(wet);
  wet.connect(master);

  loadLibrary();
  applyOcean();
  return true;
}

// Browsers only allow audio after a click or key press, so the context is created then.
function arm() {
  if (armed) return;
  armed = true;
  if (!ctx) buildContext();   // starts suspended; building it now means the sounds are loaded by the first click
  // Some browsers let a page they trust start sound without a click; if so this just works.
  if (ctx) {
    ctx.onstatechange = () => { if (ctx.state === "running") unlocked = true; };
    ctx.resume().catch(() => {});
  }
  const start = () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
    unlocked = true;
    if (!ctx && !buildContext()) return;
    if (ctx.state === "suspended") ctx.resume();
  };
  window.addEventListener("pointerdown", start, true);
  window.addEventListener("keydown", start, true);
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
}

function ready(group) {
  return allowed && ctx && ctx.state === "running" && library[group].length > 0;
}

function play(buffer, { at, gain, pan = 0, rate = 1, echo = 0, lowpass = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  src.connect(amp);
  // These recordings are close up. A low-pass takes some of the top off, as distance would.
  let tail = amp;
  if (lowpass) {
    // Two low-passes in a row make a steep slope, so the harsh, compressed-sounding top really goes.
    for (let i = 0; i < 2; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      filter.Q.value = 0.5;
      tail.connect(filter);
      tail = filter;
    }
  }
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    tail.connect(panner);
    panner.connect(master);
    if (echo) {
      const send = ctx.createGain();
      send.gain.value = echo;
      panner.connect(send);
      send.connect(reverb);
    }
  } else {
    tail.connect(master);
  }
  src.start(at);
}

// ── Ocean ──────────────────────────────────────────────────────────────────
// Waves are noise through filters: a low wash that swells and fades, a hiss of foam that follows each
// crest, and a constant deep rumble. Every wave is a little different in length and size.
function buildOcean() {
  const sr = ctx.sampleRate;
  const len = sr * 7;
  const noise = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const ch = noise.getChannelData(c);
    let y = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      y += ((Math.random() * 2 - 1) - y) * 0.25;    // softened, so it's more rumble than hiss
      ch[i] = y;
      peak = Math.max(peak, Math.abs(y));
    }
    for (let i = 0; i < len; i++) ch[i] /= peak;
  }

  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(master);

  const layer = (type, freq, q, startGain) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = startGain;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(0, Math.random() * 6);
    return { filter, gain };
  };
  const wash = layer("lowpass", 600, 0.4, 0.15);
  const foam = layer("bandpass", 2200, 0.5, 0);
  layer("lowpass", 110, 0.5, 0.35);

  let nextWave = ctx.currentTime + 0.2;
  const schedule = () => {
    while (nextWave < ctx.currentTime + 25) {
      const period = range(7, 11);
      const crest = nextWave + period * 0.45;
      const size = range(0.55, 1);
      wash.gain.gain.setTargetAtTime(size, nextWave, period * 0.16);
      wash.filter.frequency.setTargetAtTime(range(900, 1300), nextWave, period * 0.16);
      wash.gain.gain.setTargetAtTime(0.14, crest, period * 0.2);
      wash.filter.frequency.setTargetAtTime(550, crest, period * 0.2);
      foam.gain.gain.setTargetAtTime(size * 0.4, crest - period * 0.05, 0.4);
      foam.gain.gain.setTargetAtTime(0, crest + 0.6, period * 0.13);
      nextWave += period;
    }
  };
  schedule();
  setInterval(schedule, 5000);
  return { bus };
}

function applyOcean() {
  if (!ctx) return;
  const on = wantOcean && allowed;
  if (on && !ocean) ocean = buildOcean();
  if (ocean) ocean.bus.gain.setTargetAtTime(on ? OCEAN_LEVEL : 0, ctx.currentTime, 1.6);
}

// ── Paper ──────────────────────────────────────────────────────────────────
// A quiet rustle when scraps tear loose or slide to a new shape, and a soft tap as each one lands.
// Short bursts of filtered noise, sparse enough that a few hundred scraps don't turn into a roar.
let paperNoise = null;
let nextRustle = 0;
let nextTap = 0;

function noiseBuffer() {
  if (!paperNoise) {
    paperNoise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = paperNoise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return paperNoise;
}

function noiseBurst(at, { type, freq, q, peak, attack, decay, pan, rate = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.playbackRate.value = rate;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.linearRampToValueAtTime(peak * PAPER, at + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  src.connect(filter);
  filter.connect(amp);
  let out = amp;
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    amp.connect(panner);
    out = panner;
  }
  out.connect(master);
  src.start(at, Math.random() * 1.5, attack + decay + 0.05);
}

// Small sounds for hovering things you can use and for clicking. They share the footer's audio, so they
// begin after the first click (browsers keep pages silent until then) and "no thanks" mutes them too.
const HOVERABLE = "a, button, .project-row, .p-card, .influence-card, .filter-row *, [data-hover]";
let uiBound = false;
let lastHover = 0;

function uiSounds() {
  if (uiBound) return;
  uiBound = true;
  const tick = (kind, gain) => {
    if (!allowed || !ctx || !unlocked || !library[kind].length) return;
    play(pick(library[kind]), { at: ctx.currentTime, gain, rate: range(0.97, 1.03) });
  };
  document.addEventListener("pointerover", e => {
    if (e.pointerType === "touch" || !(e.target instanceof Element)) return;
    const el = e.target.closest(HOVERABLE);
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    tick("hover", 0.25);
  });
  document.addEventListener("pointerdown", () => tick("click", 0.35));
}

let nextShake = 0;

// A page being turned, from a real recording (trimmed from temp/page-flip-needs-a-trim.mp3).
let lastFlip = 0;

function pageTurn() {
  if (!allowed || !ctx || ctx.state !== "running" || !library.pageflip.length) return;
  // Sweeping the cursor down a list asks for a flip per row. One at a time: ignore requests while the
  // last one is still going, so they never stack up.
  const now = ctx.currentTime;
  if (now - lastFlip < 0.9) return;
  lastFlip = now;
  play(pick(library.pageflip), { at: now, gain: 0.24, pan: range(-0.2, 0.2), rate: range(0.96, 1.04) });
}

export const sfx = {
  pageTurn,

  // One paper rustle, used when a stack of scraps is laid out.
  rustle(strength = 1) {
    if (!allowed || !ctx || ctx.state !== "running") return;
    noiseBurst(ctx.currentTime, {
      type: "bandpass", freq: range(2400, 5600), q: range(0.6, 1.1),
      peak: 0.05 * strength, attack: range(0.01, 0.02), decay: range(0.1, 0.22),
      pan: range(-0.6, 0.6), rate: range(0.8, 1.2),
    });
  },

  // The cut-outs trembling before they tear apart: level is 0..1.
  shake(level) {
    if (!allowed || !ctx || ctx.state !== "running" || level < 0.15) return;
    const now = ctx.currentTime;
    if (now < nextShake) return;
    nextShake = now + range(0.06, 0.13);
    noiseBurst(now, {
      type: "bandpass", freq: range(3000, 6200), q: range(0.7, 1.2),
      peak: 0.04 + level * 0.07, attack: range(0.008, 0.016), decay: range(0.06, 0.15),
      pan: range(-0.8, 0.8), rate: range(0.8, 1.3),
    });
  },

  // moved: scraps that began moving this frame; landed: scraps that came to rest.
  paper(moved, landed) {
    if (!allowed || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (moved > 0 && now >= nextRustle) {
      nextRustle = now + range(0.05, 0.12);
      const n = Math.min(moved, 6);
      for (let i = 0; i < Math.min(n, 2); i++) {
        noiseBurst(now + i * 0.03, {
          type: "bandpass", freq: range(2600, 5800), q: range(0.6, 1.1),
          peak: 0.035 + n * 0.012, attack: range(0.01, 0.02), decay: range(0.09, 0.2),
          pan: range(-0.7, 0.7), rate: range(0.8, 1.2),
        });
      }
    }
    if (landed > 0 && now >= nextTap) {
      nextTap = now + range(0.04, 0.09);
      const n = Math.min(landed, 5);
      noiseBurst(now, {
        type: "lowpass", freq: range(700, 1300), q: 0.7,
        peak: 0.05 + n * 0.014, attack: 0.004, decay: range(0.03, 0.06),
        pan: range(-0.5, 0.5),
      });
    }
  },

  // Waves washing on the beach, faded in while the footer is on screen.
  ambience(on) {
    wantOcean = on;
    applyOcean();
  },

  init() { arm(); uiSounds(); },

  setAllowed(on) {
    allowed = on;
    applyOcean();
  },

  // x is 0..1 across the screen.
  launch(x) {
    if (!ready("launch")) return;
    play(pick(library.launch), { at: ctx.currentTime, gain: 0.6, pan: (x - 0.5) * 1.4, rate: range(0.95, 1.05), echo: 0.12, lowpass: 1900 });
  },

  // height is 0..1 from the top of the screen; higher bursts are further away and heard later.
  burst(x, height, size = 1) {
    if (!ready("burst")) return;
    const at = ctx.currentTime + 0.45 + (1 - height) * 0.6 + Math.random() * 0.1;
    // Bigger shells play slightly slower, so a little deeper.
    play(pick(library.burst), { at, gain: 0.85 * Math.min(size, 1.2), pan: (x - 0.5) * 1.6, rate: range(0.94, 1.06) / Math.sqrt(size), echo: 0.4, lowpass: 1500 + (1 - Math.min(height, 1)) * 500 });
  },

  crackle(x) {
    if (!ready("crackle")) return;
    const at = ctx.currentTime + 0.7 + Math.random() * 0.2;
    play(pick(library.crackle), { at, gain: 0.7, pan: (x - 0.5) * 1.6, rate: range(0.95, 1.05), echo: 0.3, lowpass: 3400 });
  },
};
