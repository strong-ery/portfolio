import { escapeHtml } from "./dom-utils.js";
import { sfx } from "./finale-sfx.js";
import { seededRandom } from "./rng.js";
import { heroPlacement, placeItems, overlapFractions } from "./collage-layout.js";
import { arrowPath, underlinePaths, starPath } from "./doodles.js";

const EXCERPT_LENGTH = 200;
const MAX_PHOTOS = 6;
const MAX_EXTRAS = 2;
const FRAME = 6;
const HERO_FRAME = 9;
const CAPTION_LINE = 20;
const CAPTION_PAD = 8;
const CAPTION_CHAR_W = 8;
const AUDIO_SIZE = { w: 200, h: 64 };
const DEFAULT_ASPECT = 4 / 3;

const dimensions = new Map();
const pending = new Map();

function loadDimensions(src) {
  if (dimensions.has(src)) return Promise.resolve();
  if (!pending.has(src)) {
    pending.set(src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => { dimensions.set(src, { w: img.naturalWidth, h: img.naturalHeight }); resolve(); };
      img.onerror = () => { dimensions.set(src, { w: 4, h: 3 }); resolve(); };
      img.src = src;
    }));
  }
  return pending.get(src);
}

function aspectOf(src) {
  const d = dimensions.get(src);
  return d ? d.w / d.h : DEFAULT_ASPECT;
}

const f = n => n.toFixed(1);

function excerpt(desc) {
  if (!desc) return "";
  const text = desc
    .split("\n")
    .filter(line => line.trim() && !line.startsWith("# "))
    .join(" ");
  return text.length > EXCERPT_LENGTH ? text.slice(0, EXCERPT_LENGTH).trimEnd() + "…" : text;
}

function collectScraps(p) {
  const photos = [];
  const extras = [];
  (p.media || []).forEach(m => {
    if (m.type === "image" && m.src) photos.push({ kind: "photo", src: m.src, caption: m.caption || "" });
    else if (m.type === "group") (m.images || []).forEach(img => img.src && photos.push({ kind: "photo", src: img.src, caption: img.caption || "" }));
    else if (m.type === "audio" && m.src) extras.push({ kind: "audio", label: m.caption || "audio" });
    else if (m.type === "youtube" && m.id) extras.push({ kind: "video", src: `https://img.youtube.com/vi/${m.id}/hqdefault.jpg`, caption: "" });
  });

  const unique = photos.filter((ph, i) => ph.src !== p.thumb && photos.findIndex(x => x.src === ph.src) === i);
  const step = unique.length / MAX_PHOTOS;
  const picked = unique.length <= MAX_PHOTOS
    ? unique
    : Array.from({ length: MAX_PHOTOS }, (_, i) => unique[Math.floor(i * step)]);

  return [...picked, ...extras.slice(0, MAX_EXTRAS)];
}

function sizeScraps(scraps, W, H, rand) {
  const share = Math.min(0.05, Math.max(0.03, 0.2 / Math.max(scraps.length, 1)));
  return scraps.map(s => {
    if (s.kind === "audio") return { ...s, ...AUDIO_SIZE, rot: (rand() - 0.5) * 10, tuck: 0.15 };

    const aspect = aspectOf(s.src);
    const area = W * H * share * (0.85 + rand() * 0.3);
    const w0 = Math.max(Math.min(Math.sqrt(area * aspect), W * 0.34), 90);

    // Captions wrap onto up to two lines; anything longer is left off rather than cut mid-word.
    const lines = s.caption ? Math.ceil(s.caption.length / ((w0 - 2 * FRAME - 4) / CAPTION_CHAR_W)) : 0;
    const caption = lines > 0 && lines <= 2 ? lines * CAPTION_LINE + CAPTION_PAD : 0;

    const w = Math.max(Math.min(w0, (H * 0.3 - 2 * FRAME - caption) * aspect + 2 * FRAME), 90);
    const h = (w - 2 * FRAME) / aspect + 2 * FRAME + caption;
    return { ...s, w, h, aspect, hasCaption: caption > 0, rot: (rand() - 0.5) * 2 * (h > w ? 6 : 9), tuck: caption ? 0 : 0.1, avoid: caption ? 10 : 4 };
  }).sort((a, b) => b.w * b.h - a.w * a.h);
}

function scrapHtml(s, cx, cy, i, tape) {
  const style = `left:${f(cx - s.w / 2)}px;top:${f(cy - s.h / 2)}px;width:${f(s.w)}px;height:${f(s.h)}px;--rot:${f(s.rot)}deg;--i:${i}`;
  const tapeClass = tape ? " scrap--tape" : "";

  if (s.kind === "audio") {
    return `<div class="scrap scrap--audio${tapeClass}" style="${style}"><span class="scrap-audio"><span class="scrap-audio-icon">♪</span>${escapeHtml(s.label)}</span></div>`;
  }

  const d = dimensions.get(s.src) || { w: 4, h: 3 };
  const play = s.kind === "video" ? `<span class="scrap-play">▶</span>` : "";
  const caption = s.hasCaption ? `<span class="scrap-caption">${escapeHtml(s.caption)}</span>` : "";
  return `<div class="scrap scrap--${s.kind}${tapeClass}" style="${style}"><div class="scrap-photo"><img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.caption || "")}" width="${d.w}" height="${d.h}" decoding="async" />${play}</div>${caption}</div>`;
}

function heroHtml(p, hero, i) {
  const style = `left:${f(hero.cx - hero.w / 2)}px;top:${f(hero.cy - hero.h / 2)}px;width:${f(hero.w)}px;--rot:${f(hero.rot)}deg;--i:${i}`;
  const d = p.thumb ? dimensions.get(p.thumb) : null;
  const inner = p.thumb
    ? `<img src="${escapeHtml(p.thumb)}" alt="${escapeHtml(p.title)}" width="${d.w}" height="${d.h}" />`
    : `<span class="preview-placeholder">${escapeHtml(p.title.slice(0, 4))}</span>`;
  return `<div class="scrap scrap--hero scrap--tape" style="${style}"><div class="preview-thumb" style="aspect-ratio:${f(hero.aspect)}">${inner}</div></div>`;
}

function noteHtml(text, cx, cy, rot, i, size) {
  return `<span class="scribble scribble--${size}" style="left:${f(cx)}px;top:${f(cy)}px;--rot:${f(rot)}deg;--i:${i}">${escapeHtml(text)}</span>`;
}

// Fallback margin notes for projects without their own `note`, so the page never labels things like a form.
const TAG_NOTES = {
  shader: "shaders!! :D",
  simulation: "sim stuff!",
  "3d": "so much 3D",
  "2d": "2D!",
  unity: "made in unity",
  art: "art time",
  blender: "blender <3",
  modding: "modding!",
  multiplayer: "w/ friends!",
  tool: "made a tool!",
  irl: "real life!",
  "vr/xr": "VR!!",
};

function tagNote(p, rand) {
  const options = (p.tags || []).map(t => TAG_NOTES[t.toLowerCase()]).filter(Boolean);
  return options.length ? options[Math.floor(rand() * options.length)] : "";
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function paintCollage(p, scraps, animate) {
  const collage = document.querySelector(".collage");
  if (!collage) return;
  const W = collage.clientWidth;
  const H = collage.clientHeight;
  if (!W || !H) return;

  const rand = seededRandom(p.id);
  const heroAspect = p.thumb ? aspectOf(p.thumb) : DEFAULT_ASPECT;
  const hero = {
    ...heroPlacement(W, H, heroAspect),
    rot: (rand() - 0.5) * 3,
    aspect: heroAspect,
  };
  hero.w += 2 * HERO_FRAME;
  hero.h += 2 * HERO_FRAME;

  const specs = sizeScraps(scraps, W, H, rand);

  // The year is a date scrawled next to the photo; `note` is an optional remark from the manifest.
  const yearText = String(p.year);
  const noteText = (p.note || "").trim() || tagNote(p, rand);
  const notes = [
    { text: yearText, size: "lg", w: yearText.length * 14 + 16, h: 36, rot: (rand() - 0.5) * 10, tuck: 0, avoid: 12 },
  ];
  if (noteText) {
    notes.push({ text: noteText, size: "md", w: noteText.length * 10.5 + 16, h: 30, rot: (rand() - 0.5) * 8, tuck: 0, avoid: 12 });
  }

  // Placement boxes are padded so handwriting keeps clear of photo edges and the tape that overhangs them.
  const padded = o => ({ ...o, w: o.w + 20, h: o.h + 26 });
  const run = () => placeItems({
    W,
    H,
    hero: padded(hero),
    items: [...specs.map(padded), ...notes.map(n => ({ ...n, w: n.w + 12, h: n.h + 18 }))],
    rand,
  });

  // If the panel is too small to hold everything cleanly, leave the most-covered photo out and try again.
  let centres = run();
  while (specs.length > 3) {
    const covered = overlapFractions(hero, specs, centres.slice(0, specs.length));
    const worst = covered.indexOf(Math.max(...covered));
    if (covered[worst] < 0.12) break;
    specs.splice(worst, 1);
    centres = run();
  }
  const scrapCentres = centres.slice(0, specs.length);
  const [yearC, noteC] = centres.slice(specs.length);

  let order = 0;
  const html = [];
  specs.forEach((s, i) => html.push(scrapHtml(s, scrapCentres[i].cx, scrapCentres[i].cy, order++, rand() > 0.45)));
  html.push(heroHtml(p, hero, order++));
  html.push(noteHtml(notes[0].text, yearC.cx, yearC.cy, notes[0].rot, order++, "lg"));
  if (noteC) html.push(noteHtml(notes[1].text, noteC.cx, noteC.cy, notes[1].rot, order++, "md"));

  const paths = [];
  let delay = (order + 4) * 45;
  const overPaths = [];
  const addPath = (d, colour, over = false) => {
    (over ? overPaths : paths).push(`<path class="doodle doodle--${colour}" pathLength="1" style="--delay:${delay}ms" d="${d}" />`);
    delay += 130;
  };

  // Point at the hero photo from the year.
  const rx = notes[0].w / 2 + 6;
  const ry = notes[0].h / 2 + 4;
  const dx = hero.cx - yearC.cx;
  const dy = hero.cy - yearC.cy;
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist;
  const uy = dy / dist;
  const toHeroEdge = Math.min((hero.w / 2) / Math.max(Math.abs(ux), 1e-6), (hero.h / 2) / Math.max(Math.abs(uy), 1e-6));
  const startGap = 1 / Math.hypot(ux / rx, uy / ry) + 6;
  const arrowLen = Math.min(70, dist - toHeroEdge - startGap - 8);
  // Skip the arrow if it would be drawn across another photo.
  const crossesScrap = len => [0.25, 0.5, 0.75, 1].some(t => {
    const x = yearC.cx + ux * (startGap + len * t);
    const y = yearC.cy + uy * (startGap + len * t);
    return specs.some((s, i) => Math.abs(x - scrapCentres[i].cx) < s.w / 2 + 4 && Math.abs(y - scrapCentres[i].cy) < s.h / 2 + 4);
  });
  if (arrowLen > 22 && !crossesScrap(arrowLen)) {
    const sx = yearC.cx + ux * startGap;
    const sy = yearC.cy + uy * startGap;
    addPath(arrowPath(rand, sx, sy, sx + ux * arrowLen, sy + uy * arrowLen), "ink");
  }

  // Underline the year like a date jotted on the back of a print.
  underlinePaths(rand, yearC.cx - notes[0].w / 2 + 6, yearC.cy + notes[0].h / 2 - 4, notes[0].w - 12)
    .forEach(d => addPath(d, "ink"));

  // A couple of stars on the photos.
  const photos = specs.map((s, i) => ({ ...s, ...scrapCentres[i] })).filter(s => s.kind !== "audio");
  const corner = (s, sx, sy) => [
    clamp(s.cx + sx * s.w * 0.45, 16, W - 16),
    clamp(s.cy + sy * s.h * 0.45, 16, H - 16),
  ];
  if (photos[0]) {
    const [x, y] = corner(photos[0], 1, -1);
    addPath(starPath(rand, x, y, 12), "ink", true);
  }
  if (photos[2]) {
    const [x, y] = corner(photos[2], 1, 1);
    addPath(starPath(rand, x, y, 11), "ink", true);
  }

  collage.classList.toggle("collage--static", !animate);
  const layer = (cls, body) => `<svg class="doodles ${cls}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body.join("")}</svg>`;
  collage.innerHTML = html.join("") + layer("doodles--under", paths) + layer("doodles--over", overPaths);
}

let currentToken = 0;
let shown = null;
let resizeTimer = null;

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => shown && paintCollage(shown.p, shown.scraps, false), 150);
});

export function showPreview(p) {
  const panel = document.getElementById("work-preview");
  const token = ++currentToken;
  shown = null;

  if (!p) {
    panel.innerHTML = "";
    return;
  }

  const body = excerpt(p.desc);
  panel.innerHTML = `
    <div class="work-preview-inner">
      <div class="collage"></div>
      <div class="preview-note">
        <p class="preview-eyebrow">${[p.year, p.category].filter(Boolean).map(escapeHtml).join(" · ")}</p>
        <h3 class="preview-title">${escapeHtml(p.title)}</h3>
        <div class="preview-tags">${p.tags.map(t => `<span class="preview-tag">${escapeHtml(t)}</span>`).join("")}</div>
        <p class="preview-excerpt">${body ? escapeHtml(body) : p.gallery ? "" : "Still in progress."}</p>
      </div>
    </div>`;

  const scraps = collectScraps(p);
  const sources = [p.thumb, ...scraps.map(s => s.src)].filter(Boolean);
  Promise.all(sources.map(loadDimensions)).then(() => {
    if (token !== currentToken) return;
    shown = { p, scraps };
    paintCollage(p, scraps, true);
    // A rustle for each scrap as it lands, in step with the animation's stagger.
    for (let i = 0; i <= scraps.length; i++) setTimeout(() => token === currentToken && sfx.rustle(0.8), i * 45);
  });
}
