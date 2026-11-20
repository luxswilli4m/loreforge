import { W, TYPES, mentionsIn, getEntry } from '../store.js';
import { esc, query, go } from '../util.js';
import { relationDialog } from './entries.js';

const hidden = new Set();
let showMentions = true;

export function render(main) {
  const w = W();
  const focus = query().focus;
  main.innerHTML = `
    <div class="page-head"><h1>Relationships</h1>
      <label class="row shrink" style="margin:0;gap:6px;color:var(--text)"><input type="checkbox" id="mentions" ${showMentions ? 'checked' : ''}> Show @mentions</label>
      ${focus && getEntry(focus) ? `<button id="addrel">＋ Relationship for ${esc(getEntry(focus).name)}</button><a class="btn" href="#/graph">Show all</a>` : ''}
    </div>
    <div class="filters">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${hidden.has(k) ? '' : 'on'}" style="--tc:${t.color}" data-type="${k}">${t.icon} ${t.plural}</button>`).join('')}</div>
    <div class="graph-stage" id="stage"><canvas id="cv"></canvas>
      <div class="graph-legend"><div><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#d4a24c" stroke-width="2"/></svg> relationship</div>
      <div><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#888" stroke-width="1.5" stroke-dasharray="4 3"/></svg> @mention</div>
      <div class="muted">Drag nodes · scroll to zoom · click to open</div></div>
    </div>`;

  if (!w.entries.length) {
    main.querySelector('#stage').innerHTML = `<div class="empty" style="margin:40px"><div class="big">🕸️</div>Add entries and link them with relationships or @mentions to see your world’s web.</div>`;
    return;
  }

  main.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { hidden.has(b.dataset.type) ? hidden.delete(b.dataset.type) : hidden.add(b.dataset.type); render(main); });
  main.querySelector('#mentions').onchange = e => { showMentions = e.target.checked; render(main); };
  const ar = main.querySelector('#addrel'); if (ar) ar.onclick = () => relationDialog(getEntry(focus), () => render(main));

  // ----- build graph -----
  const nodes = w.entries.filter(e => !hidden.has(e.type)).map((e, i) => {
    const a = i * 2.4;
    return { id: e.id, e, x: Math.cos(a) * (40 + i * 6), y: Math.sin(a) * (40 + i * 6), vx: 0, vy: 0, deg: 0 };
  });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const links = [];
  const seen = new Set();
  for (const r of w.relations) {
    if (byId[r.from] && byId[r.to]) { links.push({ s: byId[r.from], t: byId[r.to], label: r.label, rel: true }); seen.add(r.from + r.to); seen.add(r.to + r.from); }
  }
  if (showMentions) for (const e of w.entries) {
    if (!byId[e.id]) continue;
    for (const id of mentionsIn(e.body + ' ' + e.summary)) {
      if (id !== e.id && byId[id] && !seen.has(e.id + id)) { links.push({ s: byId[e.id], t: byId[id], rel: false }); seen.add(e.id + id); seen.add(id + e.id); }
    }
  }
  for (const l of links) { l.s.deg++; l.t.deg++; }
  const neighbors = new Set();
  if (focus) { neighbors.add(focus); for (const l of links) { if (l.s.id === focus) neighbors.add(l.t.id); if (l.t.id === focus) neighbors.add(l.s.id); } }

  const cv = main.querySelector('#cv');
  const ctx = cv.getContext('2d');
  const view = { x: 0, y: 0, k: 1 };
  let W_ = 0, H_ = 0, alpha = 1, hover = null, raf;
  const css = getComputedStyle(document.body);
  const textCol = css.getPropertyValue('--text').trim() || '#eee';
  const mutedCol = css.getPropertyValue('--muted').trim() || '#999';

  function resize() {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W_ = r.width; H_ = r.height;
    cv.width = W_ * dpr; cv.height = H_ * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!view.inited) { view.x = W_ / 2; view.y = H_ / 2; view.inited = true; }
  }

  function tick() {
    if (alpha > 0.005) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 1;
          if (d2 > 640000) continue;
          const f = 7000 / d2 * alpha;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
        const target = l.rel ? 170 : 210;
        const f = (d - target) / d * 0.04 * alpha * (l.rel ? 1 : 0.6);
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.003 * alpha; n.vy -= n.y * 0.003 * alpha;
        if (n === dragNode) { n.vx = n.vy = 0; continue; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      }
      alpha *= 0.994;
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  const R = n => 7 + Math.min(10, n.deg * 1.5);

  function draw() {
    ctx.clearRect(0, 0, W_, H_);
    ctx.save();
    ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const dim = n => (focus && !neighbors.has(n.id)) || (hover && hover !== n && !links.some(l => (l.s === hover && l.t === n) || (l.t === hover && l.s === n)));
    for (const l of links) {
      const active = hover && (l.s === hover || l.t === hover) || focus && (l.s.id === focus || l.t.id === focus);
      ctx.globalAlpha = (focus || hover) && !active ? 0.12 : (l.rel ? 0.8 : 0.45);
      ctx.strokeStyle = l.rel ? '#d4a24c' : '#888';
      ctx.lineWidth = (l.rel ? 2 : 1.2) / Math.sqrt(view.k);
      ctx.setLineDash(l.rel ? [] : [4, 3]);
      ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
      if (l.rel && l.label && (active || view.k > 1.4)) {
        ctx.globalAlpha = 1; ctx.setLineDash([]);
        ctx.font = `${11 / Math.sqrt(view.k)}px Inter, sans-serif`;
        ctx.fillStyle = mutedCol; ctx.textAlign = 'center';
        ctx.fillText(l.label, (l.s.x + l.t.x) / 2, (l.s.y + l.t.y) / 2 - 4);
      }
    }
    ctx.setLineDash([]);
    for (const n of nodes) {
      ctx.globalAlpha = dim(n) ? 0.2 : 1;
      ctx.fillStyle = TYPES[n.e.type]?.hex || '#aaa';
      ctx.beginPath(); ctx.arc(n.x, n.y, R(n), 0, Math.PI * 2); ctx.fill();
      if (n === hover || n.id === focus) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.font = `${n === hover ? 600 : 500} ${12 / Math.sqrt(view.k)}px Inter, sans-serif`;
      ctx.fillStyle = textCol; ctx.textAlign = 'center';
      ctx.fillText(n.e.name, n.x, n.y + R(n) + 13 / Math.sqrt(view.k));
    }
    ctx.restore();
  }

  const toWorld = ev => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }; };
  const hit = p => nodes.find(n => Math.hypot(n.x - p.x, n.y - p.y) < R(n) + 4);

  let dragNode = null, pan = null, moved = false;
  cv.addEventListener('pointerdown', ev => {
    cv.setPointerCapture(ev.pointerId);
    const p = toWorld(ev); moved = false;
    dragNode = hit(p);
    if (!dragNode) pan = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
  });
  cv.addEventListener('pointermove', ev => {
    const p = toWorld(ev);
    if (dragNode) { moved = true; dragNode.x = p.x; dragNode.y = p.y; alpha = Math.max(alpha, 0.3); }
    else if (pan) { moved = true; view.x = pan.vx + ev.clientX - pan.sx; view.y = pan.vy + ev.clientY - pan.sy; }
    else { const h = hit(p); if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; } }
  });
  cv.addEventListener('pointerup', ev => {
    if (dragNode && !moved) {
      const id = dragNode.id;
      dragNode = null;
      if (ev.ctrlKey || ev.metaKey) { const a = document.createElement('a'); a.href = `#/entry/${id}`; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); a.remove(); }
      else go(`#/entry/${id}`);
      return;
    }
    dragNode = null; pan = null;
  });
  cv.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const nk = Math.min(4, Math.max(0.2, view.k * Math.exp(-ev.deltaY * 0.0015)));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk;
  }, { passive: false });

  const ro = new ResizeObserver(resize);
  ro.observe(cv);
  resize();
  tick();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}
