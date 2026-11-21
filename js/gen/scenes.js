// Isometric scenes: a small engine with one detailed, hand-tuned style, and three sample scenes (a walled town, a harbour,
// and a mining town cut into a mountainside). Every tile is 5 ft, so the scenes double as battle maps with an isometric grid.
// Everything here is drawn by code: no outside art is used.

const TW = 64, TH = 32;   // a tile's width and height on screen (2:1 isometric)
const ZS = 1;             // one height unit = one screen pixel

// ---------- a seeded random generator, so a scene always comes out the same ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const mix = (a, b, t) => a + (b - a) * t;
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const c = v => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// ---------- the palette (one style, warm late-afternoon light from the left) ----------
const P = {
  grass: '#6f8f3e', grass2: '#86a64a', dirt: '#9a7a52', cobble: '#9c958a', cobbleD: '#6f6a62', sand: '#d8c08a', plank: '#8a5e36', rock: '#8c8478', rockD: '#5e574e',
  water: '#2f6f8a', waterD: '#1c4a63', foam: '#e8f4f2', snow: '#eef2f4',
  wallPlaster: '#e6d6b4', wallStone: '#b7ab96', wallTimber: '#dccaa2', wallBrick: '#b86a4a', wood: '#5a3a22', beam: '#3e2816',
  roofRed: '#a5452e', roofSlate: '#56606e', roofThatch: '#b89452', roofGreen: '#4f7a56', roofBlue: '#3f5e8a',
  window: '#2a2f3a', glow: '#ffcf6a', leaf: '#4d7a32', leaf2: '#6a9a3e', trunk: '#5a3e26', sail: '#efe6cf', rail: '#4a4038',
};

export function createScene(cols, rows, seed = 1) {
  const S = { cols, rows, r: rng(seed), ground: [], z: new Float32Array(cols * rows), objs: [] };
  for (let i = 0; i < cols * rows; i++) S.ground.push('grass');
  return S;
}
export const at = (S, x, y) => (x >= 0 && y >= 0 && x < S.cols && y < S.rows) ? x + y * S.cols : -1;
const groundAt = (S, x, y) => { const i = at(S, x, y); return i < 0 ? null : S.ground[i]; };
const zAt = (S, x, y) => { const i = at(S, x, y); return i < 0 ? 0 : S.z[i]; };
export function fill(S, x0, y0, x1, y1, kind) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = at(S, x, y); if (i >= 0) S.ground[i] = kind; } }
export function raise(S, x0, y0, x1, y1, z) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = at(S, x, y); if (i >= 0) S.z[i] = z; } }
export const add = (S, o) => (S.objs.push(o), o);

// ---------- drawing ----------
export function renderScene(S) {
  const maxZ = Math.max(0, ...S.z);
  const W = (S.cols + S.rows) * TW / 2 + 40, H = (S.cols + S.rows) * TH / 2 + maxZ + 160;
  const ox = S.rows * TW / 2 + 20, oy = maxZ + 120;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const pt = (x, y, z = 0) => [ox + (x - y) * TW / 2, oy + (x + y) * TH / 2 - z * ZS];
  const poly = (pts, fillStyle, stroke, lw = 1) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); if (fillStyle) { g.fillStyle = fillStyle; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  const R = rng(S.r() * 1e9);

  // sky and haze behind everything
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#8fb3c9'); sky.addColorStop(0.5, '#c9d6c8'); sky.addColorStop(1, '#3e5a3a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);

  // ---------- terrain: tiles back to front, with cliff sides where the ground drops ----------
  const waterTile = k => k === 'water';
  for (let d = 0; d < S.cols + S.rows; d++) for (let x = 0; x <= d; x++) {
    const y = d - x; if (x >= S.cols || y >= S.rows) continue;
    const k = S.ground[at(S, x, y)], z = zAt(S, x, y);
    // cliff faces toward +x and +y
    const zx = x + 1 < S.cols ? zAt(S, x + 1, y) : 0, zy = y + 1 < S.rows ? zAt(S, x, y + 1) : 0;
    if (z > zy) face(x, y + 1, x + 1, y + 1, zy, z, 'left', x, y);
    if (z > zx) face(x + 1, y, x + 1, y + 1, zx, z, 'right', x, y);
    tile(x, y, z, k);
  }
  function face(x0, y0, x1, y1, z0, z1, side, tx, ty) {
    const base = side === 'left' ? P.rock : P.rockD;
    poly([pt(x0, y0, z1), pt(x1, y1, z1), pt(x1, y1, z0), pt(x0, y0, z0)], base);
    // strata and cracks
    const h = z1 - z0;
    g.save(); g.beginPath(); [pt(x0, y0, z1), pt(x1, y1, z1), pt(x1, y1, z0), pt(x0, y0, z0)].forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.clip();
    const rr = rng((tx * 73856093) ^ (ty * 19349663) ^ (side === 'left' ? 7 : 13));
    for (let s = 6; s < h; s += 6 + rr() * 8) { const a = pt(x0, y0, z1 - s), b = pt(x1, y1, z1 - s - (rr() - 0.5) * 4); g.strokeStyle = `rgba(0,0,0,${0.12 + rr() * 0.12})`; g.lineWidth = 1 + rr() * 1.5; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    for (let c = 0; c < h / 10; c++) { const t = rr(), s = rr() * h; const a = pt(mix(x0, x1, t), mix(y0, y1, t), z1 - s); g.strokeStyle = 'rgba(30,25,20,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...a); g.lineTo(a[0] + (rr() - 0.5) * 6, a[1] + 6 + rr() * 10); g.stroke(); }
    const lg = g.createLinearGradient(0, pt(x0, y0, z1)[1], 0, pt(x0, y0, z0)[1]); lg.addColorStop(0, 'rgba(255,240,210,.18)'); lg.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    g.restore();
    // grass lip on top edge
    if (side === 'left') { g.strokeStyle = shade(P.grass, -0.2); g.lineWidth = 2; g.beginPath(); g.moveTo(...pt(x0, y0, z1)); g.lineTo(...pt(x1, y1, z1)); g.stroke(); }
  }
  function tile(x, y, z, k) {
    const c = [pt(x, y, z), pt(x + 1, y, z), pt(x + 1, y + 1, z), pt(x, y + 1, z)];
    const rr = rng((x * 92837111) ^ (y * 689287499));
    const base = { grass: rr() < 0.5 ? P.grass : P.grass2, dirt: P.dirt, cobble: P.cobble, sand: P.sand, plank: P.plank, rock: P.rock, water: P.water, snow: P.snow, field: '#b8a24e', farm: '#7a5a34' }[k] || P.grass;
    let fillC = base;
    if (k === 'water') {
      // deeper away from the shore
      let near = 9; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = groundAt(S, x + dx, y + dy); if (q && q !== 'water') near = Math.min(near, Math.hypot(dx, dy)); }
      fillC = near < 1.5 ? '#3f8aa0' : near < 3 ? P.water : P.waterD;
    }
    poly(c, fillC);
    // texture
    const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2;
    if (k === 'grass') for (let i = 0; i < 9; i++) { const u = rr(), v = rr(), p = pt(x + u, y + v, z); g.strokeStyle = rr() < 0.5 ? 'rgba(40,70,20,.35)' : 'rgba(200,220,120,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + (rr() - 0.5) * 3, p[1] - 3 - rr() * 3); g.stroke(); }
    if (k === 'cobble') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const p = pt(x + (i + 0.5 + (rr() - 0.5) * 0.3) / 4, y + (j + 0.5 + (rr() - 0.5) * 0.3) / 4, z); g.fillStyle = shade(P.cobble, (rr() - 0.5) * 0.25); g.beginPath(); g.ellipse(p[0], p[1], 6.5, 3.4, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(40,35,30,.45)'; g.lineWidth = 0.8; g.stroke(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(p[0] - 1.5, p[1] - 1, 3, 1.3, 0, 0, Math.PI * 2); g.fill(); }
    }
    if (k === 'plank') { for (let i = 1; i < 5; i++) { const a = pt(x, y + i / 5, z), b = pt(x + 1, y + i / 5, z); g.strokeStyle = 'rgba(40,25,12,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); } g.fillStyle = 'rgba(255,220,170,.08)'; g.beginPath(); c.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.fill(); }
    if (k === 'dirt' || k === 'sand') for (let i = 0; i < 10; i++) { const p = pt(x + rr(), y + rr(), z); g.fillStyle = `rgba(${k === 'sand' ? '120,95,50' : '60,40,20'},${0.15 + rr() * 0.2})`; g.fillRect(p[0], p[1], 1.6, 1.2); }
    if (k === 'field') for (let i = 1; i < 6; i++) { const a = pt(x + i / 6, y, z), b = pt(x + i / 6, y + 1, z); g.strokeStyle = 'rgba(110,80,30,.5)'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    if (k === 'rock' || k === 'snow') for (let i = 0; i < 4; i++) { const p = pt(x + rr(), y + rr(), z); g.fillStyle = k === 'snow' ? 'rgba(160,180,200,.3)' : 'rgba(40,35,30,.25)'; g.beginPath(); g.ellipse(p[0], p[1], 3 + rr() * 4, 1.5 + rr() * 2, 0, 0, Math.PI * 2); g.fill(); }
    if (k === 'water') {
      for (let i = 0; i < 3; i++) { const p = pt(x + rr(), y + rr(), z); g.strokeStyle = 'rgba(220,240,255,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p[0] - 5, p[1]); g.quadraticCurveTo(p[0], p[1] - 2, p[0] + 5, p[1]); g.stroke(); }
      // foam where water meets land
      const edges = [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]];
      for (const [dx, dy, a, b] of edges) { const q = groundAt(S, x + dx, y + dy); if (q && q !== 'water') { g.strokeStyle = 'rgba(240,250,248,.75)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(...c[a]); g.lineTo(...c[b]); g.stroke(); g.strokeStyle = 'rgba(240,250,248,.3)'; g.lineWidth = 6; g.stroke(); } }
    } else {
      // soft edge shading between tiles of different ground
      const edges = [[0, -1, 0, 1], [-1, 0, 3, 0]];
      for (const [dx, dy, a, b] of edges) { const q = groundAt(S, x + dx, y + dy); if (q && q !== k && !waterTile(q)) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(...c[a]); g.lineTo(...c[b]); g.stroke(); } }
    }
    void cx; void cy;
  }


  // ---------- object painters ----------
  function shadow(pts) { poly(pts, 'rgba(20,20,30,.28)'); }
  function box(x, y, z, w, d, h, left, right, top) {
    poly([pt(x, y + d, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x, y + d, z + h)], left);
    poly([pt(x + w, y, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x + w, y, z + h)], right);
    if (top) poly([pt(x, y, z + h), pt(x + w, y, z + h), pt(x + w, y + d, z + h), pt(x, y + d, z + h)], top);
  }
  function windowsOn(face, x, y, z, w, d, h, rr, opts = {}) {
    // face 'left' runs along x at y+d; 'right' runs along y at x+w
    const len = face === 'left' ? w : d, floors = Math.max(1, Math.floor(h / 28)), per = Math.max(1, Math.round(len * 1.4));
    for (let f = 0; f < floors; f++) for (let i = 0; i < per; i++) {
      if (opts.door && f === 0 && i === Math.floor(per / 2) && face === 'left') continue;
      const t = (i + 0.5) / per, zz = z + 8 + f * 28, ww = Math.min(0.22, 0.6 / per), hh = 12;
      const at2 = (tt, zz2) => face === 'left' ? pt(x + tt * w, y + d, zz2) : pt(x + w, y + tt * d, zz2);
      const lit = rr() < 0.35;
      poly([at2(t - ww / 2, zz), at2(t + ww / 2, zz), at2(t + ww / 2, zz + hh), at2(t - ww / 2, zz + hh)], lit ? P.glow : P.window, 'rgba(50,30,15,.8)', 1.2);
      if (lit) { const c = at2(t, zz + hh / 2); const gl = g.createRadialGradient(c[0], c[1], 1, c[0], c[1], 14); gl.addColorStop(0, 'rgba(255,200,90,.35)'); gl.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gl; g.fillRect(c[0] - 14, c[1] - 14, 28, 28); }
      // a little sill
      const s0 = at2(t - ww / 2 - 0.02, zz - 1), s1 = at2(t + ww / 2 + 0.02, zz - 1); g.strokeStyle = 'rgba(240,230,210,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...s0); g.lineTo(...s1); g.stroke();
    }
    if (opts.door && face === 'left') {
      const t = 0.5, at2 = (tt, zz2) => pt(x + tt * w, y + d, zz2), dw = Math.min(0.28, 0.7 / w);
      poly([at2(t - dw / 2, z), at2(t + dw / 2, z), at2(t + dw / 2, z + 20), at2(t, z + 23), at2(t - dw / 2, z + 20)], P.wood, P.beam, 1.2);
    }
  }
  const DRAW = {
    house(o) {
      const rr = rng(o.seed ?? (o.x * 31 + o.y * 17)), z = o.z ?? zAt(S, o.x, o.y), { x, y, w, d } = o, h = o.h || 34, rh = o.rh ?? Math.min(w, d) * 16 + 6;
      const wall = o.wall || P.wallPlaster, roof = o.roof || P.roofRed;
      // cast shadow to the right
      shadow([pt(x + w, y, z), pt(x + w + 0.9, y + 0.5, z), pt(x + w + 0.9, y + d + 0.5, z), pt(x + w, y + d, z)]);
      box(x, y, z, w, d, h, shade(wall, 0.08), shade(wall, -0.22));
      // timber framing
      if (o.timber) {
        g.strokeStyle = P.beam; g.lineWidth = 2;
        for (const face of ['left', 'right']) {
          const len = face === 'left' ? w : d, at2 = (tt, zz) => face === 'left' ? pt(x + tt * w, y + d, zz) : pt(x + w, y + tt * d, zz);
          for (let i = 0; i <= Math.round(len * 2); i++) { const t = i / Math.round(len * 2); g.beginPath(); g.moveTo(...at2(t, z)); g.lineTo(...at2(t, z + h)); g.stroke(); }
          for (const zz of [z + 1, z + h / 2, z + h - 1]) { g.beginPath(); g.moveTo(...at2(0, zz)); g.lineTo(...at2(1, zz)); g.stroke(); }
          for (let i = 0; i < Math.round(len * 2); i++) { const t0 = i / Math.round(len * 2), t1 = (i + 1) / Math.round(len * 2); g.beginPath(); g.moveTo(...at2(t0, z + h / 2)); g.lineTo(...at2(t1, z + h - 1)); g.stroke(); }
        }
      }
      // stone base course
      if (o.wall !== P.wallStone) { box(x, y, z, w, d, 5, shade(P.wallStone, -0.1), shade(P.wallStone, -0.35)); }
      windowsOn('left', x, y, z, w, d, h, rr, { door: o.door !== false }); windowsOn('right', x, y, z, w, d, h, rr);
      // ambient shadow at the base
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(...pt(x, y + d, z)); g.lineTo(...pt(x + w, y + d, z)); g.lineTo(...pt(x + w, y, z)); g.stroke();
      roofOn(x, y, z + h, w, d, rh, roof, o.ridge || (w >= d ? 'x' : 'y'), rr, o.roofType);
      if (o.chimney) { const cx2 = x + w * 0.7, cy2 = y + d * 0.3; box(cx2, cy2, z + h + rh * 0.4, 0.22, 0.22, rh * 0.75, shade(P.wallBrick, 0), shade(P.wallBrick, -0.3), shade(P.wallBrick, -0.1)); smoke(pt(cx2 + 0.11, cy2 + 0.11, z + h + rh * 1.15 + 4), rr); }
      if (o.sign) { const p = pt(x + w * 0.2, y + d, z + h * 0.55); g.strokeStyle = P.beam; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...p); g.lineTo(p[0] - 8, p[1] + 4); g.stroke(); poly([[p[0] - 13, p[1] + 4], [p[0] - 3, p[1] + 4], [p[0] - 3, p[1] + 12], [p[0] - 13, p[1] + 12]], o.sign, P.beam, 1); }
    },
    tower(o) {
      const z = o.z ?? zAt(S, o.x, o.y), cx = o.x + 0.5 * (o.w || 1), cy = o.y + 0.5 * (o.w || 1), r = 0.5 * (o.w || 1) * 0.92, h = o.h || 90, rr = rng(o.x * 7 + o.y);
      const c = pt(cx, cy, z), rx = r * TW / 1.41, ry = r * TH / 1.41;
      g.fillStyle = 'rgba(20,20,30,.28)'; g.beginPath(); g.ellipse(c[0] + rx * 0.8, c[1] + ry * 0.4, rx * 1.1, ry * 1.1, 0, 0, Math.PI * 2); g.fill();
      const wg = g.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0); const wall = o.wall || P.wallStone; wg.addColorStop(0, shade(wall, 0.15)); wg.addColorStop(0.55, shade(wall, -0.05)); wg.addColorStop(1, shade(wall, -0.4));
      g.fillStyle = wg; g.beginPath(); g.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI); g.lineTo(c[0] - rx, c[1] - h); g.ellipse(c[0], c[1] - h, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
      // stone courses
      g.strokeStyle = 'rgba(40,35,30,.25)'; g.lineWidth = 1; for (let s = 8; s < h; s += 8) { g.beginPath(); g.ellipse(c[0], c[1] - s, rx, ry, 0, 0.1, Math.PI - 0.1); g.stroke(); }
      for (let i = 0; i < Math.floor(h / 30); i++) { const zz = 16 + i * 30, a = 0.35 + rr() * 0.3; const px = c[0] - rx * Math.cos(a * Math.PI), py = c[1] - zz + ry * Math.sin(a * Math.PI) * 0.4; g.fillStyle = rr() < 0.4 ? P.glow : P.window; g.fillRect(px - 2.5, py - 7, 5, 10); }
      if (o.cone !== false) {
        const top = [c[0], c[1] - h - (o.rh || 50)], cg = g.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0); const roof = o.roof || P.roofSlate; cg.addColorStop(0, shade(roof, 0.2)); cg.addColorStop(1, shade(roof, -0.35));
        g.fillStyle = cg; g.beginPath(); g.moveTo(c[0] - rx * 1.15, c[1] - h); g.ellipse(c[0], c[1] - h, rx * 1.15, ry * 1.15, 0, Math.PI, 0, true); g.lineTo(...top); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.18)'; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(...top); g.lineTo(c[0] - rx * 1.15 + i * rx * 2.3 / 6, c[1] - h + ry * 0.6); g.stroke(); }
        if (o.flag) { g.strokeStyle = '#333'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...top); g.lineTo(top[0], top[1] - 18); g.stroke(); poly([[top[0], top[1] - 18], [top[0] + 14, top[1] - 14], [top[0], top[1] - 10]], o.flag); }
      } else {
        // crenellations
        g.fillStyle = shade(wall, -0.1); g.beginPath(); g.ellipse(c[0], c[1] - h, rx, ry, 0, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const px = c[0] + Math.cos(a) * rx, py = c[1] - h + Math.sin(a) * ry; g.fillStyle = shade(wall, Math.cos(a) > 0 ? -0.3 : 0.1); g.fillRect(px - 3, py - 7, 6, 7); }
      }
    },
    wall(o) { // a straight stretch of town wall with a walkway and merlons
      const z = o.z ?? 0, h = o.h || 34, { x, y } = o, w = o.w || 1, d = o.d || 1;
      shadow([pt(x + w, y, z), pt(x + w + 0.8, y + 0.4, z), pt(x + w + 0.8, y + d + 0.4, z), pt(x + w, y + d, z)]);
      box(x, y, z, w, d, h, shade(P.wallStone, 0.05), shade(P.wallStone, -0.3), shade(P.wallStone, -0.08));
      g.strokeStyle = 'rgba(40,35,30,.25)'; g.lineWidth = 1;
      for (let s = 6; s < h; s += 7) { g.beginPath(); g.moveTo(...pt(x, y + d, z + s)); g.lineTo(...pt(x + w, y + d, z + s)); g.lineTo(...pt(x + w, y, z + s)); g.stroke(); }
      const along = w >= d, n = Math.round((along ? w : d) * 2);
      for (let i = 0; i < n; i += 2) { const t = i / n; if (along) box(x + t * w, y + d - 0.25, z + h, w / n, 0.25, 7, shade(P.wallStone, 0.05), shade(P.wallStone, -0.3), shade(P.wallStone, -0.05)); else box(x + w - 0.25, y + t * d, z + h, 0.25, d / n, 7, shade(P.wallStone, 0.05), shade(P.wallStone, -0.3), shade(P.wallStone, -0.05)); }
      if (o.gate) { const at2 = (tt, zz) => along ? pt(x + tt * w, y + d, zz) : pt(x + w, y + tt * d, zz); g.fillStyle = '#1e1a16'; g.beginPath(); g.moveTo(...at2(0.32, z)); g.lineTo(...at2(0.32, z + h * 0.55)); g.quadraticCurveTo(...at2(0.5, z + h * 0.85), ...at2(0.68, z + h * 0.55)); g.lineTo(...at2(0.68, z)); g.closePath(); g.fill(); g.strokeStyle = '#6a5a44'; g.lineWidth = 2; g.stroke(); }
    },
    tree(o) {
      const z = o.z ?? zAt(S, Math.floor(o.x), Math.floor(o.y)), c = pt(o.x + 0.5, o.y + 0.5, z), s = o.s || 1, rr = rng(o.x * 13 + o.y * 7 + 3);
      g.fillStyle = 'rgba(20,30,15,.3)'; g.beginPath(); g.ellipse(c[0] + 10 * s, c[1] + 3, 18 * s, 8 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = P.trunk; g.fillRect(c[0] - 2.5 * s, c[1] - 18 * s, 5 * s, 18 * s);
      if (o.pine) {
        for (let i = 0; i < 4; i++) { const yy = c[1] - 14 * s - i * 11 * s, ww = (20 - i * 4) * s; g.fillStyle = shade('#2f5a32', i * 0.06); g.beginPath(); g.moveTo(c[0] - ww, yy); g.lineTo(c[0], yy - 18 * s); g.lineTo(c[0] + ww, yy); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(c[0], yy - 18 * s); g.lineTo(c[0] + ww, yy); g.lineTo(c[0] + ww * 0.2, yy); g.closePath(); g.fill(); }
        if (o.snow) { g.fillStyle = 'rgba(245,248,250,.85)'; g.beginPath(); g.moveTo(c[0], c[1] - 14 * s - 3 * 11 * s - 18 * s); g.lineTo(c[0] - 6 * s, c[1] - 14 * s - 3 * 11 * s - 8 * s); g.lineTo(c[0] + 5 * s, c[1] - 14 * s - 3 * 11 * s - 9 * s); g.fill(); }
        return;
      }
      for (let i = 0; i < 7; i++) { const a = rr() * Math.PI * 2, rad = rr() * 10 * s; const bx = c[0] + Math.cos(a) * rad, by = c[1] - 30 * s + Math.sin(a) * rad * 0.7; const br = (9 + rr() * 6) * s; const lg = g.createRadialGradient(bx - br * 0.4, by - br * 0.5, 1, bx, by, br); lg.addColorStop(0, P.leaf2); lg.addColorStop(0.7, P.leaf); lg.addColorStop(1, shade(P.leaf, -0.35)); g.fillStyle = lg; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(210,235,150,.35)'; g.fillRect(c[0] - 14 * s + rr() * 16 * s, c[1] - 44 * s + rr() * 14 * s, 2, 2); }
    },
    stall(o) {
      const z = o.z ?? 0, { x, y } = o, rr = rng(x * 5 + y * 3), col = o.color || ['#b8323a', '#2f6aa8', '#d8a23a', '#3e8a4a'][Math.floor(rr() * 4)];
      shadow([pt(x + 0.9, y + 0.1, z), pt(x + 1.5, y + 0.4, z), pt(x + 1.5, y + 1.2, z), pt(x + 0.9, y + 0.9, z)]);
      box(x + 0.15, y + 0.2, z, 0.7, 0.6, 10, '#8a6440', '#5e4228', '#a47a4e');
      for (let i = 0; i < 5; i++) { const p = pt(x + 0.25 + rr() * 0.5, y + 0.3 + rr() * 0.4, z + 10); g.fillStyle = ['#d84a3a', '#e8b84a', '#7ab04a', '#b06ad0'][Math.floor(rr() * 4)]; g.beginPath(); g.arc(p[0], p[1] - 1, 2.2, 0, Math.PI * 2); g.fill(); }
      for (const [px, py] of [[0.12, 0.18], [0.88, 0.18], [0.12, 0.82], [0.88, 0.82]]) { const a = pt(x + px, y + py, z), b = pt(x + px, y + py, z + 22); g.strokeStyle = P.beam; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      // striped awning
      const n = 6; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; poly([pt(x + 0.05 + t0 * 0.9, y + 0.1, z + 26), pt(x + 0.05 + t1 * 0.9, y + 0.1, z + 26), pt(x + 0.05 + t1 * 0.9, y + 0.95, z + 18), pt(x + 0.05 + t0 * 0.9, y + 0.95, z + 18)], i % 2 ? '#f0e6d0' : col); }
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...pt(x + 0.05, y + 0.95, z + 18)); g.lineTo(...pt(x + 0.95, y + 0.95, z + 18)); g.stroke();
    },
    well(o) { const z = o.z ?? 0, c = pt(o.x + 0.5, o.y + 0.5, z); g.fillStyle = 'rgba(20,20,30,.28)'; g.beginPath(); g.ellipse(c[0] + 8, c[1] + 3, 16, 7, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = P.wallStone; g.beginPath(); g.ellipse(c[0], c[1], 14, 7, 0, 0, Math.PI); g.lineTo(c[0] - 14, c[1] - 10); g.ellipse(c[0], c[1] - 10, 14, 7, 0, Math.PI, 0, true); g.fill(); g.fillStyle = '#1f3a48'; g.beginPath(); g.ellipse(c[0], c[1] - 10, 10, 5, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = P.beam; g.lineWidth = 2; g.beginPath(); g.moveTo(c[0] - 12, c[1] - 10); g.lineTo(c[0] - 12, c[1] - 32); g.lineTo(c[0] + 12, c[1] - 32); g.lineTo(c[0] + 12, c[1] - 10); g.stroke(); poly([[c[0] - 16, c[1] - 30], [c[0], c[1] - 40], [c[0] + 16, c[1] - 30]], P.roofRed); },
    fountain(o) { const z = o.z ?? 0, c = pt(o.x + 1, o.y + 1, z); g.fillStyle = 'rgba(20,20,30,.25)'; g.beginPath(); g.ellipse(c[0] + 10, c[1] + 4, 44, 20, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = shade(P.wallStone, 0.1); g.beginPath(); g.ellipse(c[0], c[1], 42, 20, 0, 0, Math.PI); g.lineTo(c[0] - 42, c[1] - 8); g.ellipse(c[0], c[1] - 8, 42, 20, 0, Math.PI, 0, true); g.fill(); const wg = g.createRadialGradient(c[0], c[1] - 8, 2, c[0], c[1] - 8, 38); wg.addColorStop(0, '#7ac4d8'); wg.addColorStop(1, '#2f6f8a'); g.fillStyle = wg; g.beginPath(); g.ellipse(c[0], c[1] - 8, 36, 16, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = P.wallStone; g.fillRect(c[0] - 3, c[1] - 34, 6, 26); g.fillStyle = 'rgba(200,235,245,.8)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(c[0] + (i - 1.5) * 6, c[1] - 26 + i % 2 * 4, 1.5, 6, 0, 0, Math.PI * 2); g.fill(); } },
    lamp(o) { const z = o.z ?? zAt(S, Math.floor(o.x), Math.floor(o.y)), c = pt(o.x + 0.5, o.y + 0.5, z); g.strokeStyle = '#2a2420'; g.lineWidth = 2; g.beginPath(); g.moveTo(...c); g.lineTo(c[0], c[1] - 26); g.stroke(); const gl = g.createRadialGradient(c[0], c[1] - 28, 1, c[0], c[1] - 28, 26); gl.addColorStop(0, 'rgba(255,210,110,.7)'); gl.addColorStop(1, 'rgba(255,210,110,0)'); g.fillStyle = gl; g.fillRect(c[0] - 26, c[1] - 54, 52, 52); g.fillStyle = P.glow; g.fillRect(c[0] - 3, c[1] - 32, 6, 7); },
    crates(o) { const z = o.z ?? zAt(S, Math.floor(o.x), Math.floor(o.y)), rr = rng(o.x * 3 + o.y); for (let i = 0; i < (o.n || 3); i++) { const xx = o.x + rr() * 0.5, yy = o.y + rr() * 0.5, zz = z + (i > 1 ? 10 : 0); if (rr() < 0.5) { box(xx, yy, zz, 0.32, 0.32, 10, '#a07448', '#6e4e2e', '#b88a58'); g.strokeStyle = 'rgba(40,25,10,.6)'; g.beginPath(); g.moveTo(...pt(xx, yy + 0.32, zz)); g.lineTo(...pt(xx + 0.32, yy + 0.32, zz + 10)); g.stroke(); } else { const c = pt(xx + 0.15, yy + 0.15, zz); g.fillStyle = '#7a5232'; g.beginPath(); g.ellipse(c[0], c[1], 5, 2.5, 0, 0, Math.PI); g.lineTo(c[0] - 5, c[1] - 11); g.ellipse(c[0], c[1] - 11, 5, 2.5, 0, Math.PI, 0, true); g.fill(); g.strokeStyle = '#3a3430'; g.beginPath(); g.ellipse(c[0], c[1] - 3, 5, 2.5, 0, 0, Math.PI); g.stroke(); g.beginPath(); g.ellipse(c[0], c[1] - 8, 5, 2.5, 0, 0, Math.PI); g.stroke(); } } },
    post(o) { const z = o.z ?? 0, a = pt(o.x, o.y, z - 10), b = pt(o.x, o.y, z + 6); g.strokeStyle = '#3a2614'; g.lineWidth = 3; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); },
    boat(o) {
      // a ship along x (or y), hull, deck, masts and sails
      const z = -4, { x, y } = o, L = o.len || 4, B = o.beam || 1.2, alongX = o.dir !== 'y', rr = rng(x * 7 + y * 11);
      const P2 = (u, v, zz) => alongX ? pt(x + u, y + v, zz) : pt(x + v, y + u, zz);
      const hull = (zz, inset = 0) => { const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10 * L, half = B / 2 * Math.sin(Math.min(1, (i / 10) * 1.6) * Math.PI / 2) * (i > 8 ? 1 - (i - 8) / 2.6 : 1) - inset; pts.push(P2(u, B / 2 - half, zz)); } for (let i = 10; i >= 0; i--) { const u = i / 10 * L, half = B / 2 * Math.sin(Math.min(1, (i / 10) * 1.6) * Math.PI / 2) * (i > 8 ? 1 - (i - 8) / 2.6 : 1) - inset; pts.push(P2(u, B / 2 + half, zz)); } return pts; };
      // wake and shadow on the water
      poly(hull(z - 1).map(p => [p[0] + 6, p[1] + 4]), 'rgba(10,30,40,.35)');
      const sideL = hull(z), sideH = hull(z + 14);
      poly([...sideL.slice(11), ...sideH.slice(11).reverse()], '#6a4020');
      poly([...sideL.slice(0, 11), ...sideH.slice(0, 11).reverse()], '#4e2e16');
      poly(sideH, '#a8784a', '#3a2410', 1.5);
      for (let i = 1; i < 6; i++) { g.strokeStyle = 'rgba(60,35,15,.4)'; g.beginPath(); g.moveTo(...P2(0.4, B / 2 - B * 0.35 + i * B * 0.12, z + 14)); g.lineTo(...P2(L - 0.6, B / 2 - B * 0.35 + i * B * 0.12, z + 14)); g.stroke(); }
      const masts = o.masts || (L > 4 ? 2 : 1);
      for (let m = 0; m < masts; m++) {
        const u = L * (m + 1) / (masts + 1), base = P2(u, B / 2, z + 14), top = [base[0], base[1] - 70 - (m === 0 ? 0 : 10)];
        g.strokeStyle = '#3a2410'; g.lineWidth = 3; g.beginPath(); g.moveTo(...base); g.lineTo(...top); g.stroke();
        if (o.furled) { g.strokeStyle = P.sail; g.lineWidth = 4; g.beginPath(); g.moveTo(top[0] - 16, top[1] + 14); g.lineTo(top[0] + 16, top[1] + 6); g.stroke(); continue; }
        const sw = 22, sh = 40, s0 = [top[0] - sw, top[1] + 12], s1 = [top[0] + sw * 0.8, top[1] + 4];
        const sg = g.createLinearGradient(s0[0], 0, s1[0], 0); sg.addColorStop(0, P.sail); sg.addColorStop(1, shade(P.sail, -0.25));
        g.fillStyle = sg; g.beginPath(); g.moveTo(...s0); g.lineTo(...s1); g.quadraticCurveTo(s1[0] + 10, s1[1] + sh / 2, s1[0], s1[1] + sh); g.lineTo(s0[0], s0[1] + sh); g.quadraticCurveTo(s0[0] + 8, s0[1] + sh / 2, ...s0); g.fill();
        g.strokeStyle = 'rgba(60,50,40,.4)'; g.lineWidth = 1; g.stroke();
        if (o.crest) { g.fillStyle = o.crest; g.beginPath(); g.arc((s0[0] + s1[0]) / 2, s0[1] + sh / 2, 6, 0, Math.PI * 2); g.fill(); }
        if (m === masts - 1) { g.strokeStyle = 'rgba(40,30,20,.5)'; g.beginPath(); g.moveTo(...top); g.lineTo(...P2(L, B / 2, z + 14)); g.stroke(); }
        void rr;
      }
    },
    rowboat(o) { const z = -2, c = pt(o.x + 0.5, o.y + 0.5, z); g.fillStyle = 'rgba(10,30,40,.3)'; g.beginPath(); g.ellipse(c[0] + 4, c[1] + 3, 18, 7, -0.46, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7a5030'; g.beginPath(); g.ellipse(c[0], c[1] - 3, 17, 6, -0.46, 0, Math.PI * 2); g.fill(); g.fillStyle = '#a8784a'; g.beginPath(); g.ellipse(c[0], c[1] - 5, 13, 4, -0.46, 0, Math.PI * 2); g.fill(); },
    crane(o) { const z = o.z ?? 0, b = pt(o.x + 0.5, o.y + 0.5, z); box(o.x + 0.3, o.y + 0.3, z, 0.4, 0.4, 50, '#7a5232', '#5a3a22'); const t = pt(o.x + 0.5, o.y + 0.5, z + 50); g.strokeStyle = '#5a3a22'; g.lineWidth = 3; g.beginPath(); g.moveTo(...t); g.lineTo(t[0] + 46, t[1] + 14); g.stroke(); g.strokeStyle = '#2a2420'; g.lineWidth = 1; g.beginPath(); g.moveTo(t[0] + 44, t[1] + 14); g.lineTo(t[0] + 44, t[1] + 40); g.stroke(); box(o.x + 1.15, o.y + 0.9, z + 6, 0.3, 0.3, 8, '#a07448', '#6e4e2e', '#b88a58'); void b; },
    mine(o) { // a timber-framed tunnel mouth cut into the cliff face on the +y side of tile (x, y)
      const z0 = o.z0 ?? 0, { x, y } = o, at2 = (tt, zz) => pt(x - 0.4 + tt * 1.8, y + 1, zz), hh = 40;
      g.fillStyle = '#120f0d'; g.beginPath(); g.moveTo(...at2(0.18, z0)); g.lineTo(...at2(0.18, z0 + hh * 0.75)); g.quadraticCurveTo(...at2(0.5, z0 + hh * 1.12), ...at2(0.82, z0 + hh * 0.75)); g.lineTo(...at2(0.82, z0)); g.closePath(); g.fill();
      const ig = g.createRadialGradient(...at2(0.5, z0 + 8), 2, ...at2(0.5, z0 + 8), 20); ig.addColorStop(0, 'rgba(255,170,70,.45)'); ig.addColorStop(1, 'rgba(255,170,70,0)'); g.fillStyle = ig; g.beginPath(); g.moveTo(...at2(0.18, z0)); g.lineTo(...at2(0.18, z0 + hh * 0.75)); g.lineTo(...at2(0.82, z0 + hh * 0.75)); g.lineTo(...at2(0.82, z0)); g.fill();
      g.strokeStyle = '#4a2e18'; g.lineWidth = 4; g.beginPath(); g.moveTo(...at2(0.16, z0)); g.lineTo(...at2(0.16, z0 + hh * 0.85)); g.lineTo(...at2(0.84, z0 + hh * 0.85)); g.lineTo(...at2(0.84, z0)); g.stroke();
      g.strokeStyle = '#6a4424'; g.lineWidth = 1.5; g.stroke();
      if (o.sign) { const p = at2(0.5, z0 + hh * 0.95); poly([[p[0] - 12, p[1] - 8], [p[0] + 12, p[1] - 12], [p[0] + 12, p[1] - 3], [p[0] - 12, p[1] + 1]], '#8a6440', '#3a2410', 1); }
    },
    rails(o) { // a straight run of rails from (x0,y0) to (x1,y1) at height z
      const z = o.z ?? 0, n = Math.max(1, Math.round(Math.hypot(o.x1 - o.x0, o.y1 - o.y0) * 4));
      for (let i = 0; i <= n; i++) { const t = i / n, cx = mix(o.x0, o.x1, t) + 0.5, cy = mix(o.y0, o.y1, t) + 0.5, dx = o.x1 - o.x0, dy = o.y1 - o.y0, L = Math.hypot(dx, dy) || 1, px = -dy / L * 0.22, py = dx / L * 0.22; g.strokeStyle = '#5a3e26'; g.lineWidth = 3; g.beginPath(); g.moveTo(...pt(cx - px, cy - py, z)); g.lineTo(...pt(cx + px, cy + py, z)); g.stroke(); }
      for (const s of [-0.13, 0.13]) { const dx = o.x1 - o.x0, dy = o.y1 - o.y0, L = Math.hypot(dx, dy) || 1, px = -dy / L * s, py = dx / L * s; g.strokeStyle = '#9a9aa2'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(...pt(o.x0 + 0.5 + px, o.y0 + 0.5 + py, z + 1)); g.lineTo(...pt(o.x1 + 0.5 + px, o.y1 + 0.5 + py, z + 1)); g.stroke(); }
    },
    cart(o) { const z = o.z ?? 0, x = o.x + 0.25, y = o.y + 0.25; box(x, y, z + 4, 0.5, 0.42, 12, '#6a5a4a', '#4a3e32', '#2a2420'); const r = rng(x * 9); for (let i = 0; i < 6; i++) { const p = pt(x + 0.1 + r() * 0.3, y + 0.1 + r() * 0.25, z + 16); g.fillStyle = r() < 0.3 ? '#d8b84a' : '#5a5650'; g.beginPath(); g.arc(p[0], p[1], 3, 0, Math.PI * 2); g.fill(); } for (const [u, v] of [[0.08, 0.42], [0.42, 0.42]]) { const p = pt(x + u, y + v, z + 4); g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(p[0], p[1], 3.5, 4, 0, 0, Math.PI * 2); g.fill(); } },
    stairs(o) { // steps climbing toward -y (up the slope), from height z0 to z1, one tile wide
      const { x, y } = o, n = Math.max(2, Math.round((o.z1 - o.z0) / 6)), len = o.len || 1;
      for (let i = 0; i < n; i++) { const t0 = i / n, zz = mix(o.z0, o.z1, (i + 1) / n); box(x + 0.15, y + len - (t0 + 1 / n) * len, o.z0, 0.7, len / n, zz - o.z0, shade(P.wallStone, 0.1), shade(P.wallStone, -0.3), shade(P.wallStone, 0.15)); }
    },
    waterfall(o) { const { x, y } = o, top = pt(x + 0.5, y + 1, o.z1), bot = pt(x + 0.5, y + 1, o.z0); const wg = g.createLinearGradient(0, top[1], 0, bot[1]); wg.addColorStop(0, 'rgba(160,210,230,.9)'); wg.addColorStop(1, 'rgba(230,245,250,.95)'); g.fillStyle = wg; g.fillRect(top[0] - 12, top[1], 24, bot[1] - top[1]); g.strokeStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 6; i++) { const xx = top[0] - 10 + i * 4; g.beginPath(); g.moveTo(xx, top[1]); g.lineTo(xx + 1, bot[1]); g.stroke(); } g.fillStyle = 'rgba(245,250,252,.8)'; g.beginPath(); g.ellipse(bot[0], bot[1], 22, 8, 0, 0, Math.PI * 2); g.fill(); },
    fence(o) { const z = o.z ?? 0, n = Math.round(Math.hypot(o.x1 - o.x0, o.y1 - o.y0) * 3); for (let i = 0; i <= n; i++) { const t = i / n, p = pt(mix(o.x0, o.x1, t), mix(o.y0, o.y1, t), z); g.strokeStyle = '#5a3e26'; g.lineWidth = 2; g.beginPath(); g.moveTo(...p); g.lineTo(p[0], p[1] - 10); g.stroke(); } for (const hh of [4, 8]) { g.strokeStyle = '#6e4e2e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...pt(o.x0, o.y0, z + hh)); g.lineTo(...pt(o.x1, o.y1, z + hh)); g.stroke(); } },
    banner(o) { const z = o.z ?? 0, p = pt(o.x + 0.5, o.y + 0.5, z); g.strokeStyle = '#2a2420'; g.lineWidth = 2; g.beginPath(); g.moveTo(...p); g.lineTo(p[0], p[1] - 40); g.stroke(); poly([[p[0], p[1] - 40], [p[0] + 12, p[1] - 38], [p[0] + 12, p[1] - 20], [p[0] + 6, p[1] - 24], [p[0], p[1] - 20]], o.color || '#8a2a2a'); },
  };
  function roofOn(x, y, z, w, d, rh, roof, ridge, rr, type) {
    const o = 0.12; // overhang
    const X0 = x - o, X1 = x + w + o, Y0 = y - o, Y1 = y + d + o;
    const lit = shade(roof, 0.12), dark = shade(roof, -0.28), mid = shade(roof, -0.08);
    const lines = (a, b, c, dd, n, col) => { g.strokeStyle = col; g.lineWidth = 1; for (let i = 1; i < n; i++) { const t = i / n; g.beginPath(); g.moveTo(mix(a[0], dd[0], t), mix(a[1], dd[1], t)); g.lineTo(mix(b[0], c[0], t), mix(b[1], c[1], t)); g.stroke(); } };
    if (type === 'flat') { box(x - 0.05, y - 0.05, z, w + 0.1, d + 0.1, 4, mid, dark, lit); return; }
    if (type === 'hip') {
      const ap = [pt(x + w / 2, y + d / 2, z + rh)];
      poly([pt(X0, Y0, z), pt(X1, Y0, z), ap[0]], mid); poly([pt(X0, Y0, z), pt(X0, Y1, z), ap[0]], lit);
      poly([pt(X0, Y1, z), pt(X1, Y1, z), ap[0]], lit); poly([pt(X1, Y0, z), pt(X1, Y1, z), ap[0]], dark);
      return;
    }
    if (ridge === 'x') {
      const r0 = pt(X0, y + d / 2, z + rh), r1 = pt(X1, y + d / 2, z + rh);
      const back = [pt(X0, Y0, z), pt(X1, Y0, z), r1, r0], front = [pt(X0, Y1, z), pt(X1, Y1, z), r1, r0];
      poly(back, mid); lines(back[0], back[1], back[2], back[3], 6, 'rgba(0,0,0,.18)');
      poly(front, lit); lines(front[0], front[1], front[2], front[3], 6, 'rgba(0,0,0,.2)');
      // tile texture across the slope
      const n = Math.round(w * 6); g.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 1; i < n; i++) { const t = i / n; g.beginPath(); g.moveTo(...pt(mix(X0, X1, t), Y1, z)); g.lineTo(...pt(mix(X0, X1, t), y + d / 2, z + rh)); g.stroke(); }
      // gable end
      poly([pt(x + w, y, z), pt(x + w, y + d, z), pt(x + w, y + d / 2, z + rh - 2)], shade(roof === P.roofThatch ? P.wallTimber : P.wallPlaster, -0.25));
      g.strokeStyle = shade(roof, -0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(...r0); g.lineTo(...r1); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.stroke();
    } else {
      const r0 = pt(x + w / 2, Y0, z + rh), r1 = pt(x + w / 2, Y1, z + rh);
      const back = [pt(X0, Y0, z), pt(X0, Y1, z), r1, r0], front = [pt(X1, Y0, z), pt(X1, Y1, z), r1, r0];
      poly(back, lit); lines(back[0], back[1], back[2], back[3], 6, 'rgba(0,0,0,.15)');
      poly(front, dark); lines(front[0], front[1], front[2], front[3], 6, 'rgba(0,0,0,.2)');
      const n = Math.round(d * 6); g.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 1; i < n; i++) { const t = i / n; g.beginPath(); g.moveTo(...pt(X0, mix(Y0, Y1, t), z)); g.lineTo(...pt(x + w / 2, mix(Y0, Y1, t), z + rh)); g.stroke(); }
      poly([pt(x, y + d, z), pt(x + w, y + d, z), pt(x + w / 2, y + d, z + rh - 2)], shade(roof === P.roofThatch ? P.wallTimber : P.wallPlaster, 0.02));
      g.strokeStyle = shade(roof, -0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(...r0); g.lineTo(...r1); g.stroke();
    }
    if (roof === P.roofThatch) { g.fillStyle = 'rgba(80,60,20,.25)'; for (let i = 0; i < w * d * 18; i++) { const p = pt(x + rr() * w, y + rr() * d, z + rh * 0.5); g.fillRect(p[0], p[1], 1, 3); } }
    void rr;
  }
  function smoke(p, rr) { for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(230,230,235,${0.32 - i * 0.045})`; g.beginPath(); g.arc(p[0] + i * 3 + rr() * 3, p[1] - i * 7, 4 + i * 1.6, 0, Math.PI * 2); g.fill(); } }

  // ---------- objects, sorted so nearer things cover farther ones ----------
  const key = o => (o.x + (o.w || 1)) + (o.y + (o.d || 1)) + (o.layer || 0) * 0.01;
  for (const o of [...S.objs].sort((a, b) => key(a) - key(b))) DRAW[o.t]?.(o);

  // shadows are drawn by each object; finish with light and haze
  const vg = g.createRadialGradient(W * 0.35, H * 0.3, H * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(255,230,170,.10)'); vg.addColorStop(1, 'rgba(20,15,30,.38)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  // squares nobody can stand on: water, and the footprints of buildings, towers, walls, wells and fountains
  const blocked = S.ground.map(k => k === 'water');
  for (const o of S.objs) {
    if (!['house', 'tower', 'wall', 'well', 'fountain'].includes(o.t)) continue;
    const w = o.t === 'fountain' ? 2 : o.w || 1, d = o.t === 'fountain' ? 2 : o.t === 'tower' ? o.w || 1 : o.d || 1;
    for (let y = Math.floor(o.y); y < Math.ceil(o.y + d); y++) for (let x = Math.floor(o.x); x < Math.ceil(o.x + w); x++) { const i = at(S, x, y); if (i >= 0 && !(o.t === 'wall' && o.gate)) blocked[i] = true; }
  }
  return { canvas: cv, grid: { type: 'iso', ox, oy, tw: TW, th: TH, cols: S.cols, rows: S.rows, z: Array.from(S.z), blocked } };
}

// ---------- the three sample scenes ----------
const H = { wall: P.wallPlaster, timber: P.wallTimber, stone: P.wallStone, brick: P.wallBrick };
function town(seed = 7) {
  const S = createScene(34, 34, seed), r = S.r;
  fill(S, 0, 0, 33, 33, 'grass');
  fill(S, 4, 4, 29, 29, 'cobble');
  // main streets and market square
  fill(S, 14, 14, 20, 20, 'cobble');
  // walls with towers and a gate
  for (const [x, y, w, d, gate] of [[3, 3, 27, 1, false], [3, 30, 12, 1, false], [18, 30, 12, 1, false], [15, 30, 3, 1, true], [3, 4, 1, 26, false], [30, 3, 1, 28, false]]) add(S, { t: 'wall', x, y, w, d, gate, h: 30 });
  for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29], [14, 29], [18, 29]]) add(S, { t: 'tower', x, y, w: 2, h: 70, rh: 44, roof: P.roofSlate, flag: '#8a2a2a' });
  fill(S, 15, 30, 17, 33, 'dirt');
  // market
  add(S, { t: 'fountain', x: 16, y: 16 });
  for (const [x, y] of [[14, 14], [19, 14], [14, 19], [19, 19], [16, 14], [14, 17]]) add(S, { t: 'stall', x, y });
  add(S, { t: 'lamp', x: 15, y: 18 }); add(S, { t: 'lamp', x: 18, y: 15 });
  // blocks of houses around the square
  const roofs = [P.roofRed, P.roofRed, P.roofSlate, P.roofThatch, P.roofRed, P.roofBlue];
  const block = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y += 3) for (let x = x0; x <= x1; x += 3) {
      if (r() < 0.12) { add(S, { t: 'tree', x: x + 0.5, y: y + 0.5 }); continue; }
      const w = r() < 0.5 ? 2 : 3, d = r() < 0.5 ? 2 : 2;
      if (x + w > x1 + 3 || y + d > y1 + 3) continue;
      fill(S, x, y, x + w - 1, y + d - 1, 'dirt');
      add(S, { t: 'house', x, y, w, d, h: 28 + Math.floor(r() * 3) * 12, wall: [H.wall, H.timber, H.stone, H.wall][Math.floor(r() * 4)], timber: r() < 0.45, roof: roofs[Math.floor(r() * roofs.length)], chimney: r() < 0.6, sign: r() < 0.2 ? '#c0392b' : '' });
    }
  };
  block(5, 5, 11, 11); block(23, 5, 27, 11); block(5, 23, 11, 27); block(23, 23, 27, 27);
  block(5, 15, 10, 19); block(23, 15, 27, 19);
  // a keep and temple
  fill(S, 14, 5, 20, 11, 'cobble');
  add(S, { t: 'house', x: 15, y: 6, w: 4, d: 3, h: 60, wall: H.stone, roof: P.roofSlate, roofType: 'hip', chimney: true });
  add(S, { t: 'tower', x: 19, y: 6, w: 2, h: 110, rh: 56, flag: '#d8a23a' });
  add(S, { t: 'house', x: 14, y: 23, w: 5, d: 3, h: 44, wall: H.stone, roof: P.roofGreen, ridge: 'x' }); add(S, { t: 'tower', x: 19, y: 23, w: 1.4, h: 90, rh: 40, roof: P.roofGreen });
  for (let i = 0; i < 18; i++) add(S, { t: 'tree', x: r() < 0.5 ? r() * 2 : 31 + r() * 2, y: r() * 33, s: 0.9 + r() * 0.4 });
  for (let i = 0; i < 10; i++) add(S, { t: 'tree', x: 4 + r() * 26, y: 31.2 + r() * 2, s: 1 });
  for (let i = 0; i < 6; i++) add(S, { t: 'crates', x: 5 + r() * 24, y: 12 + r() * 10 });
  add(S, { t: 'well', x: 9, y: 21 });
  return S;
}
function harbour(seed = 11) {
  const S = createScene(36, 32, seed), r = S.r;
  fill(S, 0, 0, 35, 31, 'water');
  // the town on the land at the back (low x+y), sloping beach to the sea
  for (let y = 0; y < 32; y++) for (let x = 0; x < 36; x++) { const land = x + y * 0.6 < 22 + Math.sin(y * 0.5) * 1.5; if (land) S.ground[at(S, x, y)] = x + y * 0.6 < 18 ? 'cobble' : 'sand'; }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 36; x++) if (S.ground[at(S, x, y)] === 'cobble') S.z[at(S, x, y)] = 8;
  // quay wall along the cobbles
  // piers and jetties
  for (const [y0, len] of [[4, 9], [11, 12], [19, 8]]) { const x0 = Math.ceil(22 - y0 * 0.6) - 3; fill(S, x0, y0, x0 + len, y0 + 1, 'plank'); for (let i = 0; i <= len; i += 2) { add(S, { t: 'post', x: x0 + i, y: y0, z: 0 }); add(S, { t: 'post', x: x0 + i, y: y0 + 2, z: 0 }); } add(S, { t: 'crates', x: x0 + len - 1, y: y0, n: 4 }); add(S, { t: 'lamp', x: x0 + len, y: y0 + 1, z: 0 }); }
  add(S, { t: 'crane', x: 15, y: 9, z: 0 });
  // ships at the piers and out in the bay
  add(S, { t: 'boat', x: 20, y: 6.2, len: 6, beam: 1.6, masts: 2, crest: '#8a2a2a' });
  add(S, { t: 'boat', x: 22, y: 13.4, len: 7, beam: 1.8, masts: 3 });
  add(S, { t: 'boat', x: 18, y: 21.2, len: 4.5, beam: 1.3, masts: 1, furled: true });
  add(S, { t: 'boat', x: 30, y: 24, len: 5, beam: 1.4, masts: 2, crest: '#2f6aa8' });
  for (const [x, y] of [[26, 9], [17, 17], [28, 18], [24, 27]]) add(S, { t: 'rowboat', x, y });
  // warehouses and houses up the slope
  const roofs = [P.roofRed, P.roofSlate, P.roofRed, P.roofThatch];
  for (let y = 0; y < 30; y += 3) for (let x = 0; x < 20; x += 3) {
    const i = at(S, x, y); if (i < 0 || S.ground[i] !== 'cobble' || x + y * 0.6 > 14) continue;
    if (r() < 0.15) { add(S, { t: 'tree', x: x + 0.5, y: y + 0.5, z: 8 }); continue; }
    const w = 2 + Math.floor(r() * 2), d = 2; if (S.ground[at(S, x + w, y + d)] !== 'cobble') continue;
    add(S, { t: 'house', x, y, w, d, z: 8, h: 26 + Math.floor(r() * 3) * 12, wall: [H.wall, H.timber, H.brick, H.stone][Math.floor(r() * 4)], timber: r() < 0.4, roof: roofs[Math.floor(r() * roofs.length)], chimney: r() < 0.5 });
  }
  add(S, { t: 'house', x: 9, y: 10, w: 3, d: 3, z: 8, h: 34, wall: H.stone, roof: P.roofSlate, door: true, sign: '#2f6aa8' });
  add(S, { t: 'tower', x: 4, y: 22, w: 2, z: 8, h: 120, rh: 20, roof: P.roofRed, flag: '#d8a23a' }); // lighthouse
  for (let i = 0; i < 8; i++) add(S, { t: 'stall', x: 10 + i % 4 * 1.2, y: 5 + Math.floor(i / 4) * 1.3, z: 8 });
  for (let i = 0; i < 8; i++) add(S, { t: 'crates', x: 12 + r() * 4, y: 3 + r() * 20, z: 8 });
  for (let i = 0; i < 6; i++) add(S, { t: 'lamp', x: 13 + r() * 3, y: 2 + r() * 22, z: 8 });
  return S;
}
function mountain(seed = 23) {
  const S = createScene(30, 34, seed), r = S.r;
  // terraces rise toward the back (low y); each step is a cliff face
  const terrace = y => y < 6 ? 200 : y < 11 ? 150 : y < 16 ? 104 : y < 22 ? 60 : y < 27 ? 24 : 0;
  for (let y = 0; y < 34; y++) for (let x = 0; x < 30; x++) {
    const i = at(S, x, y);
    // the peaks: a rugged ridge climbing to the back, with summits along it
    const peak = y < 6 ? Math.max(0, (6 - y) * 26 + Math.sin(x * 0.55) * 34 + Math.sin(x * 1.7 + 1) * 12 + Math.cos(y * 2.1 + x) * 8) : 0;
    S.z[i] = Math.round(terrace(y) + peak);
    S.ground[i] = y < 6 ? (S.z[i] > 300 ? 'snow' : 'rock') : y >= 27 ? 'grass' : (x % 9 === 4 ? 'cobble' : r() < 0.15 ? 'rock' : 'dirt');
  }
  // a river at the foot with the waterfall from the heights
  fill(S, 0, 31, 29, 33, 'water'); raise(S, 0, 31, 29, 33, 0);
  fill(S, 24, 6, 24, 30, 'water'); for (let y = 6; y < 31; y++) S.z[at(S, 24, y)] = terrace(y) - 2;
  for (const y of [5, 10, 15, 21, 26]) add(S, { t: 'waterfall', x: 24, y, z1: terrace(y), z0: terrace(y + 1) });
  // mine mouths in the cliff faces, rails, carts
  for (const [x, y] of [[6, 10], [15, 10], [10, 15], [3, 21]]) { add(S, { t: 'mine', x, y, z0: terrace(y + 1), sign: true, layer: 1 }); add(S, { t: 'rails', x0: x, y0: y + 1, x1: x, y1: y + 4, z: terrace(y + 1) }); add(S, { t: 'cart', x, y: y + 2, z: terrace(y + 1) }); add(S, { t: 'lamp', x: x + 1, y: y + 1, z: terrace(y + 1) }); }
  // stairs between terraces along the street
  for (const y of [10, 15, 21, 26]) add(S, { t: 'stairs', x: 4, y: y - 0.2, z0: terrace(y + 1), z1: terrace(y), len: 1 });
  for (const y of [10, 15, 21, 26]) add(S, { t: 'stairs', x: 13, y: y - 0.2, z0: terrace(y + 1), z1: terrace(y), len: 1 });
  // houses, a hall and workshops on each terrace
  const roofs = [P.roofSlate, P.roofSlate, P.roofRed, P.roofThatch];
  for (const [y0, y1] of [[6, 10], [11, 15], [16, 21], [22, 26]]) for (let x = 0; x < 23; x += 3) {
    if (x % 9 === 3 || r() < 0.18) continue;
    const y = y1 - 2 - Math.floor(r() * 2); if (y < y0) continue;
    add(S, { t: 'house', x: x + 0.2, y, w: 2, d: 2, z: terrace(y), h: 24 + Math.floor(r() * 2) * 12, wall: [H.stone, H.timber, H.stone][Math.floor(r() * 3)], timber: r() < 0.3, roof: roofs[Math.floor(r() * roofs.length)], chimney: r() < 0.75 });
  }
  add(S, { t: 'house', x: 17, y: 17, w: 4, d: 3, z: terrace(17), h: 46, wall: H.stone, roof: P.roofSlate, roofType: 'hip', chimney: true, sign: '#d8a23a' });
  add(S, { t: 'tower', x: 19, y: 7, w: 2, z: terrace(7), h: 80, cone: false });
  // pines on the slopes and snow-capped trees up high
  for (let i = 0; i < 34; i++) { const y = r() * 33, x = r() * 29; const t = S.ground[at(S, Math.floor(x), Math.floor(y))]; if (t === 'water' || t === 'cobble') continue; add(S, { t: 'tree', x, y, pine: true, snow: y < 6, s: 0.8 + r() * 0.4, z: S.z[at(S, Math.floor(x), Math.floor(y))] }); }
  for (let i = 0; i < 6; i++) add(S, { t: 'crates', x: 2 + r() * 20, y: 23 + r() * 3, z: terrace(23) });
  add(S, { t: 'fence', x0: 0, y0: 28, x1: 20, y1: 28, z: 0 });
  return S;
}
export const SCENES = {
  town: { label: 'Walled market town', icon: '🏰', build: town },
  harbour: { label: 'Harbour town', icon: '⚓', build: harbour },
  mountain: { label: 'Mountain mining town', icon: '⛏️', build: mountain },
};
const rendered = {};
export function sceneRender(key) { if (!SCENES[key]) return null; return rendered[key] || (rendered[key] = renderScene(SCENES[key].build())); }
