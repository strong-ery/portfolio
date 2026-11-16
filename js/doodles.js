// Hand-drawn SVG path generators. Each takes a seeded rand() so a project's doodles are stable.

const jitter = (rand, amt) => (rand() - 0.5) * 2 * amt;
const fmt = n => n.toFixed(1);

function smooth(pts) {
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

// A loop that overshoots its own start and drifts outward, like a pen circling something.
export function ellipsePath(rand, cx, cy, rx, ry) {
  const n = 40;
  const start = rand() * Math.PI * 2;
  const tilt = jitter(rand, 0.25);
  const wobbleA = rand() * 6.28;
  const wobbleB = rand() * 6.28;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + t * 1.14 * Math.PI * 2;
    const r = 1 + 0.05 * Math.sin(a * 2 + wobbleA) + 0.035 * Math.sin(a * 3 + wobbleB) + (t - 0.5) * 0.1;
    const x = Math.cos(a) * rx * r;
    const y = Math.sin(a) * ry * r;
    pts.push([
      cx + x * Math.cos(tilt) - y * Math.sin(tilt) + jitter(rand, 0.7),
      cy + x * Math.sin(tilt) + y * Math.cos(tilt) + jitter(rand, 0.7),
    ]);
  }
  return smooth(pts);
}

export function arrowPath(rand, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const bend = len * 0.2 * (rand() < 0.5 ? -1 : 1);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const cx = (x0 + x1) / 2 + nx * bend;
  const cy = (y0 + y1) / 2 + ny * bend;

  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const u = 1 - t;
    pts.push([
      u * u * x0 + 2 * u * t * cx + t * t * x1 + jitter(rand, 0.7),
      u * u * y0 + 2 * u * t * cy + t * t * y1 + jitter(rand, 0.7),
    ]);
  }

  const heading = Math.atan2(y1 - cy, x1 - cx);
  const headLen = 11 + rand() * 5;
  const spread = 0.45 + rand() * 0.2;
  const wing = sign => {
    const a = heading + Math.PI + sign * spread;
    return `M${fmt(x1)} ${fmt(y1)} L${fmt(x1 + Math.cos(a) * headLen)} ${fmt(y1 + Math.sin(a) * headLen)}`;
  };
  return `${smooth(pts)} ${wing(1)} ${wing(-1)}`;
}

// Two quick strokes: left-to-right, then back right-to-left a little shorter and lower,
// so the ends don't line up like a ruled double line.
export function underlinePaths(rand, x, y, length) {
  const pass = (x0, len, offset, reverse) => {
    const pts = [];
    const steps = Math.max(5, Math.round(len / 8));
    const slope = jitter(rand, 2.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // slight bow in the middle plus a flick up at the far end
      const flick = t > 0.9 ? -(t - 0.9) * 22 : 0;
      pts.push([x0 + t * len, y + offset + slope * t + Math.sin(t * Math.PI) * 1.6 + flick + jitter(rand, 0.5)]);
    }
    return smooth(reverse ? pts.reverse() : pts);
  };
  return [
    pass(x - 3, length + 8, 0, false),
    pass(x + 4 + rand() * 4, length * 0.7, 4.5, true),
  ];
}

// One continuous stroke, the way you'd draw a star without lifting the pen.
export function starPath(rand, cx, cy, r) {
  const order = [0, 2, 4, 1, 3, 0, 2];
  const offset = -Math.PI / 2 + jitter(rand, 0.4);
  const pts = order.map(k => {
    const a = offset + (k * 2 * Math.PI) / 5;
    const rr = r * (1 + jitter(rand, 0.12));
    return `${fmt(cx + Math.cos(a) * rr)} ${fmt(cy + Math.sin(a) * rr)}`;
  });
  return `M${pts.join(" L")}`;
}

export function crossPath(rand, cx, cy, r) {
  const stroke = angle => {
    const a = angle + jitter(rand, 0.2);
    const len = r * (0.9 + rand() * 0.25);
    return `M${fmt(cx - Math.cos(a) * len)} ${fmt(cy - Math.sin(a) * len)} L${fmt(cx + Math.cos(a) * len)} ${fmt(cy + Math.sin(a) * len)}`;
  };
  return `${stroke(Math.PI / 4)} ${stroke(-Math.PI / 4)}`;
}
