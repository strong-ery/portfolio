export function initReveal() {
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); }),
    { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
  );
  document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
}

export function initTopbarScroll() {
  window.addEventListener("scroll", () => {
    document.getElementById("topbar").classList.toggle("scrolled", window.scrollY > 60);
    const cue = document.getElementById("scroll-cue");
    if (cue) cue.classList.toggle("gone", window.scrollY > 40);
  });
}

// The cursor is a small fairy: a glowing orb with flapping wings and a faint trail of light.
// It says "Hey!" whenever something dispatches a "navi:say" event.
const TRAIL = 6;
const INTERACTIVE = "a, button, .project-row, .p-card, .filter-row *, [data-hover]";

export function initCursor() {
  document.getElementById("cursor")?.remove();
  document.getElementById("cursor-ring")?.remove();

  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const trail = Array.from({ length: TRAIL }, (_, i) => {
    const dot = document.createElement("div");
    dot.className = "navi-trail";
    dot.style.setProperty("--k", i);
    document.body.appendChild(dot);
    return dot;
  });

  const navi = document.createElement("div");
  navi.className = "navi";
  navi.innerHTML = `
    <svg viewBox="-20 -20 40 40" width="38" height="38" aria-hidden="true">
      <defs>
        <radialGradient id="navi-core"><stop offset="0" stop-color="#fff"/><stop offset="0.45" stop-color="#e8f6ff"/><stop offset="1" stop-color="#9fd3ff"/></radialGradient>
        <linearGradient id="navi-wing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#b9e0ff" stop-opacity="0.55"/></linearGradient>
      </defs>
      <g class="navi-wing navi-wing--l"><path d="M-2 0 C-6 -9 -15 -14 -17 -10 C-18 -5 -10 1 -2 1 Z" fill="url(#navi-wing)" stroke="#8cc4f2" stroke-width="0.5"/></g>
      <g class="navi-wing navi-wing--r"><path d="M2 0 C6 -9 15 -14 17 -10 C18 -5 10 1 2 1 Z" fill="url(#navi-wing)" stroke="#8cc4f2" stroke-width="0.5"/></g>
      <circle r="4.2" fill="url(#navi-core)"/>
    </svg>
    <span class="navi-say" hidden></span>`;
  document.body.appendChild(navi);
  const say = navi.querySelector(".navi-say");

  let mx = -100, my = -100, x = -100, y = -100, seen = false;
  const history = [];

  document.addEventListener("mousemove", e => {
    mx = e.clientX; my = e.clientY;
    if (!seen) { seen = true; x = mx; y = my; navi.classList.add("is-here"); flushSay(); }
    navi.classList.toggle("alert", !!(e.target instanceof Element && e.target.closest(INTERACTIVE)));
  });
  document.addEventListener("mouseleave", () => navi.classList.remove("is-here"));
  document.addEventListener("mouseenter", () => seen && navi.classList.add("is-here"));
  document.addEventListener("pointerdown", () => {
    navi.classList.remove("pop");
    void navi.offsetWidth;
    navi.classList.add("pop");
  });

  let pending = null;
  let sayTimer = 0;
  function flushSay() {
    if (!pending) return;
    say.textContent = pending;
    say.hidden = false;
    pending = null;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { say.hidden = true; }, 2600);
  }
  window.addEventListener("navi:say", e => { pending = e.detail; if (seen) flushSay(); });

  let t = 0;
  (function tick() {
    t += 1;
    // Drift after the pointer with a little float, so it feels like it's hovering rather than pinned.
    x += (mx - x) * 0.35;
    y += (my - y) * 0.35;
    const bob = calm ? 0 : Math.sin(t / 14) * 1.6;
    navi.style.transform = `translate(${x}px, ${y + bob}px)`;
    history.unshift([x, y + bob]);
    if (history.length > TRAIL * 3 + 1) history.pop();
    trail.forEach((dot, i) => {
      const h = history[(i + 1) * 3] || history[history.length - 1] || [x, y];
      dot.style.transform = `translate(${h[0]}px, ${h[1]}px)`;
    });
    requestAnimationFrame(tick);
  })();
}

function drawPaper() {
  const canvas = document.getElementById("paper-canvas");
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (!W || !H) return;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255 | 0;
    data[i]     = v;
    data[i + 1] = v * 0.9 | 0;
    data[i + 2] = v * 0.75 | 0;
    data[i + 3] = Math.random() * 38 | 0;
  }
  ctx.putImageData(img, 0, 0);

  // Uneven pulp: big soft blotches, a few lighter and a few darker.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 80 + Math.random() * 260;
    const dark = Math.random() < 0.65;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, dark ? "rgba(140,105,55,0.07)" : "rgba(255,250,235,0.08)");
    g.addColorStop(1, "rgba(140,105,55,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Short curved fibres embedded in the sheet.
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 520; i++) {
    const x1 = Math.random() * W;
    const y1 = Math.random() * H;
    const len = 12 + Math.random() * 60;
    const a = Math.random() * Math.PI * 2;
    const bend = (Math.random() - 0.5) * len * 0.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(
      x1 + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
      y1 + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
      x1 + Math.cos(a) * len,
      y1 + Math.sin(a) * len,
    );
    ctx.lineWidth = 0.3 + Math.random() * 0.6;
    ctx.strokeStyle = Math.random() < 0.7
      ? `rgba(110,80,45,${0.04 + Math.random() * 0.07})`
      : `rgba(255,252,240,${0.1 + Math.random() * 0.15})`;
    ctx.stroke();
  }
  ctx.restore();

  // Edges of the sheet sit a touch darker than the middle.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  vignette.addColorStop(0, "rgba(120,85,40,0)");
  vignette.addColorStop(1, "rgba(120,85,40,0.16)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

export function initPaperTexture() {
  drawPaper();
  window.addEventListener("resize", drawPaper);
}
