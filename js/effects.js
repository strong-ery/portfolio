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

export function initCursor() {
  const cursor = document.getElementById("cursor");
  const ring   = document.getElementById("cursor-ring");
  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener("mousemove", e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + "px";
    cursor.style.top  = my + "px";
  });

  (function animRing() {
    rx += (mx - rx) * 0.88;
    ry += (my - ry) * 0.88;
    ring.style.left = rx + "px";
    ring.style.top  = ry + "px";
    requestAnimationFrame(animRing);
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
