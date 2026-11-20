// Shared helpers for the map generators: seeded randomness, noise, contours, geometry, drawing.

export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return r;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8);

// 2D Perlin noise with fractal (fbm) and ridged variants
export function makeNoise(r) {
  const base = [...Array(256).keys()];
  r.shuffle(base);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n(x, y) {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
    const g = (ix, iy, dx, dy) => { const h = perm[ix + perm[iy]]; return gx[h] * dx + gy[h] * dy; };
    const u = fade(xf), v = fade(yf);
    const a = g(xi, yi, xf, yf), b = g(xi + 1, yi, xf - 1, yf);
    const c = g(xi, yi + 1, xf, yf - 1), d = g(xi + 1, yi + 1, xf - 1, yf - 1);
    const top = a + (b - a) * u, bot = c + (d - c) * u;
    return top + (bot - top) * v;
  }
  n.fbm = (x, y, oct = 5, gain = 0.5) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f); norm += amp; amp *= gain; f *= 2.03; }
    return s / norm;
  };
  n.ridged = (x, y, oct = 4) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(n(x * f, y * f) * 1.6); s += amp * v * v; norm += amp; amp *= 0.5; f *= 2.1; }
    return s / norm;
  };
  return n;
}

// Min-heap of (priority, value)
export class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.p.length; }
  push(pri, val) {
    const p = this.p, v = this.v;
    let i = p.length; p.push(pri); v.push(val);
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= p[i]) break; [p[i], p[j]] = [p[j], p[i]]; [v[i], v[j]] = [v[j], v[i]]; i = j; }
  }
  pop() {
    const p = this.p, v = this.v;
    const top = v[0], lp = p.pop(), lv = v.pop();
    if (p.length) {
      p[0] = lp; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, rr = l + 1; let m = i;
        if (l < p.length && p[l] < p[m]) m = l;
        if (rr < p.length && p[rr] < p[m]) m = rr;
        if (m === i) break;
        [p[i], p[m]] = [p[m], p[i]]; [v[i], v[m]] = [v[m], v[i]]; i = m;
      }
    }
    return top;
  }
}

// Box blur a scalar field in place-ish (returns new array)
export function blur(field, w, h, passes = 1, radius = 1) {
  let a = Float32Array.from(field);
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dx = -radius; dx <= radius; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
      b[y * w + x] = s / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += b[yy * w + x]; n++; } }
      a[y * w + x] = s / n;
    }
  }
  return a;
}

// Marching squares → stitched polylines in grid coordinates
export function contour(field, w, h, level) {
  const segs = [];
  const val = (x, y) => field[y * w + x];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const a = val(x, y), b = val(x + 1, y), c = val(x + 1, y + 1), d = val(x, y + 1);
    const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = [x + (level - a) / (b - a), y];
    const R = [x + 1, y + (level - b) / (c - b)];
    const B = [x + (level - d) / (c - d), y + 1];
    const L = [x, y + (level - a) / (d - a)];
    const add = (p, q) => segs.push([p[0], p[1], q[0], q[1]]);
    switch (idx) {
      case 1: case 14: add(L, B); break;
      case 2: case 13: add(B, R); break;
      case 3: case 12: add(L, R); break;
      case 4: case 11: add(T, R); break;
      case 6: case 9: add(T, B); break;
      case 7: case 8: add(L, T); break;
      case 5: case 10: {
        const center = (a + b + c + d) / 4 > level;
        if ((idx === 5) === center) { add(L, T); add(B, R); } else { add(L, B); add(T, R); }
        break;
      }
    }
  }
  return stitch(segs);
}

export function stitch(segs) {
  const key = (x, y) => Math.round(x * 1e4) + ',' + Math.round(y * 1e4);
  const map = new Map();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) { if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]];
    for (const fwd of [true, false]) {
      for (;;) {
        const end = fwd ? line[line.length - 1] : line[0];
        const k = key(end[0], end[1]);
        const cand = (map.get(k) || []).find(j => !used[j]);
        if (cand === undefined) break;
        used[cand] = 1;
        const s = segs[cand];
        const next = key(s[0], s[1]) === k ? [s[2], s[3]] : [s[0], s[1]];
        fwd ? line.push(next) : line.unshift(next);
      }
    }
    const f = line[0], l = line[line.length - 1];
    line.closed = line.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6;
    lines.push(line);
  }
  return lines;
}

export function chaikin(pts, iterations = 2, closed = false) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const out = [];
    const n = p.length;
    if (!closed) out.push(p[0]);
    const lim = closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

export function tracePath(ctx, pts, closed = false) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}

// ---------- Polygon geometry (convex polygons as [[x,y],...]) ----------
export function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
export function centroid(poly) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-9) { const n = poly.length || 1; return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]; }
  return [x / (3 * a), y / (3 * a)];
}
// Keep the part of poly where (p - o)·n >= 0
export function clipHalf(poly, ox, oy, nx, ny) {
  const out = [];
  const side = p => (p[0] - ox) * nx + (p[1] - oy) * ny;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// Shrink a convex polygon inward by d (counter-clockwise or clockwise handled)
export function inset(poly, d) {
  const ccw = polyArea(poly) > 0;
  let out = poly;
  for (let i = 0; i < poly.length && out.length > 2; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
    let nx = -ey / len, ny = ex / len;
    if (!ccw) { nx = -nx; ny = -ny; }
    out = clipHalf(out, a[0] + nx * d, a[1] + ny * d, nx, ny);
  }
  return out;
}
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
export function distToPolyline(p, line) {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, distToSeg(p, line[i - 1], line[i]));
  return d;
}
export function segIntersect(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { p: [a[0] + r[0] * t, a[1] + r[1] * t], angle: Math.atan2(r[1], r[0]) };
}

// Voronoi cells via half-plane clipping. A grid finds nearby sites first, and stops as soon as
// no farther site could still cut the cell — exact, and fast enough for thousands of sites.
export function voronoi(points, bounds) {
  const [x0, y0, x1, y1] = bounds;
  const n = points.length;
  if (!n) return [];
  const g = Math.max(1, Math.sqrt((x1 - x0) * (y1 - y0) / n) * 1.2);
  const gw = Math.max(1, Math.ceil((x1 - x0) / g)), gh = Math.max(1, Math.ceil((y1 - y0) / g));
  const buckets = Array.from({ length: gw * gh }, () => []);
  const bx = x => Math.max(0, Math.min(gw - 1, Math.floor((x - x0) / g))), by = y => Math.max(0, Math.min(gh - 1, Math.floor((y - y0) / g)));
  points.forEach((p, i) => buckets[by(p[1]) * gw + bx(p[0])].push(i));
  const maxRing = Math.max(gw, gh);
  return points.map((p, i) => {
    let cell = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const cx = bx(p[0]), cy = by(p[1]);
    for (let ring = 0; ring <= maxRing && cell.length; ring++) {
      // once every cell corner is closer than half the distance to this ring, nothing further can clip it
      if (ring >= 2) {
        let far = 0;
        for (const v of cell) far = Math.max(far, (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2);
        const minD = (ring - 1) * g;
        if (minD * minD > far * 4) break;
      }
      for (let yy = cy - ring; yy <= cy + ring; yy++) {
        if (yy < 0 || yy >= gh) continue;
        for (let xx = cx - ring; xx <= cx + ring; xx++) {
          if (xx < 0 || xx >= gw || (Math.abs(xx - cx) !== ring && Math.abs(yy - cy) !== ring)) continue;
          for (const j of buckets[yy * gw + xx]) {
            if (j === i) continue;
            const q = points[j];
            cell = clipHalf(cell, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, p[0] - q[0], p[1] - q[1]);
            if (!cell.length) break;
          }
        }
      }
    }
    return cell;
  });
}

// ---------- Drawing helpers ----------
export class Labeler {
  constructor(w, h, margin = 0) { this.boxes = []; this.w = w; this.h = h; this.m = margin; }
  free(b) {
    if (b[0] < this.m || b[1] < this.m || b[2] > this.w - this.m || b[3] > this.h - this.m) return false;
    return !this.boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  }
  add(b) { this.boxes.push(b); }
}

export function haloText(ctx, text, x, y, fill, halo, haloW = 4) {
  if (halo) { ctx.lineJoin = 'round'; ctx.strokeStyle = halo; ctx.lineWidth = haloW; ctx.strokeText(text, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function spaced(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function drawCompass(ctx, x, y, r, ink, paper, accent) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, r / 40);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2, l = i % 4 === 0 ? 0.5 : 0.56;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * l, Math.sin(a) * r * l); ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); ctx.stroke();
  }
  const star = (len, wid, rot, c1, c2) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2;
      const tip = [Math.cos(a) * len, Math.sin(a) * len];
      const l = [Math.cos(a - Math.PI / 2) * wid, Math.sin(a - Math.PI / 2) * wid];
      const rr = [Math.cos(a + Math.PI / 2) * wid, Math.sin(a + Math.PI / 2) * wid];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(...l); ctx.closePath(); ctx.fillStyle = c1; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(...rr); ctx.closePath(); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    }
  };
  star(r * 0.72, r * 0.09, Math.PI / 4, paper, ink);
  star(r, r * 0.13, -Math.PI / 2, paper, accent || ink);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = `600 ${r * 0.3}px "Cormorant Garamond", Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  haloText(ctx, 'N', 0, -r - r * 0.08, ink, paper, 4);
  ctx.restore();
}

export function drawScaleBar(ctx, x, y, pxPerUnit, unit, ink, paper, scale = 1) {
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const target = 220 * scale;
  let units = nice[0];
  for (const n of nice) if (n * pxPerUnit <= target) units = n;
  const len = units * pxPerUnit, h = 7 * scale;
  ctx.save();
  ctx.lineWidth = 1.2 * scale; ctx.strokeStyle = ink;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? paper : ink;
    ctx.fillRect(x + len / 4 * i, y, len / 4, h); ctx.strokeRect(x + len / 4 * i, y, len / 4, h);
  }
  ctx.font = `600 ${13 * scale}px "Cormorant Garamond", Georgia, serif`;
  ctx.textAlign = 'center';
  haloText(ctx, '0', x, y - 5 * scale, ink, paper, 3 * scale);
  haloText(ctx, `${units} ${unit}`, x + len, y - 5 * scale, ink, paper, 3 * scale);
  ctx.restore();
}

export function drawFrame(ctx, w, h, ink, paper, s = 1) {
  ctx.save();
  ctx.strokeStyle = ink;
  const m = 14 * s;
  ctx.lineWidth = 3 * s; ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  ctx.lineWidth = 1 * s; ctx.strokeRect(m + 6 * s, m + 6 * s, w - m * 2 - 12 * s, h - m * 2 - 12 * s);
  // outer margin wash so the frame sits on paper
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, m); ctx.fillRect(0, h - m, w, m); ctx.fillRect(0, 0, m, h); ctx.fillRect(w - m, 0, m, h);
  ctx.lineWidth = 3 * s; ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  for (const [cx, cy] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) {
    ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(cx, cy, 9 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, cy, 3.5 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawCartouche(ctx, x, y, title, subtitle, ink, paper, s = 1) {
  ctx.save();
  ctx.font = `700 ${38 * s}px "Cormorant Garamond", Georgia, serif`;
  spaced(ctx, 3 * s);
  const tw = ctx.measureText(title.toUpperCase()).width;
  ctx.font = `italic 500 ${16 * s}px "Cormorant Garamond", Georgia, serif`;
  spaced(ctx, 1 * s);
  const sw = subtitle ? ctx.measureText(subtitle).width : 0;
  const w = Math.max(tw, sw) + 60 * s, h = (subtitle ? 84 : 62) * s;
  ctx.globalAlpha = 0.92; ctx.fillStyle = paper;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6 * s) : ctx.rect(x, y, w, h); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 2 * s; ctx.stroke();
  ctx.lineWidth = 0.8 * s; ctx.strokeRect(x + 5 * s, y + 5 * s, w - 10 * s, h - 10 * s);
  ctx.textAlign = 'center'; ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${38 * s}px "Cormorant Garamond", Georgia, serif`; spaced(ctx, 3 * s);
  ctx.fillText(title.toUpperCase(), x + w / 2, y + 46 * s);
  if (subtitle) {
    ctx.font = `italic 500 ${16 * s}px "Cormorant Garamond", Georgia, serif`; spaced(ctx, 1 * s);
    ctx.fillText(subtitle, x + w / 2, y + 70 * s);
  }
  spaced(ctx, 0);
  ctx.restore();
}

// Fine paper grain + soft blotches + vignette over an ImageData
export function paperGrain(img, w, h, r, amount = 10, vignette = 0.25) {
  const d = img.data;
  const n = makeNoise(r);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const blot = n.fbm(x / 260, y / 260, 3) * amount * 1.6;
      const grain = (r() - 0.5) * amount;
      const dx = x / w - 0.5, dy = y / h - 0.5;
      const v = 1 - vignette * Math.pow(Math.min(1, (dx * dx + dy * dy) * 2.2), 1.6);
      d[i] = (d[i] + grain + blot) * v;
      d[i + 1] = (d[i + 1] + grain + blot) * v;
      d[i + 2] = (d[i + 2] + grain + blot * 0.8) * v;
    }
  }
}

export async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 40px "Cormorant Garamond"'),
      document.fonts.load('italic 500 20px "Cormorant Garamond"'),
      document.fonts.load('600 20px "Cormorant Garamond"'),
      document.fonts.load('400 30px "Uncial Antiqua"'),
      document.fonts.load('400 30px "Almendra SC"'),
    ]);
  } catch { /* fall back to Georgia */ }
}
