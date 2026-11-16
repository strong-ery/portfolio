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
    name: "buildings",
    w: 100,
    h: 100,
    draw(g) {
      g.fillRect(0, 58, 14, 42);
      g.fillRect(16, 30, 16, 70);
      g.fillRect(34, 46, 12, 54);
      g.fillRect(48, 12, 18, 88);
      g.fillRect(53, 4, 8, 9);
      g.fillRect(56.5, 0, 1.5, 5);
      g.fillRect(68, 38, 14, 62);
      g.fillRect(84, 54, 16, 46);
      g.fillRect(20, 24, 8, 7);
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
const ORDER = ["triforce", "buildings", "heart"];
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
          cells.push({ x: ox + x, y: oy + y });
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
  if (cells.length > count) cells = shuffle(cells, rand).slice(0, count);
  const gap = Math.min(3, Math.max(1.5, pitch * 0.1));
  return { cells, tile: Math.min(pitch - gap, 46) };
}
