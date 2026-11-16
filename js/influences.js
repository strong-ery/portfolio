import { escapeHtml } from "./dom-utils.js";

export function renderInfluences(influences) {
  const grid = document.getElementById("influences-grid");
  influences.forEach(inf => {
    const card = document.createElement("div");
    card.className = "influence-card";
    card.innerHTML = `<div class="influence-type">${escapeHtml(inf.type)}</div><div class="influence-name">${escapeHtml(inf.name)}</div><div class="influence-note">${escapeHtml(inf.note)}</div>`;
    grid.appendChild(card);
  });
}
