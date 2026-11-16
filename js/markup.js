import { escapeHtml as esc } from "./dom-utils.js";

/*
 * Article body format. Plain text, written in the editor, rendered by renderBody().
 *
 *   # Heading            ## Smaller heading
 *   blank line = new paragraph; a plain line break stays a line break
 *   - list item          > quote          ---  (divider)
 *   ![caption](path){left}     an image right where you write it. Flags: left, right, wide, full
 *   (image lines with no blank line between them sit side by side as one row)
 *   ::audio path | caption     ::youtube id | caption     ::vimeo id | caption
 *
 *   inline: **bold**  *italic*  [text](https://link)  {red|text}  {#ff7a00|text}  {rainbow|text}  {hand|text}
 */

export const COLOURS = {
  red: "#b5342b", orange: "#c8661a", yellow: "#b98a0e", green: "#4a7a3a",
  teal: "#2f7a74", blue: "#2f5f9a", purple: "#6c4a9a", pink: "#b04a82", accent: "#3d2f1e",
};

const IMAGE = /^!\[(.*?)\]\((.+?)\)(?:\{(left|right|wide|full)\})?\s*$/;
const EMBED = /^::(audio|youtube|vimeo)\s+(.+?)(?:\s*\|\s*(.*))?$/;

function safeHref(url) {
  return /^(https?:\/\/|mailto:|#|\/|\.\/|[\w-]+[\w./-]*$)/i.test(url) ? url : "#";
}

export function inline(raw) {
  let s = esc(raw);
  s = s.replace(/\{([#\w]+)\|(.+?)\}/g, (all, kind, text) => {
    if (kind === "rainbow") return `<span class="tx-rainbow">${text}</span>`;
    if (kind === "hand") return `<span class="tx-hand">${text}</span>`;
    if (COLOURS[kind]) return `<span style="color:${COLOURS[kind]}">${text}</span>`;
    if (/^#[0-9a-f]{3,8}$/i.test(kind)) return `<span style="color:${kind}">${text}</span>`;
    return all;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) =>
    `<a href="${safeHref(url)}" target="_blank" rel="noopener">${text}</a>`);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  return s;
}

// Break the text into blocks, without producing any HTML. Both the renderer and the helpers below use this.
export function parseBody(text) {
  const blocks = [];
  let para = null;
  const flush = () => { if (para) { blocks.push({ type: "p", lines: para }); para = null; } };
  let row = null;
  const flushRow = () => { if (row) { blocks.push({ type: "row", images: row }); row = null; } };

  for (const rawLine of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    const img = line.match(IMAGE);
    if (img) {
      flush();
      (row = row || []).push({ caption: img[1], src: img[2], flag: img[3] || "" });
      continue;
    }
    flushRow();
    if (line.trim() === "") { flush(); continue; }

    const emb = line.match(EMBED);
    if (emb) { flush(); blocks.push({ type: emb[1], value: emb[2].trim(), caption: (emb[3] || "").trim() }); continue; }
    const h = line.match(/^(#{1,2}) (.+)$/);
    if (h) { flush(); blocks.push({ type: "h", level: h[1].length, text: h[2] }); continue; }
    if (line === "---") { flush(); blocks.push({ type: "hr" }); continue; }
    if (line.startsWith("> ")) { flush(); blocks.push({ type: "quote", text: line.slice(2) }); continue; }
    if (line.startsWith("- ")) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ul") last.items.push(line.slice(2));
      else blocks.push({ type: "ul", items: [line.slice(2)] });
      continue;
    }
    (para = para || []).push(line);
  }
  flush(); flushRow();
  return blocks;
}

function figure(img, extra = "") {
  const cap = img.caption ? `<figcaption class="embed-caption">${inline(img.caption)}</figcaption>` : "";
  const flag = img.flag ? ` fig-${img.flag}` : "";
  return `<figure class="embed-photo${flag}${extra}"><img src="${esc(img.src)}" alt="${esc(img.caption || "")}" loading="lazy" />${cap}</figure>`;
}

function video(src, caption) {
  const cap = caption ? `<figcaption class="embed-caption">${inline(caption)}</figcaption>` : "";
  return `<figure class="embed-video"><div class="embed-ratio"><iframe src="${src}" allowfullscreen loading="lazy"></iframe></div>${cap}</figure>`;
}

function audio(src, caption) {
  return `
    <div class="audio-card">
      <div class="audio-label">${esc(caption || "audio")}</div>
      <audio class="audio-player" src="${esc(src)}" preload="none"></audio>
      <div class="audio-controls">
        <button class="audio-btn" type="button">▶</button>
        <div class="audio-progress-wrap"><div class="audio-progress-bar"></div></div>
        <span class="audio-time">0:00</span>
      </div>
    </div>`;
}

function blockHtml(b) {
  switch (b.type) {
    case "h": return `<h${b.level + 1} class="article-heading h${b.level}">${inline(b.text)}</h${b.level + 1}>`;
    case "p": return `<p>${b.lines.map(inline).join("<br>")}</p>`;
    case "quote": return `<blockquote class="article-quote">${inline(b.text)}</blockquote>`;
    case "ul": return `<ul class="article-list">${b.items.map(i => `<li>${inline(i)}</li>`).join("")}</ul>`;
    case "hr": return `<hr class="article-rule">`;
    case "row":
      if (b.images.length === 1) return figure(b.images[0]);
      return `<div class="fig-row">${b.images.map(i => figure(i, " in-row")).join("")}</div>`;
    case "audio": return audio(b.value, b.caption);
    case "youtube": return video(`https://www.youtube.com/embed/${esc(b.value)}`, b.caption);
    case "vimeo": return video(`https://player.vimeo.com/video/${esc(b.value)}`, b.caption);
  }
  return "";
}

// A picture only floats beside the text when there is enough text after it to wrap around; otherwise it would
// squeeze a couple of words into a sliver and run into the next picture. Those just sit inline instead.
const FLOAT_MIN_CHARS = 380;

function settleFloats(blocks) {
  return blocks.map((b, i) => {
    if (b.type !== "row" || b.images.length !== 1) return b;
    const flag = b.images[0].flag;
    if (flag !== "left" && flag !== "right") return b;
    const next = blocks[i + 1];
    const room = next && next.type === "p" && next.lines.join(" ").length >= FLOAT_MIN_CHARS;
    return room ? b : { ...b, images: [{ ...b.images[0], flag: "" }] };
  });
}

export function renderBody(text) {
  return settleFloats(parseBody(text)).map(blockHtml).join("");
}

// Every picture, video and sound in the text, in the shape the home page hover collage wants.
export function bodyMedia(text) {
  const out = [];
  for (const b of parseBody(text)) {
    if (b.type === "row") b.images.forEach(i => out.push({ type: "image", src: i.src, caption: i.caption }));
    else if (b.type === "audio") out.push({ type: "audio", src: b.value, caption: b.caption });
    else if (b.type === "youtube") out.push({ type: "youtube", id: b.value, caption: b.caption });
  }
  return out;
}

// Just the words, for excerpts and for deciding whether an entry is still empty.
export function plainText(text) {
  return parseBody(text)
    .filter(b => b.type === "p" || b.type === "quote" || b.type === "ul")
    .map(b => b.type === "p" ? b.lines.join(" ") : b.type === "ul" ? b.items.join(" ") : b.text)
    .join(" ")
    .replace(/\{[#\w]+\|(.+?)\}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*+/g, "");
}

export function allMedia(p) {
  return [...bodyMedia(p.body), ...(p.media || [])];
}
