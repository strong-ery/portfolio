import { escapeHtml } from "./dom-utils.js";

// An entry that has been opened up on the board but not filled in yet: no pictures or video, and at most a line of text.
export function isEmpty(p) {
  return !(p.media && p.media.length) && !(p.breakdown && p.breakdown.length) && (p.desc || "").trim().length < 60;
}

export function formatDesc(desc) {
  return desc.split("\n").map(line => {
    if (line.startsWith("# ")) return `<h2 class="article-heading">${escapeHtml(line.slice(2))}</h2>`;
    if (line === "") return `<br>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join("");
}

function buildMedia(media) {
  return (media || []).map(m => {
    const caption = m.caption ? `<p class="embed-caption">${escapeHtml(m.caption)}</p>` : "";
    if (m.type === "youtube") return `<div><div class="embed-ratio"><iframe src="https://www.youtube.com/embed/${escapeHtml(m.id)}" allowfullscreen loading="lazy"></iframe></div>${caption}</div>`;
    if (m.type === "vimeo")   return `<div><div class="embed-ratio"><iframe src="https://player.vimeo.com/video/${escapeHtml(m.id)}" allowfullscreen loading="lazy"></iframe></div>${caption}</div>`;
    if (m.type === "image" && m.src) return `<figure class="embed-photo"><img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.caption || "")}" loading="lazy" />${caption}</figure>`;
    if (m.type === "break") return `<div class="media-break"></div>`;
    if (m.type === "audio" && m.src) return `
      <div class="audio-card">
        <div class="audio-label">${escapeHtml(m.caption || "audio")}</div>
        <audio class="audio-player" src="${escapeHtml(m.src)}" preload="none"></audio>
        <div class="audio-controls">
          <button class="audio-btn">▶</button>
          <div class="audio-progress-wrap">
            <div class="audio-progress-bar"></div>
          </div>
          <span class="audio-time">0:00</span>
        </div>
      </div>`;
    return "";
  }).join("");
}

export function articleHtml(p) {
  const breakdown = p.breakdown?.length
    ? `<div class="article-breakdown"><div class="article-breakdown-label">Process</div><ul>${p.breakdown.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>`
    : "";
  if (isEmpty(p)) return `<div class="project-split"><article class="project-article"><p class="article-empty">Nothing to see here yet! :P</p></article></div>`;
  const media = buildMedia(p.media);
  const text = p.desc
    ? `<div class="article-body">${formatDesc(p.desc)}</div>${breakdown}`
    : `<p class="article-empty">Nothing to see here yet! :P</p>`;

  return `
    <div class="project-split">
      <article class="project-article">${text}</article>
      ${media ? `<aside class="project-media"><div class="media-stack">${media}</div></aside>` : ""}
    </div>`;
}
