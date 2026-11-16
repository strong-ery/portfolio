import { loadProjects, findProject } from "./data.js";
import { escapeHtml } from "./dom-utils.js";
import { articleHtml, formatDesc } from "./article.js";
import { renderGallery } from "./gallery.js";
import { initAudioPlayers } from "./audio-player.js";
import { initCursor, initPaperTexture } from "./effects.js";

function headerHtml(p) {
  const links = (p.links || []).map(l =>
    `<a class="project-link${l.primary ? " primary" : ""}" href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
  ).join("");

  return `
    <header class="project-head">
      <p class="project-eyebrow">${[p.year, p.category].filter(Boolean).map(escapeHtml).join(" · ")}</p>
      <h1 class="project-title">${escapeHtml(p.title)}</h1>
      <div class="project-tags">${p.tags.map(t => `<span class="project-tag">${escapeHtml(t)}</span>`).join("")}</div>
      ${links ? `<div class="project-links">${links}</div>` : ""}
    </header>`;
}

async function start() {
  initCursor();
  initPaperTexture();
  initAudioPlayers();

  const root = document.getElementById("project");
  await loadProjects();
  const p = findProject(new URLSearchParams(location.search).get("id"));

  if (!p) {
    document.title = "Not found · Dylan Strong";
    root.innerHTML = `<header class="project-head"><h1 class="project-title">Nothing here.</h1><p class="project-eyebrow"><a href="index.html#work">Back to all work</a></p></header>`;
    return;
  }

  document.title = `${p.title} · Dylan Strong`;

  if (p.gallery) {
    const intro = p.desc ? `<div class="project-intro article-body">${formatDesc(p.desc)}</div>` : "";
    root.innerHTML = `${headerHtml(p)}${intro}<section class="project-gallery" id="project-gallery"></section>`;
    renderGallery(p, document.getElementById("project-gallery"));
  } else {
    root.innerHTML = `${headerHtml(p)}${articleHtml(p)}`;
  }
}

start();
