// Shapes the photo tiles arrange themselves into, one after another, beside the beach.
// Each is drawn in its own little coordinate box (w by h units) as a solid silhouette; sampleShape()
// then covers that silhouette with a grid of tiles, one per image.

const poly = (g, points) => {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
};

// Cut-outs are drawn with destination-out so doors and windows really are holes.
const punch = (g, fn) => {
  g.save();
  g.globalCompositeOperation = "destination-out";
  fn();
  g.restore();
};

const SHAPE_LIST = [
  {
    name: "triforce",
    w: 100,
    h: 87,
    draw(g) {
      poly(g, [[50, 0], [75, 43.3], [25, 43.3]]);
      poly(g, [[25, 43.3], [50, 86.6], [0, 86.6]]);
      poly(g, [[75, 43.3], [100, 86.6], [50, 86.6]]);
    },
  },
  {
    name: "eye",
    w: 100,
    h: 100,
    // Makima's eyes: rings inside rings.
    draw(g) {
      [[50, 41], [33, 24], [16, 9]].forEach(([outer, inner]) => {
        g.beginPath();
        g.arc(50, 50, outer, 0, Math.PI * 2);
        g.arc(50, 50, inner, 0, Math.PI * 2, true);
        g.fill("evenodd");
      });
      g.beginPath();
      g.arc(50, 50, 3, 0, Math.PI * 2);
      g.fill();
    },
  },
  {
    name: "sawblade",
    w: 100,
    h: 100,
    // A spinning sawblade: six hooked teeth that sweep round the same way, with a hole in the middle.
    draw(g) {
      const teeth = 6;
      const step = (Math.PI * 2) / teeth;
      const inner = 25;
      const outer = 49;
      g.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = i * step;
        // The back of the tooth swells out to the tip, the front falls away in a hollow curve.
        for (let s = 0; s <= 1.0001; s += 0.125) {
          const r = inner + (outer - inner) * Math.pow(s, 0.5);
          const a = a0 + step * 0.86 * s;
          const x = 50 + Math.cos(a) * r;
          const y = 50 + Math.sin(a) * r;
          i === 0 && s === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        for (let s = 0.125; s <= 1.0001; s += 0.125) {
          const r = outer - (outer - inner) * Math.pow(s, 0.6);
          const a = a0 + step * (0.86 + 0.14 * s);
          g.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r);
        }
      }
      g.closePath();
      g.fill();
      punch(g, () => {
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i + 0.5) * (Math.PI / 4);
          i ? g.lineTo(50 + Math.cos(a) * 14, 50 + Math.sin(a) * 14) : g.moveTo(50 + Math.cos(a) * 14, 50 + Math.sin(a) * 14);
        }
        g.closePath();
        g.fill();
      });
    },
  },
  {
    name: "heart",
    w: 100,
    h: 90,
    draw(g) {
      g.beginPath();
      g.moveTo(50, 88);
      g.bezierCurveTo(-8, 48, 14, 2, 50, 28);
      g.bezierCurveTo(86, 2, 108, 48, 50, 88);
      g.fill();
    },
  },
];

// The order they appear in.
const ORDER = ["triforce", "heart", "eye", "sawblade"];
export const SHAPES = ORDER.map(name => SHAPE_LIST.find(shape => shape.name === name));

const shuffle = (list, rand) => list.map(v => [rand(), v]).sort((a, b) => a[0] - b[0]).map(p => p[1]);

// Covers a shape with a grid of tiles and returns exactly `count` of their centres.
// region is { x0, w, h, gy }: the box the shape stands in, with its bottom on the ground line gy.
export function sampleShape(shape, region, count, rand) {
  const k = Math.min(region.w / shape.w, region.h / shape.h) * 0.96;
  const sw = Math.ceil(shape.w * k);
  const sh = Math.ceil(shape.h * k);

  const mask = document.createElement("canvas");
  mask.width = sw;
  mask.height = sh;
  const g = mask.getContext("2d");
  g.scale(k, k);
  g.fillStyle = "#fff";
  shape.draw(g);
  const data = g.getImageData(0, 0, sw, sh).data;

  const covered = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < sw && iy < sh && data[(iy * sw + ix) * 4 + 3] > 128;
  };
  let area = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) area++;

  const ox = region.x0 + (region.w - sw) / 2;
  const oy = region.gy - sh;
  const gridAt = pitch => {
    const cells = [];
    const r = pitch * 0.32;
    for (let y = pitch / 2; y < sh; y += pitch) {
      for (let x = pitch / 2; x < sw; x += pitch) {
        if (covered(x, y) && covered(x - r, y) && covered(x + r, y) && covered(x, y - r) && covered(x, y + r)) {
          cells.push({ x: ox + x, y: oy + y, ix: Math.round((x - pitch / 2) / pitch), iy: Math.round((y - pitch / 2) / pitch) });
        }
      }
    }
    return cells;
  };

  // Start with tiles a little too big and shrink them until there's a cell for every image.
  let pitch = Math.sqrt(area / count) * 1.2;
  let cells = gridAt(pitch);
  for (let i = 0; i < 90 && cells.length < count && pitch > 5; i++) {
    pitch *= 0.96;
    cells = gridAt(pitch);
  }
  const gap = Math.min(3, Math.max(1.5, pitch * 0.1));
  const base = Math.min(pitch - gap, 46);

  // Usually the grid has a few more cells than there are images. Rather than leave holes, glue some
  // neighbouring 2x2 blocks into one bigger tile (that saves three cells each time), so every image
  // gets a place and the shape stays solid.
  let excess = cells.length - count;
  const at = new Map(cells.map(c => [`${c.ix},${c.iy}`, c]));
  const used = new Set();
  const out = [];
  const big = [];
  if (excess >= 3) {
    for (const c of shuffle(cells, rand)) {
      if (excess < 3) break;
      const block = [c, at.get(`${c.ix + 1},${c.iy}`), at.get(`${c.ix},${c.iy + 1}`), at.get(`${c.ix + 1},${c.iy + 1}`)];
      if (block.some(b => !b || used.has(b))) continue;
      block.forEach(b => used.add(b));
      big.push({ x: (block[0].x + block[3].x) / 2, y: (block[0].y + block[3].y) / 2, size: pitch + base });
      excess -= 3;
    }
  }
  let rest = cells.filter(c => !used.has(c));
  // One or two cells too many: drop those with the fewest neighbours (the shape's outermost corners).
  if (excess > 0) {
    const free = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !at.has(`${c.ix + dx},${c.iy + dy}`)).length;
    rest = rest.map(c => [free(c) + rand() * 0.1, c]).sort((a, b) => b[0] - a[0]).slice(excess).map(p => p[1]);
  }
  rest.forEach(c => out.push({ x: c.x, y: c.y, size: base }));
  return { cells: [...out, ...big], tile: base };
}
