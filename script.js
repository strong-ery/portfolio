let activeId = null;
let activeFilter = "all";
let projects = [];

async function loadManifests() {
  const [projectRes, influenceRes] = await Promise.all([
    fetch("projects/manifest.json"),
    fetch("influences/manifest.json"),
  ]);
  projects = await projectRes.json();
  const influences = await influenceRes.json();
  buildFilters();
  renderBoard("all");
  renderInfluences(influences);
  initReveal();
}

function allTags() {
  const tags = new Set();
  projects.forEach(p => p.tags.forEach(t => tags.add(t)));
  return ["all", ...Array.from(tags).sort()];
}

function buildFilters() {
  const row = document.getElementById("filter-row");
  row.innerHTML = "";
  allTags().forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (tag === "all" ? " active" : "");
    btn.dataset.filter = tag;
    btn.textContent = tag === "all" ? "all" : tag;
    btn.addEventListener("click", () => {
      activeFilter = tag;
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      closeDrawer();
      renderBoard(tag);
    });
    row.appendChild(btn);
  });
}

function cardWidth(w) {
  // w is a fraction of total width (0–1). Subtract gap allowance.
  if (!w) return "calc(33.333% - 1.25rem)";
  // clamp between 15% and 100%
  const pct = Math.min(100, Math.max(15, Math.round(w * 100)));
  return `calc(${pct}% - 1.25rem)`;
}

function renderBoard(filter) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  let list = filter === "all" ? projects : projects.filter(p => p.tags.includes(filter));

  // sort by date descending (most recent top-left)
  list = [...list].sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(a.year || 0);
    const db = b.date ? new Date(b.date) : new Date(b.year || 0);
    return db - da;
  });

  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "p-card";
    card.dataset.id = p.id;
    if (p.ratio) card.dataset.ratio = p.ratio;

    card.style.width = cardWidth(p.w);
    card.style.flexBasis = cardWidth(p.w);
    if (p.rotate !== undefined) {
      card.style.transform = `rotate(${p.rotate}deg)`;
    } else {
      const seed = p.id.charCodeAt(0) + p.id.charCodeAt(p.id.length - 1);
      const r = ((seed * 137) % 5) - 2;
      card.style.transform = `rotate(${r * 0.4}deg)`;
    }

    if (!p.desc) card.classList.add("p-card--wip");

    const thumb = p.thumb
      ? `<div class="p-card-thumb"><img src="${p.thumb}" alt="${p.title}" loading="lazy" /></div>`
      : `<div class="p-card-thumb"><span class="p-card-placeholder">${p.title.slice(0, 4)}</span></div>`;

    card.innerHTML = `${thumb}
      <div class="p-card-body">
        <div class="p-card-title">${p.title}</div>
        <div class="p-card-meta">
          <span class="p-card-year">${p.year}</span>
          ${p.tags.map(t => `<span class="p-card-tag">${t}</span>`).join("")}
        </div>
      </div>`;

    card.addEventListener("click", () => toggleDrawer(p.id));
    board.appendChild(card);
  });
}

function toggleDrawer(id) {
  if (activeId === id) { closeDrawer(); return; }
  openDrawer(id);
}

function formatDesc(desc) {
  return desc.split("\n").map(line => {
    if (line.startsWith("# ")) return `<p class="drawer-desc-heading">${line.slice(2)}</p>`;
    if (line === "") return `<br>`;
    return `<p>${line}</p>`;
  }).join("");
}

function openDrawer(id) {
  const scrollOrigin = window.scrollY;
  const p = projects.find(x => x.id === id);
  if (!p) return;
  activeId = id;
  document.querySelectorAll(".p-card").forEach(c => c.classList.toggle("active", c.dataset.id === id));

  const bd = p.breakdown?.length
    ? `<div class="drawer-breakdown"><div class="drawer-breakdown-label">Process</div><ul>${p.breakdown.map(b => `<li>${b}</li>`).join("")}</ul></div>`
    : "";

  const links = (p.links || []).map(l =>
    `<a class="drawer-link${l.primary ? " primary" : ""}" href="${l.href}" target="_blank">${l.label}</a>`
  ).join("");

  document.getElementById("d-left").innerHTML = `
    <p class="drawer-eyebrow">${p.year} · ${p.category}</p>
    <h3 class="drawer-title">${p.title}</h3>
    <div class="drawer-tags">${p.tags.map(t => `<span class="drawer-tag">${t}</span>`).join("")}</div>
    ${p.desc ? `<div class="drawer-desc">${formatDesc(p.desc)}</div>` : ""}
    ${bd}
    <div class="drawer-links">
      ${links}
      <button class="drawer-link drawer-close-inline" onclick="closeDrawer(${scrollOrigin})">close</button>
    </div>`;

  const med = buildMedia(p.media);
  document.getElementById("d-right").innerHTML = med
    ? `<div class="media-stack">${med}</div>`
    : "";

  const wrap = document.getElementById("drawer-wrap");
  wrap.classList.add("open");
  setTimeout(() => {
    const target = wrap.getBoundingClientRect().top + window.scrollY - 80;
    const start = window.scrollY;
    const dist = target - start;
    const duration = 900;
    let startTime = null;
    let cancelled = false;

    function cancel() { cancelled = true; }
    window.addEventListener("wheel", cancel, { once: true });
    window.addEventListener("touchstart", cancel, { once: true });

    function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
    function step(ts) {
      if (cancelled) return;
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / duration, 1);
      window.scrollTo(0, start + dist * ease(t));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, 50);
}

function closeDrawer(scrollOrigin) {
  activeId = null;
  document.querySelectorAll(".p-card").forEach(c => c.classList.remove("active"));
  document.getElementById("drawer-wrap").classList.remove("open");
  if (scrollOrigin !== undefined) {
    setTimeout(() => window.scrollTo({ top: scrollOrigin, behavior: "smooth" }), 50);
  }
}

function buildMedia(media) {
  return (media || []).map(m => {
    if (m.type === "youtube") return `<div><div class="embed-ratio"><iframe src="https://www.youtube.com/embed/${m.id}" allowfullscreen loading="lazy"></iframe></div>${m.caption ? `<p class="embed-caption">${m.caption}</p>` : ""}</div>`;
    if (m.type === "vimeo")   return `<div><div class="embed-ratio"><iframe src="https://player.vimeo.com/video/${m.id}" allowfullscreen loading="lazy"></iframe></div>${m.caption ? `<p class="embed-caption">${m.caption}</p>` : ""}</div>`;
    if (m.type === "image" && m.src) return `<div><img class="embed-img" src="${m.src}" alt="${m.caption || ""}" loading="lazy" />${m.caption ? `<p class="embed-caption">${m.caption}</p>` : ""}</div>`;
    if (m.type === "break") return `<div class="media-break"></div>`;
    if (m.type === "audio" && m.src) return `
      <div class="audio-card">
        <div class="audio-label">${m.caption || "audio"}</div>
        <audio class="audio-player" src="${m.src}" preload="none"></audio>
        <div class="audio-controls">
          <button class="audio-btn" onclick="this.closest('.audio-card').querySelector('audio').paused ? (this.closest('.audio-card').querySelector('audio').play(), this.textContent='▐▐') : (this.closest('.audio-card').querySelector('audio').pause(), this.textContent='▶')">▶</button>
          <div class="audio-progress-wrap" onclick="
            const a = this.closest('.audio-card').querySelector('audio');
            const rect = this.getBoundingClientRect();
            a.currentTime = ((event.clientX - rect.left) / rect.width) * a.duration;
          ">
            <div class="audio-progress-bar"></div>
          </div>
          <span class="audio-time">0:00</span>
        </div>
      </div>`;
    return "";
  }).join("");
}

function renderInfluences(influences) {
  const grid = document.getElementById("influences-grid");
  influences.forEach(inf => {
    const card = document.createElement("div");
    card.className = "influence-card";
    card.innerHTML = `<div class="influence-type">${inf.type}</div><div class="influence-name">${inf.name}</div><div class="influence-note">${inf.note}</div>`;
    grid.appendChild(card);
  });
}

function initReveal() {
  const obs = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); }),
    { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
  );
  document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
}

window.addEventListener("scroll", () => {
  document.getElementById("topbar").classList.toggle("scrolled", window.scrollY > 60);
});

const cursor = document.getElementById("cursor");
const ring   = document.getElementById("cursor-ring");
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener("mousemove", e => {
  mx = e.clientX; my = e.clientY;
  cursor.style.left = mx + "px";
  cursor.style.top  = my + "px";
});

(function animRing() {
  rx += (mx - rx) * 0.12;
  ry += (my - ry) * 0.12;
  ring.style.left = rx + "px";
  ring.style.top  = ry + "px";
  requestAnimationFrame(animRing);
})();

function drawPaper() {
  const canvas = document.getElementById("paper-canvas");
  const W = window.innerWidth;
  const H = window.innerHeight;
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

  ctx.save();
  for (let i = 0; i < 180; i++) {
    const x1 = Math.random() * W;
    const y1 = Math.random() * H;
    const x2 = x1 + (Math.random() - 0.5) * 300;
    const y2 = y1 + (Math.random() - 0.5) * 300;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = Math.random() * 0.4;
    ctx.strokeStyle = `rgba(120,90,50,${Math.random() * 0.06})`;
    ctx.stroke();
  }
  ctx.restore();
}

drawPaper();
window.addEventListener("resize", drawPaper);

loadManifests();

document.addEventListener("click", e => {
  const card = e.target.closest(".audio-card");
  if (!card) return;
  const audio = card.querySelector("audio");
  audio.addEventListener("timeupdate", () => {
    const pct = (audio.currentTime / audio.duration) * 100 || 0;
    card.querySelector(".audio-progress-bar").style.width = pct + "%";
    const m = Math.floor(audio.currentTime / 60);
    const s = Math.floor(audio.currentTime % 60).toString().padStart(2, "0");
    card.querySelector(".audio-time").textContent = `${m}:${s}`;
  });
  audio.addEventListener("ended", () => {
    card.querySelector(".audio-btn").textContent = "▶";
  });
});