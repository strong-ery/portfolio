// The night sky behind the footer: stars and fireworks drawn from scratch
// (rockets, then bursts of sparks with trails that cool from white to orange to ember).

import { seededRandom } from "./rng.js";

const STEP = 1 / 60;
const MAX_PARTICLES = 1800;
const ALPHA_LEVELS = 16;
const STAR_STYLES = Array.from({ length: 21 }, (_, i) => `rgba(214, 226, 255, ${(i / 20).toFixed(2)})`);

const clamp = (v, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const lerp = (a, b, t) => a + (b - a) * t;
const range = (a, b) => a + Math.random() * (b - a);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return [0, 1, 2].map(i => Math.round(lerp(a[i], b[i], t)));
}

// A colour with its rgba() strings precomputed, so drawing never builds strings per spark.
function makeShade(rgb) {
  const strings = [];
  for (let i = 0; i <= ALPHA_LEVELS; i++) strings.push(`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(i / ALPHA_LEVELS).toFixed(3)})`);
  return { rgb, strings };
}

const shadeAt = (shade, alpha) => shade.strings[Math.round(clamp(alpha) * ALPHA_LEVELS)];

// [core, edge, weight]. Mostly warm whites, golds, oranges and pinks, like the festival in the film.
const PALETTE_SOURCE = [
  ["#fff3e0", "#ffb457", 3],
  ["#ffe0b0", "#ff7a3d", 3],
  ["#ffe6ea", "#ff5d7a", 3],
  ["#fff6d6", "#ffd36b", 3],
  ["#ffffff", "#ffe9c8", 2],
  ["#e6f6ff", "#7fd0ff", 1],
  ["#f3e8ff", "#b58cff", 1],
];
const EMBER = hexToRgb("#ff5a1f");
const PALETTES = PALETTE_SOURCE.map(([core, edge, weight]) => {
  const edgeRgb = hexToRgb(edge);
  return {
    weight,
    core: makeShade(hexToRgb(core)),
    edge: makeShade(edgeRgb),
    ember: makeShade(mixRgb(edgeRgb, EMBER, 0.55)),
  };
});
const GOLD = PALETTES[3];
const WHITE = PALETTES[4];

function pickPalette() {
  const total = PALETTES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PALETTES) { r -= p.weight; if (r <= 0) return p; }
  return PALETTES[0];
}

const KINDS = [
  ["peony", 30], ["chrysanthemum", 20], ["willow", 14], ["ring", 10], ["double", 12], ["crackle", 14],
];

function pickKind() {
  const total = KINDS.reduce((s, k) => s + k[1], 0);
  let r = Math.random() * total;
  for (const [name, weight] of KINDS) { r -= weight; if (r <= 0) return name; }
  return "peony";
}

// A soft round glow, drawn once and stamped wherever a spark needs a halo.
function makeGlowSprite() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

// events is optional: { launch(x), burst(x, height, size), crackle(x) } with x and height as 0..1 of the stage.
export function createSky(skyCanvas, events = {}) {
  const ctx = skyCanvas.getContext("2d");
  const glow = makeGlowSprite();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0;
  let H = 0;
  let S = 1;            // reference size the bursts scale with
  let stars = [];
  let particles = [];
  let rockets = [];
  let flashes = [];
  let raf = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let running = false;
  let launching = false;
  let nextLaunch = 0;
  let recentX = [];
  let sea = true;       // water behind the beach; off when a custom ground image is used
  let queued = [];      // rockets scheduled for later, as [time, launch function]

  function resize(width, height, ratio) {
    W = Math.round(width);
    H = Math.round(height);
    const dpr = Math.min(ratio || 1, 1.5);
    skyCanvas.width = Math.round(W * dpr);
    skyCanvas.height = Math.round(H * dpr);
    skyCanvas.style.width = `${W}px`;
    skyCanvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W, H * 1.5);

    const rand = seededRandom("finale-sky");
    stars = Array.from({ length: Math.round(clamp(W * H / 6500, 70, 220)) }, () => ({
      x: rand() * W,
      y: Math.pow(rand(), 1.4) * H * 0.62,
      r: 0.35 + rand() * 0.8,
      base: 0.2 + rand() * 0.55,
      speed: 0.6 + rand() * 1.8,
      phase: rand() * 6.28,
    }));
    if (!running) paintStill();
  }

  // The water sits between a horizon a little above the sand and the top of the sand.
  function seaBand() {
    return { top: H * 0.66, bottom: H * 0.8 };
  }

  function drawSea() {
    const { top, bottom } = seaBand();
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, "#0c1017");
    grad.addColorStop(1, "#151b27");
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, W, bottom - top);

    ctx.fillStyle = "rgba(130, 150, 190, 0.2)";
    ctx.fillRect(0, top, W, 1);

    // A few distant ships.
    [[0.31, 0.5], [0.74, 0.3]].forEach(([fx, fy]) => {
      ctx.fillStyle = "rgba(255, 200, 130, 0.7)";
      ctx.fillRect(W * fx, top - 2, 2, 2);
      ctx.fillStyle = "rgba(255, 200, 130, 0.12)";
      ctx.fillRect(W * fx - 6, top + 1, 14, 1);
    });

    // Slow swells drifting across the water.
    ctx.lineCap = "round";
    for (let row = 0; row < 9; row++) {
      const depth = (row + 1) / 9;
      const y = top + (bottom - top) * depth * depth;
      ctx.strokeStyle = `rgba(150, 170, 210, ${0.035 + depth * 0.06})`;
      ctx.lineWidth = 0.6 + depth;
      const span = 60 + depth * 90;
      const drift = clock * (4 + depth * 9);
      ctx.beginPath();
      for (let x = -span; x < W + span; x += span * 1.7) {
        const sx = ((x + drift + row * 53) % (W + span * 2)) - span;
        ctx.moveTo(sx, y);
        ctx.lineTo(sx + span * (0.4 + 0.3 * Math.sin(row + x)), y + Math.sin(clock * 0.8 + row) * 0.6);
      }
      ctx.stroke();
    }

    // Each burst shimmers on the water below it.
    ctx.globalCompositeOperation = "lighter";
    flashes.forEach(f => {
      if (f.dur < 0.5) return;
      const k = 1 - f.age / f.dur;
      for (let j = 0; j < 14; j++) {
        const y = top + ((j + 0.5) / 14) * (bottom - top);
        const w = (5 + j * 3.5) * (0.45 + 0.55 * Math.sin(clock * 9 + j * 1.7));
        const x = f.x + Math.sin(clock * 3 + j) * (3 + j * 0.9);
        ctx.fillStyle = `rgba(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]},${(k * k * 0.55 * (1 - j / 16)).toFixed(3)})`;
        ctx.fillRect(x - Math.abs(w) / 2, y, Math.abs(w), 1.4);
      }
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function paintStill() {
    ctx.clearRect(0, 0, W, H);
    if (sea) drawSea();
    drawStars();
  }

  function drawStars() {
    ctx.globalCompositeOperation = "source-over";
    const horizon = sea ? seaBand().top : H;
    stars.forEach(s => {
      if (s.y > horizon - 3) return;
      const a = s.base * (0.65 + 0.35 * Math.sin(clock * s.speed + s.phase));
      ctx.fillStyle = STAR_STYLES[Math.round(clamp(a) * 20)];
      ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
    });
  }

  // ── particles ──────────────────────────────────────────────────────────────

  function spark(x, y, vx, vy, opts) {
    if (particles.length >= MAX_PARTICLES) return;
    particles.push({
      x, y, vx, vy,
      age: 0,
      life: opts.life,
      drag: opts.drag,
      grav: opts.grav,
      palette: opts.palette,
      size: opts.size,
      trailLen: opts.trail,
      trail: [x, y],
      crackle: !!opts.crackle,
      flicker: Math.random() * 6.28,
      bright: opts.bright || 1,
    });
  }

  function burst(x, y, kind) {
    const palette = pickPalette();
    const grav = S * 0.1;
    const flashRgb = palette.edge.rgb;
    flashes.push({ x, y, age: 0, dur: 0.8, radius: S * 0.5, rgb: flashRgb, strength: 0.2 });
    if (events.burst) {
      const size = kind === "chrysanthemum" || kind === "double" ? 1.15 : kind === "willow" || kind === "ring" ? 0.8 : 1;
      events.burst(x / W, y / H, size, kind);
    }
    const crackleOdds = { crackle: 1, chrysanthemum: 0.6, willow: 0.6, double: 0.4, peony: 0.3, ring: 0.2 }[kind] || 0;
    if (events.crackle && Math.random() < crackleOdds) queued.push([clock + 0.9 + Math.random() * 0.5, () => events.crackle(x / W)]);
    flashes.push({ x, y, age: 0, dur: 0.25, radius: S * 0.07, rgb: [255, 245, 230], strength: 0.9 });

    const radialSpeed = (radius, drag) => radius * 60 * (1 - drag);

    if (kind === "peony" || kind === "chrysanthemum" || kind === "crackle") {
      const long = kind === "chrysanthemum";
      const drag = long ? 0.972 : 0.962;
      const radius = S * range(0.12, 0.17) * (long ? 1.1 : 1);
      const count = long ? 120 : 80;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const v = radialSpeed(radius, drag) * range(0.55, 1);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, {
          life: range(1.5, 2.3) * (long ? 1.2 : 1), drag, grav, palette,
          size: range(1.1, 1.8), trail: long ? 9 : 5, crackle: kind === "crackle" && Math.random() < 0.35,
        });
      }
    } else if (kind === "willow") {
      const drag = 0.955;
      const radius = S * range(0.13, 0.18);
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = radialSpeed(radius, drag) * range(0.5, 1);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, {
          life: range(2.8, 3.8), drag, grav: S * 0.2, palette: GOLD, size: range(1, 1.5), trail: 11,
        });
      }
    } else if (kind === "ring") {
      const drag = 0.962;
      const radius = S * range(0.11, 0.15);
      const tilt = range(-0.7, 0.7);
      const squash = range(0.35, 0.9);
      const count = 64;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const v = radialSpeed(radius, drag);
        const px = Math.cos(a) * v;
        const py = Math.sin(a) * v * squash;
        spark(x, y, px * Math.cos(tilt) - py * Math.sin(tilt), px * Math.sin(tilt) + py * Math.cos(tilt), {
          life: range(1.5, 2), drag, grav, palette, size: 1.5, trail: 5,
        });
      }
    } else if (kind === "double") {
      const inner = pickPalette();
      const drag = 0.962;
      const radius = S * range(0.13, 0.17);
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = radialSpeed(radius, drag) * range(0.8, 1);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, { life: range(1.6, 2.2), drag, grav, palette, size: 1.5, trail: 5 });
      }
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2;
        const v = radialSpeed(radius * 0.5, drag);
        spark(x, y, Math.cos(a) * v, Math.sin(a) * v, { life: range(1.4, 1.9), drag, grav, palette: inner, size: 1.6, trail: 4 });
      }
    }
  }

  function launch(kind) {
    // Spread launches out so two never go up side by side.
    let x = W * range(0.08, 0.92);
    for (let i = 0; i < 8; i++) {
      const candidate = W * range(0.08, 0.92);
      if (recentX.every(r => Math.abs(r - candidate) > W * 0.16)) { x = candidate; break; }
    }
    if (events.launch) events.launch(x / W);
    recentX.push(x);
    if (recentX.length > 3) recentX.shift();

    rockets.push({
      x0: x + range(-20, 20),
      y0: H * 0.7,
      x1: x,
      y1: H * range(0.1, 0.36),
      t: 0,
      dur: range(0.8, 1.2),
      kind: kind || pickKind(),
      wobble: Math.random() * 6.28,
      trail: [],
    });
  }

  function volley() {
    if (reduceMotion) return;
    const kinds = ["chrysanthemum", "peony", "willow", "double", "ring", "crackle", "chrysanthemum"];
    kinds.forEach((kind, i) => queued.push([clock + 0.15 + i * 0.28 + Math.random() * 0.1, () => launch(kind)]));
  }

  // ── frame loop ─────────────────────────────────────────────────────────────

  function step() {
    clock += STEP;

    if (launching && !reduceMotion && clock >= nextLaunch) {
      launch();
      nextLaunch = clock + range(1, 2.1);
    }
    queued = queued.filter(([time, fn]) => {
      if (clock < time) return true;
      fn();
      return false;
    });

    rockets = rockets.filter(r => {
      r.t += STEP / r.dur;
      const e = 1 - Math.pow(1 - clamp(r.t), 2.2);
      r.x = lerp(r.x0, r.x1, e) + Math.sin(r.t * 14 + r.wobble) * 1.4;
      r.y = lerp(r.y0, r.y1, e);
      r.trail.push(r.x, r.y);
      if (r.trail.length > 24) r.trail.splice(0, 2);
      // A few embers fall away behind the rocket.
      if (Math.random() < 0.6) {
        spark(r.x, r.y, range(-14, 14), range(10, 40), {
          life: range(0.3, 0.6), drag: 0.96, grav: S * 0.12, palette: GOLD, size: 1, trail: 3, bright: 0.7,
        });
      }
      if (r.t >= 1) { burst(r.x, r.y, r.kind); return false; }
      return true;
    });

    particles = particles.filter(p => {
      p.age += STEP;
      if (p.age >= p.life) {
        if (p.crackle) {
          for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = range(20, 70);
            spark(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, {
              life: range(0.25, 0.5), drag: 0.94, grav: S * 0.05, palette: WHITE, size: 1.3, trail: 2,
            });
          }
        }
        return false;
      }
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.grav * STEP;
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      p.trail.push(p.x, p.y);
      if (p.trail.length > p.trailLen * 2) p.trail.splice(0, 2);
      return true;
    });

    flashes = flashes.filter(f => (f.age += STEP) < f.dur);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (sea) drawSea();
    drawStars();
    ctx.globalCompositeOperation = "lighter";

    // Sky light from each burst, strongest at the start and gone within a second.
    flashes.forEach(f => {
      const k = 1 - f.age / f.dur;
      const a = f.strength * k * k;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
      g.addColorStop(0, `rgba(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
    });

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    particles.forEach(p => {
      const life = p.age / p.life;
      const fade = clamp((1 - life) / 0.45);
      const twinkle = life > 0.55 ? 0.65 + 0.35 * Math.sin(p.age * 38 + p.flicker) : 1;
      const alpha = fade * twinkle * p.bright;
      if (alpha <= 0.02) return;

      const shade = life < 0.14 ? p.palette.core : life < 0.62 ? p.palette.edge : p.palette.ember;
      const pts = p.trail;
      const n = pts.length;
      if (n >= 4) {
        ctx.strokeStyle = shadeAt(shade, alpha * 0.4);
        ctx.lineWidth = p.size * 0.8;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < n; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();

        ctx.strokeStyle = shadeAt(shade, alpha);
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(pts[Math.max(0, n - 6)], pts[Math.max(1, n - 5)]);
        ctx.lineTo(pts[n - 4 < 0 ? 0 : n - 4], pts[n - 3 < 1 ? 1 : n - 3]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      if (life < 0.5) {
        const r = p.size * 5;
        ctx.globalAlpha = alpha * 0.45;
        ctx.drawImage(glow, p.x - r, p.y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
    });

    rockets.forEach(r => {
      const pts = r.trail;
      for (let i = 2; i < pts.length; i += 2) {
        const k = i / pts.length;
        ctx.strokeStyle = shadeAt(GOLD.edge, k * 0.7);
        ctx.lineWidth = 0.6 + k * 1.2;
        ctx.beginPath();
        ctx.moveTo(pts[i - 2], pts[i - 1]);
        ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glow, r.x - 7, r.y - 7, 14, 14);
      ctx.globalAlpha = 1;
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 4) { step(); acc -= STEP; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  // Run only while the footer is on screen.
  function run(on) {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  // Start (or stop) sending up new rockets. Anything already in the air finishes.
  function setLaunching(on) {
    if (on === launching) return;
    launching = on;
    if (on) nextLaunch = clock + 0.5;
  }

  function reset() {
    particles = [];
    rockets = [];
    flashes = [];
    queued = [];
    recentX = [];
    if (!running) paintStill();
  }

  function useSea(on) {
    sea = on;
    if (!running) paintStill();
  }

  // How bright the sky is from fireworks right now (0..1) and what colour it is: the average colour
  // of the bursts currently glowing, weighted by how bright each still is.
  function light() {
    let sum = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    flashes.forEach(f => {
      if (f.dur < 0.5) return;
      const k = 1 - f.age / f.dur;
      const w = f.strength * k * k;
      sum += w;
      r += f.rgb[0] * w;
      g += f.rgb[1] * w;
      b += f.rgb[2] * w;
    });
    if (sum < 0.0001) return { amount: 0, rgb: [255, 255, 255] };
    return { amount: Math.min(1, sum * 3.5), rgb: [Math.round(r / sum), Math.round(g / sum), Math.round(b / sum)] };
  }

  return { resize, run, setLaunching, volley, reset, useSea, light };
}
