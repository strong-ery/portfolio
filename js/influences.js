import { escapeHtml } from "./dom-utils.js";

// Each influence is a plain card at rest. On hover a hero card slides over it: a colour field, the
// title, and the character stepping out past the card's edge.
export function renderInfluences(influences) {
  const grid = document.getElementById("influences-grid");
  influences.forEach(inf => {
    const card = document.createElement("div");
    card.className = "influence-card";
    card.tabIndex = 0;
    let hero = "";
    if (inf.hero) {
      const h = inf.hero;
      card.style.setProperty("--hero-from", h.from);
      card.style.setProperty("--hero-to", h.to);
      card.style.setProperty("--hero-ink", h.ink);
      hero = `<div class="hero" aria-hidden="true">
        <div class="hero-face"><div class="hero-type">${escapeHtml(inf.type)}</div><div class="hero-name">${escapeHtml(inf.name)}</div></div>
        <img class="hero-art" src="${escapeHtml(h.src)}" alt="" loading="lazy" draggable="false">
      </div>`;
    }
    card.innerHTML = `<div class="influence-type">${escapeHtml(inf.type)}</div><div class="influence-name">${escapeHtml(inf.name)}</div><div class="influence-note">${escapeHtml(inf.note)}</div>${hero}`;
    grid.appendChild(card);
  });
}
