import { getProjects, allTags, projectUrl, newestFirst } from "./data.js";
import { escapeHtml } from "./dom-utils.js";
import { showPreview } from "./preview.js";
import { isEmpty } from "./article.js";

function sortedProjects(filter) {
  const projects = getProjects();
  const list = filter === "all" ? projects : projects.filter(p => p.tags.includes(filter));
  return newestFirst(list);
}

function buildFilters() {
  const row = document.getElementById("filter-row");
  row.innerHTML = "";
  allTags().forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (tag === "all" ? " active" : "");
    btn.textContent = tag;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderBoard(tag);
    });
    row.appendChild(btn);
  });
}

function renderBoard(filter) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const list = sortedProjects(filter);

  list.forEach(p => {
    const row = document.createElement("a");
    row.className = "project-row";
    row.href = projectUrl(p.id);
    if (p.gallery) row.classList.add("project-row--gallery");
    if (isEmpty(p)) row.classList.add("project-row--wip");

    row.innerHTML = `
      <span class="project-row-year">${escapeHtml(p.year)}</span>
      <span class="project-row-title">${escapeHtml(p.title)}</span>
      <span class="project-row-tags">${p.tags.map(escapeHtml).join(" · ")}</span>`;

    row.addEventListener("mouseenter", () => showPreview(p));
    row.addEventListener("focus", () => showPreview(p));
    board.appendChild(row);
  });

  showPreview(list[0]);
}

export function initBoard() {
  buildFilters();
  renderBoard("all");
}
