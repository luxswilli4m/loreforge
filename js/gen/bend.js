// Bendable lines for rivers and roads: the two ends plus any elbows are control points,
// and each stretch between them is a smooth curve you can pull. A line with no elbows bends
// as one curve from start to finish; elbows let you set where it articulates.

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const qpt = (a, q, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * q[0] + t * t * b[0], u * u * a[1] + 2 * u * t * q[1] + t * t * b[1]]; };
const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)); return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t); };

// Douglas–Peucker: keep only the points that matter
function simplify(pts, tol) {
  if (pts.length < 3) return pts.map((_, i) => i);
  const keep = new Set([0, pts.length - 1]);
  const rec = (i0, i1) => {
    let best = -1, bd = tol;
    for (let i = i0 + 1; i < i1; i++) { const d = segDist(pts[i], pts[i0], pts[i1]); if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep.add(best); rec(i0, best); rec(best, i1); }
  };
  rec(0, pts.length - 1);
  return [...keep].sort((a, b) => a - b);
}

// turn a drawn polyline into control points + bends that follow it closely
export function curveFromPts(pts, tol) {
  if (!pts || pts.length < 2) return { ctl: (pts || []).map(p => [...p]), bend: [] };
  // a coarse pass picks the elbows; each stretch between them becomes one curve through its middle
  const idx = simplify(pts, tol * 2.2);
  const ctl = idx.map(i => [pts[i][0], pts[i][1]]), bend = [];
  for (let k = 1; k < idx.length; k++) {
    const i0 = idx[k - 1], i1 = idx[k], a = pts[i0], b = pts[i1];
    if (i1 - i0 < 2) { bend.push(null); continue; }
    // the point halfway along this stretch
    let total = 0; for (let i = i0 + 1; i <= i1; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let acc = 0, m = a;
    for (let i = i0 + 1; i <= i1; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + L >= total / 2) { m = lerp(pts[i - 1], pts[i], (total / 2 - acc) / (L || 1)); break; } acc += L; }
    const mid = lerp(a, b, 0.5);
    bend.push(Math.hypot(m[0] - mid[0], m[1] - mid[1]) < tol * 0.15 ? null : [2 * m[0] - mid[0], 2 * m[1] - mid[1]]);
  }
  return { ctl, bend };
}

const ctrlOf = (line, i) => line.bend[i] || lerp(line.ctl[i], line.ctl[i + 1], 0.5);

// the path as a dense polyline, `step` units apart
export function samplePath(line, step) {
  const out = [];
  for (let i = 0; i < line.ctl.length - 1; i++) {
    const a = line.ctl[i], b = line.ctl[i + 1], q = ctrlOf(line, i);
    const n = Math.max(2, Math.ceil((Math.hypot(q[0] - a[0], q[1] - a[1]) + Math.hypot(b[0] - q[0], b[1] - q[1])) / step));
    for (let k = i ? 1 : 0; k <= n; k++) out.push(qpt(a, q, b, k / n));
  }
  return out;
}
// the middle of each stretch (where its bend handle sits)
export const segMid = (line, i) => qpt(line.ctl[i], ctrlOf(line, i), line.ctl[i + 1], 0.5);

// nearest spot on the curve: which stretch, how far along it, and how close
export function hitCurve(line, p) {
  let best = null;
  for (let i = 0; i < line.ctl.length - 1; i++) {
    const a = line.ctl[i], b = line.ctl[i + 1], q = ctrlOf(line, i);
    let prev = a;
    for (let k = 1; k <= 24; k++) {
      const t = k / 24, cur = qpt(a, q, b, t), d = segDist(p, prev, cur);
      if (!best || d < best.d) best = { seg: i, t: t - 1 / 48, d };
      prev = cur;
    }
  }
  return best;
}

// pull a stretch so the curve passes through p at (about) the point that was grabbed
export function pullSegment(line, seg, t, p) {
  t = Math.max(0.2, Math.min(0.8, t));
  const a = line.ctl[seg], b = line.ctl[seg + 1], u = 1 - t;
  line.bend[seg] = [(p[0] - u * u * a[0] - t * t * b[0]) / (2 * u * t), (p[1] - u * u * a[1] - t * t * b[1]) / (2 * u * t)];
}

// add an elbow on a stretch without changing its shape (splits the curve exactly)
export function addElbow(line, seg, t) {
  const a = line.ctl[seg], b = line.ctl[seg + 1], q = ctrlOf(line, seg);
  const p = qpt(a, q, b, t), q1 = lerp(a, q, t), q2 = lerp(q, b, t);
  const straight = !line.bend[seg];
  line.ctl.splice(seg + 1, 0, p);
  line.bend.splice(seg, 1, straight ? null : q1, straight ? null : q2);
  return seg + 1;
}
// remove an elbow; the merged stretch still bends through where it was
export function removeElbow(line, i) {
  if (i <= 0 || i >= line.ctl.length - 1) return false;
  const a = line.ctl[i - 1], b = line.ctl[i + 1], p = line.ctl[i], mid = lerp(a, b, 0.5);
  line.ctl.splice(i, 1);
  line.bend.splice(i - 1, 2, [2 * p[0] - mid[0], 2 * p[1] - mid[1]]);
  return true;
}
export function straighten(line) { line.bend = line.bend.map(() => null); }
export const cloneLine = l => ({ ctl: l.ctl.map(p => [...p]), bend: l.bend.map(q => q ? [...q] : null) });
