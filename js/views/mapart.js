// Freehand drawing layer for maps: pen, marker, lines, boxes, circles, text, stamps, eraser and layers.
// Everything is stored in map pixel coordinates on map.art = { layers: [{ id, name, visible, items: [] }] }.
import { uid, save } from '../store.js';
import { esc, openModal, closeModal } from '../util.js';

export const STAMPS = {
  castle: ['Castle', '<path d="M-10 10V-7h1.5v-2h1.5v2h1.5v-2H-4v7h1v-8h1.2v-2h1.4v2H.4v-2h1.4v2H3v8h1v-7h1.5v-2H7v2h1.5v-2H10v17z"/><path d="M-2 10V6a2 2 0 0 1 4 0v4"/>'],
  tower: ['Tower', '<path d="M-4 10V-6h-1.5v-4h2v2h2v-2h3v2h2v-2h2v4H4v16z"/><path d="M-1 -2h2v3h-2z"/>'],
  village: ['Village', '<path d="M-11 10V2l5-5 5 5v8z"/><path d="M0 10V0l5-6 5 6v10z"/><path d="M-7 10V6h2v4M4 10V5h2v5"/>'],
  temple: ['Temple', '<path d="M-10 -4 0 -10 10 -4z"/><path d="M-11 10H11M-9.5 7.5h19"/><path d="M-7 -4v11.5M-2.4 -4v11.5M2.4 -4v11.5M7 -4v11.5"/>'],
  ruins: ['Ruins', '<path d="M-11 10h22"/><path d="M-9 10V-4h3v14z"/><path d="M-2 10V-1l3-2v13z"/><path d="M5 10V-7h3v17z"/><path d="M-6 6l3 1"/>'],
  camp: ['Camp', '<path d="M-11 9 0-10 11 9z"/><path d="M-3 9 0 3l3 6"/><path d="M0-10v-2"/>'],
  cave: ['Cave', '<path d="M-11 9C-11-2-5-9 0-9S11-2 11 9z"/><path style="fill:currentColor;stroke:none" d="M-5 9C-5 2 5 2 5 9z"/>'],
  mountain: ['Peak', '<path d="M-11 9-3-8 3 2l3-5 5 12z"/><path d="M-5.5-3-3-1-1-4"/>'],
  tree: ['Grove', '<path d="M0 10V3"/><circle cx="0" cy="-3" r="7"/><circle cx="-6" cy="3" r="4"/><circle cx="6" cy="3" r="4"/>'],
  ship: ['Ship', '<path d="M-10 2h20l-3 6H-7z"/><path d="M0 2v-13"/><path d="M0-10 8-1H0z"/><path d="M0-8-6 0h6"/>'],
  anchor: ['Port', '<circle cx="0" cy="-8.5" r="2"/><path d="M0-6.5V9M-5-3h10M-9 2c1 6 6 7 9 7s8-1 9-7"/>'],
  serpent: ['Sea beast', '<path d="M-11 4c2-8 6-8 7 0M-2 4c2-9 6-9 7 0M7 4c1-6 4-7 4-4"/><path d="M-12 6h24" stroke-dasharray="3 2"/><circle style="fill:currentColor;stroke:none" cx="10" cy="-1" r=".8"/>'],
  skull: ['Danger', '<path d="M-8-1c0-7 16-7 16 0 0 4-3 5-3 8h-10c0-3-3-4-3-8z"/><circle style="fill:currentColor;stroke:none" cx="-3.5" cy="-1" r="2"/><circle style="fill:currentColor;stroke:none" cx="3.5" cy="-1" r="2"/><path d="M-2 7v3M0 7v3M2 7v3"/>'],
  battle: ['Battle', '<path d="M-9-9 8 8M9-9-8 8M-6 3l3 3M6 3 3 6M-9 9l1.5-1.5M9 9l-1.5-1.5"/>'],
  treasure: ['X marks', '<path style="stroke-width:3.2" d="M-8-8 8 8M8-8-8 8"/>'],
  flag: ['Flag', '<path d="M-6 10v-20"/><path d="M-6-10H8l-3 5 3 5H-6z"/>'],
  portal: ['Magic', '<circle cx="0" cy="0" r="9"/><path d="M0-6 1.8-1.8 6 0 1.8 1.8 0 6-1.8 1.8-6 0-1.8-1.8z"/>'],
  star: ['Star', '<path d="M0-10 2.9-3.1 10.5-3.1 4.4 1.5 6.6 9 0 4.6-6.6 9-4.4 1.5-10.5-3.1-2.9-3.1z"/>'],
};

export const STAMP_DEFS = `<defs>${Object.entries(STAMPS).map(([k, [, d]]) => `<g id="st-${k}" style="fill:var(--paper,#f3e9d2);stroke:currentColor;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round">${d}</g>`).join('')}</defs>`;

const COLORS = ['#3a2b1c', '#1d1b1f', '#b5483f', '#d4a24c', '#3f6fa8', '#4f8a3c', '#7d5aa0', '#f5efe0'];
const FONTS = { serif: '"Cormorant Garamond", Georgia, serif', calligraphy: '"Uncial Antiqua", "Cormorant Garamond", serif', plain: 'Inter, system-ui, sans-serif' };
const TOOLS = [['move', '✋', 'Move'], ['pen', '✏️', 'Pen'], ['marker', '🖍️', 'Marker'], ['line', '╱', 'Line'], ['rect', '▭', 'Box'], ['ellipse', '◯', 'Circle'], ['text', '🔤', 'Text'], ['stamp', '🏰', 'Stamp'], ['eraser', '🧽', 'Eraser']];
const HELP = {
  move: 'Drag a drawing to move it. Click one and press Delete to remove it.', pen: 'Drag to draw freehand.', marker: 'Wide see-through strokes — good for regions and routes.',
  line: 'Drag from start to end.', rect: 'Drag to draw a box.', ellipse: 'Drag to draw a circle or oval.', text: 'Click where the text should go.',
  stamp: 'Pick a symbol, then click the map to place it.', eraser: 'Click or drag over drawings to remove them.',
};
// tool settings remembered for the session
const opt = { tool: 'pen', color: '#3a2b1c', width: 4, opacity: 1, fill: false, stamp: 'castle', size: 36, font: 'serif', textSize: 28 };

export function ensureArt(m) {
  if (!m.art || !Array.isArray(m.art.layers)) m.art = { layers: [] };
  if (!m.art.layers.length) m.art.layers.push({ id: uid(), name: 'Drawings', visible: true, items: [] });
  if (!m.art.active || !m.art.layers.some(l => l.id === m.art.active)) m.art.active = m.art.layers[0].id;
  return m.art;
}
const hasArt = m => m.art?.layers?.some(l => l.items.length);

const smoothD = pts => {
  if (pts.length < 3) return `M${pts.map(p => p.join(' ')).join(' L')}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0]} ${l[1]}`;
};
const r1 = v => Math.round(v * 10) / 10;

export function itemSVG(it, extra = '') {
  const id = it.id ? ` data-item="${it.id}"` : '';
  switch (it.t) {
    case 'path': return `<path${id}${extra} d="${smoothD(it.pts)}" fill="none" stroke="${it.c}" stroke-width="${it.w}" stroke-opacity="${it.a ?? 1}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'line': return `<line${id}${extra} x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${it.c}" stroke-width="${it.w}" stroke-opacity="${it.a ?? 1}" stroke-linecap="round"/>`;
    case 'rect': return `<rect${id}${extra} x="${Math.min(it.x1, it.x2)}" y="${Math.min(it.y1, it.y2)}" width="${Math.abs(it.x2 - it.x1)}" height="${Math.abs(it.y2 - it.y1)}" rx="${it.w}" fill="${it.fill ? it.c : 'none'}" fill-opacity="0.22" stroke="${it.c}" stroke-width="${it.w}" stroke-opacity="${it.a ?? 1}"/>`;
    case 'ellipse': return `<ellipse${id}${extra} cx="${(it.x1 + it.x2) / 2}" cy="${(it.y1 + it.y2) / 2}" rx="${Math.abs(it.x2 - it.x1) / 2}" ry="${Math.abs(it.y2 - it.y1) / 2}" fill="${it.fill ? it.c : 'none'}" fill-opacity="0.22" stroke="${it.c}" stroke-width="${it.w}" stroke-opacity="${it.a ?? 1}"/>`;
    case 'text': return `<text${id}${extra} x="${it.x}" y="${it.y}" font-size="${it.s}" font-family='${FONTS[it.f] || FONTS.serif}' font-weight="600" fill="${it.c}" text-anchor="middle" paint-order="stroke" stroke="${it.c === '#f5efe0' ? '#1d1b1f' : '#f5efe0'}" stroke-opacity=".65" stroke-width="${it.s * 0.12}" letter-spacing="${it.f === 'calligraphy' ? it.s * 0.12 : 0}">${esc(it.text)}</text>`;
    case 'stamp': return `<g${id}${extra} class="stamp" transform="translate(${it.x},${it.y}) scale(${it.s / 24})" color="${it.c}" style="--paper:${it.c === '#f5efe0' ? '#1d1b1f' : '#f3e9d2'}"><use href="#st-${it.k}"/></g>`;
  }
  return '';
}

export function artSVG(m) {
  if (!hasArt(m)) return '';
  return m.art.layers.filter(l => l.visible !== false).map(l => `<g data-layer="${l.id}">${l.items.map(it => itemSVG(it)).join('')}</g>`).join('');
}

// geometry for hit tests (map coordinates)
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
function hits(it, p, tol) {
  switch (it.t) {
    case 'path': for (let i = 1; i < it.pts.length; i++) if (segDist(p, it.pts[i - 1], it.pts[i]) < tol + it.w / 2) return true; return it.pts.length === 1 && Math.hypot(p[0] - it.pts[0][0], p[1] - it.pts[0][1]) < tol + it.w;
    case 'line': return segDist(p, [it.x1, it.y1], [it.x2, it.y2]) < tol + it.w / 2;
    case 'rect': {
      const x0 = Math.min(it.x1, it.x2), x1 = Math.max(it.x1, it.x2), y0 = Math.min(it.y1, it.y2), y1 = Math.max(it.y1, it.y2);
      const inside = p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;
      if (it.fill && inside) return true;
      return [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].some(([a, b, c, d]) => segDist(p, [a, b], [c, d]) < tol + it.w / 2);
    }
    case 'ellipse': {
      const cx = (it.x1 + it.x2) / 2, cy = (it.y1 + it.y2) / 2, rx = Math.max(1, Math.abs(it.x2 - it.x1) / 2), ry = Math.max(1, Math.abs(it.y2 - it.y1) / 2);
      const v = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry);
      return it.fill ? v < 1 + tol / Math.min(rx, ry) : Math.abs(v - 1) * Math.min(rx, ry) < tol + it.w / 2;
    }
    case 'text': { const w = it.text.length * it.s * 0.55; return Math.abs(p[0] - it.x) < w / 2 + tol && p[1] < it.y + it.s * 0.25 + tol && p[1] > it.y - it.s * 0.8 - tol; }
    case 'stamp': return Math.hypot(p[0] - it.x, p[1] - it.y) < it.s * 0.5 + tol;
  }
  return false;
}
function moveItem(it, dx, dy) {
  if (it.pts) it.pts = it.pts.map(([x, y]) => [r1(x + dx), r1(y + dy)]);
  if ('x1' in it) { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; }
  if ('x' in it) { it.x += dx; it.y += dy; }
}
// Ramer–Douglas–Peucker
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, best = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > best) { best = d; idx = i; } }
  if (best <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

// Controller used by the map viewer while “Draw” mode is on
export function createArtTool({ m, artG, overlay, getK, toMap }) {
  const art = ensureArt(m);
  let act = null, sel = null;
  const layer = () => art.layers.find(l => l.id === art.active);
  const visibleItems = () => art.layers.filter(l => l.visible !== false).flatMap(l => l.items.map(it => ({ it, l })));
  const hitAt = p => { const tol = 6 / getK(); const all = visibleItems(); for (let i = all.length - 1; i >= 0; i--) if (hits(all[i].it, p, tol)) return all[i]; return null; };

  function redraw() {
    artG.innerHTML = artSVG(m);
    if (sel) { const el = artG.querySelector(`[data-item="${sel.it.id}"]`); if (el) el.classList.add('art-sel'); else sel = null; }
  }
  function preview(it) { overlay.innerHTML = it ? itemSVG(it, ' class="art-preview"') : ''; }

  function panelHTML() {
    const tools = TOOLS.map(([id, ic, lb]) => `<button class="tool ${opt.tool === id ? 'on' : ''}" data-at="${id}" title="${esc(HELP[id])}"><span>${ic}</span>${lb}</button>`).join('');
    const colors = COLORS.map(c => `<button class="swatch-dot ${opt.color === c ? 'on' : ''}" data-col="${c}" style="background:${c}" title="${c}"></button>`).join('')
      + `<input type="color" id="a-col" value="${opt.color}" title="Any colour">`;
    const isStroke = ['pen', 'marker', 'line', 'rect', 'ellipse'].includes(opt.tool);
    const stamps = opt.tool === 'stamp' ? `<div class="stamp-grid">${Object.entries(STAMPS).map(([k, [lb]]) =>
      `<button class="stamp-btn ${opt.stamp === k ? 'on' : ''}" data-stamp="${k}" title="${lb}"><svg viewBox="-13 -13 26 26" color="${opt.color === '#f5efe0' ? '#1d1b1f' : opt.color}"><use href="#st-${k}"/></svg></button>`).join('')}</div>
      <label>Size <span class="val">${opt.size}</span></label><input type="range" data-o="size" min="14" max="120" value="${opt.size}">` : '';
    const text = opt.tool === 'text' ? `<label>Lettering</label><select data-o="font"><option value="serif" ${opt.font === 'serif' ? 'selected' : ''}>Classic serif</option><option value="calligraphy" ${opt.font === 'calligraphy' ? 'selected' : ''}>Calligraphy</option><option value="plain" ${opt.font === 'plain' ? 'selected' : ''}>Plain</option></select>
      <label>Size <span class="val">${opt.textSize}</span></label><input type="range" data-o="textSize" min="10" max="96" value="${opt.textSize}">` : '';
    const stroke = isStroke ? `<label>Thickness <span class="val">${opt.tool === 'marker' ? opt.width * 4 : opt.width}</span></label><input type="range" data-o="width" min="1" max="24" value="${opt.width}">
      ${['rect', 'ellipse'].includes(opt.tool) ? `<label class="check"><input type="checkbox" data-o="fill" ${opt.fill ? 'checked' : ''}> Tinted fill</label>` : ''}` : '';
    const layers = art.layers.map(l => `<div class="layer-row ${l.id === art.active ? 'on' : ''}" data-layer-row="${l.id}">
        <button class="icon small" data-eye="${l.id}" title="${l.visible === false ? 'Show' : 'Hide'}">${l.visible === false ? '🙈' : '👁️'}</button>
        <input data-lname="${l.id}" value="${esc(l.name)}">
        <span class="muted small">${l.items.length}</span>
        ${art.layers.length > 1 ? `<button class="icon small" data-ldel="${l.id}" title="Delete layer">✕</button>` : ''}
      </div>`).join('');
    return `<div class="card side-box art-panel">
      <h4>🖌️ Draw on this map</h4>
      <div class="tools">${tools}</div>
      <p class="small muted tool-help">${esc(HELP[opt.tool])} <span class="hint">Hold Space or use the middle mouse button to move around.</span></p>
      ${opt.tool !== 'eraser' && opt.tool !== 'move' ? `<label>Colour</label><div class="color-row">${colors}</div>` : ''}
      ${stroke}${stamps}${text}
      <label style="margin-top:12px">Layers <span class="muted small">— click one to draw on it</span></label>
      <div class="layers">${layers}</div>
      <button class="small" id="a-addlayer" style="margin-top:6px">＋ Add layer</button>
      <p class="small muted" style="margin:10px 0 0">Ctrl+Z undoes drawing too. Drawings are saved with the map and sync like everything else.</p>
    </div>`;
  }

  function bindPanel(box, rerenderPanel) {
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { const row = e.target.closest('[data-layer-row]'); if (row && !e.target.matches('input')) { art.active = row.dataset.layerRow; save(); rerenderPanel(); } return; }
      if (b.dataset.at) { opt.tool = b.dataset.at; sel = null; redraw(); rerenderPanel(); }
      else if (b.dataset.col) { opt.color = b.dataset.col; rerenderPanel(); }
      else if (b.dataset.stamp) { opt.stamp = b.dataset.stamp; rerenderPanel(); }
      else if (b.dataset.eye) { const l = art.layers.find(x => x.id === b.dataset.eye); l.visible = l.visible === false; save(); redraw(); rerenderPanel(); }
      else if (b.dataset.ldel) {
        const l = art.layers.find(x => x.id === b.dataset.ldel);
        if (l.items.length && !confirm(`Delete the layer “${l.name}” and its ${l.items.length} drawings?`)) return;
        art.layers = art.layers.filter(x => x !== l); ensureArt(m); save(); redraw(); rerenderPanel();
      } else if (b.id === 'a-addlayer') { const l = { id: uid(), name: `Layer ${art.layers.length + 1}`, visible: true, items: [] }; art.layers.push(l); art.active = l.id; save(); rerenderPanel(); }
    });
    box.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'a-col') { opt.color = t.value; box.querySelectorAll('.swatch-dot').forEach(x => x.classList.remove('on')); return; }
      if (t.dataset.lname) { const l = art.layers.find(x => x.id === t.dataset.lname); l.name = t.value; save(); return; }
      if (t.dataset.o) {
        opt[t.dataset.o] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value;
        const v = t.previousElementSibling?.querySelector?.('.val');
        if (v) v.textContent = t.dataset.o === 'width' && opt.tool === 'marker' ? opt.width * 4 : t.value;
      }
    });
    box.addEventListener('change', e => { if (e.target.id === 'a-col') rerenderPanel(); });
  }

  function add(it) {
    it.id = uid();
    const l = layer();
    if (l.visible === false) l.visible = true;
    l.items.push(it); save(); redraw();
  }

  return {
    redraw, panelHTML, bindPanel,
    get selected() { return sel; },
    get tool() { return opt.tool; },
    // used by the right-click menu
    hitAt(ev) { const p = toMap(ev); return hitAt([r1(p.x), r1(p.y)]); },
    selectAt(ev) { const p = toMap(ev), h = hitAt([r1(p.x), r1(p.y)]); sel = h; if (h) opt.tool = 'move'; redraw(); return !!h; },
    deselect() { sel = null; redraw(); },
    setTool(t) { opt.tool = t; sel = null; redraw(); },
    deleteSelected() { if (!sel) return false; sel.l.items = sel.l.items.filter(x => x !== sel.it); sel = null; save(); redraw(); return true; },
    down(ev) {
      const p = toMap(ev), pt = [r1(p.x), r1(p.y)], k = getK();
      const c = opt.color, w = r1(opt.width / k);
      switch (opt.tool) {
        case 'pen': act = { it: { t: 'path', pts: [pt], c, w, a: 1 } }; break;
        case 'marker': act = { it: { t: 'path', pts: [pt], c, w: r1(opt.width * 4 / k), a: 0.4 } }; break;
        case 'line': case 'rect': case 'ellipse': act = { it: { t: opt.tool, x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1], c, w, a: 1, fill: opt.fill } }; break;
        case 'stamp': add({ t: 'stamp', x: pt[0], y: pt[1], s: r1(opt.size / k), k: opt.stamp, c }); return;
        case 'text': {
          openModal(`<h2>Add text</h2><input id="at-text" placeholder="e.g. Here be dragons" autofocus>
            <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Add</button></div>`, md => {
            const done = ok => { const v = md.querySelector('#at-text').value.trim(); closeModal(); if (ok && v) add({ t: 'text', x: pt[0], y: pt[1], s: r1(opt.textSize / k), f: opt.font, c, text: v }); };
            md.querySelector('#at-text').addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
            md.addEventListener('click', e => { if (e.target.dataset.a) done(e.target.dataset.a === 'yes'); });
          });
          return;
        }
        case 'eraser': { act = { erase: true }; const h = hitAt(pt); if (h) { h.l.items = h.l.items.filter(x => x !== h.it); act.changed = true; redraw(); } return; }
        case 'move': { const h = hitAt(pt); sel = h; redraw(); if (h) act = { move: true, last: pt }; return; }
      }
      preview(act.it);
    },
    move(ev) {
      if (!act) return;
      const p = toMap(ev), pt = [r1(p.x), r1(p.y)];
      if (act.erase) { const h = hitAt(pt); if (h) { h.l.items = h.l.items.filter(x => x !== h.it); act.changed = true; redraw(); } return; }
      if (act.move) { moveItem(sel.it, pt[0] - act.last[0], pt[1] - act.last[1]); act.last = pt; act.moved = true; redraw(); return; }
      const it = act.it;
      if (it.t === 'path') { const l = it.pts[it.pts.length - 1]; if (Math.hypot(pt[0] - l[0], pt[1] - l[1]) * getK() >= 2) it.pts.push(pt); }
      else { it.x2 = pt[0]; it.y2 = pt[1]; if (ev.shiftKey && it.t !== 'line') { const s = Math.max(Math.abs(it.x2 - it.x1), Math.abs(it.y2 - it.y1)); it.x2 = it.x1 + Math.sign(it.x2 - it.x1 || 1) * s; it.y2 = it.y1 + Math.sign(it.y2 - it.y1 || 1) * s; } }
      preview(it);
    },
    up() {
      if (!act) return;
      const a = act; act = null; preview(null);
      if (a.erase) { if (a.changed) save(); return; }
      if (a.move) { if (a.moved) save(); return; }
      const it = a.it;
      if (it.t === 'path') it.pts = simplify(it.pts, 0.7 / getK());
      else if (Math.hypot(it.x2 - it.x1, it.y2 - it.y1) * getK() < 3) return;
      add(it);
    },
    cancel() { act = null; preview(null); },
  };
}
