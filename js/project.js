import { loadProjects, findProject, newestFirst, projectUrl } from "./data.js";
import { escapeHtml } from "./dom-utils.js";
import { articleHtml, isEmpty } from "./article.js";
import { renderBody } from "./markup.js";
import { renderGallery } from "./gallery.js";
import { initAudioPlayers } from "./audio-player.js";
import { initCursor, initPaperTexture } from "./effects.js";
import { sfx } from "./finale-sfx.js";

const BACK = `<a class="project-back" href="index.html#work" id="project-back">← back to all work</a>`;

function headerHtml(p) {
  const links = (p.links || []).map(l =>
    `<a class="project-link${l.primary ? " primary" : ""}" href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
  ).join("");

  return `
    <header class="project-head">
      ${BACK}
      <p class="project-eyebrow">${[p.year, p.category].filter(Boolean).map(escapeHtml).join(" · ")}</p>
      <h1 class="project-title">${escapeHtml(p.title)}</h1>
      <div class="project-tags">${p.tags.map(t => `<span class="project-tag">${escapeHtml(t)}</span>`).join("")}</div>
      ${links ? `<div class="project-links">${links}</div>` : ""}
    </header>`;
}

// Going back should land where you left the list, so use the browser's own back when you came from this site.
function wireBack() {
  const link = document.getElementById("project-back");
  if (!link) return;
  link.addEventListener("click", e => {
    // Only use the browser's back when the last page was the home page; coming from another article it should still go home.
    let fromHome = false;
    try {
      const ref = new URL(document.referrer);
      fromHome = ref.origin === location.origin && /(^|\/)(index\.html)?$/.test(ref.pathname);
    } catch {}
    if (fromHome && history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });
}

// Newer / older entry, in the same order as the board, so the site reads like a blog.
function neighboursHtml(p) {
  const list = newestFirst();
  const i = list.findIndex(x => x.id === p.id);
  const link = (q, label, cls) => q ? `<a class="project-next ${cls}" href="${projectUrl(q.id)}"><span>${label}</span>${escapeHtml(q.title)}</a>` : "<span></span>";
  return `<nav class="project-neighbours">${link(list[i + 1], "← older", "older")}${link(list[i - 1], "newer →", "newer")}</nav>`;
}

async function start() {
  initCursor();
  sfx.init();
  initPaperTexture();
  initAudioPlayers();

  const root = document.getElementById("project");
  await loadProjects();
  const p = findProject(new URLSearchParams(location.search).get("id"));

  if (!p) {
    document.title = "Not found · Dylan Strong";
    root.innerHTML = `<header class="project-head">${BACK}<h1 class="project-title">Nothing here.</h1></header>`;
    wireBack();
    return;
  }

  document.title = `${p.title} · Dylan Strong`;

  if (p.gallery && !isEmpty(p)) {
    const intro = p.body ? `<div class="project-intro article-flow">${renderBody(p.body)}</div>` : "";
    root.innerHTML = `${headerHtml(p)}${intro}<section class="project-gallery" id="project-gallery"></section>${neighboursHtml(p)}`;
    renderGallery(p, document.getElementById("project-gallery"));
  } else {
    root.innerHTML = `${headerHtml(p)}${articleHtml(p)}${neighboursHtml(p)}`;
  }
  wireBack();
}

start();
