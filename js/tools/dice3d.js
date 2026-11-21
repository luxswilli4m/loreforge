// Real 3D dice for the dice table: each die is a proper polyhedron (d4, d6, d8, d10, d12, d20) with numbered faces.
// They are drawn with a tiny built-in renderer (flat-shaded faces, numbers mapped onto each face), so no 3D engine is needed.
// World axes: x right, y down the screen, z up out of the table towards the viewer.

// ---------- vectors & quaternions ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const qMul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qNorm = q => { const l = Math.hypot(...q) || 1; return q.map(x => x / l); };
export const qAxis = (axis, ang) => { const s = Math.sin(ang / 2), n = norm(axis); return [Math.cos(ang / 2), n[0] * s, n[1] * s, n[2] * s]; };
export function qRot(q, v) { const p = qMul(qMul(q, [0, v[0], v[1], v[2]]), [q[0], -q[1], -q[2], -q[3]]); return [p[1], p[2], p[3]]; }
export function qRandom() { const u = Math.random(), v = Math.random(), w = Math.random(); return [Math.sqrt(1 - u) * Math.sin(2 * Math.PI * v), Math.sqrt(1 - u) * Math.cos(2 * Math.PI * v), Math.sqrt(u) * Math.sin(2 * Math.PI * w), Math.sqrt(u) * Math.cos(2 * Math.PI * w)]; }
// the smallest turn that takes direction a onto direction b
export function qArc(a, b) {
  a = norm(a); b = norm(b);
  const d = dot(a, b);
  if (d < -0.9999) { const ax = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]); return qAxis(ax, Math.PI); }
  const c = cross(a, b);
  return qNorm([1 + d, c[0], c[1], c[2]]);
}
export function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map(x => -x); d = -d; }
  if (d > 0.9995) return qNorm(a.map((x, i) => x + (b[i] - x) * t));
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((x, i) => (x * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s);
}

// ---------- the shapes ----------
const PHI = (1 + Math.sqrt(5)) / 2;
function hullFaces(verts, faceNormals) {
  // for each face direction, the vertices furthest along it make up that face
  return faceNormals.map(n0 => {
    const n = norm(n0), m = Math.max(...verts.map(v => dot(v, n)));
    const idx = verts.map((v, i) => [i, dot(v, n)]).filter(([, d]) => d > m - 1e-6).map(([i]) => i);
    const c = mulS(idx.reduce((s, i) => add(s, verts[i]), [0, 0, 0]), 1 / idx.length);
    // order the corners around the face
    const u = norm(sub(verts[idx[0]], c)), w = cross(n, u);
    idx.sort((i, j) => Math.atan2(dot(sub(verts[i], c), w), dot(sub(verts[i], c), u)) - Math.atan2(dot(sub(verts[j], c), w), dot(sub(verts[j], c), u)));
    return { idx, n, c };
  });
}
function geometry(kind) {
  let verts, normals;
  if (kind === 4) { verts = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; normals = verts.map(v => mulS(v, -1)); }
  else if (kind === 6) { verts = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push([x, y, z]); normals = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]; }
  else if (kind === 8) { verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; normals = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) normals.push([x, y, z]); }
  else if (kind === 20 || kind === 12) {
    const ico = []; for (const a of [-1, 1]) for (const b of [-1, 1]) { ico.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]); }
    if (kind === 20) { verts = ico; normals = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) normals.push([x, y, z]); for (const a of [-1, 1]) for (const b of [-1, 1]) normals.push([a / PHI, 0, b * PHI], [b * PHI, a / PHI, 0], [0, b * PHI, a / PHI]); }
    else { verts = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push([x, y, z]); for (const a of [-1, 1]) for (const b of [-1, 1]) verts.push([a / PHI, 0, b * PHI], [b * PHI, a / PHI, 0], [0, b * PHI, a / PHI]); normals = ico; }
  } else { // d10: a pentagonal trapezohedron
    const h = 1.0, c = 0.105, ring = [];
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; ring.push([Math.cos(a), Math.sin(a), k % 2 ? -c : c]); }
    verts = [[0, 0, h], [0, 0, -h], ...ring];
    const faces = [];
    for (let i = 0; i < 10; i += 2) faces.push([0, 2 + i, 2 + (i + 1) % 10, 2 + (i + 2) % 10].reverse());
    for (let i = 1; i < 10; i += 2) faces.push([1, 2 + i, 2 + (i + 1) % 10, 2 + (i + 2) % 10]);
    const out = faces.map(idx => { const cc = mulS(idx.reduce((s, i) => add(s, verts[i]), [0, 0, 0]), 1 / 4); let n = norm(cross(sub(verts[idx[1]], verts[idx[0]]), sub(verts[idx[2]], verts[idx[0]]))); if (dot(n, cc) < 0) n = mulS(n, -1); return { idx, n, c: cc }; });
    return finish(verts, out, kind);
  }
  return finish(verts, hullFaces(verts, normals), kind);
}
function finish(verts, faces, kind) {
  // scale so the die's widest point sits on a unit circle, and label the faces (opposite faces add up, like real dice)
  const R = Math.max(...verts.map(len));
  verts = verts.map(v => mulS(v, 1 / R)); for (const f of faces) f.c = mulS(f.c, 1 / R);
  const n = faces.length, used = new Set(), order = [];
  for (let i = 0; i < n; i++) {
    if (used.has(i)) continue; used.add(i);
    let j = -1, best = 1;
    for (let k = 0; k < n; k++) if (!used.has(k) && dot(faces[i].n, faces[k].n) < best) { best = dot(faces[i].n, faces[k].n); j = k; }
    if (j >= 0 && best < -0.9) { used.add(j); order.push([i, j]); } else order.push([i]);
  }
  let lo = 1, hi = n;
  for (const pair of order) { faces[pair[0]].v = lo++; if (pair[1] != null) faces[pair[1]].v = hi--; }
  if (kind === 10) for (const f of faces) f.v -= 1; // a d10 reads 0–9
  // which way is "up" for the number on each face: towards a corner, the middle of an edge (d6) or the pointed tip (d10)
  for (const f of faces) {
    let to;
    if (kind === 6) to = mulS(add(verts[f.idx[0]], verts[f.idx[1]]), 0.5);
    else if (kind === 10) to = verts[f.idx.find(i => i < 2)];
    else to = verts[f.idx[0]];
    f.up = norm(sub(to, f.c));
  }
  return { verts, faces };
}
const CACHE = {};
export const model = kind => CACHE[kind] || (CACHE[kind] = geometry(kind));

// text printed on a face
export function faceLabel(kind, v) {
  if (kind === 'tens') return v === 0 ? '00' : String(v * 10);
  if (kind === 10) return String(v);
  return String(v);
}

// ---------- drawing one die ----------
const LIGHT = norm([-0.45, -0.55, 0.75]);
const VIEW = qAxis([1, 0, 0], 0.5);
export function drawDie(ctx, d, opts) {
  // the table is seen from slightly in front, so the sides of each die show as well as its top
  const m = model(d.geo), r = d.r, q = qMul(VIEW, d.q);
  const P = d.verts3 = m.verts.map(v => qRot(q, v));
  const faces = m.faces.map(f => ({ f, n: qRot(q, f.n), c: qRot(q, f.c) })).filter(x => x.n[2] > 0.02).sort((a, b) => a.c[2] - b.c[2]);
  ctx.lineJoin = 'round';
  for (const { f, n, c } of faces) {
    ctx.beginPath(); f.idx.forEach((i, k) => k ? ctx.lineTo(P[i][0] * r, P[i][1] * r) : ctx.moveTo(P[i][0] * r, P[i][1] * r)); ctx.closePath();
    const lit = Math.max(0, dot(n, LIGHT)), shadeAmt = 0.55 + lit * 0.6;
    if (opts.pattern) {
      // the material's surface, laid flat onto this face
      ctx.save(); ctx.clip();
      const [ax, ay] = faceAxes(q, f);
      ctx.transform(ax[0] * r, ax[1] * r, ay[0] * r, ay[1] * r, c[0] * r, c[1] * r);
      ctx.fillStyle = opts.pattern; ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
      ctx.restore();
      ctx.fillStyle = shadeAmt < 1 ? `rgba(0,0,0,${(1 - shadeAmt) * 0.85})` : `rgba(255,255,255,${(shadeAmt - 1) * 0.6})`; ctx.fill();
    } else { ctx.fillStyle = opts.shade(opts.body, shadeAmt - 1); ctx.fill(); }
    if (opts.glass) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); }
    ctx.strokeStyle = opts.edge; ctx.lineWidth = Math.max(1, r * 0.045); ctx.stroke();
    // a glint on faces that catch the light
    if (opts.shine && lit > 0.75) { ctx.fillStyle = `rgba(255,255,255,${(lit - 0.75) * opts.shine * 1.6})`; ctx.fill(); }
    // the number
    if (n[2] > 0.3) {
      const [ax, ay] = faceAxes(q, f);
      ctx.save();
      ctx.transform(ax[0], ax[1], ay[0], ay[1], c[0] * r, c[1] * r);
      const label = faceLabel(d.label || d.geo, f.v), sz = r * (d.geo === 4 ? 0.36 : d.geo === 6 ? 0.62 : d.geo === 8 ? 0.42 : d.geo === 10 ? 0.4 : d.geo === 12 ? 0.42 : 0.34) * (label.length > 1 ? 0.8 : 1);
      ctx.font = `800 ${sz.toFixed(1)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const special = opts.special?.(d, f.v), ty = d.geo === 10 ? r * 0.12 : d.geo === 4 ? r * 0.04 : 0;
      ctx.globalAlpha *= Math.min(1, (n[2] - 0.3) * 3);
      ctx.lineWidth = Math.max(1, sz * 0.12); ctx.strokeStyle = special ? '#000' : opts.inkOutline; ctx.strokeText(label, 0, ty);
      ctx.fillStyle = special || opts.ink; ctx.fillText(label, 0, ty);
      if ((label === '6' || label === '9') && d.geo !== 6) ctx.fillRect(-sz * 0.22, ty + sz * 0.42, sz * 0.44, Math.max(1, sz * 0.07));
      ctx.restore();
    }
  }
}
// two flat axes across a face (in screen space), with "up" pointing the way the number should read
function faceAxes(q, f) {
  const n = qRot(q, f.n), up = norm(qRot(q, f.up));
  let right = norm(cross(n, up));
  if (dot(right, right) < 1e-6) right = [1, 0, 0];
  return [right, mulS(up, -1)];
}
// the face that should end up on top for a rolled value
export const faceFor = (kind, v) => model(kind).faces.find(f => f.v === v) || model(kind).faces[0];

// the orientation a die comes to rest in: the rolled face straight up, and its number turned upright to read
export function restQ(kind, q, face) {
  const n = qRot(q, face.n);
  let t = qMul(qArc(n, [0, 0, 1]), q);
  const u = qRot(t, face.up), tw = -Math.PI / 2 - Math.atan2(u[1], u[0]);
  return qMul(qAxis([0, 0, 1], tw), t);
}
export const upness = (q, face) => qRot(q, face.n)[2];
