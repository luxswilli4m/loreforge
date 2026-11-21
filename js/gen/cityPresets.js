// Ready-made city pieces: single fantasy buildings and whole sets (with their own streets) that can be
// dropped, rotated, picked up again and moved. Everything is laid out in "units" of a tenth of a town block,
// facing south (+y), and scaled to the map when it's placed.
import { addCityRoad, addCityWall, snapToRoad, removeCityRoad, updateBridges, regateCity } from './city.js';
import { pointInPoly, centroid } from './core.js';

// ---------- little shape helpers (local units) ----------
const R = (x, y, w, h) => [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
const C = (x, y, r, n = 14) => Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * Math.PI * 2) * r, y + Math.sin(i / n * Math.PI * 2) * r]);
const S = (pts, k = 1, dx = 0, dy = 0) => pts.map(([x, y]) => [x * k + dx, y * k + dy]);
const stone = poly => ({ poly, mat: 'stone', special: true });
const roof = poly => ({ poly, mat: 'roof', special: true });
const AWNINGS = ['#c8463e', '#3c78aa', '#deaa3c', '#46966a', '#8a5aa8', '#d97a3a'];

function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// a row of houses along x (from x0 to x1), front edge at y, going `dir` (+1 down / -1 up) by depth
function row(r, x0, x1, y, dir, depth = 3.2, gapEvery = null) {
  const out = []; let x = x0;
  while (x < x1 - 1.2) {
    const w = Math.min(x1 - x, 2.4 + r() * 1.4), dd = depth * (0.8 + r() * 0.2);
    if (!gapEvery || !gapEvery(x + w / 2)) out.push({ poly: [[x + 0.08, y], [x + w - 0.08, y], [x + w - 0.08, y + dir * dd], [x + 0.08, y + dir * dd]] });
    x += w;
  }
  return out;
}
const col = (r, y0, y1, x, dir, depth = 3.2, skip) => row(r, y0, y1, x, dir, depth, skip).map(b => ({ ...b, poly: b.poly.map(([a, c]) => [c, a]) }));

// ---------- single buildings ----------
const cross = (k = 1) => S([[-2, -7], [2, -7], [2, -4], [5, -4], [5, -1], [2, -1], [2, 6], [1.75, 6], [1.75, 9.5], [-1.75, 9.5], [-1.75, 6], [-2, 6], [-2, -1], [-5, -1], [-5, -4], [-2, -4]], k);
export const BUILDINGS = {
  castle: { label: 'Castle', emoji: '🏰', make: () => ({
    buildings: [stone(R(0, -1, 7, 7)), ...[[-8, -8], [8, -8], [8, 8], [-8, 8]].map(([x, y]) => stone(C(x, y, 2.2))), stone(R(0, 8.5, 4.5, 3))],
    plazas: [R(0, 0, 15, 15)], walls: [{ pts: R(0, 0, 16, 16), closed: true }], roads: [{ pts: [[0, 8], [0, 18]], open: [false, true] }] }) },
  church: { label: 'Church', emoji: '⛪', make: () => ({ buildings: [stone(cross())] }) },
  cathedral: { label: 'Cathedral', emoji: '🕍', make: () => ({ buildings: [stone(cross(1.6)), stone(R(-2.9, 15.6, 2.6, 2.6)), stone(R(2.9, 15.6, 2.6, 2.6))], plazas: [R(0, 20, 12, 6)] }) },
  chapel: { label: 'Chapel', emoji: '🛐', make: () => ({ buildings: [stone([[-1.7, 3], [1.7, 3], [1.7, -1.5], ...C(0, -1.5, 1.7, 12).filter(([, y]) => y <= -1.5).sort((a, b) => b[0] - a[0]), [-1.7, -1.5]])] }) },
  blacksmith: { label: 'Blacksmith', emoji: '⚒️', make: () => ({ buildings: [roof([[-3, -2.5], [3, -2.5], [3, 0.5], [0, 0.5], [0, 2.5], [-3, 2.5]]), stone(R(1.6, 1.7, 1.6, 1.6))] }) },
  tavern: { label: 'Tavern', emoji: '🍺', make: () => ({ buildings: [roof(R(0, 0, 7, 4.5)), roof(R(-2.4, 3.3, 2.2, 2.1))] }) },
  inn: { label: 'Inn', emoji: '🛏️', make: () => ({ buildings: [roof([[-5, -4], [5, -4], [5, 4], [2.6, 4], [2.6, -1.5], [-2.6, -1.5], [-2.6, 4], [-5, 4]])], plazas: [R(0, 1.3, 5, 5.4)] }) },
  guildhall: { label: 'Guild hall', emoji: '🏛️', make: () => ({ buildings: [roof(R(0, 0, 9, 6)), roof(R(0, -4, 4, 2.2))] }) },
  townhall: { label: 'Town hall', emoji: '🏢', make: () => ({ buildings: [stone(R(0, 0, 8, 5.5)), stone(R(0, 3.8, 2.6, 2.6))], plazas: [R(0, 7.5, 11, 4.5)] }) },
  magetower: { label: 'Mage tower', emoji: '🔮', make: () => ({ buildings: [stone(C(0, 0, 2.7, 16)), stone(C(2.9, 1.8, 1.4, 12))] }) },
  watchtower: { label: 'Watchtower', emoji: '🗼', make: () => ({ buildings: [stone(R(0, 0, 3, 3))] }) },
  barracks: { label: 'Barracks', emoji: '⚔️', make: () => ({ buildings: [roof(R(0, -3, 11, 3.2)), roof(R(0, 3, 11, 3.2))], plazas: [R(0, 0, 12, 3)] }) },
  stables: { label: 'Stables', emoji: '🐎', make: () => ({ buildings: [roof([[-6, -2.5], [6, -2.5], [6, 2.5], [4, 2.5], [4, -0.6], [-4, -0.6], [-4, 2.5], [-6, 2.5]])] }) },
  windmill: { label: 'Windmill', emoji: '🌾', make: () => ({ buildings: [roof(C(0, 0, 1.9, 12)), roof(R(0, 0, 0.7, 7.5)), roof(R(0, 0, 7.5, 0.7))] }) },
  granary: { label: 'Granary', emoji: '🌽', make: () => ({ buildings: [roof(R(0, 0, 6, 3.6)), roof(C(4.3, 0, 1.4, 12))] }) },
  manor: { label: 'Manor house', emoji: '🏡', make: () => ({ buildings: [roof([[-6, -4], [-3, -4], [-3, -1], [3, -1], [3, -4], [6, -4], [6, 4], [3, 4], [3, 1], [-3, 1], [-3, 4], [-6, 4]])] }) },
  library: { label: 'Library', emoji: '📚', make: () => ({ buildings: [stone(C(0, 0, 3.6, 8)), stone(R(0, 4.2, 3.2, 2.6))] }) },
  alchemist: { label: 'Alchemist', emoji: '⚗️', make: () => ({ buildings: [roof(R(-0.9, 0, 4, 3.4)), stone(C(2.1, 0.6, 1.3, 10))] }) },
  bathhouse: { label: 'Bathhouse', emoji: '♨️', make: () => ({ buildings: [stone(R(0, -1.5, 7, 3)), stone(R(-3, 2, 1, 4)), stone(R(3, 2, 1, 4))], plazas: [R(0, 2, 5, 4)] }) },
  arena: { label: 'Arena', emoji: '🏟️', make: () => {
    const n = 18, rx = 8, ry = 6, t = 2, seg = [];
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; seg.push(stone([[Math.cos(a0) * rx, Math.sin(a0) * ry], [Math.cos(a1) * rx, Math.sin(a1) * ry], [Math.cos(a1) * (rx - t), Math.sin(a1) * (ry - t)], [Math.cos(a0) * (rx - t), Math.sin(a0) * (ry - t)]])); }
    return { buildings: seg, plazas: [C(0, 0, rx - t + 0.2, 24).map(([x, y]) => [x, y * (ry - t) / (rx - t)])] };
  } },
};

// ---------- sets, with their own streets ----------
export const SETS = {
  market: { label: 'Market square', emoji: '🛒', make: r => {
    const b = [];
    for (let x = -5; x <= 5.1; x += 2.5) for (let y = -3; y <= 3.1; y += 3) if (r() > 0.18 && Math.abs(x) > 0.6) b.push({ poly: R(x + (r() - 0.5) * 0.4, y + (r() - 0.5) * 0.4, 1.5, 1.1), color: AWNINGS[Math.floor(r() * AWNINGS.length)] });
    const gap = v => Math.abs(v) < 1.8;
    b.push(...row(r, -9.6, 9.6, -6, -1, 3.2, gap), ...row(r, -9.6, 9.6, 6, 1, 3.2, gap), ...col(r, -5.5, 5.5, -7.6, -1, 3.2, gap), ...col(r, -5.5, 5.5, 7.6, 1, 3.2, gap));
    return { buildings: b, plazas: [R(0, 0, 15, 12)], labels: [{ name: 'Market', p: [0, 0] }],
      roads: [{ pts: [[0, -6], [0, -17]], open: [false, true] }, { pts: [[0, 6], [0, 17]], open: [false, true] }, { pts: [[-7.5, 0], [-19, 0]], open: [false, true] }, { pts: [[7.5, 0], [19, 0]], open: [false, true] }] };
  } },
  block: { label: 'Town block', emoji: '🏘️', make: r => {
    const b = [];
    for (const [x0, x1] of [[-9.6, -1.4], [1.4, 9.6]]) {
      b.push(...row(r, x0, x1, -6.6, 1), ...row(r, x0, x1, 6.6, -1));
      b.push(...row(r, x0, x1, -0.1, -1, 3.1), ...row(r, x0, x1, 0.1, 1, 3.1));
    }
    return { buildings: b, roads: [{ pts: [[-11, -8], [11, -8], [11, 8], [-11, 8], [-11, -8]], open: [false, false] }, { pts: [[0, -15], [0, 15]], open: [true, true] }, { pts: [[-18, 0], [-11, 0]], open: [true, false] }, { pts: [[11, 0], [18, 0]], open: [false, true] }] };
  } },
  temple: { label: 'Temple square', emoji: '⛪', make: r => {
    const b = [stone(S(cross(), 0.9, 0, -9))];
    b.push(...col(r, -4, 8, -7.2, -1), ...col(r, -4, 8, 7.2, 1), ...row(r, -6.8, 6.8, 9.6, 1, 3, v => Math.abs(v) < 1.8));
    return { buildings: b, plazas: [R(0, 2.5, 14, 13)], labels: [{ name: 'Temple Square', p: [0, 2] }],
      trees: [[-5, -2], [5, -2], [-5, 6], [5, 6]].map(([x, y]) => [x, y, 0.9]), roads: [{ pts: [[0, 9], [0, 19]], open: [false, true] }, { pts: [[-7, 4], [-18, 4]], open: [false, true] }, { pts: [[7, 4], [18, 4]], open: [false, true] }] };
  } },
  castle: { label: 'Castle compound', emoji: '🏯', make: r => ({
    buildings: [stone(R(0, -4, 8, 8)), ...[[-4, -8], [4, -8], [4, 0], [-4, 0]].map(([x, y]) => stone(C(x, y, 1.6))), roof(R(-9, 4, 6, 3)), roof(R(9, 4, 6, 3)), roof(R(-9, -6, 4, 4)), stone(R(9, -6, 3, 3))],
    plazas: [R(0, 3, 26, 14)], walls: [{ pts: R(0, 0, 28, 22), closed: true }], labels: [{ name: 'Castle', p: [0, -4] }],
    trees: [[-11, 9], [11, 9]].map(([x, y]) => [x, y, 0.9 + r() * 0.3]), roads: [{ pts: [[0, 3], [0, 22]], open: [false, true] }] }) },
  hamlet: { label: 'Crossroads hamlet', emoji: '🛤️', make: r => {
    const b = [], skip = v => Math.abs(v) < 2.2 || r() < 0.3;
    b.push(...row(r, -16, 16, -1.9, -1, 3, skip), ...row(r, -16, 16, 1.9, 1, 3, skip), ...col(r, -14, 14, -1.9, -1, 3, skip), ...col(r, -14, 14, 1.9, 1, 3, skip));
    const trees = []; for (let i = 0; i < 16; i++) { const x = (r() - 0.5) * 30, y = (r() - 0.5) * 26; if (Math.abs(x) > 6.5 && Math.abs(y) > 6.5) trees.push([x, y, 0.8 + r() * 0.5]); }
    return { buildings: [...b.filter(h => !h.poly.some(([x, y]) => x > 2 && x < 9 && y < -2 && y > -8)), roof(R(5.5, -5, 6, 4))], trees, labels: [{ name: 'Crossroads Inn', p: [5.5, -5] }],
      roads: [{ pts: [[-19, 0], [19, 0]], open: [true, true] }, { pts: [[0, -17], [0, 17]], open: [true, true] }] };
  } },
  estate: { label: 'Noble estate', emoji: '👑', make: r => {
    const trees = []; for (const x of [-10, -7, 7, 10]) for (let y = 3; y <= 10; y += 2.3) trees.push([x, y, 0.85]);
    return { buildings: [roof(S([[-6, -4], [-3, -4], [-3, -1], [3, -1], [3, -4], [6, -4], [6, 4], [3, 4], [3, 1], [-3, 1], [-3, 4], [-6, 4]], 1.15, 0, -5)), stone(S([[-1.7, 3], [1.7, 3], [1.7, -1.5], [0, -3.2], [-1.7, -1.5]], 1, 11, -8)), roof(R(-11, -8, 5, 3))],
      plazas: [R(0, 4, 4, 9)], trees, walls: [{ pts: R(0, -1, 30, 24), closed: true }], labels: [{ name: 'Manor', p: [0, -5] }], roads: [{ pts: [[0, 2], [0, 21]], open: [false, true] }] };
  } },
  farm: { label: 'Farmstead', emoji: '🚜', make: r => {
    const trees = []; for (let i = 0; i < 6; i++) trees.push([-9 + r() * 4, -8 + r() * 4, 0.9 + r() * 0.4]);
    return { buildings: [roof(R(-4, -2, 5, 3.6)), roof(R(4.5, -2.2, 7, 4.6)), roof(C(9.3, 2, 1.6, 12))],
      fields: [{ poly: R(-10, 9, 12, 9), angle: 0 }, { poly: R(5, 9, 14, 9), angle: Math.PI / 2 }, { poly: R(-16, -4, 7, 11), angle: 0.3 }, { poly: R(16, -3, 7, 12), angle: Math.PI / 2 }],
      trees, labels: [{ name: 'Farm', p: [0, -2] }], roads: [{ pts: [[0, 1.5], [0, 20]], open: [false, true] }] };
  } },
};
export const PIECE = key => BUILDINGS[key] || SETS[key];

// the laid-out piece in local units (same seed = same houses, so the preview matches what is placed)
export function layoutOf(key, seed) {
  const def = PIECE(key); if (!def) return null;
  const lay = def.make(rng(seed));
  for (const k of ['buildings', 'roads', 'plazas', 'walls', 'trees', 'fields', 'labels']) lay[k] = lay[k] || [];
  if (BUILDINGS[key] && !lay.labels.length) lay.labels.push({ name: def.label, p: centroid(lay.buildings[0].poly) });
  return lay;
}

// local units → map pixels
export function transformer(d, at, rot, scale) {
  const U = d.s / 10 * scale, c = Math.cos(rot), s = Math.sin(rot);
  const T = ([x, y]) => [at[0] + (x * c - y * s) * U, at[1] + (x * s + y * c) * U];
  T.U = U; T.rot = rot;
  return T;
}

// drop a piece onto the city. Returns the group id that ties its parts together.
export function placePiece(d, key, seed, at, rot, scale, opts = {}) {
  const lay = layoutOf(key, seed), T = transformer(d, at, rot, scale), U = T.U;
  const g = 'g' + Math.random().toString(36).slice(2, 8);
  // clear what's underneath: anything inside the outline of the new piece
  const pts = [...lay.buildings.flatMap(b => b.poly), ...lay.plazas.flat(), ...lay.walls.flatMap(w => w.pts), ...lay.fields.flatMap(f => f.poly)].map(T);
  const hull = convexHull(pts);
  if (hull.length > 2) {
    d.buildings = d.buildings.filter(b => !pointInPoly(centroid(b.poly), hull));
    d.trees = d.trees.filter(t => !pointInPoly(t.p, hull));
  }
  d.plazas = d.plazas || []; d.roadG = d.roadG || []; d.groups = d.groups || {};
  for (const f of lay.fields) d.fields.push({ poly: f.poly.map(T), angle: (f.angle || 0) + rot, tone: Math.floor(Math.random() * 3), g });
  for (const p of lay.plazas) d.plazas.push({ poly: p.map(T), g });
  for (const w of lay.walls) { addCityWall(d, w.pts.map(T), w.closed, false); d.walls2[d.walls2.length - 1].g = g; }
  for (const rd of lay.roads) {
    const p = rd.pts.map(T);
    // streets that end at the edge of the piece can run on to join the nearest road
    if (opts.snap) for (const [k, idx] of [[0, 0], [1, p.length - 1]]) {
      if (!rd.open?.[k]) continue;
      const q = snapToRoad(d, p[idx], 9 * U);
      if (q && Math.hypot(q[0] - p[idx][0], q[1] - p[idx][1]) > U * 0.3) { if (idx === 0) p.unshift(q); else p.push(q); }
    }
    addCityRoad(d, p); d.roadG[d.roads.length - 1] = g;
  }
  const rv = Math.random;
  for (const b of lay.buildings) d.buildings.push({ poly: b.poly.map(T), kind: b.special ? 'special' : 'house', ...(b.mat ? { mat: b.mat } : {}), ...(b.color ? { color: b.color } : {}), v: rv(), g });
  for (const [x, y, s] of lay.trees) d.trees.push({ p: T([x, y]), s: s * U * 0.75, v: rv(), g });
  if (opts.labels !== false) for (const l of lay.labels) d.labels.push({ name: l.name, p: T(l.p), kind: 'landmark', g });
  d.groups[g] = { key, seed, rot, scale };
  return g;
}

// the placed piece under a point, if any
export function groupAt(d, p) {
  for (const b of d.buildings) if (b.g && pointInPoly(p, b.poly)) return b.g;
  for (const pl of d.plazas || []) if (pl.g && pointInPoly(p, pl.poly)) return pl.g;
  return null;
}
// lift a placed piece off the map; returns how it was placed so it can be dropped again
export function pickUpPiece(d, g) {
  const info = d.groups?.[g]; if (!info) return null;
  const keep = x => x.g !== g;
  d.buildings = d.buildings.filter(keep); d.trees = d.trees.filter(keep); d.labels = d.labels.filter(keep);
  d.plazas = (d.plazas || []).filter(keep); d.fields = d.fields.filter(keep); d.walls2 = (d.walls2 || []).filter(keep);
  for (let i = d.roads.length - 1; i >= 0; i--) if (d.roadG?.[i] === g) removeCityRoad(d, i);
  regateCity(d); updateBridges(d);
  delete d.groups[g];
  return info;
}

function convexHull(pts) {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
