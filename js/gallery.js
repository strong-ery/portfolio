import { escapeHtml } from "./dom-utils.js";

let lbIndex = 0;
let lbImages = [];

export function renderGallery(p, container) {
  const lbFlat = [];
  const gridParts = [];

  (p.media || []).forEach(m => {
    if (m.type === "image" && m.src) {
      const lbIdx = lbFlat.length;
      lbFlat.push({ src: m.src, caption: m.caption || "" });
      gridParts.push(`
        <div class="gallery-item" data-lb-index="${lbIdx}">
          <img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.caption || "")}" loading="lazy" />
          ${m.caption ? `<p class="gallery-item-caption">${escapeHtml(m.caption)}</p>` : ""}
        </div>`);

    } else if (m.type === "group" && Array.isArray(m.images) && m.images.length) {
      const lbStart = lbFlat.length;
      m.images.forEach(img => lbFlat.push({ src: img.src, caption: img.caption || "" }));

      const dots = m.images.map((_, di) =>
        `<button class="group-dot${di === 0 ? " active" : ""}" data-dot="${di}" aria-label="View image ${di + 1}"></button>`
      ).join("");

      const label = m.label ? `<span class="group-label">${escapeHtml(m.label)}</span>` : "";
      const useGrid = m.images.length >= 4;

      let imgWrapInner;
      if (useGrid) {
        const gridCells = m.images.slice(0, 4).map((img, di) =>
          `<div class="group-grid-cell">
            <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption || "")}" loading="lazy" data-slot="${di}" />
          </div>`
        ).join("");

        // Clone images solely so setSlot() can track the active slot without
        // re-querying the DOM; always hidden regardless of slot (see css/gallery.css).
        const hiddenImgs = m.images.map((img, di) =>
          `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption || "")}" loading="lazy"
            class="group-img group-img--clone${di === 0 ? " active" : ""}" data-slot="${di}" />`
        ).join("");
        imgWrapInner = `<div class="group-grid-preview">${gridCells}</div>${hiddenImgs}`;
      } else {
        imgWrapInner = m.images.map((img, di) =>
          `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption || "")}"
            class="group-img${di === 0 ? " active" : ""}" data-slot="${di}" />`
        ).join("");
      }

      gridParts.push(`
        <div class="gallery-item gallery-group${useGrid ? " gallery-group--grid" : ""}" data-lb-start="${lbStart}" data-active-slot="0" data-count="${m.images.length}">
          <div class="group-img-wrap">${imgWrapInner}</div>
          <div class="group-footer">
            ${label}
            ${useGrid ? "" : `<div class="group-dots">${dots}</div>`}
            <span class="group-counter">${useGrid ? `${m.images.length} images` : `1 / ${m.images.length}`}</span>
          </div>
          ${useGrid ? "" : `<p class="gallery-item-caption group-caption">${escapeHtml(m.images[0].caption || "")}</p>`}
        </div>`);
    }
  });

  container.innerHTML = `
    <div class="gallery-grid" id="gallery-grid">${gridParts.join("")}</div>
    <div class="gallery-lightbox" id="gallery-lightbox" style="display:none">
      <button class="lb-nav lb-prev" id="lb-prev">‹</button>
      <div class="lb-img-wrap">
        <p class="lb-caption lb-caption-top" id="lb-caption-top"></p>
        <img id="lb-img" src="" alt="" />
        <p class="lb-caption lb-caption-bot" id="lb-caption-bot"></p>
      </div>
      <button class="lb-nav lb-next" id="lb-next">›</button>
      <button class="lb-close" id="lb-close">✕</button>
      <div class="lb-counter" id="lb-counter"></div>
      <div class="lb-bg" id="lb-bg"></div>
    </div>`;

  waitForImagesAndLayout();

  container.querySelectorAll(".gallery-item:not(.gallery-group)").forEach(item => {
    item.addEventListener("click", () => openLightbox(lbFlat, parseInt(item.dataset.lbIndex)));
  });

  container.querySelectorAll(".gallery-group").forEach(group => {
    const lbStart = parseInt(group.dataset.lbStart);
    const count   = parseInt(group.dataset.count);

    function setSlot(slot) {
      group.dataset.activeSlot = slot;
      group.querySelectorAll(".group-img").forEach(img =>
        img.classList.toggle("active", parseInt(img.dataset.slot) === slot));
      group.querySelectorAll(".group-dot").forEach(d =>
        d.classList.toggle("active", parseInt(d.dataset.dot) === slot));
      group.querySelectorAll(".group-grid-cell").forEach((cell, i) =>
        cell.classList.toggle("is-active", i === slot));
      group.querySelector(".group-counter").textContent = `${slot + 1} / ${count}`;
      const cap = lbFlat[lbStart + slot].caption;
      group.querySelector(".group-caption").textContent = cap;
      group.querySelector(".group-caption").style.display = cap ? "" : "none";

      // Swapping the image or caption changes this card's height, and the masonry is
      // absolutely positioned, so re-flow now and again once a not-yet-loaded image arrives.
      assignMasonryColumns();
      const shown = group.querySelector(".group-img.active");
      if (shown && !shown.complete) {
        shown.addEventListener("load", assignMasonryColumns, { once: true });
      }
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
  document.getElementById("lb-close").addEventListener("click", closeLightbox);
  document.getElementById("lb-bg").addEventListener("click", closeLightbox);

  document.addEventListener("keydown", e => {
    if (document.getElementById("gallery-lightbox").style.display === "none") return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") shiftLightbox(-1);
    if (e.key === "ArrowRight") shiftLightbox(1);
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(assignMasonryColumns, 120);
  });
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

// Re-runs the masonry layout whenever a late image finishes loading so
// uncached images on GitHub Pages don't collapse the layout.
function waitForImagesAndLayout() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;

  let debounceTimer = null;
  function scheduleLayout() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(assignMasonryColumns, 60);
  }

  const imgs = Array.from(grid.querySelectorAll("img")).filter(
    img => !img.classList.contains("group-img--clone")
  );

  scheduleLayout();
  imgs.filter(img => !img.complete || img.naturalHeight === 0).forEach(img => {
    img.addEventListener("load",  scheduleLayout, { once: true });
    img.addEventListener("error", scheduleLayout, { once: true });
  });
}

function openLightbox(flatImages, index) {
  lbImages = flatImages;
  lbIndex = index;
  const lb = document.getElementById("gallery-lightbox");
  lb.style.display = "flex";
  document.body.classList.add("gallery-open");
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
  document.body.classList.remove("gallery-open");
  setTimeout(() => { lb.style.display = "none"; }, 250);
}
