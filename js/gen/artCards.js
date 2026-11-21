// Scene art cards: the isometric town scenes, painted up as framed illustrations.
// Each scene floats as a diorama on a slab of earth against a sky for the time of day,
// with distant hills, clouds, glow from windows and lamps at night, a frame and a title plate.
import { SCENES, renderScene } from './scenes.js';

export const TIMES = {
  dawn: { label: 'Dawn', sky: ['#2c3a6a', '#c86a7a', '#f6c08a'], hills: ['#5a4a6a', '#7a6080'], grade: ['#ff9a7a', 'soft-light', 0.35], dark: 0, sun: [0.18, 0.62, '#ffd8a0'] },
  day: { label: 'Midday', sky: ['#4a86c0', '#8fc0e0', '#dcecf0'], hills: ['#6a8aa0', '#8aa8b8'], grade: ['#fff2d0', 'soft-light', 0.2], dark: 0, sun: [0.8, 0.12, '#fffbe8'] },
  dusk: { label: 'Dusk', sky: ['#1a1a3a', '#8a3a5a', '#f08a4a'], hills: ['#3a2a4a', '#5a3a5a'], grade: ['#ff7a3a', 'soft-light', 0.45], dark: 0.25, sun: [0.85, 0.66, '#ffb060'] },
  night: { label: 'Night', sky: ['#05081a', '#101a3a', '#24305a'], hills: ['#0e1428', '#161e38'], grade: ['#3a4a8a', 'multiply', 0.62], dark: 0.6, moon: [0.78, 0.16] },
};
export const CARDS = [];
for (const [k, S] of Object.entries(SCENES)) for (const [t, T] of Object.entries(TIMES)) CARDS.push({ id: k + ':' + t, scene: k, time: t, title: S.label, sub: T.label });

const R = s => { let x = s >>> 0 || 1; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296; };
const scenes = {};
function sceneArt(key) { return scenes[key] || (scenes[key] = renderScene(SCENES[key].build(), { sky: false })); }

export function artCard(id, { width = 1600, height = 1000, frame = true } = {}) {
  const [key, time] = id.split(':'), T = TIMES[time] || TIMES.day, sc = sceneArt(key), G = sc.grid;
  const cv = document.createElement('canvas'); cv.width = width; cv.height = height; const g = cv.getContext('2d');
  const r = R(key.length * 997 + time.length * 31);
  // ---- sky ----
  const sky = g.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.55, T.sky[1]); sky.addColorStop(1, T.sky[2]);
  g.fillStyle = sky; g.fillRect(0, 0, width, height);
  if (time === 'night') { for (let i = 0; i < 380; i++) { const x = r() * width, y = r() * height * 0.7, s = r() * 1.6 + 0.3; g.fillStyle = `rgba(255,255,240,${0.3 + r() * 0.7})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); } }
  if (T.sun) { const [sx, sy, sc2] = T.sun, gr = g.createRadialGradient(sx * width, sy * height, 0, sx * width, sy * height, width * 0.45); gr.addColorStop(0, sc2); gr.addColorStop(0.08, sc2 + 'cc'); gr.addColorStop(0.3, sc2 + '33'); gr.addColorStop(1, sc2 + '00'); g.fillStyle = gr; g.fillRect(0, 0, width, height); }
  if (T.moon) { const [mx, my] = T.moon, gl = g.createRadialGradient(mx * width, my * height, 0, mx * width, my * height, 220); gl.addColorStop(0, 'rgba(220,230,255,.35)'); gl.addColorStop(1, 'rgba(220,230,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, width, height); g.fillStyle = '#f4f2e6'; g.beginPath(); g.arc(mx * width, my * height, 34, 0, 7); g.fill(); g.fillStyle = 'rgba(180,180,170,.35)'; for (const [a, b, c] of [[-8, -6, 9], [10, 8, 6], [4, -14, 4]]) { g.beginPath(); g.arc(mx * width + a, my * height + b, c, 0, 7); g.fill(); } }
  // clouds: soft lumps in layers
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 5; i++) {
    const cx = r() * width * 1.2 - width * 0.1, cy = height * (0.08 + layer * 0.1 + r() * 0.08), w = width * (0.12 + r() * 0.16);
    const lit = time === 'night' ? 'rgba(120,140,190,' : time === 'dusk' ? 'rgba(255,170,130,' : time === 'dawn' ? 'rgba(255,200,190,' : 'rgba(255,255,255,';
    for (let k = 0; k < 9; k++) { const x = cx + (r() - 0.5) * w, y = cy + (r() - 0.5) * w * 0.12, s = w * (0.12 + r() * 0.14); g.save(); g.translate(x, y); g.scale(1.7, 1); const gr = g.createRadialGradient(0, -s * 0.15, 0, 0, 0, s); gr.addColorStop(0, lit + ((time === 'night' ? 0.22 : 0.45) - layer * 0.08) + ')'); gr.addColorStop(1, lit + '0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill(); g.restore(); }
  }
  // distant hills, two ranges, hazier further back
  for (let h = 0; h < 2; h++) {
    const base = height * (0.62 + h * 0.08); g.fillStyle = T.hills[h]; g.beginPath(); g.moveTo(0, height);
    let y = base; for (let x = 0; x <= width; x += 8) { y += (r() - 0.5) * 14; y = Math.max(base - 110 + h * 30, Math.min(base + 20, y)); g.lineTo(x, y - Math.sin(x / (180 + h * 90)) * (50 - h * 15)); }
    g.lineTo(width, height); g.closePath(); g.fill();
    const haze = g.createLinearGradient(0, base - 120, 0, height); haze.addColorStop(0, T.sky[2] + '00'); haze.addColorStop(1, T.sky[2] + (h ? '55' : '88')); g.fillStyle = haze; g.fillRect(0, base - 160, width, height);
  }
  // ---- the diorama ----
  const D = height * 0.12, k = Math.min(width * 0.8 / sc.canvas.width, height * 0.74 / sc.canvas.height), yB = G.oy + (G.cols + G.rows) * G.th / 2, dx = (width - sc.canvas.width * k) / 2, dy = height * 0.46 - (yB * k + D * 1.1) / 2;
  const P = (x, y) => [dx + (G.ox + (x - y) * G.tw / 2) * k, dy + (G.oy + (x + y) * G.th / 2) * k];
  const L = P(0, G.rows), B = P(G.cols, G.rows), Rt = P(G.cols, 0);
  // the shadow it throws on the haze below
  g.save(); const sh = g.createRadialGradient(B[0], B[1] + D * 1.6, 0, B[0], B[1] + D * 1.6, width * 0.4); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, 0, width, height); g.restore();
  // a slab of earth under it: soil, rock strata, roots hanging off the bottom
  const slab = (a, b, c1, c2) => { const gr = g.createLinearGradient(0, a[1], 0, a[1] + D * 1.4); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); for (let t = 1; t >= 0; t -= 0.05) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; g.lineTo(x, y + D * (0.55 + 0.45 * Math.sin(t * Math.PI)) + (r() - 0.5) * D * 0.18); } g.closePath(); g.fill(); };
  slab(L, B, '#6a4a2e', '#2a1a10'); slab(B, Rt, '#4a3220', '#1a100a');
  g.save(); g.globalAlpha = 0.35; g.strokeStyle = '#1a120a'; g.lineWidth = 2; for (let s = 1; s < 5; s++) for (const [a, b] of [[L, B], [B, Rt]]) { g.beginPath(); for (let t = 0; t <= 1; t += 0.05) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t + s * D * 0.16 + Math.sin(t * 9 + s) * 4; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } g.restore();
  g.strokeStyle = 'rgba(60,40,20,.7)'; g.lineWidth = 1.5; for (let i = 0; i < 24; i++) { const t = r(), [a, b] = r() < 0.5 ? [L, B] : [B, Rt], x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t + D * (0.5 + 0.4 * Math.sin(t * Math.PI)); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 6, y + 15, x - 6, y + 25, x + (r() - 0.5) * 10, y + 20 + r() * 40); g.stroke(); }
  g.drawImage(sc.canvas, dx, dy, sc.canvas.width * k, sc.canvas.height * k);
  // ---- light and colour ----
  const glow = bloomOf(cv, time === 'night' || time === 'dusk');
  const [tint, op, a] = T.grade; g.save(); g.globalCompositeOperation = op; g.globalAlpha = a; g.fillStyle = tint; g.fillRect(0, 0, width, height); g.restore();
  if (glow) { g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = time === 'night' ? 1 : 0.6; g.drawImage(glow, 0, 0, width, height); if (time === 'night') g.drawImage(glow, 0, 0, width, height); g.restore(); }
  if (time === 'day') { const [sx, sy, c] = T.sun; g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.07; for (let i = 0; i < 7; i++) { const a2 = 1.2 + i * 0.22 + r() * 0.1; g.fillStyle = c; g.beginPath(); g.moveTo(sx * width, sy * height); g.lineTo(sx * width + Math.cos(a2) * width * 1.4 * (sx > 0.5 ? -1 : 1), sy * height + Math.sin(a2) * height * 1.4); g.lineTo(sx * width + Math.cos(a2 + 0.06) * width * 1.4 * (sx > 0.5 ? -1 : 1), sy * height + Math.sin(a2 + 0.06) * height * 1.4); g.fill(); } g.restore(); }
  // vignette and a little grain
  const vg = g.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,4,.6)'); g.fillStyle = vg; g.fillRect(0, 0, width, height);
  grain(g, width, height, r);
  if (frame) drawFrame(g, width, height, SCENES[key].label, T.label);
  return cv;
}
// windows, lamps and fires: pick out the bright warm pixels and spread them into a glow
function bloomOf(cv, on) {
  if (!on) return null;
  const s = 3, w = Math.ceil(cv.width / s), h = Math.ceil(cv.height / s), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const warm = d[i] > 235 && d[i + 1] > 170 && d[i + 1] < 230 && d[i + 2] < 140; if (!warm) d[i + 3] = 0; else { d[i] = 255; d[i + 1] = 196; d[i + 2] = 110; d[i + 3] = 255; } }
  g.putImageData(id, 0, 0);
  // a wide soft halo, a tighter glow, and the bright cores themselves
  const o = document.createElement('canvas'); o.width = w; o.height = h; const og = o.getContext('2d');
  og.filter = 'blur(10px)'; og.globalAlpha = 0.9; og.drawImage(c, 0, 0); og.drawImage(c, 0, 0);
  og.filter = 'blur(3px)'; og.globalAlpha = 0.8; og.drawImage(c, 0, 0);
  og.filter = 'none'; og.globalAlpha = 0.7; og.drawImage(c, 0, 0);
  return o;
}
function grain(g, w, h, r) { const n = document.createElement('canvas'); n.width = 256; n.height = 256; const ng = n.getContext('2d'), id = ng.createImageData(256, 256); for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 14; } ng.putImageData(id, 0, 0); g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, w, h); g.restore(); }
function drawFrame(g, w, h, title, sub) {
  const b = Math.round(w * 0.018);
  // gilt frame: dark outer band, gold bevel, thin inner line
  g.save();
  g.lineWidth = b * 2; g.strokeStyle = '#1a120c'; g.strokeRect(0, 0, w, h);
  const gold = g.createLinearGradient(0, 0, w, h); gold.addColorStop(0, '#f2d48a'); gold.addColorStop(0.25, '#a8782c'); gold.addColorStop(0.5, '#f8e2a0'); gold.addColorStop(0.75, '#8a5e20'); gold.addColorStop(1, '#e8c070');
  g.lineWidth = b * 0.55; g.strokeStyle = gold; g.strokeRect(b * 1.0, b * 1.0, w - b * 2, h - b * 2);
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(248,226,160,.7)'; g.strokeRect(b * 1.6, b * 1.6, w - b * 3.2, h - b * 3.2);
  // corner flourishes
  for (const [x, y, sx, sy] of [[b * 1.6, b * 1.6, 1, 1], [w - b * 1.6, b * 1.6, -1, 1], [b * 1.6, h - b * 1.6, 1, -1], [w - b * 1.6, h - b * 1.6, -1, -1]]) {
    g.save(); g.translate(x, y); g.scale(sx, sy); g.strokeStyle = gold; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, b * 2.6); g.quadraticCurveTo(0, 0, b * 2.6, 0); g.moveTo(b * 0.6, b * 1.6); g.quadraticCurveTo(b * 0.6, b * 0.6, b * 1.6, b * 0.6); g.stroke(); g.fillStyle = gold; g.beginPath(); g.arc(b * 0.6, b * 0.6, b * 0.25, 0, 7); g.fill(); g.restore();
  }
  // title plate
  const pw = Math.min(w * 0.5, 120 + title.length * w * 0.018), ph = h * 0.085, px = (w - pw) / 2, py = h - b * 1.6 - ph * 0.72;
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18; g.shadowOffsetY = 4;
  g.fillStyle = '#1e1610'; g.beginPath(); g.moveTo(px, py + ph / 2); g.lineTo(px + ph * 0.4, py); g.lineTo(px + pw - ph * 0.4, py); g.lineTo(px + pw, py + ph / 2); g.lineTo(px + pw - ph * 0.4, py + ph); g.lineTo(px + ph * 0.4, py + ph); g.closePath(); g.fill();
  g.shadowColor = 'transparent'; g.lineWidth = 2.5; g.strokeStyle = gold; g.stroke();
  g.fillStyle = '#f4e2b0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${Math.round(ph * 0.36)}px "Cinzel", "Palatino Linotype", Georgia, serif`; g.fillText(title, w / 2, py + ph * 0.42);
  g.font = `italic ${Math.round(ph * 0.22)}px Georgia, serif`; g.fillStyle = '#c8a86a'; g.fillText(sub, w / 2, py + ph * 0.76);
  g.restore();
}
