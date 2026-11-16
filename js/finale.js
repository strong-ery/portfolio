import { seededRandom } from "./rng.js";
import { createSky } from "./finale-sky.js";
import { loadAssets, createScene } from "./finale-scene.js";
import { initFinaleAudio, prepareFinaleAudio, setFinaleAudioWanted, declineFinaleAudio } from "./finale-audio.js";
import { sfx } from "./finale-sfx.js";
import { getSoundPref, setSoundPref } from "./sound-pref.js";

const MAX_FRAGMENTS = 300;   // hand-picked images (album covers etc.); the city grows to hold them
const MAX_PROJECT_IMAGES = 40;
const FRAGMENTS_URL = "resources/footer/fragments.json";
const THUMBS_URL = "resources/footer/thumbs.json";
const PER_PROJECT = 3;

const clamp = (v, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const smooth = t => { const c = clamp(t); return c * c * (3 - 2 * c); };

// A spread of images from every project, shuffled so no one project dominates.
function pickScrapSources(projects) {
  const rand = seededRandom("finale-sources");
  const picks = [];
  projects.forEach(p => {
    const found = [];
    if (p.thumb) found.push(p.thumb);
    (p.media || []).forEach(m => {
      if (m.type === "image" && m.src) found.push(m.src);
      if (m.type === "group") (m.images || []).forEach(i => i.src && found.push(i.src));
    });
    const unique = [...new Set(found)];
    picks.push(...unique.slice(0, 1), ...unique.slice(1).sort(() => rand() - 0.5).slice(0, PER_PROJECT - 1));
  });
  return picks.sort(() => rand() - 0.5).slice(0, MAX_PROJECT_IMAGES);
}

// Small copies of the images, made by tools/footer_thumbs.py. Without them the footer would
// download the full-size originals just to show tiny tiles.
async function loadThumbs() {
  try {
    const res = await fetch(THUMBS_URL);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

// Hand-picked images (album covers and so on) listed in resources/footer/fragments.json.
async function loadFragments() {
  try {
    const res = await fetch(FRAGMENTS_URL);
    if (!res.ok) return { images: [], ground: null };
    const data = await res.json();
    return {
      images: (data.images || []).map(name => `resources/footer/${name}`),
      ground: data.ground ? `resources/footer/${data.ground}` : null,
    };
  } catch {
    return { images: [], ground: null };
  }
}

// Browsers only allow sound after a click, so a small note at the start of the page asks for one.
// Any click on the page counts, including the "sound on" button; the audio module listens for it.
function initWelcome() {
  const card = document.getElementById("welcome");
  if (!card) return;

  const veil = document.createElement("div");
  veil.className = "welcome-veil";
  veil.hidden = true;
  document.body.appendChild(veil);

  // Always start at the top.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  // Already answered on an earlier visit: no note, no lock. A yes starts on their first click or key press.
  const saved = getSoundPref();
  if (saved) {
    if (saved === "off") { declineFinaleAudio(); sfx.setAllowed(false); }
    card.remove();
    return;
  }

  // Stay put until they've answered.
  document.documentElement.classList.add("is-locked");

  const leave = () => {
    card.classList.add("is-leaving");
    veil.classList.add("is-leaving");
    document.documentElement.classList.remove("is-locked");
    setTimeout(() => { card.hidden = true; veil.remove(); }, 350);
  };
  card.querySelector(".welcome-yes").addEventListener("click", () => { setSoundPref("on"); leave(); });
  card.querySelector(".welcome-no").addEventListener("click", () => { setSoundPref("off"); declineFinaleAudio(); sfx.setAllowed(false); leave(); });

  setTimeout(() => {
    card.hidden = false;
    veil.hidden = false;
    window.dispatchEvent(new CustomEvent("navi:say", { detail: "Hey!" }));
  }, 1500);
}

// Timeline in milliseconds -> scene progress. It plays by itself once the footer is on screen.
const TIMELINE = [
  [0, 0],
  [1600, 0.12],   // the figures hold, fully assembled
  [5100, 0.62],   // scraps lift off and land in a pile
  [6700, 0.9],    // the quiet pair and the contact info arrive
  [7400, 1],
];

function progressAt(ms) {
  for (let i = 1; i < TIMELINE.length; i++) {
    const [t1, p1] = TIMELINE[i];
    if (ms <= t1) {
      const [t0, p0] = TIMELINE[i - 1];
      return p0 + ((ms - t0) / (t1 - t0)) * (p1 - p0);
    }
  }
  return 1;
}

// The top of the dark page is a torn edge of paper, so the night doesn't start with a ruler-straight line.
// The ragged outline is cut out of the sky itself (not a separate dark shape laid over it), so fireworks
// and their light reach right up to the tear. A thin ragged strip of pale paper fibre sits just above it.
function buildTornEdge(section, stage) {
  const rand = seededRandom("finale-edge");
  const points = [];
  for (let x = 0; x < 1000; x += 4 + rand() * 9) points.push([x, 3 + rand() * 8]);
  points.push([1000, 6]);

  stage.style.clipPath = `polygon(${points.map(([x, y]) => `${(x / 10).toFixed(2)}% ${y.toFixed(1)}px`).join(",")}, 100% 100%, 0 100%)`;

  // The edge element starts 19px above the stage, so stage y is svg y minus 19.
  const top = 19;
  const above = points.map(([x, y]) => `L${x.toFixed(1)} ${(top + y - 2 - rand() * 3.5).toFixed(1)}`);
  const below = [...points].reverse().map(([x, y]) => `L${x.toFixed(1)} ${(top + y + 2).toFixed(1)}`);
  const edge = document.createElement("div");
  edge.className = "finale-edge";
  edge.setAttribute("aria-hidden", "true");
  edge.innerHTML = `<svg viewBox="0 0 1000 40" preserveAspectRatio="none"><path d="M0 ${top + 8} ${above.join(" ")} ${below.join(" ")} Z" fill="#e8dfc8"/></svg>`;
  section.prepend(edge);
}

// Splits text into letters so each can ride the wave; the whole is still read as one piece.
function waveText(el, offset) {
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  el.textContent = "";
  [...text].forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "wave-ch";
    span.setAttribute("aria-hidden", "true");
    span.style.setProperty("--i", offset + i);
    span.textContent = ch;
    el.appendChild(span);
  });
  return offset + text.length + 2;
}

export function initFinale(projects) {
  const section = document.getElementById("finale");
  if (!section) return;
  const stage = section.querySelector(".finale-stage");
  const canvas = section.querySelector(".finale-canvas");
  let waveAt = 0;
  section.querySelectorAll(".finale-name, .finale-line, .finale-mail").forEach(el => { waveAt = waveText(el, waveAt); });

  let scene = null;
  let loading = false;
  let inView = false;
  let progress = 0;
  let startedAt = 0;
  let raf = 0;
  let volleyDone = false;
  let doneAt = 0;          // when the figures finished turning into the first shape
  let hold = 0;            // how long ago that was; drives the changing of shapes
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sky = createSky(section.querySelector(".finale-sky"), {
    launch: x => sfx.launch(x),
    burst: (x, height, size, kind) => sfx.burst(x, height, size, kind),
    crackle: x => sfx.crackle(x),
  });
  buildTornEdge(section, stage);

  function draw() {
    if (progress >= 0.8 && !volleyDone) { volleyDone = true; sky.volley(); }
    if (scene) scene.render(progress, hold, sky.light());
    const textOpacity = smooth((progress - 0.78) / 0.1);
    section.style.setProperty("--text-o", textOpacity.toFixed(3));
    section.classList.toggle("text-on", textOpacity > 0.5);
  }

  function frame(now) {
    progress = progressAt(now - startedAt);
    if (progress >= 1 && !doneAt) doneAt = now;
    hold = doneAt && !reduceMotion ? now - doneAt + 1 : 0;
    draw();
    // Once complete it keeps running so the shape beside the beach can change.
    raf = progress < 1 || !reduceMotion ? requestAnimationFrame(frame) : 0;
  }

  function play() {
    if (!scene || !scene.ready || !inView || raf || (progress >= 1 && reduceMotion)) return;
    startedAt = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Leaving the footer rewinds it so it plays again next time.
  function rewind() {
    cancelAnimationFrame(raf);
    raf = 0;
    progress = 0;
    doneAt = 0;
    hold = 0;
    volleyDone = false;
    sky.reset();
    draw();
  }

  // The footer is a little shorter than the screen, so the torn paper edge is always in view
  // when you reach the bottom: the page can't be scrolled past it.
  function fitHeight() {
    const bar = document.querySelector(".topbar");
    section.style.setProperty("--topbar-h", `${bar ? bar.offsetHeight : 64}px`);
  }

  function fitSky() {
    fitHeight();
    sky.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
  }

  // Building the scene takes a moment (it works in small slices), so wait for it before drawing.
  async function fit() {
    await scene.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio);
    draw();
    play();
  }

  async function load() {
    if (loading) return;
    loading = true;
    prepareFinaleAudio();
    const [fragments, thumbs] = await Promise.all([loadFragments(), loadThumbs()]);
    const sources = [...fragments.images.slice(0, MAX_FRAGMENTS), ...pickScrapSources(projects)].map(src => thumbs[src] || src);
    const assets = await loadAssets(sources, fragments.ground);
    if (!assets || !assets.scraps.length) return;
    sky.useSea(!assets.ground);
    scene = createScene(canvas, assets, { paper: (moved, landed) => sfx.paper(moved, landed), shake: level => sfx.shake(level) });
    fit();
  }

  section.classList.add("finale--live");
  section.style.setProperty("--text-o", "0");

  // Start loading the images a little before the footer arrives.
  const preload = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { preload.disconnect(); load(); }
  }, { rootMargin: "1500px 0px" });
  preload.observe(section);

  const watch = new IntersectionObserver(entries => {
    const ratio = entries[0].intersectionRatio;
    sky.run(ratio > 0);
    document.body.classList.toggle("on-night", ratio >= 0.4);
    if (ratio >= 0.55 && !inView) {
      inView = true;
      sky.setLaunching(true);
      sfx.ambience(true);
      setFinaleAudioWanted(true);
      play();
    } else if (ratio < 0.3 && inView) {
      inView = false;
      sky.setLaunching(false);
      sfx.ambience(false);
      setFinaleAudioWanted(false);
      rewind();
    }
  }, { threshold: [0, 0.1, 0.3, 0.4, 0.55, 1] });
  watch.observe(stage);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { fitSky(); if (scene) fit(); }, 150);
  });

  fitSky();
  initWelcome();
  sfx.init();
  initFinaleAudio(playing => section.classList.toggle("is-playing", playing));
}
