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
    keep: 3,
    symmetry: "mirror",
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
    keep: 5,
    symmetry: "rot4",
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
    symmetry: "rot2",
    // A spinning sawblade: six hooked blades sweeping round the same way, a hole in the middle.
    // Six blades don't fit a square grid exactly, so the tiles are only kept symmetrical when turned half way.
    draw(g) {
      const teeth = 6;
      const step = (Math.PI * 2) / teeth;
      const inner = 25;
      const outer = 49;
      g.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = i * step;
        // The back of the tooth swells out to the tip, the front falls away in a hollow curve.
        for (let t = 0; t <= 1.0001; t += 0.1) {
          const r = inner + (outer - inner) * Math.pow(t, 0.9);
          const a = a0 + step * 0.62 * t;
          const x = 50 + Math.cos(a) * r;
          const y = 50 + Math.sin(a) * r;
          i === 0 && t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        for (let t = 0.1; t <= 1.0001; t += 0.1) {
          const r = outer - (outer - inner) * Math.pow(t, 0.4);
          const a = a0 + step * (0.62 + 0.38 * t);
          g.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r);
        }
      }
      g.closePath();
      g.fill();
      punch(g, () => {
        g.beginPath();
        g.arc(50, 50, 11, 0, Math.PI * 2);
        g.fill();
      });
    },
  },
  {
    name: "heart",
    symmetry: "mirror",
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

const MAPS = {
  mirror: [(i, j) => [i, j], (i, j) => [-i, j]],
  rot2: [(i, j) => [i, j], (i, j) => [-i, -j]],
  rot4: [(i, j) => [i, j], (i, j) => [-j, i], (i, j) => [-i, -j], (i, j) => [j, -i]],
};

// Covers a shape with a grid of tiles and returns exactly `count` of them, each { x, y, size }.
// region is { x0, w, h, gy }: the box the shape stands in, with its bottom on the ground line gy.
//
// The grid is centred on the shape, so a symmetrical shape gets a symmetrical set of tiles. A cell is kept
// when about half of it lies inside the shape, which keeps sharp corners and curves from being shaved off.
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

  const inside = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < sw && iy < sh && data[(iy * sw + ix) * 4 + 3] > 128;
  };
  let area = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) area++;

  const cx = (shape.w / 2) * k;
  const cy = (shape.h / 2) * k;
  const ox = region.x0 + (region.w - sw) / 2;
  const oy = region.gy - sh;
  const maps = MAPS[shape.symmetry] || [MAPS.mirror[0]];

  const gridAt = pitch => {
    const cells = [];
    const reach = Math.ceil(Math.max(sw, sh) / pitch) + 1;
    const q = pitch * 0.33;
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach; i <= reach; i++) {
        const x = cx + i * pitch;
        const y = cy + j * pitch;
        let hit = 0;
        for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) if (inside(x + u * q, y + v * q)) hit++;
        if (hit >= (shape.keep || 4)) cells.push({ i, j, x: ox + x, y: oy + y, score: hit });
      }
    }
    return cells;
  };

  // Start with tiles a little too big and shrink them until there's a cell for every image.
  let pitch = Math.sqrt(area / count) * 1.2;
  let cells = gridAt(pitch);
  for (let n = 0; n < 200 && cells.length < count && pitch > 5; n++) {
    pitch *= 0.985;
    cells = gridAt(pitch);
  }
  // Two by two blocks save three cells each, so nudge the pitch until the surplus is a multiple of three
  // and no tile has to be dropped from the shape's outline.
  for (let n = 0; n < 60 && (cells.length - count) % 3 !== 0; n++) {
    pitch *= 0.995;
    cells = gridAt(pitch);
  }
  const gap = Math.min(3, Math.max(1.5, pitch * 0.1));
  const base = Math.min(pitch - gap, 46);

  const at = new Map(cells.map(c => [`${c.i},${c.j}`, c]));
  const used = new Set();
  let excess = cells.length - count;

  // Cells that mirror or turn onto this one (itself included), if they all exist and are free.
  const orbit = c => {
    const found = new Map();
    for (const m of maps) {
      const [i, j] = m(c.i, c.j);
      const other = at.get(`${i},${j}`);
      if (!other || used.has(other)) return null;
      found.set(other, true);
    }
    return [...found.keys()];
  };

  // More cells than images: glue 2x2 blocks into one big tile (saves three cells each). Symmetrical
  // sets of blocks go first, so the pattern stays even; single blocks finish the job.
  const big = [];
  const blockAt = (i, j) => [at.get(`${i},${j}`), at.get(`${i + 1},${j}`), at.get(`${i},${j + 1}`), at.get(`${i + 1},${j + 1}`)];
  const glue = blocks => {
    blocks.forEach(b => b.forEach(c => used.add(c)));
    blocks.forEach(b => big.push({ x: (b[0].x + b[3].x) / 2, y: (b[0].y + b[3].y) / 2, size: pitch + base }));
    excess -= 3 * blocks.length;
  };
  const order = shuffle(cells, rand);
  for (const strict of [true, false]) {
    for (const c of order) {
      if (excess < 3) break;
      const block = blockAt(c.i, c.j);
      if (block.some(b => !b || used.has(b))) continue;
      if (!strict) { glue([block]); continue; }
      // Where do the other cells of its symmetry group put this block?
      const group = [];
      for (const m of maps) {
        const cs = block.map(b => m(b.i, b.j));
        const ci = Math.min(...cs.map(p => p[0]));
        const cj = Math.min(...cs.map(p => p[1]));
        const mapped = blockAt(ci, cj);
        if (mapped.some(b => !b || used.has(b))) { group.length = 0; break; }
        if (!group.some(o => o[0] === mapped[0])) group.push(mapped);
      }
      const flat = new Set(group.flat());
      if (group.length && flat.size === group.length * 4 && 3 * group.length <= excess) glue(group);
    }
  }

  // One or two cells too many: drop the ones least inside the shape, a symmetrical set when it fits.
  let rest = cells.filter(c => !used.has(c));
  const gone = new Set();
  while (excess > 0) {
    const left = rest.filter(c => !gone.has(c)).sort((a, b) => a.score - b.score || rand() - 0.5);
    const pick = left.find(c => { const o = orbit(c); return o && o.length <= excess; }) || left[0];
    const group = (!used.has(pick) && orbit(pick)) || [pick];
    const take = group.length <= excess ? group : [pick];
    take.forEach(c => { gone.add(c); used.add(c); });
    excess -= take.length;
  }
  rest = rest.filter(c => !gone.has(c));

  return { cells: [...rest.map(c => ({ x: c.x, y: c.y, size: base })), ...big], tile: base };
}
