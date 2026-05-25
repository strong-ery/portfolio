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
  if (!w) return "calc(33.333% - 1.25rem)";

  const pct = Math.min(100, Math.max(15, Math.round(w * 100)));
  return `calc(${pct}% - 1.25rem)`;
}

function renderBoard(filter) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  let list = filter === "all" ? projects : projects.filter(p => p.tags.includes(filter));

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

    if (p.gallery) card.classList.add("p-card--gallery");
    else if (!p.desc) card.classList.add("p-card--wip");

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
  const p = projects.find(x => x.id === id);
  if (!p) return;
  if (p.gallery) {
    if (activeId === id) { closeGallery(); return; }
    openGallery(id);
    return;
  }
  if (activeId === id) { closeDrawer(); return; }
  openDrawer(id);
}

function openGallery(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  activeId = id;
  document.querySelectorAll(".p-card").forEach(c => c.classList.toggle("active", c.dataset.id === id));

  const links = (p.links || []).map(l =>
    `<a class="gallery-link${l.primary ? " primary" : ""}" href="${l.href}" target="_blank">${l.label}</a>`
  ).join("");

  const lbFlat = [];
  const gridParts = [];

  (p.media || []).forEach(m => {
    if (m.type === "image" && m.src) {
      const lbIdx = lbFlat.length;
      lbFlat.push({ src: m.src, caption: m.caption || "" });
      gridParts.push(`
        <div class="gallery-item" data-lb-index="${lbIdx}">
          <img src="${m.src}" alt="${m.caption || ""}" loading="lazy" />
          ${m.caption ? `<p class="gallery-item-caption">${m.caption}</p>` : ""}
        </div>`);

    } else if (m.type === "group" && Array.isArray(m.images) && m.images.length) {
      const lbStart = lbFlat.length;
      m.images.forEach(img => lbFlat.push({ src: img.src, caption: img.caption || "" }));


      const dots = m.images.map((_, di) =>
        `<button class="group-dot${di === 0 ? " active" : ""}" data-dot="${di}" aria-label="View image ${di + 1}"></button>`
      ).join("");

      const label = m.label ? `<span class="group-label">${m.label}</span>` : "";
      const useGrid = m.images.length >= 4;

      let imgWrapInner;
      if (useGrid) {

        const gridCells = m.images.slice(0, 4).map((img, di) =>
          `<div class="group-grid-cell">
            <img src="${img.src}" alt="${img.caption || ""}" loading="lazy" data-slot="${di}" />
          </div>`
        ).join("");

        const hiddenImgs = m.images.map((img, di) =>
          `<img src="${img.src}" alt="${img.caption || ""}" loading="lazy"
            class="group-img${di === 0 ? " active" : ""}" data-slot="${di}"
            style="display:none" />`
        ).join("");
        imgWrapInner = `<div class="group-grid-preview">${gridCells}</div>${hiddenImgs}`;
      } else {

        imgWrapInner = m.images.map((img, di) =>
          `<img src="${img.src}" alt="${img.caption || ""}" loading="lazy"
            class="group-img${di === 0 ? " active" : ""}" data-slot="${di}" />`
        ).join("");
      }

      gridParts.push(`
        <div class="gallery-item gallery-group${useGrid ? " gallery-group--grid" : ""}" data-lb-start="${lbStart}" data-active-slot="0" data-count="${m.images.length}">
          <div class="group-img-wrap">${imgWrapInner}</div>
          <div class="group-footer">
            ${label}
            <div class="group-dots">${dots}</div>
            <span class="group-counter">1 / ${m.images.length}</span>
          </div>
          <p class="gallery-item-caption group-caption">${m.images[0].caption || ""}</p>
        </div>`);
    }
  });

  const overlay = document.createElement("div");
  overlay.id = "gallery-overlay";
  overlay.className = "gallery-overlay";
  overlay.innerHTML = `
    <div class="gallery-header">
      <div class="gallery-header-left">
        <span class="gallery-eyebrow">${p.year} · ${p.category}</span>
        <span class="gallery-title">${p.title}</span>
        <div class="gallery-tags">${p.tags.map(t => `<span class="gallery-tag">${t}</span>`).join("")}</div>
      </div>
      <div class="gallery-header-right">
        ${links}
        <button class="gallery-close-btn" onclick="closeGallery()">close ✕</button>
      </div>
    </div>
    <div class="gallery-desc-bar">${p.desc ? `<p>${p.desc.replace(/\n/g, " ").replace(/# /g, "").slice(0, 320)}${p.desc.length > 320 ? "…" : ""}</p>` : ""}</div>
    <div class="gallery-grid" id="gallery-grid">${gridParts.join("")}</div>
    <div class="gallery-lightbox" id="gallery-lightbox" style="display:none">
      <button class="lb-nav lb-prev" id="lb-prev">‹</button>
      <div class="lb-img-wrap">
        <p class="lb-caption lb-caption-top" id="lb-caption-top"></p>
        <img id="lb-img" src="" alt="" />
        <p class="lb-caption lb-caption-bot" id="lb-caption-bot"></p>
      </div>
      <button class="lb-nav lb-next" id="lb-next">›</button>
      <button class="lb-close" onclick="closeLightbox()">✕</button>
      <div class="lb-counter" id="lb-counter"></div>
      <div class="lb-bg" onclick="closeLightbox()"></div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.classList.add("gallery-open");

  requestAnimationFrame(() => overlay.classList.add("visible"));
  setTimeout(() => assignMasonryColumns(), 50);

  overlay.querySelectorAll(".gallery-item:not(.gallery-group)").forEach(item => {
    item.addEventListener("click", () => openLightbox(lbFlat, parseInt(item.dataset.lbIndex)));
  });

  overlay.querySelectorAll(".gallery-group").forEach(group => {
    const lbStart   = parseInt(group.dataset.lbStart);
    const count     = parseInt(group.dataset.count);

    function setSlot(slot) {
      group.dataset.activeSlot = slot;
      group.querySelectorAll(".group-img").forEach(img =>
        img.classList.toggle("active", parseInt(img.dataset.slot) === slot));
      group.querySelectorAll(".group-dot").forEach(d =>
        d.classList.toggle("active", parseInt(d.dataset.dot) === slot));
      group.querySelector(".group-counter").textContent = `${slot + 1} / ${count}`;
      const cap = lbFlat[lbStart + slot].caption;
      group.querySelector(".group-caption").textContent = cap;
      group.querySelector(".group-caption").style.display = cap ? "" : "none";
    }

    group.querySelectorAll(".group-dot").forEach(dot => {
      dot.addEventListener("click", e => {
        e.stopPropagation();
        setSlot(parseInt(dot.dataset.dot));
      });
    });

    if (group.classList.contains("gallery-group--grid")) {
      group.querySelectorAll(".group-grid-cell").forEach(cell => {
        cell.addEventListener("click", e => {
          e.stopPropagation();
          const slot = parseInt(cell.querySelector("img").dataset.slot);
          openLightbox(lbFlat, lbStart + slot);
        });
      });
    } else {
      group.querySelector(".group-img-wrap").addEventListener("click", () => {
        const slot = parseInt(group.dataset.activeSlot) || 0;
        openLightbox(lbFlat, lbStart + slot);
      });
    }
  });

  document.getElementById("lb-prev").addEventListener("click", e => { e.stopPropagation(); shiftLightbox(-1); });
  document.getElementById("lb-next").addEventListener("click", e => { e.stopPropagation(); shiftLightbox(1); });

  overlay._keyHandler = e => {
    if (e.key === "Escape") { if (document.getElementById("gallery-lightbox").style.display !== "none") closeLightbox(); else closeGallery(); }
    if (e.key === "ArrowLeft") shiftLightbox(-1);
    if (e.key === "ArrowRight") shiftLightbox(1);
  };
  document.addEventListener("keydown", overlay._keyHandler);
}

function assignMasonryColumns() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;

  const COLS = window.innerWidth <= 700 ? 2 : 3;
  const GAP  = 16;

  grid.style.display  = "block";
  grid.style.position = "relative";

  const items = Array.from(grid.querySelectorAll(".gallery-item"));
  const colW  = (grid.clientWidth - GAP * (COLS - 1)) / COLS;
  const colH  = new Array(COLS).fill(0);

  items.forEach((item, i) => {
    item.style.position = "absolute";
    item.style.width    = colW + "px";
    item.style.margin   = "0";

    const isLone = !item.classList.contains("gallery-group");
    const centerCol = Math.floor(COLS / 2);
    const col = isLone ? centerCol : colH.indexOf(Math.min(...colH));
    item.style.left = (col * (colW + GAP)) + "px";
    item.style.top  = colH[col] + "px";

    colH[col] += item.offsetHeight + GAP;

    item.style.animationDelay = `${i * 0.04}s`;
    item.classList.add("gallery-item-in");
  });

  grid.style.height = Math.max(...colH) + "px";
}

let _masonryTimer = null;
window.addEventListener("resize", () => {
  if (!document.getElementById("gallery-grid")) return;
  clearTimeout(_masonryTimer);
  _masonryTimer = setTimeout(assignMasonryColumns, 120);
});

let lbIndex = 0;
let lbImages = [];

function openLightbox(flatImages, index) {
  lbImages = flatImages;
  lbIndex = index;
  const lb = document.getElementById("gallery-lightbox");
  lb.style.display = "flex";
  requestAnimationFrame(() => lb.classList.add("lb-visible"));
  setLightboxImage();
}

function setLightboxImage() {
  const m = lbImages[lbIndex];
  const img = document.getElementById("lb-img");
  img.classList.remove("lb-img-in");
  void img.offsetWidth;
  img.src = m.src;
  img.alt = m.caption || "";

  const capTop = document.getElementById("lb-caption-top");
  const capBot = document.getElementById("lb-caption-bot");
  const cap = m.caption || "";
  const isLong = cap.length > 60;
  capTop.textContent = isLong ? cap : "";
  capBot.textContent = isLong ? "" : cap;

  document.getElementById("lb-counter").textContent = `${lbIndex + 1} / ${lbImages.length}`;
  requestAnimationFrame(() => img.classList.add("lb-img-in"));
  document.getElementById("lb-prev").style.opacity = "1";
  document.getElementById("lb-next").style.opacity = "1";
}

function shiftLightbox(dir) {
  const lb = document.getElementById("gallery-lightbox");
  if (!lb || lb.style.display === "none") return;
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
  setLightboxImage();
}

function closeLightbox() {
  const lb = document.getElementById("gallery-lightbox");
  if (!lb) return;
  lb.classList.remove("lb-visible");
  setTimeout(() => { lb.style.display = "none"; }, 250);
}

function closeGallery() {
  const overlay = document.getElementById("gallery-overlay");
  if (!overlay) return;
  activeId = null;
  document.querySelectorAll(".p-card").forEach(c => c.classList.remove("active"));
  if (overlay._keyHandler) document.removeEventListener("keydown", overlay._keyHandler);
  overlay.classList.remove("visible");
  document.body.classList.remove("gallery-open");
  setTimeout(() => overlay.remove(), 400);
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
  rx += (mx - rx) * 0.88;
  ry += (my - ry) * 0.88;
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