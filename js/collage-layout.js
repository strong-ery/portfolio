// Pure layout for the scrapbook panel: no DOM, just geometry.

const CANDIDATES = 320;

export function rotatedBox(w, h, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
}

function overlapArea(a, b) {
  const x = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
  const y = Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2);
  return x > 0 && y > 0 ? x * y : 0;
}

// For each item, how much of its box (0..1) is covered by the hero or any other item.
export function overlapFractions(hero, items, centres) {
  const box = (o, c) => ({ cx: c.cx, cy: c.cy, ...rotatedBox(o.w, o.h, o.rot) });
  const boxes = items.map((it, i) => box(it, centres[i]));
  const heroBox = { cx: hero.cx, cy: hero.cy, ...rotatedBox(hero.w, hero.h, hero.rot) };
  return boxes.map((b, i) => {
    let total = overlapArea(b, heroBox);
    boxes.forEach((o, j) => { if (j !== i) total += overlapArea(b, o); });
    return total / (b.w * b.h);
  });
}

export function heroPlacement(W, H, thumbAspect) {
  const maxW = W * 0.6;
  const maxH = H * 0.52;
  const w = Math.min(maxW, maxH * thumbAspect);
  const h = w / thumbAspect;
  const cy = Math.min(Math.max(H * 0.47, h / 2 + 12), H - h / 2 - 12);
  return { cx: W / 2, cy, w, h };
}

// Best-candidate placement: every item samples many spots and keeps the one that
// overlaps the least, sits nearest the middle, and stays furthest from its neighbours.
// `tuck` is how much of the item is allowed to slide under the hero photo (0 for notes).
export function placeItems({ W, H, hero, items, rand, margin = 10 }) {
  const diag = Math.hypot(W, H);
  const heroBox = { cx: hero.cx, cy: hero.cy, ...rotatedBox(hero.w, hero.h, hero.rot) };
  const placed = [heroBox];

  return items.map(item => {
    const box = rotatedBox(item.w, item.h, item.rot);
    const area = box.w * box.h;
    const minX = box.w / 2 + margin;
    const maxX = Math.max(minX, W - box.w / 2 - margin);
    const minY = box.h / 2 + margin;
    const maxY = Math.max(minY, H - box.h / 2 - margin);

    let best = null;
    for (let k = 0; k < CANDIDATES; k++) {
      const cx = minX + rand() * (maxX - minX);
      const cy = minY + rand() * (maxY - minY);
      const cand = { cx, cy, w: box.w, h: box.h };

      const heroOverlap = overlapArea(cand, heroBox) / area;
      let otherOverlap = 0;
      let nearest = Infinity;
      for (let i = 1; i < placed.length; i++) {
        otherOverlap += overlapArea(cand, placed[i]) / area;
        nearest = Math.min(nearest, Math.hypot(cx - placed[i].cx, cy - placed[i].cy));
      }

      const heroCost = item.tuck > 0 ? 4 * Math.abs(heroOverlap - item.tuck) : 7 * heroOverlap;
      const spread = placed.length > 1 ? Math.min(nearest, diag * 0.3) / diag : 0;
      const centreDist = Math.hypot(cx - heroBox.cx, cy - heroBox.cy) / diag;
      const cost = heroCost + (item.avoid ?? 3) * otherOverlap - 1.2 * spread + 0.5 * centreDist;

      if (!best || cost < best.cost) best = { cost, cx, cy };
    }

    placed.push({ cx: best.cx, cy: best.cy, w: box.w, h: box.h });
    return { cx: best.cx, cy: best.cy };
  });
}
