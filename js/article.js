import { renderBody, plainText, allMedia } from "./markup.js";

// An entry that has been opened up on the board but not filled in yet: no pictures or video, and at most a line of text.
export function isEmpty(p) {
  return allMedia(p).length === 0 && plainText(p.body).trim().length < 60;
}

export function articleHtml(p) {
  if (isEmpty(p)) return `<div class="article-flow"><p class="article-empty">Nothing to see here yet! :P</p></div>`;
  return `<article class="article-flow">${renderBody(p.body)}</article>`;
}
