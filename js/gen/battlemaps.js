// Encounter maps: top-down battle maps, painted by code in one detailed style.
// A map is data: terrain painted on a 5-ft grid, walls, objects (stamped assets), lights and a darkness level.
// Rendering blends the terrain with soft, natural edges (or crisp ones for built floors), shades walls and objects,
// and lights the scene. The editor and the preset maps both use this.
import { ASSETS, drawAsset } from './bmAssets.js';

export const CELL = 80; // pixels per 5-ft square in the finished picture

// ---------- seeded randomness and tileable noise ----------
export function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function hash2(x, y, seed) { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// value noise that repeats every P cells (so textures tile with no seams)
function pnoise(x, y, P, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const m = v => ((v % P) + P) % P, s = t => t * t * (3 - 2 * t);
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed), c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, P, seed, oct = 4) { let t = 0, amp = 0.5, f = 1, norm = 0; for (let i = 0; i < oct; i++) { t += amp * pnoise(x * f, y * f, P * f, seed + i * 17); norm += amp; amp *= 0.5; f *= 2; } return t / norm; }
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- terrain ----------
// natural ground blends with soft, ragged edges; built floors keep crisp square edges.
// order: what lies on top of what. Floors sit low, so grass and dirt creep over their edges.
export const TERRAIN = {
  water: { label: 'Water', icon: '🌊', order: 0, colors: ['#1f5470', '#2d6f8c', '#3a86a0'], natural: true },
  deep: { label: 'Deep water', icon: '🌊', order: 0.5, colors: ['#163f58', '#1f5470', '#28607c'], natural: true },
  mud: { label: 'Mud', icon: '🟫', order: 4, colors: ['#4a3a26', '#5a4630', '#6a5338'], natural: true },
  sand: { label: 'Sand', icon: '🏖️', order: 5, colors: ['#c8ae78', '#d6bf8a', '#e2cd9c'], natural: true },
  dirt: { label: 'Dirt', icon: '🟤', order: 6, colors: ['#6e5234', '#7f6040', '#8f6f4c'], natural: true },
  grass: { label: 'Grass', icon: '🌿', order: 7, colors: ['#4c6b2a', '#5d7d32', '#6f9040'], natural: true },
  moss: { label: 'Moss', icon: '🍀', order: 7.5, colors: ['#3f5a2c', '#4d6a34', '#5d7a3c'], natural: true },
  snow: { label: 'Snow', icon: '❄️', order: 8, colors: ['#d8e2ea', '#e6eef4', '#f4f8fb'], natural: true },
  rock: { label: 'Cave floor', icon: '🪨', order: 3.5, colors: ['#5a5650', '#68635c', '#78736a'], natural: true },
  cobble: { label: 'Cobblestones', icon: '🧱', order: 2, colors: ['#77726a', '#86817a', '#958f86'], natural: false },
  flag: { label: 'Flagstones', icon: '⬜', order: 2, colors: ['#6c6a66', '#7a7873', '#8a8780'], natural: false },
  wood: { label: 'Wooden floor', icon: '🪵', order: 3, colors: ['#6e4a2a', '#7c5532', '#8a613a'], natural: false },
  deck: { label: 'Ship deck', icon: '⛵', order: 3, colors: ['#7a5630', '#8a6238', '#9a6e42'], natural: false },
  carpet: { label: 'Carpet', icon: '🟥', order: 3.2, colors: ['#6a1e22', '#7a2428', '#8a2a2e'], natural: false },
  lava: { label: 'Lava', icon: '🌋', order: 1, colors: ['#5a1208', '#c2410c', '#ffb020'], natural: true },
  void: { label: 'Solid rock', icon: '⬛', order: 9, colors: ['#2a2622', '#34302a', '#3e3932'], natural: true },
  wall: { label: 'Masonry', icon: '🏯', order: 9, colors: ['#3a3834', '#46433e', '#524e48'], natural: false },
};

// a seamless 512-px texture for each kind of ground
const TEX = {};
function texture(kind) {
  if (TEX[kind]) return TEX[kind];
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), T = TERRAIN[kind], cols = T.colors.map(hex), id = g.createImageData(N, N), D = id.data;
  const seed = [...kind].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 0xffff;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n1 = fbm(x / N * 8, y / N * 8, 8, seed, 5), n2 = pnoise(x / N * 64, y / N * 64, 64, seed + 99);
    let t = Math.min(1, Math.max(0, (n1 - 0.25) * 1.9 + (n2 - 0.5) * 0.18));
    if (kind === 'lava') t = Math.pow(fbm(x / N * 6, y / N * 6, 6, seed, 5), 2.2) * 2.4;
    const c = t < 0.5 ? lerp3(cols[0], cols[1], t * 2) : lerp3(cols[1], cols[2], Math.min(1, (t - 0.5) * 2));
    const i = (y * N + x) * 4; D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const r = rng(seed), wrap = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  const R = (a, b) => a + r() * (b - a);
  if (kind === 'grass' || kind === 'moss') {
    const blades = []; for (let i = 0; i < 2600; i++) blades.push([R(0, N), R(0, N), R(-0.6, 0.6), R(3, 8), r()]);
    wrap(() => { for (const [x, y, a, l, t] of blades) { g.strokeStyle = t < 0.5 ? 'rgba(30,50,15,.35)' : 'rgba(170,200,90,.32)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l); g.stroke(); } });
    if (kind === 'grass') { const fl = []; for (let i = 0; i < 40; i++) fl.push([R(0, N), R(0, N), ['#f4e27a', '#ffffff', '#c98ad8', '#f29a6a'][Math.floor(r() * 4)]]); wrap(() => { for (const [x, y, c] of fl) { g.fillStyle = c; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.57) * 1.6, y + Math.sin(k * 1.57) * 1.6, 1.3, 0, 7); g.fill(); } } }); }
  }
  if (kind === 'dirt' || kind === 'mud' || kind === 'rock') {
    const peb = []; for (let i = 0; i < (kind === 'rock' ? 420 : 300); i++) peb.push([R(0, N), R(0, N), R(1, kind === 'rock' ? 5 : 3.2), r()]);
    wrap(() => { for (const [x, y, s, t] of peb) { g.fillStyle = t < 0.5 ? 'rgba(30,22,14,.35)' : 'rgba(220,200,170,.25)'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, t * 3, 0, 7); g.fill(); if (s > 2.4) { g.fillStyle = 'rgba(255,240,220,.18)'; g.beginPath(); g.ellipse(x - s * 0.3, y - s * 0.3, s * 0.45, s * 0.3, 0, 0, 7); g.fill(); } } });
    if (kind === 'rock') { const cr = []; for (let i = 0; i < 26; i++) { const p = [[R(0, N), R(0, N)]]; for (let k = 0; k < 5; k++) p.push([p[k][0] + R(-22, 22), p[k][1] + R(-22, 22)]); cr.push(p); } wrap(() => { g.strokeStyle = 'rgba(20,18,15,.5)'; g.lineWidth = 1.2; for (const p of cr) { g.beginPath(); p.forEach((q, i) => i ? g.lineTo(...q) : g.moveTo(...q)); g.stroke(); } }); }
    if (kind === 'mud') { const pud = []; for (let i = 0; i < 18; i++) pud.push([R(0, N), R(0, N), R(8, 26)]); wrap(() => { for (const [x, y, s] of pud) { const gr = g.createRadialGradient(x, y, 1, x, y, s); gr.addColorStop(0, 'rgba(60,70,60,.45)'); gr.addColorStop(1, 'rgba(60,70,60,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, s, s * 0.6, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(200,220,220,.15)'; g.beginPath(); g.ellipse(x - s * 0.3, y - s * 0.2, s * 0.3, s * 0.12, 0, 0, 7); g.fill(); } }); }
  }
  if (kind === 'sand') { const rp = []; for (let i = 0; i < 70; i++) rp.push([R(0, N), R(0, N), R(20, 60)]); wrap(() => { g.strokeStyle = 'rgba(150,120,70,.22)'; g.lineWidth = 1.4; for (const [x, y, l] of rp) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 5, x + l, y); g.stroke(); } }); const sp = []; for (let i = 0; i < 900; i++) sp.push([R(0, N), R(0, N), r()]); wrap(() => { for (const [x, y, t] of sp) { g.fillStyle = t < 0.5 ? 'rgba(120,95,55,.3)' : 'rgba(255,250,230,.35)'; g.fillRect(x, y, 1.2, 1.2); } }); }
  if (kind === 'snow') { const sp = []; for (let i = 0; i < 60; i++) sp.push([R(0, N), R(0, N), R(10, 40)]); wrap(() => { for (const [x, y, s] of sp) { g.fillStyle = 'rgba(150,170,195,.12)'; g.beginPath(); g.ellipse(x, y, s, s * 0.5, 0.4, 0, 7); g.fill(); } }); }
  if (kind === 'water' || kind === 'deep') {
    const wv = []; for (let i = 0; i < 160; i++) wv.push([R(0, N), R(0, N), R(8, 22), r()]);
    wrap(() => { for (const [x, y, l, t] of wv) { g.strokeStyle = `rgba(200,235,250,${0.1 + t * 0.2})`; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x - l, y); g.quadraticCurveTo(x, y - 3.5, x + l, y); g.stroke(); } });
  }
  if (kind === 'lava') { const cr = []; for (let i = 0; i < 40; i++) { const p = [[R(0, N), R(0, N)]]; for (let k = 0; k < 6; k++) p.push([p[k][0] + R(-25, 25), p[k][1] + R(-25, 25)]); cr.push(p); } wrap(() => { g.strokeStyle = 'rgba(40,10,4,.55)'; g.lineWidth = 3; for (const p of cr) { g.beginPath(); p.forEach((q, i) => i ? g.lineTo(...q) : g.moveTo(...q)); g.stroke(); } }); }
  if (kind === 'cobble') {
    // stones on a jittered grid, each shaded and outlined
    const S = 22, n = N / S; const st = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) st.push([i * S + S / 2 + (j % 2) * S / 2 + R(-3, 3), j * S + S / 2 + R(-3, 3), S * R(0.40, 0.5), S * R(0.36, 0.46), R(-0.4, 0.4), R(-0.12, 0.12)]);
    g.fillStyle = '#3e3a35'; g.fillRect(0, 0, N, N);
    wrap(() => { for (const [x, y, a, b, rot, t] of st) { const base = lerp3(cols[0], cols[2], 0.5 + t * 2); g.fillStyle = `rgb(${base.map(Math.round)})`; g.beginPath(); g.ellipse(x, y, a, b, rot, 0, 7); g.fill(); const gr = g.createLinearGradient(x - a, y - b, x + a, y + b); gr.addColorStop(0, 'rgba(255,250,240,.22)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = gr; g.fill(); } });
  }
  if (kind === 'flag' || kind === 'wall') {
    // big stone slabs in offset rows (masonry uses smaller blocks)
    const H = kind === 'wall' ? 32 : 64; g.fillStyle = '#2e2c28'; g.fillRect(0, 0, N, N);
    for (let row = 0; row < N / H; row++) { let x = (row % 2) * H * 0.5 - H; while (x < N) { const w = H * R(0.8, 1.5); const t = R(-0.15, 0.15), base = lerp3(cols[0], cols[2], 0.5 + t * 2); const x0 = x + 2, y0 = row * H + 2, ww = Math.min(w, N - x) - 4, hh = H - 4; for (const ox of [-N, 0, N]) { g.fillStyle = `rgb(${base.map(Math.round)})`; g.fillRect(x0 + ox, y0, ww, hh); const gr = g.createLinearGradient(x0 + ox, y0, x0 + ox + ww, y0 + hh); gr.addColorStop(0, 'rgba(255,250,240,.16)'); gr.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = gr; g.fillRect(x0 + ox, y0, ww, hh); } if (r() < 0.3) { g.strokeStyle = 'rgba(20,18,15,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + R(0, ww), y0); g.lineTo(x0 + R(0, ww), y0 + hh); g.stroke(); } x += w; } }
    // grime from the noise pass, laid back over the slabs
    const grime = g.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const n = fbm(x / N * 6, y / N * 6, 6, seed + 5, 4); const i = (y * N + x) * 4; grime.data[i] = 20; grime.data[i + 1] = 18; grime.data[i + 2] = 14; grime.data[i + 3] = Math.max(0, (n - 0.45)) * 220; }
    const gc = document.createElement('canvas'); gc.width = gc.height = N; gc.getContext('2d').putImageData(grime, 0, 0); g.drawImage(gc, 0, 0);
  }
  if (kind === 'wood' || kind === 'deck') {
    // boards running across, staggered ends, grain lines and nails
    const H = kind === 'deck' ? 30 : 26; g.fillStyle = '#2a1a0e'; g.fillRect(0, 0, N, N);
    for (let row = 0; row < N / H; row++) { let x = R(-200, 0); while (x < N) { const w = R(140, 300), t = R(-0.2, 0.2), base = lerp3(cols[0], cols[2], 0.5 + t * 2.2); for (const ox of [-N, 0, N]) { const x0 = x + ox; g.fillStyle = `rgb(${base.map(Math.round)})`; g.fillRect(x0 + 1, row * H + 1, w - 2, H - 2); g.strokeStyle = 'rgba(40,22,10,.35)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { const yy = row * H + 4 + k * (H - 8) / 3 + R(-1, 1); g.beginPath(); g.moveTo(x0 + 2, yy); g.bezierCurveTo(x0 + w * 0.3, yy + R(-2, 2), x0 + w * 0.6, yy + R(-2, 2), x0 + w - 2, yy); g.stroke(); } const gr = g.createLinearGradient(0, row * H, 0, row * H + H); gr.addColorStop(0, 'rgba(255,230,190,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = gr; g.fillRect(x0 + 1, row * H + 1, w - 2, H - 2); g.fillStyle = 'rgba(25,15,8,.7)'; for (const nx of [x0 + 6, x0 + w - 7]) { g.beginPath(); g.arc(nx, row * H + H * 0.3, 1.4, 0, 7); g.arc(nx, row * H + H * 0.7, 1.4, 0, 7); g.fill(); } } x += w; } }
  }
  if (kind === 'carpet') { g.strokeStyle = 'rgba(220,170,80,.25)'; g.lineWidth = 2; for (let i = 0; i < N; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.moveTo(0, i); g.lineTo(N, i); g.stroke(); } for (let i = 16; i < N; i += 32) for (let j = 16; j < N; j += 32) { g.fillStyle = 'rgba(230,190,90,.3)'; g.beginPath(); g.moveTo(i, j - 6); g.lineTo(i + 6, j); g.lineTo(i, j + 6); g.lineTo(i - 6, j); g.fill(); } }
  if (kind === 'void') { const cr = []; for (let i = 0; i < 30; i++) { const p = [[R(0, N), R(0, N)]]; for (let k = 0; k < 4; k++) p.push([p[k][0] + R(-30, 30), p[k][1] + R(-30, 30)]); cr.push(p); } wrap(() => { g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; for (const p of cr) { g.beginPath(); p.forEach((q, i) => i ? g.lineTo(...q) : g.moveTo(...q)); g.stroke(); } }); }
  TEX[kind] = cv;
  return cv;
}
export { texture };
export const terrainThumb = kind => { const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'); g.drawImage(texture(kind), 0, 0, 128, 128, 0, 0, 48, 48); return c.toDataURL(); };

// ---------- a map's data ----------
export function blankMap(cols = 30, rows = 22, ground = 'grass') {
  return { v: 1, cols, rows, ground: new Array(cols * rows).fill(ground), floors: [], walls: [], objs: [], lights: [], dark: 0, mood: 'none', fog: 0, seed: Math.floor(Math.random() * 1e6), name: 'New encounter map' };
}
export const cellIdx = (m, x, y) => (x >= 0 && y >= 0 && x < m.cols && y < m.rows) ? x + y * m.cols : -1;

// ---------- rendering ----------
// layers: which parts to draw (terrain, walls, objects, lights). cell: pixels per square.
export function renderMap(m, opts = {}) {
  const C = opts.cell || CELL, W = m.cols * C, H = m.rows * C, L = { terrain: true, walls: true, objects: true, lights: true, ...(opts.layers || {}) };
  const cv = opts.canvas || document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const tk = terrainKey(m, C), terrain = !L.terrain ? null : opts.terrainCache && opts.terrainCache.key === tk ? opts.terrainCache.canvas : renderTerrain(m, C);
  if (L.terrain) { g.save(); g.filter = 'saturate(1.12) contrast(1.05)'; g.drawImage(terrain, 0, 0); g.restore(); } else { g.fillStyle = '#222'; g.fillRect(0, 0, W, H); }
  if (L.walls) drawWalls(g, m, C);
  if (L.objects) drawObjects(g, m, C);
  if (L.lights) drawLights(g, m, C, W, H);
  if (L.mood !== false) drawMood(g, m, C, W, H);
  // a gentle vignette and warmth, to pull it together
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,8,6,.38)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return { canvas: cv, terrain: terrain ? { key: tk, canvas: terrain } : opts.terrainCache };
}
const terrainKey = (m, C) => C + ':' + m.cols + 'x' + m.rows + ':' + hashGround(m) + ':' + JSON.stringify(m.floors || []);
function hashGround(m) { let h = 0; for (let i = 0; i < m.ground.length; i++) h = (h * 31 + m.ground[i].charCodeAt(0) + i) | 0; return h; }

// the ground: each kind gets a mask (soft and ragged for natural ground, crisp for floors), filled with its texture.
// Masks are worked out at half size (they're soft anyway) and scaled up smoothly, which keeps this quick.
const MS = 0.5;
export function renderTerrain(m, C) {
  const W = m.cols * C, H = m.rows * C, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
  const kinds = [...new Set(m.ground)].sort((a, b) => (TERRAIN[a]?.order ?? 5) - (TERRAIN[b]?.order ?? 5));
  const nz = noiseField(Math.ceil(W * MS), Math.ceil(H * MS), m.seed);
  const fillTex = (gg, kind) => { const p = gg.createPattern(texture(kind), 'repeat'); gg.fillStyle = p; gg.fillRect(0, 0, W, H); };
  const waterish = k => k === 'water' || k === 'deep';
  const up = (mask) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(mask, 0, 0, W, H); return c; };
  fillTex(g, kinds[0]);
  const hasWater = kinds.some(waterish);
  if (hasWater) {
    // shallows: lighter water close to land
    const land = maskOf(m, k => !waterish(k), C, true, 1.4);
    const sh = tint(land, '#62b4c2'); g.save(); g.globalAlpha = 0.5; g.drawImage(sh, 0, 0, W, H); g.restore();
  }
  for (const k of kinds.slice(1)) {
    if (!TERRAIN[k]) continue;
    const natural = TERRAIN[k].natural;
    const mask = maskOf(m, x => x === k, C, natural, k === 'deep' ? 1.3 : 0.14);
    if (natural && k !== 'deep') roughen(mask, nz, waterish(k) ? 0.6 : 0.85);
    const big = up(mask);
    if (k === 'void' || k === 'wall') { const sh = document.createElement('canvas'); sh.width = mask.width; sh.height = mask.height; const sg = sh.getContext('2d'); sg.filter = `blur(${C * MS * 0.2}px)`; sg.drawImage(tint(mask, '#000'), 0, 0); g.save(); g.globalAlpha = 0.8; g.drawImage(sh, C * 0.1, C * 0.14, W, H); g.restore(); }
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H; const lg = layer.getContext('2d');
    fillTex(lg, k); lg.globalCompositeOperation = 'destination-in'; lg.drawImage(big, 0, 0);
    g.drawImage(layer, 0, 0);
    if (k === 'void' || k === 'wall') { g.save(); g.globalAlpha = 0.45; g.drawImage(tint(edgeBand(mask, -1, -1, 1.5), '#cfc3ae'), 0, 0, W, H); g.restore(); }
    else if (!natural) { g.save(); g.globalAlpha = 0.45; g.drawImage(tint(edgeBand(mask, 0, 0, 1.5), '#000'), 0, 0, W, H); g.restore(); }
    else if (!waterish(k)) { g.save(); g.globalAlpha = 0.22; g.drawImage(tint(edgeBand(mask, 0, 0, 3), '#000'), 0, 0, W, H); g.restore(); }
  }
  // floors drawn as shapes (a ship's deck, a round tower): any outline, not just squares
  for (const f of m.floors || []) {
    if (!TERRAIN[f.kind] || f.pts.length < 3) continue;
    const path = () => { g.beginPath(); f.pts.forEach(([x, y], i) => i ? g.lineTo(x * C, y * C) : g.moveTo(x * C, y * C)); g.closePath(); };
    g.save(); g.filter = `blur(${C * 0.12}px)`; g.translate(C * 0.12, C * 0.18); path(); g.fillStyle = 'rgba(0,0,0,.55)'; g.fill(); g.restore();
    g.save(); path(); g.clip(); fillTex(g, f.kind); g.restore();
  }
  if (hasWater) {
    // foam where the water meets land
    const land = maskOf(m, k => !waterish(k), C, true, 0.14); roughen(land, nz, 0.85);
    g.save(); g.globalAlpha = 0.7; g.drawImage(tint(edgeBand(land, 0, 0, 2), '#eef8f6'), 0, 0, W, H); g.restore();
  }
  return cv;
}
// a half-size mask of the squares that pass the test. Natural ground is stamped as overlapping circles and blurred,
// so corners round off; floors stay square.
function maskOf(m, test, C, natural, extraBlur = 0) {
  const c = C * MS, cv = document.createElement('canvas'); cv.width = Math.ceil(m.cols * c); cv.height = Math.ceil(m.rows * c);
  const g = cv.getContext('2d'); g.fillStyle = '#000';
  if (natural) {
    g.filter = `blur(${c * (0.28 + extraBlur)}px)`;
    g.beginPath();
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (test(m.ground[x + y * m.cols])) { g.moveTo((x + 0.5) * c + c * 0.78, (y + 0.5) * c); g.arc((x + 0.5) * c, (y + 0.5) * c, c * 0.78, 0, Math.PI * 2); }
    g.fill();
  } else {
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (test(m.ground[x + y * m.cols])) g.fillRect(x * c, y * c, c + 0.5, c + 0.5);
  }
  return cv;
}
function noiseField(w, h, seed) {
  const id = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = fbm(x / 14, y / 14, 4096, seed, 4) * 0.72 + pnoise(x / 2.5, y / 2.5, 4096, seed + 3) * 0.28; id[(y * w + x) * 4] = n * 255; }
  return id;
}
function roughen(mask, nz, rough) {
  const g = mask.getContext('2d'), id = g.getImageData(0, 0, mask.width, mask.height), d = id.data;
  for (let i = 3; i < d.length; i += 4) { const a = d[i] / 255; if (a <= 0.001 || a >= 0.999) continue; const n = nz[i - 3] / 255; const v = (a - 0.5 + (n - 0.5) * rough) * 5 + 0.5; d[i] = Math.max(0, Math.min(255, v * 255)); }
  g.putImageData(id, 0, 0);
}
function tint(mask, color) { const c = document.createElement('canvas'); c.width = mask.width; c.height = mask.height; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); return c; }
// a thin band just inside the edge of a mask (for rims and foam)
function edgeBand(mask, dx, dy, width = 3) {
  const c = document.createElement('canvas'); c.width = mask.width; c.height = mask.height; const g = c.getContext('2d');
  g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'destination-out'; g.filter = `blur(${width}px)`; g.drawImage(mask, dx + width * 0.9, dy + width * 0.9); g.filter = 'none';
  return c;
}

// ---------- walls ----------
export const WALLS = {
  stone: { label: 'Stone wall', w: 0.34, color: '#6e6a62', dark: '#3a3732', top: '#8c877d' },
  brick: { label: 'Brick wall', w: 0.3, color: '#7a4434', dark: '#3e2018', top: '#9a5a44' },
  wood: { label: 'Timber wall', w: 0.22, color: '#5e3e22', dark: '#2e1c0e', top: '#7c5430' },
  palisade: { label: 'Palisade', w: 0.3, color: '#6a4a2a', dark: '#2e1c0e', top: '#8a6438' },
  rail: { label: 'Ship rail', w: 0.18, color: '#6a4424', dark: '#2a180a', top: '#9a6a3c' },
  fence: { label: 'Fence', w: 0.1, color: '#7a5a38', dark: '#3a2814', top: '#9a7a50' },
  hedge: { label: 'Hedge', w: 0.45, color: '#3e5e2a', dark: '#1e3010', top: '#5a7e3a' },
};
function drawWalls(g, m, C) {
  for (const wl of m.walls) {
    const T = WALLS[wl.kind] || WALLS.stone, pts = wl.pts.map(([x, y]) => [x * C, y * C]), w = T.w * C;
    if (pts.length < 2) continue;
    const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); if (wl.closed) g.closePath(); };
    g.save(); g.lineJoin = 'round'; g.lineCap = wl.kind === 'hedge' ? 'round' : 'square';
    // cast shadow
    g.save(); g.translate(C * 0.08, C * 0.12); path(); g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = w * 1.5; g.stroke(); g.lineWidth = w * 1.1; g.stroke(); g.restore();
    path(); g.strokeStyle = T.dark; g.lineWidth = w + 3; g.stroke();
    path(); g.strokeStyle = T.color; g.lineWidth = w; g.stroke();
    path(); g.strokeStyle = T.top; g.lineWidth = w * 0.45; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
    // blocks, planks, stakes or leaves along each segment
    const r = rng(pts.length * 999 + Math.round(pts[0][0] + pts[0][1]));
    for (let i = 0; i < pts.length - (wl.closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
      if (wl.kind === 'stone' || wl.kind === 'brick') { const step = wl.kind === 'brick' ? C * 0.22 : C * 0.36; for (let t = step * (0.5 + r() * 0.5); t < L; t += step * (0.7 + r() * 0.6)) { g.strokeStyle = 'rgba(25,22,18,.6)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(a[0] + ux * t + nx * w / 2, a[1] + uy * t + ny * w / 2); g.lineTo(a[0] + ux * t - nx * w / 2, a[1] + uy * t - ny * w / 2); g.stroke(); } }
      if (wl.kind === 'palisade' || wl.kind === 'fence') { const step = wl.kind === 'fence' ? C * 0.5 : w * 0.95; for (let t = 0; t <= L; t += step) { const p = [a[0] + ux * t, a[1] + uy * t]; g.fillStyle = T.dark; g.beginPath(); g.arc(p[0] + 1, p[1] + 1, (wl.kind === 'fence' ? C * 0.07 : w / 2), 0, 7); g.fill(); const gr = g.createRadialGradient(p[0] - 2, p[1] - 2, 1, p[0], p[1], wl.kind === 'fence' ? C * 0.07 : w / 2); gr.addColorStop(0, T.top); gr.addColorStop(1, T.color); g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], (wl.kind === 'fence' ? C * 0.06 : w / 2 - 1), 0, 7); g.fill(); g.strokeStyle = 'rgba(40,25,10,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], (wl.kind === 'fence' ? C * 0.03 : w / 4), 0, 7); g.stroke(); } }
      if (wl.kind === 'wood' || wl.kind === 'rail') { g.strokeStyle = 'rgba(30,18,8,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); for (let t = C * 0.6; t < L; t += C * (wl.kind === 'rail' ? 0.5 : 1)) { const p = [a[0] + ux * t, a[1] + uy * t]; g.fillStyle = T.dark; g.fillRect(p[0] - w * 0.45, p[1] - w * 0.45, w * 0.9, w * 0.9); g.fillStyle = T.top; g.fillRect(p[0] - w * 0.35, p[1] - w * 0.35, w * 0.6, w * 0.6); } }
      if (wl.kind === 'hedge') { for (let t = 0; t < L; t += C * 0.1) { const p = [a[0] + ux * t + nx * (r() - 0.5) * w * 0.7, a[1] + uy * t + ny * (r() - 0.5) * w * 0.7], s = w * (0.28 + r() * 0.3); const gr = g.createRadialGradient(p[0] - s * 0.4, p[1] - s * 0.4, 1, p[0], p[1], s); gr.addColorStop(0, '#7aa04a'); gr.addColorStop(1, T.color); g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], s, 0, 7); g.fill(); } }
    }
    g.restore();
  }
}

// ---------- objects ----------
function drawObjects(g, m, C) {
  // ground decals first, then everything else; within each, by position so overlaps look right
  const order = o => (ASSETS[o.a]?.layer ?? 1) * 1e6 + o.y * 1000 + o.x;
  for (const o of [...m.objs].sort((a, b) => order(a) - order(b))) {
    if (!ASSETS[o.a]) continue;
    g.save(); g.translate(o.x * C, o.y * C); g.rotate(o.r || 0); const s = o.s || 1; g.scale(s, s);
    drawAsset(g, o.a, C, o.seed ?? Math.round(o.x * 97 + o.y * 31), o);
    g.restore();
  }
}

// ---------- light and darkness ----------
export function lightsOf(m) {
  // lights placed by hand, plus any object that gives off light (campfires, braziers, torches…)
  const out = [...m.lights];
  for (const o of m.objs) { const L = ASSETS[o.a]?.light; if (L) out.push({ x: o.x, y: o.y, r: L.r * (o.s || 1), color: L.color }); }
  return out;
}
function drawLights(g, m, C, W, H) {
  const lights = lightsOf(m), dark = +m.dark || 0;
  if (dark > 0) {
    const sh = document.createElement('canvas'); sh.width = W; sh.height = H; const sg = sh.getContext('2d');
    sg.fillStyle = `rgba(8,10,28,${dark * 0.92})`; sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = 'destination-out';
    for (const L of lights) { const x = L.x * C, y = L.y * C, R = L.r * C; const gr = sg.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(x - R, y - R, R * 2, R * 2); }
    g.drawImage(sh, 0, 0);
  }
  // the warm glow itself
  g.save(); g.globalCompositeOperation = 'screen';
  for (const L of lights) { const x = L.x * C, y = L.y * C, R = L.r * C * 0.8; const [r, gg, b] = hex(L.color || '#ffb347'); const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(${r},${gg},${b},${0.16 + dark * 0.1})`); gr.addColorStop(0.45, `rgba(${r},${gg},${b},${0.05 + dark * 0.05})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); }
  g.restore();
}

export function inPoly(P, x, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
// ---------- colour grading and fog ----------
export const MOODS = {
  none: { label: 'Natural' },
  golden: { label: 'Golden hour', tint: '#ffb070', op: 'soft-light', a: 0.22 },
  dusk: { label: 'Dusk', tint: '#7a4a8a', op: 'multiply', a: 0.28 },
  moon: { label: 'Moonlight', tint: '#4a6aa8', op: 'multiply', a: 0.38 },
  winter: { label: 'Cold', tint: '#a8c8e8', op: 'soft-light', a: 0.5 },
  sepia: { label: 'Old parchment', tint: '#c89a5a', op: 'color', a: 0.45 },
  eerie: { label: 'Eerie', tint: '#4aa86a', op: 'soft-light', a: 0.55 },
  hell: { label: 'Infernal', tint: '#c8301a', op: 'soft-light', a: 0.55 },
};
function drawMood(g, m, C, W, H) {
  const M = MOODS[m.mood];
  if (M && M.tint) { g.save(); g.globalCompositeOperation = M.op; g.globalAlpha = M.a; g.fillStyle = M.tint; g.fillRect(0, 0, W, H); g.restore(); }
  const fog = +m.fog || 0;
  if (fog > 0) {
    // drifting banks of mist, thicker in places
    const w = Math.ceil(W / 8), h = Math.ceil(H / 8), c = document.createElement('canvas'); c.width = w; c.height = h;
    const cg = c.getContext('2d'), id = cg.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = fbm(x / 26, y / 26, 4096, (m.seed || 1) + 77, 5); const i = (y * w + x) * 4; id.data[i] = 225; id.data[i + 1] = 230; id.data[i + 2] = 235; id.data[i + 3] = Math.max(0, Math.min(255, (n - 0.5 + fog * 0.6) * 2.2 * 255 * fog)); }
    cg.putImageData(id, 0, 0); g.save(); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, W, H); g.restore();
  }
}

// ---------- squares nobody can walk into (for the battle map) ----------
export function blockedOf(m) {
  const b = m.ground.map(k => k === 'void' || k === 'wall' || k === 'deep' || k === 'lava');
  for (const f of m.floors || []) for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (inPoly(f.pts, x + 0.5, y + 0.5)) b[x + y * m.cols] = false;
  for (const o of m.objs) { const A = ASSETS[o.a]; if (!A?.solid) continue; const r = (A.solid * (o.s || 1)); for (let y = Math.floor(o.y - r); y <= Math.floor(o.y + r - 0.01); y++) for (let x = Math.floor(o.x - r); x <= Math.floor(o.x + r - 0.01); x++) { const i = cellIdx(m, x, y); if (i >= 0) b[i] = true; } }
  for (const wl of m.walls) { if (wl.kind === 'fence' || wl.kind === 'hedge') continue; for (let i = 0; i < wl.pts.length - (wl.closed ? 0 : 1); i++) { const a = wl.pts[i], c2 = wl.pts[(i + 1) % wl.pts.length], n = Math.ceil(Math.hypot(c2[0] - a[0], c2[1] - a[1]) * 3); for (let k = 0; k <= n; k++) { const x = a[0] + (c2[0] - a[0]) * k / n, y = a[1] + (c2[1] - a[1]) * k / n; const fx = x - Math.floor(x), fy = y - Math.floor(y); /* walls run along cell edges; block the cell they pass through only if it's mid-cell */ if (fx > 0.2 && fx < 0.8 && fy > 0.2 && fy < 0.8) { const i2 = cellIdx(m, Math.floor(x), Math.floor(y)); if (i2 >= 0) b[i2] = true; } } } }
  return b;
}

// ---------- presets, rendered once and kept ----------
import { PRESETS } from './bmPresets.js';
export const BM_PRESETS = PRESETS;
const cache = {};
export async function bmRender(key) {
  if (cache[key]) return cache[key];
  const P = PRESETS[key]; if (!P) return null;
  await new Promise(r => setTimeout(r, 0));
  const m = P.build();
  const out = renderMap(m);
  return (cache[key] = { canvas: out.canvas, cell: CELL, cols: m.cols, rows: m.rows, blocked: blockedOf(m), map: m });
}
export function presetMap(key) { return PRESETS[key]?.build(); }
