import { loadProjects, loadInfluences, getProjects } from "./data.js";
import { initBoard } from "./board.js";
import { renderInfluences } from "./influences.js";
import { initFinale } from "./finale.js";
import { initReveal, initTopbarScroll, initCursor, initPaperTexture } from "./effects.js";

async function start() {
  initCursor();
  initPaperTexture();
  initTopbarScroll();

  const [, influences] = await Promise.all([loadProjects(), loadInfluences()]);
  initBoard();
  renderInfluences(influences);
  initReveal();
  initFinale(getProjects());
}

start();
