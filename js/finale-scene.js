// Canvas scene for the footer: cut-out figures built from scraps of project images.
// The scraps lift off and become tiles of a shape beside the beach (a triforce, buildings, a heart, ...)
// that keeps changing, while a quieter pair sits on the ground.

import { seededRandom } from "./rng.js";
import { SHAPES, sampleShape, fitCount } from "./finale-shapes.js";

const FOLDER = "resources/footer/";
const FIGURES = ["denji", "tv", "me", "crest"];
const MIN_SCRAPS = 110;   // even with few images the city should look full
const MAX_SCRAPS = 320;
const SCRAP_EDGE = 320;   // images are shrunk to this on load so hundreds of them stay light
const PAIR_DIM = 0.5;
const MAX_PIXELS = 4.2e6;
const FIG_PAD = 24;
const HOLD_MS = 6500;     // how long each shape stays put
const MORPH_MS = 2400;    // how long the tiles take to move on to the next one    // how far the seated pair is darkened into the night

const clamp = (v, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { const c = clamp(t); return c * c * (3 - 2 * c); };
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function loadImage(src, maxEdge) {
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const k = maxEdge ? Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
      if (k >= 1) return resolve(img);
      // Keep a small copy instead of the full-size picture; it only ever appears as a tiny fragment.
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(img.naturalWidth * k));
      small.height = Math.max(1, Math.round(img.naturalHeight * k));
      small.getContext("2d").drawImage(img, 0, 0, small.width, small.height);
      small.naturalWidth = small.width;
      small.naturalHeight = small.height;
      resolve(small);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// The figures all live in one picture (made by a script in temp/); each is cut back out into its own canvas.
async function loadFigures() {
  try {
    const [res, sheet] = await Promise.all([fetch(`${FOLDER}figures.json`), loadImage(`${FOLDER}figures.webp`)]);
    if (!res.ok || !sheet) return null;
    const placed = await res.json();
    const out = {};
    for (const [name, r] of Object.entries(placed)) {
      const c = makeCanvas(r.w, r.h);
      c.getContext("2d").drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      c.naturalWidth = r.w;
      c.naturalHeight = r.h;
      out[name] = c;
    }
    return out;
  } catch {
    return null;
  }
}

// groundSrc is optional: a transparent strip along the bottom (a beach, a shoreline) the pair sits on.
export async function loadAssets(scrapSources, groundSrc) {
  const names = [...FIGURES.flatMap(n => [n, `${n}-ink`]), "pair"];
  const [figures, scraps, ground] = await Promise.all([
    loadFigures(),
    Promise.all(scrapSources.map(src => loadImage(src, SCRAP_EDGE))),
    groundSrc ? loadImage(groundSrc) : null,
  ]);
  if (!figures || names.some(n => !figures[n])) return null;
  return { figures, scraps: scraps.filter(Boolean), ground };
}

function aspect(img) {
  return img.naturalWidth / img.naturalHeight;
}

// Where everything sits for a given stage size. Fractions of the stage, so it scales with the window.
function layout(W, H, figures, ground) {
  const landscape = W >= H * 0.9;
  const box = (img, h, cx, cy) => {
    const w = h * aspect(img);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };

  // The ground strip along the bottom, and the line things stand on.
  const gh = ground ? Math.min((W * ground.naturalHeight) / ground.naturalWidth, H * 0.3) : H * 0.22;
  const gTop = H - gh;
  const gy = gTop + gh * 0.4;

  const place = { ground: { top: gTop, h: gh, y: gy } };
  if (landscape) {
    // Relative heights; the whole row is scaled to fit the stage.
    const rel = { denji: 0.85, tv: 0.95, me: 1, crest: 0.6 };
    const gap = 0.03 * W;
    const relWidth = FIGURES.reduce((sum, n) => sum + rel[n] * aspect(figures[n]), 0);
    const k = Math.min(0.6 * H, (W - gap * (FIGURES.length + 1)) / relWidth);
    let x = (W - relWidth * k - gap * (FIGURES.length - 1)) / 2;
    FIGURES.forEach(n => {
      const h = rel[n] * k;
      const w = h * aspect(figures[n]);
      place[n] = box(figures[n], h, x + w / 2, 0.5 * H);
      x += w + gap;
    });
    const ph = Math.min(0.38 * H, (0.27 * W) / aspect(figures.pair));
    place.pair = box(figures.pair, ph, 0.21 * W, gy + ph * 0.03 - ph / 2);
    place.city = { x0: 0.63 * W, w: 0.355 * W, gy, h: Math.min(0.6 * H, gy - 0.14 * H) };
  } else {
    place.denji = box(figures.denji, (0.92 * W) / aspect(figures.denji), 0.5 * W, 0.24 * H);
    place.tv = box(figures.tv, 0.32 * H, 0.27 * W, 0.54 * H);
    place.me = box(figures.me, 0.3 * H, 0.73 * W, 0.54 * H);
    place.crest = box(figures.crest, (0.42 * W) / aspect(figures.crest), 0.5 * W, 0.72 * H);
    const ph = Math.min(0.3 * H, (0.52 * W) / aspect(figures.pair));
    place.pair = box(figures.pair, ph, 0.29 * W, gy + ph * 0.03 - ph / 2);
    place.city = { x0: 0.5 * W, w: 0.475 * W, gy, h: Math.min(0.5 * H, gy - 0.34 * H) };
  }
  return { place };
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// A photo scrap with its paper border and soft shadow baked into one small bitmap.
function makeScrap(img, longEdge, dpr, rand) {
  const ratio = clamp(aspect(img), 0.88, 1.14);
  const w = ratio >= 1 ? longEdge : longEdge * ratio;
  const h = ratio >= 1 ? longEdge / ratio : longEdge;
  const frame = Math.max(2.5, longEdge * 0.05);
  const pad = 10;
  const bw = w + frame * 2;
  const bh = h + frame * 2;

  const bmp = makeCanvas((bw + pad * 2) * dpr, (bh + pad * 2) * dpr);
  const ctx = bmp.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.shadowColor = "rgba(40, 28, 10, 0.4)";
  ctx.shadowBlur = 7 * dpr;
  ctx.shadowOffsetX = 1.5 * dpr;
  ctx.shadowOffsetY = 3 * dpr;
  ctx.fillStyle = "#fbf7ec";
  ctx.fillRect(pad, pad, bw, bh);
  ctx.shadowColor = "transparent";

  // Crop a random window of the source so repeated images don't look identical.
  const zoom = 1 + rand() * 0.9;
  let sw = img.naturalWidth / zoom;
  let sh = sw / (w / h);
  if (sh > img.naturalHeight) { sh = img.naturalHeight / zoom; sw = sh * (w / h); }
  sw = Math.min(sw, img.naturalWidth);
  sh = Math.min(sh, img.naturalHeight);
  const sx = rand() * (img.naturalWidth - sw);
  const sy = rand() * (img.naturalHeight - sh);
  ctx.drawImage(img, sx, sy, sw, sh, pad + frame, pad + frame, w, h);

  return { bmp, drawW: bw + pad * 2, drawH: bh + pad * 2, bodyW: bw, bodyH: bh };
}

// A night beach, drawn in code until a real ground image is named in resources/footer/fragments.json:
// lapping water and foam along the edge, wet then dry sand, pebbles, footprints and a few tufts of grass.
function drawGround(g, W, H, top, rand) {
  const gh = H - top;
  const edgeY = x => top + Math.sin(x * 0.009 + 0.6) * 3.2 + Math.sin(x * 0.031 + 1.3) * 1.6 + Math.sin(x * 0.083) * 0.7;
  const line = (offset, wobble, phase) => {
    g.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = edgeY(x) - offset + Math.sin(x * 0.045 + phase) * wobble;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };

  // Shallow water sliding up the shore, lit faintly by the sky.
  const water = g.createLinearGradient(0, top - 24, 0, top + 2);
  water.addColorStop(0, "rgba(118, 138, 176, 0)");
  water.addColorStop(1, "rgba(118, 138, 176, 0.2)");
  g.fillStyle = water;
  g.beginPath();
  g.moveTo(0, top + 2);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, edgeY(x) - 18 - Math.sin(x * 0.02 + 2) * 5);
  g.lineTo(W, top + 8);
  g.lineTo(0, top + 8);
  g.closePath();
  g.fill();

  // Sand: damp and glossy at the waterline, drier and darker towards the viewer.
  const sand = g.createLinearGradient(0, top, 0, H);
  sand.addColorStop(0, "#2d3340");
  sand.addColorStop(0.16, "#1f2430");
  sand.addColorStop(0.6, "#12151c");
  sand.addColorStop(1, "#090a0e");
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, edgeY(x));
  g.lineTo(W, H);
  g.closePath();
  g.fillStyle = sand;
  g.fill();

  // Foam: a few broken lines of white along the water's edge.
  [[2, 1.6, 0, 0.42, 1.8], [8, 2.6, 1.7, 0.24, 1.3], [15, 3.4, 3.1, 0.13, 1]].forEach(([offset, wobble, phase, alpha, width]) => {
    g.strokeStyle = `rgba(200, 214, 238, ${alpha})`;
    g.lineWidth = width;
    g.setLineDash([30 + rand() * 40, 8 + rand() * 18, 6 + rand() * 14, 12 + rand() * 20]);
    line(offset, wobble, phase);
    g.stroke();
  });
  g.setLineDash([]);

  // Grain.
  for (let i = 0; i < W * 0.2; i++) {
    g.fillStyle = `rgba(190, 200, 228, ${(0.03 + rand() * 0.09).toFixed(3)})`;
    g.fillRect(rand() * W, top + 4 + rand() * (gh - 4), 1 + rand() * 1.6, 1);
  }

}

export function createScene(canvas, assets, events = {}) {
  const ctx = canvas.getContext("2d");
  let rand = seededRandom("finale-scene");
  let W = 0;
  let H = 0;
  let dpr = 1;
  let ready = false;
  let token = 0;            // bumped by every resize, so an out-of-date build can stop itself
  let figArt = [];          // one picture per cut-out figure, so each can move on its own
  let poses = [];
  let shiver = 0;
  let groundLayer = null;
  let pairArt = null;
  let pairShadow = null;
  let scraps = [];
  let groundTop = 0;
  let clock = 0;
  let paperMoved = 0;
  let paperLanded = 0;
  let cache = null;         // the tiles of the current shape, drawn once while they hold still

  function drawGroundLayer(place) {
    groundLayer = makeCanvas(W * dpr, H * dpr);
    const g = groundLayer.getContext("2d");
    g.scale(dpr, dpr);
    if (assets.ground) g.drawImage(assets.ground, 0, place.ground.top, W, place.ground.h);
    else {
      const pair = place.pair;
      drawGround(g, W, H, place.ground.top, seededRandom("finale-ground"));
    }
  }

  function drawFigureLayers(place) {
    figArt = FIGURES.map(n => {
      const b = place[n];
      const c = makeCanvas((b.w + FIG_PAD * 2) * dpr, (b.h + FIG_PAD * 2) * dpr);
      const g = c.getContext("2d");
      g.scale(dpr, dpr);
      g.shadowColor = "rgba(255, 176, 120, 0.22)";
      g.shadowBlur = 16 * dpr;
      g.drawImage(assets.figures[n], FIG_PAD, FIG_PAD, b.w, b.h);
      return { canvas: c, box: b };
    });

    // The seated pair is lit by the night, not by the page: a dark cool version always, and the
    // same picture warmed up and faded in whenever a firework goes off.
    const pb = place.pair;
    const tinted = (tint, fadeDown) => {
      const c = makeCanvas(pb.w * dpr, pb.h * dpr);
      const g = c.getContext("2d");
      g.drawImage(assets.figures.pair, 0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = tint;
      g.fillRect(0, 0, c.width, c.height);
      if (fadeDown) {
        // The fireworks are above them, so only their heads and shoulders catch the light.
        g.globalCompositeOperation = "destination-in";
        const fade = g.createLinearGradient(0, 0, 0, c.height);
        fade.addColorStop(0, "rgba(0, 0, 0, 1)");
        fade.addColorStop(0.3, "rgba(0, 0, 0, 0.75)");
        fade.addColorStop(0.62, "rgba(0, 0, 0, 0)");
        g.fillStyle = fade;
        g.fillRect(0, 0, c.width, c.height);
      }
      return c;
    };
    // The lit layer is the plain picture with a fade towards the feet. Each frame it is multiplied by the
    // colour of whichever firework is glowing, so the whites take on that colour and the blacks stay black.
    const litBase = tinted("rgba(0, 0, 0, 0)", true);
    const litTmp = makeCanvas(litBase.width, litBase.height);
    // Their shadow on the sand: the same outline pressed flat and blurred, plus a darker patch where
    // they actually touch the ground.
    const sp = 22;
    const sh = pb.h * 0.2;
    const flat = makeCanvas(pb.w * dpr, sh * dpr);
    const fg = flat.getContext("2d");
    fg.translate(0, flat.height);
    fg.scale(1, -0.2);
    fg.drawImage(assets.figures.pair, 0, 0, flat.width, pb.h * dpr);
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.globalCompositeOperation = "source-in";
    fg.fillStyle = "#000";
    fg.fillRect(0, 0, flat.width, flat.height);
    const soft = makeCanvas((pb.w + sp * 2) * dpr, (sh + sp * 2) * dpr);
    const sg = soft.getContext("2d");
    sg.shadowColor = "rgba(12, 8, 18, 0.55)";
    sg.shadowBlur = 9 * dpr;
    sg.shadowOffsetX = 10000;
    sg.drawImage(flat, sp * dpr - 10000, sp * dpr);
    pairShadow = { canvas: soft, pad: sp, h: sh };
    pairArt = { box: pb, dim: tinted(`rgba(8, 12, 24, ${PAIR_DIM})`, false), litBase, litTmp };
  }

  function inkMasks(place) {
    // Full-resolution mask for clipping, and a 1x copy for sampling where scraps may go.
    const full = makeCanvas(W * dpr, H * dpr);
    const small = makeCanvas(W, H);
    const fctx = full.getContext("2d");
    const sctx = small.getContext("2d");
    fctx.scale(dpr, dpr);
    FIGURES.forEach(n => {
      const b = place[n];
      const ink = assets.figures[`${n}-ink`];
      fctx.drawImage(ink, b.x, b.y, b.w, b.h);
      sctx.drawImage(ink, b.x, b.y, b.w, b.h);
    });
    return { full, data: sctx.getImageData(0, 0, W, H).data };
  }

  // The same scrap tinted night-blue, laid over the bright one to dim it once it's part of a shape.
  function makeDim(s) {
    const dim = makeCanvas(s.bmp.width, s.bmp.height);
    const dctx = dim.getContext("2d");
    dctx.drawImage(s.bmp, 0, 0);
    dctx.globalCompositeOperation = "source-atop";
    dctx.fillStyle = "rgb(9, 13, 23)";
    dctx.fillRect(0, 0, dim.width, dim.height);
    return dim;
  }

  // The part of a scrap that sits inside the figure's ink, cut out once so a scrap can start
  // life as a clipped piece of the figure and only "come loose" when it lifts off.
  function cutPiece(s, maskFull) {
    const piece = makeCanvas(s.bmp.width, s.bmp.height);
    const pctx = piece.getContext("2d");
    pctx.drawImage(s.bmp, 0, 0);
    pctx.globalCompositeOperation = "destination-in";
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.translate(s.drawW / 2, s.drawH / 2);
    pctx.rotate(-s.rot);
    pctx.translate(-s.cx, -s.cy);
    pctx.drawImage(maskFull, 0, 0, W, H);
    return piece;
  }

  // The expensive set-up runs in short slices so the page keeps scrolling while it happens.
  // step() returns false if a newer resize has started and this one should give up.
  function makeStepper(mine) {
    let started = performance.now();
    return async () => {
      if (performance.now() - started > 10) {
        await new Promise(resolve => setTimeout(resolve, 0));
        started = performance.now();
      }
      return mine === token;
    };
  }

  async function buildScraps(place, maskData, step) {
    const list = [];
    const wanted = fitCount(clamp(assets.scraps.length, MIN_SCRAPS, MAX_SCRAPS), MAX_SCRAPS);
    // More images means smaller fragments in the figures too.
    const longEdge = clamp(W * 0.055, 52, 104) * clamp(Math.sqrt(MIN_SCRAPS / wanted), 0.45, 1);
    const minDist = longEdge * 0.42;
    const bounds = FIGURES.map(n => place[n]);

    // A shuffled order, so if there are ever more images than room, the ones left out vary.
    const order = assets.scraps.map((_, i) => i).sort(() => rand() - 0.5);

    // If the figures run out of room, squeeze the scraps a little closer until every one has a place; the
    // shapes (the triforce especially) need the full number to come out whole.
    for (const squeeze of [1, 0.85, 0.7, 0.55, 0.4]) {
    const gapMin = minDist * squeeze;
    for (let tries = 0; tries < wanted * 80 && list.length < wanted; tries++) {
      const bi = Math.floor(rand() * bounds.length);
      const b = bounds[bi];
      const x = b.x + rand() * b.w;
      const y = b.y + rand() * b.h;
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      if (maskData[(iy * W + ix) * 4 + 3] < 128) continue;
      if (list.some(s => Math.hypot(s.cx - x, s.cy - y) < gapMin)) continue;

      const img = assets.scraps[order[list.length % order.length]];
      const size = longEdge * (0.8 + rand() * 0.5);
      const made = makeScrap(img, size, dpr, rand);
      list.push({
        ...made,
        cx: x,
        cy: y,
        fig: bi,
        state: 0,
        rot: (rand() - 0.5) * 0.9,
        trot: (rand() - 0.5) * 0.03,
        glintEvery: 9 * (0.94 + rand() * 0.12),   // seconds for one round of dim, then lit
        glintAt: (list.length * 0.6180339887) % 1,  // spread evenly, so the same share is always dim
        delay: rand(),
        arc: 0.4 + rand() * 0.9,
        spin: (rand() - 0.5) * 1.4,
      });
      if (!(await step())) return null;
    }
    if (list.length >= wanted) break;
    }

    // Every shape gets a cell for every scrap. Each scrap is matched to the cell in the same sweep
    // direction, so when the shape changes the tiles flow across rather than scatter.
    list.forEach(sc => { sc.slots = []; });
    for (let k = 0; k < SHAPES.length; k++) {
      const { cells, tile } = sampleShape(SHAPES[k], place.city, list.length, rand);
      const angle = k * 0.9;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const key = (x, y) => x * dx + y * dy;
      const from = sc => (k === 0 ? { x: sc.cx, y: sc.cy } : sc.slots[k - 1]);
      const sorted = [...list].sort((a, b) => key(from(a).x, from(a).y) - key(from(b).x, from(b).y));
      const ordered = [...cells].sort((a, b) => key(a.x, a.y) - key(b.x, b.y));
      sorted.forEach((sc, i) => {
        const cell = ordered[i % ordered.length];
        sc.slots[k] = { x: cell.x, y: cell.y, scale: cell.size / Math.max(sc.bodyW, sc.bodyH) };
      });
      if (!(await step())) return null;
    }
    return list;
  }

  // The cut-outs are alive: a slow sway and breath, each out of step with the others, and a shudder
  // while their scraps are tearing loose. Scraps still attached follow the same pose.
  function updatePoses(clock) {
    poses = figArt.map(({ box }, i) => {
      const ph = i * 1.7;
      return {
        px: box.x + box.w / 2,
        py: box.y + box.h,
        rot: Math.sin(clock * 1.1 + ph) * 0.018 + shiver * Math.sin(clock * 38 + ph) * 0.012,
        dy: Math.sin(clock * 1.7 + ph * 1.3) * 2.5 + shiver * Math.sin(clock * 47 + ph) * 1.8,
        sc: 1 + Math.sin(clock * 1.7 + ph) * 0.012,
      };
    });
  }

  function posed(i, x, y) {
    const q = poses[i];
    const dx = x - q.px;
    const dy = y - q.py;
    const cs = Math.cos(q.rot);
    const sn = Math.sin(q.rot);
    return { x: q.px + (dx * cs - dy * sn) * q.sc, y: q.py + (dx * sn + dy * cs) * q.sc + q.dy };
  }

  function drawScrap(c, s, bitmap, x, y, rot, scale = 1) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    const w = s.drawW * scale;
    const h = s.drawH * scale;
    c.drawImage(bitmap, -w / 2, -h / 2, w, h);
    c.restore();
  }

  async function resize(width, height, ratio) {
    const mine = ++token;
    const step = makeStepper(mine);
    ready = false;
    cache = null;

    W = Math.round(width);
    H = Math.round(height);
    // Keep every full-stage layer to a sensible number of pixels, so big screens don't use huge amounts of memory.
    dpr = clamp(Math.min(ratio || 1, 2, Math.sqrt(MAX_PIXELS / (W * H))), 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    rand = seededRandom("finale-scene");

    const { place } = layout(W, H, assets.figures, assets.ground);
    groundTop = place.ground.top;
    drawGroundLayer(place);
    drawFigureLayers(place);
    let masks = inkMasks(place);
    if (!(await step())) return false;

    const list = await buildScraps(place, masks.data, step);
    if (!list) return false;
    for (const sc of list) {
      sc.piece = cutPiece(sc, masks.full);
      sc.dim = makeDim(sc);
      if (!(await step())) return false;
    }
    masks = null;   // only needed to cut the pieces

    const c = place.city;
    const pad = 70;
    scraps = list;
    cache = { box: { x: c.x0 - pad, y: c.gy - c.h - pad, w: c.w + pad * 2, h: c.h + pad * 1.5 }, shape: -1, canvas: null };
    ready = true;
    return true;
  }

  // Draws every scrap for the given moment. t is how far the figures have turned into tiles (0..1),
  // from/to are shape numbers and m is how far through changing from one to the other.
  function drawTiles(c, t, from, to, m, count, dimAll = false) {
    scraps.forEach(s => {
      const ti = clamp((t - s.delay * 0.55) / (1 - s.delay * 0.55));
      const q = poses[s.fig];
      const at = q ? posed(s.fig, s.cx, s.cy) : { x: s.cx, y: s.cy };
      const tilt = q ? q.rot : 0;
      if (ti <= 0) {
        // A scrap about to tear free trembles first.
        const lead = s.delay * 0.55 - t;
        const tremble = t > 0 && lead < 0.07 ? (1 - lead / 0.07) * 1.6 : 0;
        const jx = tremble * Math.sin(clock * 61 + s.delay * 40);
        const jy = tremble * Math.cos(clock * 53 + s.delay * 30);
        c.globalAlpha = 1;
        drawScrap(c, s, s.piece, at.x + jx, at.y + jy, s.rot + tilt + jx * 0.02);
        return;
      }
      let moving = false;
      let x;
      let y;
      let rot;
      let scale;
      let lift;
      if (ti < 1) {
        // Flying from the figure to its place in the first shape.
        const slot = s.slots[0];
        const e = easeInOut(ti);
        lift = Math.sin(Math.PI * e);
        x = lerp(at.x, slot.x, e);
        y = lerp(at.y, slot.y, e) - lift * s.arc * H * 0.12;
        rot = lerp(s.rot + tilt, s.trot, e) + lift * s.spin;
        moving = true;
        scale = lerp(1, slot.scale, e);
      } else {
        // Settled in a shape, or on its way to the next one.
        const a = s.slots[from];
        const b = s.slots[to];
        const e = easeInOut(clamp((m - s.delay * 0.4) / 0.6));
        lift = Math.sin(Math.PI * e);
        x = lerp(a.x, b.x, e);
        y = lerp(a.y, b.y, e) - lift * s.arc * H * 0.05;
        rot = s.trot + lift * s.spin * 0.6;
        scale = lerp(a.scale, b.scale, e);
        moving = e > 0 && e < 1;
      }
      if (count) {
        const now = moving ? 1 : 2;
        if (now !== s.state) {
          if (now === 1) paperMoved++;
          else paperLanded++;
          s.state = now;
        }
      }

      // At first only the clipped piece moves. The rest of the photo is revealed as it comes away.
      const loose = clamp(ti / 0.12);
      if (loose < 1) {
        c.globalAlpha = 1;
        drawScrap(c, s, s.piece, x, y, rot, scale);
      }
      c.globalAlpha = loose;
      drawScrap(c, s, s.bmp, x, y, rot, scale);

      // Once it's a tile it goes dark (brighter while it's moving). Settled tiles catch the light now and
      // then; see glint().
      const night = smooth((ti - 0.6) / 0.4) * 0.5 * (1 - lift * 0.7) * (dimAll ? 1 : 1 - litLevel(s));
      if (night > 0.01) {
        c.globalAlpha = night;
        drawScrap(c, s, s.dim, x, y, rot, scale);
      }
    });
    c.globalAlpha = 1;
  }

  // While the tiles hold still they are drawn once into a small canvas and just copied each frame.
  function drawSettled(shape) {
    const { box } = cache;
    if (cache.shape !== shape) {
      if (!cache.canvas) cache.canvas = makeCanvas(box.w * dpr, box.h * dpr);
      const c = cache.canvas.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
      c.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
      drawTiles(c, 1, shape, shape, 0, false, true);
      cache.shape = shape;
    }
    ctx.drawImage(cache.canvas, box.x, box.y, box.w, box.h);
  }

  // Tiles at rest are lit 70% of the time and dim 30%. Each one runs its own cycle (a spell dim, then lit again),
  // and the cycles are spread evenly so at any moment about 30% of them are dim. A tile that comes back on gives
  // a small four-point glint, and the lit ones shimmer a little.
  const DIM_SHARE = 0.3;
  // How lit a tile is right now: 0 dim, 1 lit, with short fades either side and a slight shimmer while lit.
  function litLevel(s) {
    const u = (clock / s.glintEvery + s.glintAt) % 1;
    let level = 1;
    if (u < 0.04) level = 1 - smooth(u / 0.04);
    else if (u < DIM_SHARE) level = 0;
    else level = smooth((u - DIM_SHARE) / 0.04);
    return level * (0.86 + 0.14 * Math.sin(clock * 2.3 + s.glintAt * 40));
  }
  function glint(shape) {
    scraps.forEach(s => {
      const u = (clock / s.glintEvery + s.glintAt) % 1;
      const level = litLevel(s);
      const a = s.slots[shape];
      if (level > 0.02) {
        ctx.globalAlpha = level;
        drawScrap(ctx, s, s.bmp, a.x, a.y, s.trot, a.scale);
      }
      // The flash as it comes back on.
      const since = (u - DIM_SHARE) / 0.09;
      if (since > 0 && since < 1) {
        const g = Math.sin(Math.PI * since);
        const half = (a.scale * Math.max(s.bodyW, s.bodyH)) / 2;
        const r = half * 0.6 * g;
        const cx = a.x + half * 0.7;
        const cy = a.y - half * 0.7;
        const w = r * 0.16;
        ctx.globalAlpha = Math.min(1, g * 1.3);
        ctx.fillStyle = "#fffbe8";
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + w, cy - w);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx + w, cy + w);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - w, cy + w);
        ctx.lineTo(cx - r, cy);
        ctx.lineTo(cx - w, cy - w);
        ctx.closePath();
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  // p is progress through the footer animation, 0..1. holdMs is how long the first shape has been
  // complete (it drives the changing of shapes) and light is how bright the sky is from fireworks, 0..1.
  function render(p, holdMs = 0, light = { amount: 0, rgb: [255, 255, 255] }) {
    if (!ready) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(groundLayer, 0, 0, W, H);

    // Each burst also washes the sand and the water's edge with its own colour.
    if (light.amount > 0.02) {
      const [r, g, b] = light.rgb;
      const wash = ctx.createLinearGradient(0, groundTop - H * 0.1, 0, H);
      wash.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      wash.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${(0.16 * light.amount).toFixed(3)})`);
      wash.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = wash;
      ctx.fillRect(0, groundTop - H * 0.1, W, H - groundTop + H * 0.1);
      ctx.globalCompositeOperation = "source-over";
    }

    const t = clamp((p - 0.12) / 0.5);
    clock = performance.now() / 1000;
    shiver = smooth(t / 0.25) * (1 - smooth((t - 0.6) / 0.4));
    updatePoses(clock);
    if (events.shake && shiver > 0) events.shake(shiver);
    const stickerAlpha = 1 - smooth((p - 0.5) / 0.16);
    const pairAlpha = smooth((p - 0.6) / 0.18);

    // Which shape the tiles are in, and how far they are into moving to the next one.
    let from = 0;
    let to = 0;
    let m = 0;
    if (holdMs > 0 && SHAPES.length > 1) {
      const cycle = HOLD_MS + MORPH_MS;
      const k = Math.floor(holdMs / cycle);
      const within = holdMs - k * cycle;
      from = k % SHAPES.length;
      to = (k + 1) % SHAPES.length;
      m = within < HOLD_MS ? 0 : (within - HOLD_MS) / MORPH_MS;
    }

    if (stickerAlpha > 0) {
      ctx.globalAlpha = stickerAlpha;
      figArt.forEach(({ canvas: art, box }, i) => {
        const q = poses[i];
        ctx.save();
        ctx.translate(q.px, q.py + q.dy);
        ctx.rotate(q.rot);
        ctx.scale(q.sc, q.sc);
        ctx.drawImage(art, -box.w / 2 - FIG_PAD, -box.h - FIG_PAD, box.w + FIG_PAD * 2, box.h + FIG_PAD * 2);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }

    paperMoved = 0;
    paperLanded = 0;
    if (t >= 1 && m === 0) {
      drawSettled(from);
      glint(from);
      scraps.forEach(sc => { if (sc.state !== 2) { sc.state = 2; paperLanded++; } });
    } else drawTiles(ctx, t, from, to, m, true);
    if ((paperMoved || paperLanded) && events.paper) events.paper(paperMoved, paperLanded);

    if (pairAlpha > 0) {
      const b = pairArt.box;
      ctx.globalAlpha = pairAlpha;
      const feet = b.y + b.h - b.h * 0.035;
      const sw = pairShadow;
      ctx.drawImage(sw.canvas, b.x - sw.pad + b.w * 0.04, feet - sw.pad, b.w + sw.pad * 2, sw.h + sw.pad * 2);
      const patch = ctx.createRadialGradient(b.x + b.w * 0.5, feet, 0, b.x + b.w * 0.5, feet, b.w * 0.5);
      patch.addColorStop(0, "rgba(10, 6, 16, 0.4)");
      patch.addColorStop(1, "rgba(10, 6, 16, 0)");
      ctx.save();
      ctx.translate(0, feet);
      ctx.scale(1, 0.14);
      ctx.translate(0, -feet);
      ctx.fillStyle = patch;
      ctx.fillRect(b.x - b.w * 0.1, feet - b.w * 0.6, b.w * 1.2, b.w * 1.2);
      ctx.restore();
      ctx.drawImage(pairArt.dim, b.x, b.y, b.w, b.h);
      if (light.amount > 0.01) {
        const tg = pairArt.litTmp.getContext("2d");
        const w = pairArt.litTmp.width;
        const h = pairArt.litTmp.height;
        tg.globalCompositeOperation = "source-over";
        tg.clearRect(0, 0, w, h);
        tg.drawImage(pairArt.litBase, 0, 0);
        tg.globalCompositeOperation = "multiply";
        tg.fillStyle = `rgb(${light.rgb[0]}, ${light.rgb[1]}, ${light.rgb[2]})`;
        tg.fillRect(0, 0, w, h);
        tg.globalCompositeOperation = "destination-in";
        tg.drawImage(pairArt.litBase, 0, 0);
        ctx.globalAlpha = pairAlpha * Math.min(light.amount, 1) * 0.95;
        ctx.drawImage(pairArt.litTmp, b.x, b.y, b.w, b.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  return { resize, render, get ready() { return ready; } };
}
