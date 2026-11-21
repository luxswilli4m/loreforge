// Ready-made shapes for the Asset Forge's Shapes gallery, like the shapes menu in a word processor.
// Each one is drawn in a box from -1 to 1 and gets scaled to wherever it's dropped.
const ring = (n, r = 1, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [Math.cos(rot + i / n * Math.PI * 2) * r, Math.sin(rot + i / n * Math.PI * 2) * r]);
const star = (n, inner) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i / (n * 2) * Math.PI * 2, r = i % 2 ? inner : 1; return [Math.cos(a) * r, Math.sin(a) * r]; });
const curve = (fn, steps = 48) => Array.from({ length: steps }, (_, i) => fn(i / steps * Math.PI * 2));
const fit = pts => { // stretch to fill the -1..1 box
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return pts.map(([x, y]) => [((x - x0) / (x1 - x0 || 1)) * 2 - 1, ((y - y0) / (y1 - y0 || 1)) * 2 - 1]);
};
export const SHAPES = [
  { k: 'box', label: 'Box', t: 'rect' },
  { k: 'oval', label: 'Oval', t: 'ell' },
  { k: 'tri', label: 'Triangle', pts: [[0, -1], [1, 1], [-1, 1]] },
  { k: 'rtri', label: 'Right triangle', pts: [[-1, -1], [1, 1], [-1, 1]] },
  { k: 'diamond', label: 'Diamond', pts: [[0, -1], [1, 0], [0, 1], [-1, 0]] },
  { k: 'pent', label: 'Pentagon', pts: fit(ring(5)) },
  { k: 'hex', label: 'Hexagon', pts: fit(ring(6, 1, 0)) },
  { k: 'oct', label: 'Octagon', pts: ring(8, 1, Math.PI / 8) },
  { k: 'star5', label: 'Star', pts: fit(star(5, 0.42)) },
  { k: 'star4', label: 'Sparkle', pts: star(4, 0.3) },
  { k: 'burst', label: 'Burst', pts: star(12, 0.72) },
  { k: 'heart', label: 'Heart', curved: true, pts: fit(curve(t => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])) },
  { k: 'moon', label: 'Crescent', curved: true, pts: fit([...Array.from({ length: 25 }, (_, i) => { const a = -Math.PI / 2 + i / 24 * Math.PI; return [Math.cos(a), Math.sin(a)]; }), ...Array.from({ length: 25 }, (_, i) => { const a = Math.PI / 2 - i / 24 * Math.PI; return [Math.cos(a) * 0.45 + 0.05, Math.sin(a)]; })].map(([x, y]) => [-x, y])) },
  { k: 'drop', label: 'Drop', curved: true, pts: fit(curve(t => [Math.sin(t) * (1 - Math.cos(t)) * 0.9, -Math.cos(t)])) },
  { k: 'cloud', label: 'Cloud', curved: true, pts: fit(curve(t => { const r = 1 + 0.16 * Math.abs(Math.sin(t * 3.5)); return [Math.cos(t) * r * 1.4, Math.sin(t) * r * 0.85]; }, 72)) },
  { k: 'arrowR', label: 'Arrow', pts: [[-1, -0.35], [0.2, -0.35], [0.2, -0.8], [1, 0], [0.2, 0.8], [0.2, 0.35], [-1, 0.35]] },
  { k: 'arrowU', label: 'Up arrow', pts: [[-0.35, 1], [-0.35, -0.2], [-0.8, -0.2], [0, -1], [0.8, -0.2], [0.35, -0.2], [0.35, 1]] },
  { k: 'chevron', label: 'Chevron', pts: [[-1, -1], [0.1, -1], [1, 0], [0.1, 1], [-1, 1], [-0.1, 0]] },
  { k: 'plus', label: 'Cross', pts: [[-0.3, -1], [0.3, -1], [0.3, -0.3], [1, -0.3], [1, 0.3], [0.3, 0.3], [0.3, 1], [-0.3, 1], [-0.3, 0.3], [-1, 0.3], [-1, -0.3], [-0.3, -0.3]] },
  { k: 'shield', label: 'Shield', curved: true, pts: (() => { const side = Array.from({ length: 13 }, (_, i) => { const t = i / 12, u = 1 - t; return [u * u * 1 + 2 * u * t * 1 + 0, u * u * -0.2 + 2 * u * t * 0.6 + t * t * 1]; }); return [[-1, -1], [1, -1], ...side, ...side.slice(0, -1).reverse().map(([x, y]) => [-x, y])]; })() },
  { k: 'banner', label: 'Banner', pts: [[-1, -0.5], [1, -0.5], [0.7, 0], [1, 0.5], [-1, 0.5], [-0.7, 0]] },
  { k: 'flag', label: 'Pennant', pts: [[-1, -1], [1, -0.4], [-0.8, 0.2], [-0.8, 1], [-1, 1]] },
  { k: 'bolt', label: 'Lightning', pts: [[0.2, -1], [-0.7, 0.15], [-0.05, 0.15], [-0.3, 1], [0.7, -0.25], [0.05, -0.25], [0.35, -1]] },
  { k: 'mountain', label: 'Mountain', pts: [[-1, 1], [-0.3, -0.6], [-0.05, -0.2], [0.35, -1], [1, 1]] },
  { k: 'pine', label: 'Pine tree', pts: [[0, -1], [0.45, -0.35], [0.25, -0.35], [0.7, 0.3], [0.12, 0.3], [0.12, 1], [-0.12, 1], [-0.12, 0.3], [-0.7, 0.3], [-0.25, -0.35], [-0.45, -0.35]] },
  { k: 'house', label: 'House', pts: [[0, -1], [1, -0.15], [0.75, -0.15], [0.75, 1], [-0.75, 1], [-0.75, -0.15], [-1, -0.15]] },
  { k: 'tower', label: 'Battlements', pts: [[-1, 1], [-1, -1], [-0.6, -1], [-0.6, -0.7], [-0.2, -0.7], [-0.2, -1], [0.2, -1], [0.2, -0.7], [0.6, -0.7], [0.6, -1], [1, -1], [1, 1]] },
  { k: 'arch', label: 'Arch', curved: true, pts: [[-1, 1], [-1, -0.1], ...Array.from({ length: 17 }, (_, i) => { const a = Math.PI + i / 16 * Math.PI; return [Math.cos(a), -0.1 + Math.sin(a) * 0.9]; }), [1, 1], [0.5, 1], [0.5, 0.05], ...Array.from({ length: 17 }, (_, i) => { const a = -i / 16 * Math.PI; return [Math.cos(a) * 0.5, 0.05 + Math.sin(a) * 0.45]; }), [-0.5, 1]] },
  { k: 'line', label: 'Line', t: 'line', pts: [[-1, 0], [1, 0]] },
];
// the shape as real shape data, centred at (cx, cy) and `size` units across
export function makeShape(def, cx, cy, size) {
  const h = size / 2, R = v => +v.toFixed(1);
  if (def.t === 'rect') return { t: 'rect', x: R(cx - h), y: R(cy - h * 0.75), w: R(size), h: R(size * 0.75), name: def.label };
  if (def.t === 'ell') return { t: 'ell', cx: R(cx), cy: R(cy), rx: R(h), ry: R(h * 0.75), name: def.label };
  const pts = def.pts.map(([x, y]) => [R(cx + x * h), R(cy + y * h)]);
  if (def.t === 'line') return { t: 'line', pts, name: def.label };
  return def.curved ? { t: 'path', closed: true, pts, name: def.label } : { t: 'poly', pts, name: def.label };
}
// a small picture for the gallery
export function shapeSVG(def) {
  let body;
  if (def.t === 'rect') body = '<rect x="3" y="6" width="18" height="12" rx="1"/>';
  else if (def.t === 'ell') body = '<ellipse cx="12" cy="12" rx="9" ry="7"/>';
  else if (def.t === 'line') body = '<line x1="3" y1="12" x2="21" y2="12" stroke-width="2"/>';
  else body = `<polygon points="${def.pts.map(([x, y]) => `${(12 + x * 9).toFixed(1)},${(12 + y * 9).toFixed(1)}`).join(' ')}"/>`;
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">${body}</svg>`;
}
