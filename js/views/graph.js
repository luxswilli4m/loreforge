// World Web: an interactive relationship map of every entry, with right-click tools.
import { W, TYPES, mentionsIn, getEntry, newEntry, deleteEntry, save, uid } from '../store.js';
import { esc, query, go, toast, openModal, closeModal, confirmDialog, contextMenu, closeContextMenu, editorHTML, attachEditor, REL_SUGGESTIONS, typeColor } from '../util.js';
import { REL_KINDS, relKind, relColor, familyLink, parentOf, mapHref, relKindPicker, wireRelKindPicker } from '../hierarchy.js';

const hidden = new Set();
let showMentions = true;
// web settings kept between visits
const opt = { masters: true, nest: true, rel: 'all', mode: 'web', famFocus: '' };
const collapsed = new Set();
const live = new Map(); // id -> {x,y,vx,vy} kept between visits

function pinnedStore() { const w = W(); if (!w.graph) w.graph = { pinned: {} }; if (!w.graph.pinned) w.graph.pinned = {}; return w.graph.pinned; }

// ---------- dialogs shared with other views ----------
export function connectDialog(fromId, toId, onDone, rel = null) {
  let a = fromId, b = toId, kind = rel?.kind || '';
  const draw = m => {
    const A = getEntry(a), B = getEntry(b);
    m.innerHTML = `<h2>${rel ? 'Edit connection' : 'New connection'}</h2>
      <div class="conn-preview"><span class="mention" style="--tc:${typeColor(A.type)}">${esc(A.name)}</span>
        <input id="cl" list="cl-s" value="${esc(rel?.label || '')}" placeholder="is… (e.g. ally of)" autofocus>
        <span class="mention" style="--tc:${typeColor(B.type)}">${esc(B.name)}</span></div>
      <datalist id="cl-s">${REL_SUGGESTIONS.map(s => `<option value="${s}">`).join('')}</datalist>
      <div class="filters" style="margin-top:12px">${REL_SUGGESTIONS.slice(0, 12).map(s => `<button class="chip" data-s="${s}">${s}</button>`).join('')}</div>
      <label>Kind (its colour in the web)</label>${relKindPicker(kind)}
      <div class="modal-actions"><button data-a="swap" title="Swap direction">⇄ Swap</button><span style="flex:1"></span><button data-a="no">Cancel</button><button class="primary" data-a="yes">${rel ? 'Save' : 'Connect'}</button></div>`;
    setTimeout(() => m.querySelector('#cl')?.focus(), 20);
  };
  openModal('', m => {
    draw(m);
    const done = () => {
      const label = m.querySelector('#cl').value.trim();
      const w = W();
      if (rel) { Object.assign(rel, { from: a, to: b, label }); if (kind) rel.kind = kind; else delete rel.kind; }
      else w.relations.push({ id: uid(), from: a, to: b, label, ...(kind ? { kind } : {}) });
      save(); closeModal(); onDone?.();
    };
    m.addEventListener('click', e => {
      const k = e.target.closest('[data-rk]');
      if (k) { kind = k.dataset.rk; m.querySelectorAll('[data-rk]').forEach(x => x.classList.toggle('on', x === k)); return; }
      const t = e.target.closest('[data-a],[data-s]'); if (!t) return;
      if (t.dataset.s) { m.querySelector('#cl').value = t.dataset.s; m.querySelector('#cl').focus(); return; }
      if (t.dataset.a === 'swap') { const v = m.querySelector('#cl').value; [a, b] = [b, a]; draw(m); m.querySelector('#cl').value = v; }
      if (t.dataset.a === 'no') closeModal();
      if (t.dataset.a === 'yes') done();
    });
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cl') done(); });
  });
}

export function pickEntryDialog(title, exclude, onPick) {
  const list = W().entries.filter(e => e.id !== exclude).sort((x, y) => x.name.localeCompare(y.name));
  openModal(`<h2>${esc(title)}</h2><input id="pq" placeholder="Search entries…" autofocus><div class="search-results" id="pr"></div>`, m => {
    const q = m.querySelector('#pq'), pr = m.querySelector('#pr');
    let res = [], sel = 0;
    const draw = () => {
      const s = q.value.toLowerCase();
      res = list.filter(e => e.name.toLowerCase().includes(s)).slice(0, 10);
      sel = Math.min(sel, Math.max(0, res.length - 1));
      pr.innerHTML = res.map((e, i) => `<div class="res ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="type-dot" style="--tc:${typeColor(e.type)}"></span><b>${esc(e.name)}</b><span class="muted small">${TYPES[e.type]?.label}</span></div>`).join('') || '<p class="muted">No matches.</p>';
    };
    const pick = i => { const e = res[i]; if (!e) return; closeModal(); onPick(e); };
    q.addEventListener('input', () => { sel = 0; draw(); });
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, res.length - 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      if (e.key === 'Enter') pick(sel);
    });
    pr.addEventListener('click', e => { const d = e.target.closest('.res'); if (d) pick(+d.dataset.i); });
    draw();
  });
}

export function newConnectedDialog(src, onDone) {
  let type = src.type === 'location' ? 'character' : 'location';
  openModal(`<h2>New entry connected to ${esc(src.name)}</h2>
    <label>Name</label><input id="nn" autofocus placeholder="e.g. The Gull’s Lament">
    <label>Type</label>
    <div class="filters" id="nt">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${k === type ? 'on' : ''}" style="--tc:${t.color}" data-t="${k}">${t.icon} ${t.label}</button>`).join('')}</div>
    <label>${esc(src.name)} is…</label>
    <input id="nl" list="nl-s" placeholder="e.g. owns, ally of, lives in"><datalist id="nl-s">${REL_SUGGESTIONS.map(s => `<option value="${s}">`).join('')}</datalist>
    <label>One-line summary (optional)</label><input id="ns">
    <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Create & connect</button></div>`, m => {
    m.querySelector('#nt').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      type = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b));
    });
    const done = () => {
      const name = m.querySelector('#nn').value.trim();
      if (!name) return m.querySelector('#nn').focus();
      const e = newEntry(type, name);
      e.summary = m.querySelector('#ns').value.trim();
      W().relations.push({ id: uid(), from: src.id, to: e.id, label: m.querySelector('#nl').value.trim() });
      save(); closeModal(); toast(`Created ${name}`); onDone?.(e);
    };
    m.addEventListener('click', e => { const a = e.target.dataset.a; if (a === 'no') closeModal(); if (a === 'yes') done(); });
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') done(); });
  });
}

export function addNoteDialog(ent, onDone) {
  openModal(`<h2>📝 Note on ${esc(ent.name)}</h2>
    <p class="muted small" style="margin-top:-4px">Added to the end of its description with today’s date. Type @ to link other entries.</p>
    ${editorHTML('note', '', 6, 'What did you learn, decide, or want to remember?')}
    <label class="check"><input type="checkbox" id="nsecret"> GM secret (hidden from the player wiki)</label>
    <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Add note</button></div>`, m => {
    const ta = m.querySelector('#note');
    attachEditor(ta);
    m.addEventListener('click', e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'yes' && ta.value.trim()) {
        const stamp = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const block = `### Note — ${stamp}\n${ta.value.trim()}`;
        const key = m.querySelector('#nsecret').checked ? 'secret' : 'body';
        ent[key] = (ent[key] ? ent[key].trimEnd() + '\n\n' : '') + block;
        ent.updated = Date.now(); save(); toast('Note added');
      }
      closeModal(); if (a === 'yes') onDone?.();
    });
  });
}

// ---------- the web ----------
const ROOT = '__root', TN = t => '__t:' + t;

export function render(main) {
  const w = W();
  const focusQ = query().focus;
  if (focusQ) opt.mode = 'web';
  const relOpts = [['all', 'All relationships'], ['none', 'None (just the tree)'], ...Object.entries(REL_KINDS).map(([k, v]) => [k, v.label])];
  main.innerHTML = `
    <div class="page-head"><h1>World Web</h1>
      <div class="seg small" id="wmode"><button data-wm="web" class="${opt.mode === 'web' ? 'on' : ''}">🕸️ Web</button><button data-wm="family" class="${opt.mode === 'family' ? 'on' : ''}">🌳 Family tree</button></div>
      <input id="find" placeholder="Find a node…" style="max-width:200px">
      <button id="relayout" title="Unpin everything and re-arrange">↺ Re-layout</button>
      <button class="primary" id="newnode">＋ New entry</button>
    </div>
    <div class="filters web-filters">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${hidden.has(k) ? '' : 'on'}" style="--tc:${t.color}" data-type="${k}">${t.icon} ${t.plural}</button>`).join('')}</div>
    <div class="filters web-opts" id="wopts"></div>
    <div class="graph-stage" id="stage"><canvas id="cv"></canvas>
      <div class="graph-legend" id="legend"></div>
      <div class="graph-card hidden" id="card"></div>
      <div class="graph-hint hidden" id="hint"></div>
    </div>`;

  const cv = main.querySelector('#cv'), stage = main.querySelector('#stage');
  const card = main.querySelector('#card'), hint = main.querySelector('#hint'), legend = main.querySelector('#legend'), wopts = main.querySelector('#wopts');
  const ctx = cv.getContext('2d');
  const view = { x: 0, y: 0, k: 1, inited: false };
  let W_ = 0, H_ = 0, alpha = 1, hover = null, hoverLink = null, raf, selected = focusQ && getEntry(focusQ) ? focusQ : null;
  let nodes = [], links = [], tree = [], byId = {}, kidsOf = {};
  let fam = null; // family-tree layout
  let linkMode = null; // { from: node, x, y }
  const pinned = pinnedStore();

  function drawOpts() {
    if (opt.mode === 'family') {
      const chars = famPeople();
      wopts.innerHTML = `<label class="row shrink" style="margin:0;gap:6px">Show the family of
        <select id="ffocus"><option value="">everyone</option>${chars.map(e => `<option value="${e.id}" ${opt.famFocus === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
        <span class="muted small">Built from relationships like <i>parent of</i>, <i>child of</i>, <i>married to</i> and <i>sibling of</i> between characters.</span>`;
      wopts.querySelector('#ffocus').onchange = e => { opt.famFocus = e.target.value; rebuild(); fitFamily(); };
      return;
    }
    wopts.innerHTML = `
      <button class="chip ${opt.masters ? 'on' : ''}" data-o="masters" title="A centre node for the world, a node for each entry type, and every entry hanging off its type">◎ Master nodes</button>
      <button class="chip ${opt.nest ? 'on' : ''}" data-o="nest" title="Towns inside realms, realms inside planets… as sub-nodes">⤷ Places inside places</button>
      <button class="chip ${showMentions ? 'on' : ''}" data-o="mentions">@ mentions</button>
      <label class="row shrink" style="margin:0 0 0 6px;gap:6px">Relationships
        <select id="relf">${relOpts.map(([k, l]) => `<option value="${k}" ${opt.rel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    wopts.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
      const k = b.dataset.o;
      if (k === 'mentions') showMentions = !showMentions; else opt[k] = !opt[k];
      drawOpts(); rebuild(); alpha = 1;
    });
    wopts.querySelector('#relf').onchange = e => { opt.rel = e.target.value; rebuild(); alpha = 1; };
  }
  function drawLegend() {
    if (opt.mode === 'family') {
      legend.innerHTML = `<div><svg width="26" height="8"><line x1="0" y1="2" x2="26" y2="2" stroke="${REL_KINDS.love.color}" stroke-width="2"/><line x1="0" y1="6" x2="26" y2="6" stroke="${REL_KINDS.love.color}" stroke-width="2"/></svg> married / partners</div>
        <div><svg width="26" height="10"><path d="M2 0 V5 H24 V10" fill="none" stroke="${REL_KINDS.family.color}" stroke-width="2"/></svg> parent → child</div>
        <div><svg width="26" height="8"><path d="M2 8 V2 H24 V8" fill="none" stroke="#9aa4b8" stroke-width="2" stroke-dasharray="3 2"/></svg> siblings</div>
        <div class="muted legend-help">Click a card for details · double-click to open<br>Drag to move · scroll to zoom</div>`;
      return;
    }
    const used = new Set(links.filter(l => l.rel).map(l => l.kind));
    legend.innerHTML = `${opt.masters || opt.nest ? `<div><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#8a90a8" stroke-width="2.5" opacity=".6"/></svg> belongs to / inside</div>` : ''}
      ${Object.entries(REL_KINDS).filter(([k]) => used.has(k)).map(([k, v]) => `<div><svg width="26" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="${v.color}" stroke-width="2"/><path d="M26 4 L19 0.5 L19 7.5 Z" fill="${v.color}"/></svg> ${v.label}</div>`).join('')}
      ${showMentions ? `<div><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#888" stroke-width="1.5" stroke-dasharray="4 3"/></svg> @mention</div>` : ''}
      <div class="muted legend-help"><b>Right-click</b> anything for options<br><b>Shift + drag</b> node → node to connect<br>Double-click a place to open its map<br>Double-click a master node to fold it</div>`;
  }

  main.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { hidden.has(b.dataset.type) ? hidden.delete(b.dataset.type) : hidden.add(b.dataset.type); b.classList.toggle('on'); rebuild(); alpha = Math.max(alpha, 0.6); });
  main.querySelectorAll('[data-wm]').forEach(b => b.onclick = () => {
    opt.mode = b.dataset.wm; main.querySelectorAll('[data-wm]').forEach(x => x.classList.toggle('on', x === b));
    selected = null; drawCard(); drawOpts(); rebuild(); if (opt.mode === 'family') fitFamily(); else fit();
  });

  const nodeState = (id, near) => {
    let st = live.get(id);
    if (!st) {
      const p = pinned[id];
      if (p) st = { x: p[0], y: p[1], vx: 0, vy: 0 };
      else { const a = Math.random() * Math.PI * 2, r0 = near ? 60 : 200 + Math.random() * 200; st = { x: (near?.x || 0) + Math.cos(a) * r0, y: (near?.y || 0) + Math.sin(a) * r0, vx: 0, vy: 0 }; }
      live.set(id, st);
    }
    return st;
  };

  function rebuild() {
    if (opt.mode === 'family') { buildFamily(); drawLegend(); drawCard(); return; }
    const ents = W().entries.filter(e => !hidden.has(e.type));
    const vis = new Set(ents.map(e => e.id));
    // which relationships are shown
    const relShown = r => opt.rel !== 'none' && (opt.rel === 'all' || relKind(r) === opt.rel);
    const rels = W().relations.filter(r => vis.has(r.from) && vis.has(r.to) && r.from !== r.to && relShown(r));
    // the tree: every entry's parent (a place it sits in, or its type's master node)
    const parent = {};
    for (const e of ents) {
      const p = opt.nest ? parentOf(e) : '';
      if (p && vis.has(p)) parent[e.id] = p;
      else if (opt.masters) parent[e.id] = TN(e.type);
    }
    const types = Object.keys(TYPES).filter(t => !hidden.has(t) && ents.some(e => e.type === t));
    if (opt.masters) for (const t of types) parent[TN(t)] = ROOT;
    kidsOf = {};
    for (const [c, p] of Object.entries(parent)) (kidsOf[p] = kidsOf[p] || []).push(c);
    // hide everything under a folded node
    const folded = id => { let p = parent[id]; for (let i = 0; i < 40 && p; i++) { if (collapsed.has(p)) return true; p = parent[p]; } return false; };
    const descCount = {};
    const countDesc = id => { if (descCount[id] != null) return descCount[id]; let n = 0; for (const c of kidsOf[id] || []) n += 1 + countDesc(c); return (descCount[id] = n); };

    nodes = [];
    if (opt.masters) {
      const rs = nodeState(ROOT); rs.x = rs.x || 0; rs.y = rs.y || 0;
      nodes.push(Object.assign(rs, { id: ROOT, virt: 'root', name: W().name || 'World', deg: 0, fixed: true }));
      rs.x = 0; rs.y = 0;
      types.forEach((t, i) => {
        if (folded(TN(t))) return;
        let st = live.get(TN(t));
        if (!st) { const a = i / types.length * Math.PI * 2 - Math.PI / 2; st = { x: Math.cos(a) * 320, y: Math.sin(a) * 320, vx: 0, vy: 0 }; live.set(TN(t), st); }
        nodes.push(Object.assign(st, { id: TN(t), virt: 'type', type: t, name: TYPES[t].plural, deg: 0, fixed: false }));
      });
    }
    byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    // entries: parents first so children can start next to them
    const order = [...ents].sort((a, b) => depth(a.id) - depth(b.id));
    function depth(id) { let d = 0, p = parent[id]; while (p && d < 40) { d++; p = parent[p]; } return d; }
    for (const e of order) {
      if (folded(e.id)) continue;
      const st = nodeState(e.id, byId[parent[e.id]]);
      const n = Object.assign(st, { id: e.id, e, virt: null, type: e.type, name: e.name, deg: 0, fixed: !!pinned[e.id] });
      nodes.push(n); byId[e.id] = n;
    }
    for (const n of nodes) { n.desc = countDesc(n.id); n.hiddenKids = collapsed.has(n.id) ? n.desc : 0; if (n.virt === 'type') n.total = ents.filter(e => e.type === n.type).length; }
    tree = [];
    for (const [c, p] of Object.entries(parent)) if (byId[c] && byId[p]) tree.push({ s: byId[c], t: byId[p], tree: true, master: p === ROOT || p.startsWith('__t:') });
    links = [];
    const treePair = new Set(tree.map(l => l.s.id + '>' + l.t.id));
    const seen = new Set();
    for (const r of rels) {
      if (!byId[r.from] || !byId[r.to]) continue;
      // a "part of" link that the tree already shows doesn't need drawing twice
      if (treePair.has(r.from + '>' + r.to) || treePair.has(r.to + '>' + r.from)) continue;
      links.push({ s: byId[r.from], t: byId[r.to], label: r.label, rel: r, kind: relKind(r), color: relColor(r) });
      seen.add(r.from + r.to); seen.add(r.to + r.from);
    }
    if (showMentions) for (const e of ents) {
      if (!byId[e.id]) continue;
      for (const id of mentionsIn(e.body + ' ' + e.summary)) {
        if (id !== e.id && byId[id] && !seen.has(e.id + id)) { links.push({ s: byId[e.id], t: byId[id], rel: null }); seen.add(e.id + id); seen.add(id + e.id); }
      }
    }
    for (const l of [...links, ...tree]) { l.s.deg++; l.t.deg++; }
    alpha = Math.max(alpha, 0.5);
    drawLegend(); drawCard();
  }

  const css = getComputedStyle(document.body);
  const textCol = () => css.getPropertyValue('--text').trim() || '#eee';
  const mutedCol = () => css.getPropertyValue('--muted').trim() || '#999';
  const accent = () => css.getPropertyValue('--accent').trim() || '#d4a24c';
  const halo = () => `rgb(${css.getPropertyValue('--panel-rgb').trim().split(/\s+/).join(',') || '0,0,0'})`;

  function resize() {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W_ = r.width; H_ = r.height;
    cv.width = W_ * dpr; cv.height = H_ * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!view.inited) { view.x = W_ / 2; view.y = H_ / 2; view.inited = true; }
  }

  const R = n => n.virt === 'root' ? 34 : n.virt === 'type' ? 24 : 7 + Math.min(14, Math.sqrt(n.desc || 0) * 2.4 + Math.min(4, n.deg * 0.8));
  function tick() {
    if (opt.mode === 'web' && alpha > 0.005) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 1;
          if (d2 > 640000) continue;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
          d2 = Math.max(d2, 400);
          const big = (a.virt ? 3 : 1) * (b.virt ? 3 : 1);
          const f = 5200 * Math.min(big, 4) / d2 * alpha, d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      }
      for (const l of tree) {
        const rest = l.t.virt === 'root' ? 300 : l.t.virt === 'type' ? 110 + Math.min(120, Math.sqrt(kidsOf[l.t.id]?.length || 1) * 14) : 70 + Math.min(90, Math.sqrt(kidsOf[l.t.id]?.length || 1) * 10);
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
        const f = (d - rest) / d * 0.06 * alpha;
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f * 0.4; l.t.vy -= dy * f * 0.4;
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
        const f = (d - (l.rel ? 170 : 210)) / d * 0.03 * alpha * (l.rel ? 1 : 0.5);
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of nodes) {
        if (n.fixed || n === dragNode) { n.vx = n.vy = 0; continue; }
        n.vx -= n.x * 0.0025 * alpha; n.vy -= n.y * 0.0025 * alpha;
        n.vx *= 0.82; n.vy *= 0.82;
        const sp = Math.hypot(n.vx, n.vy); if (sp > 30) { n.vx *= 30 / sp; n.vy *= 30 / sp; }
        n.x += n.vx; n.y += n.vy;
      }
      alpha *= 0.994;
    }
    if (opt.mode === 'family') drawFamily(); else draw();
    raf = requestAnimationFrame(tick);
  }

  const neighbours = id => { const s = new Set([id]); for (const l of [...links, ...tree]) { if (l.s.id === id) s.add(l.t.id); if (l.t.id === id) s.add(l.s.id); } return s; };
  const nodeColor = n => n.virt === 'root' ? accent() : TYPES[n.type]?.hex || '#aaa';

  function arrow(x, y, ux, uy, size) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * size - uy * size * 0.5, y - uy * size + ux * size * 0.5); ctx.lineTo(x - ux * size + uy * size * 0.5, y - uy * size - ux * size * 0.5); ctx.closePath(); ctx.fill(); }

  function draw() {
    ctx.clearRect(0, 0, W_, H_);
    ctx.save();
    ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const focus = selected || (hover && hover.id);
    const near = focus ? neighbours(focus) : null;
    const sk = Math.sqrt(view.k);
    // tree lines
    ctx.lineCap = 'round';
    for (const l of tree) {
      const active = focus && (l.s.id === focus || l.t.id === focus);
      ctx.globalAlpha = focus && !active ? 0.08 : l.master ? 0.32 : 0.55;
      ctx.strokeStyle = l.master ? (l.t.virt === 'root' ? accent() : TYPES[l.s.type]?.hex || '#8a90a8') : TYPES[l.s.type]?.hex || '#8a90a8';
      ctx.lineWidth = (l.t.virt === 'root' ? 4 : l.master ? 1.4 : 2.4) / sk;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
    }
    for (const l of links) {
      const active = focus && (l.s.id === focus || l.t.id === focus);
      const isHover = l === hoverLink;
      ctx.globalAlpha = focus && !active && !isHover ? 0.08 : (l.rel ? 0.9 : 0.45);
      const col = l.rel ? l.color : '#888';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.lineWidth = (isHover ? 4 : l.rel ? 2.2 : 1.2) / sk;
      ctx.setLineDash(l.rel ? [] : [4, 3]);
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      // a gentle curve so two-way relationships don't sit on top of each other
      const mx = (l.s.x + l.t.x) / 2 - uy * d * 0.08, my = (l.s.y + l.t.y) / 2 + ux * d * 0.08;
      const ex = l.t.x - ux * (R(l.t) + 3), ey = l.t.y - uy * (R(l.t) + 3);
      ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      if (l.rel) {
        ctx.setLineDash([]);
        const tx = ex - mx, ty = ey - my, td = Math.hypot(tx, ty) || 1;
        arrow(ex, ey, tx / td, ty / td, 9 / sk);
        if (l.label && (active || isHover || view.k > 1.3)) {
          ctx.globalAlpha = 1;
          ctx.font = `600 ${11 / sk}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          const lx = (l.s.x + 2 * mx + l.t.x) / 4, ly = (l.s.y + 2 * my + l.t.y) / 4;
          ctx.lineWidth = 3 / sk; ctx.strokeStyle = halo(); ctx.strokeText(l.label, lx, ly - 5 / sk);
          ctx.fillStyle = l.color; ctx.fillText(l.label, lx, ly - 5 / sk);
        }
      }
    }
    ctx.setLineDash([]);
    if (linkMode) {
      ctx.globalAlpha = 1; ctx.strokeStyle = accent(); ctx.lineWidth = 2.5 / sk; ctx.setLineDash([6 / sk, 4 / sk]);
      ctx.beginPath(); ctx.moveTo(linkMode.from.x, linkMode.from.y); ctx.lineTo(linkMode.x, linkMode.y); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const n of nodes) {
      ctx.globalAlpha = near && !near.has(n.id) ? 0.18 : 1;
      const r = R(n), col = nodeColor(n);
      if (n.virt) {
        // master nodes: a ringed disc with the type's icon
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.globalAlpha *= 0.25; ctx.fill(); ctx.globalAlpha = near && !near.has(n.id) ? 0.18 : 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fillStyle = halo(); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
        ctx.font = `${n.virt === 'root' ? 28 : 20}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = textCol(); ctx.fillText(n.virt === 'root' ? '🌍' : TYPES[n.type].icon, n.x, n.y + 1);
        ctx.textBaseline = 'alphabetic';
      } else {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
        if (n.desc && !n.hiddenKids) { ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); }
      }
      if (n.id === selected || n === hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, r + (n.virt ? 8 : 3), 0, Math.PI * 2); ctx.stroke(); }
      if (n.fixed && !n.virt) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      // folded: a badge with how many sub-nodes are tucked away
      if (n.hiddenKids) {
        const bx = n.x + r * 0.8, by = n.y - r * 0.8, txt = '+' + n.hiddenKids;
        ctx.font = `700 ${11 / sk}px Inter, sans-serif`; const tw = ctx.measureText(txt).width + 10 / sk;
        ctx.fillStyle = accent(); ctx.beginPath(); ctx.roundRect(bx - tw / 2, by - 9 / sk, tw, 18 / sk, 9 / sk); ctx.fill();
        ctx.fillStyle = '#1b1408'; ctx.textAlign = 'center'; ctx.fillText(txt, bx, by + 4 / sk);
      }
      const big = n.virt === 'root' ? 15 : n.virt === 'type' ? 13.5 : 12.5;
      ctx.font = `${n.virt || n === hover || n.id === selected ? 700 : 500} ${big / sk}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      const ty = n.y + r + (n.virt ? 20 : 14) / sk;
      const label = n.virt === 'type' ? `${n.name} · ${n.total}` : n.name;
      ctx.lineWidth = 3.5 / sk; ctx.strokeStyle = halo(); ctx.strokeText(label, n.x, ty);
      ctx.fillStyle = n.virt === 'type' ? col : textCol(); ctx.fillText(label, n.x, ty);
    }
    ctx.restore();
  }

  // ---------- family tree ----------
  function famRels() { return W().relations.map(r => ({ r, f: familyLink(r) })).filter(x => x.f && getEntry(x.r.from)?.type === 'character' && getEntry(x.r.to)?.type === 'character'); }
  function famPeople() {
    const ids = new Set(); for (const { r } of famRels()) { ids.add(r.from); ids.add(r.to); }
    return [...ids].map(getEntry).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }
  function buildFamily() {
    const fr = famRels();
    let ids = new Set(); for (const { r } of fr) { ids.add(r.from); ids.add(r.to); }
    // just one family: everyone reachable from the chosen person
    if (opt.famFocus && ids.has(opt.famFocus)) {
      const adj = {}; for (const { r } of fr) { (adj[r.from] = adj[r.from] || []).push(r.to); (adj[r.to] = adj[r.to] || []).push(r.from); }
      const keep = new Set([opt.famFocus]), q = [opt.famFocus];
      while (q.length) { const c = q.shift(); for (const n of adj[c] || []) if (!keep.has(n)) { keep.add(n); q.push(n); } }
      ids = keep;
    }
    const pc = [], sp = [], sib = [];
    for (const { f } of fr) {
      if (f.parent && ids.has(f.parent) && ids.has(f.child)) pc.push([f.parent, f.child]);
      else if (f.spouse && ids.has(f.spouse[0]) && ids.has(f.spouse[1])) sp.push(f.spouse);
      else if (f.sibling && ids.has(f.sibling[0]) && ids.has(f.sibling[1])) sib.push(f.sibling);
    }
    // generations: children below parents, partners and siblings side by side
    const gen = {}; for (const id of ids) gen[id] = 0;
    for (let it = 0; it < 60; it++) {
      let ch = false;
      for (const [p, c] of pc) if (gen[c] < gen[p] + 1) { gen[c] = gen[p] + 1; ch = true; }
      for (const [a, b] of [...sp, ...sib]) { const m = Math.max(gen[a], gen[b]); if (gen[a] !== m || gen[b] !== m) { gen[a] = gen[b] = m; ch = true; } }
      if (!ch) break;
    }
    const rows = {};
    for (const id of ids) (rows[gen[id]] = rows[gen[id]] || []).push(id);
    const gens = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const parentsOf = id => pc.filter(([, c]) => c === id).map(([p]) => p);
    const partnerOf = id => sp.filter(x => x.includes(id)).map(x => x[0] === id ? x[1] : x[0]);
    const pos = {}, CW = 168, RH = 130;
    // order each row by where the parents are, keeping partners next to each other
    for (const g of gens) {
      let row = rows[g];
      row.sort((a, b) => {
        const pa = parentsOf(a), pb = parentsOf(b);
        const xa = pa.length ? pa.reduce((s, p) => s + (pos[p]?.x || 0), 0) / pa.length : Infinity, xb = pb.length ? pb.reduce((s, p) => s + (pos[p]?.x || 0), 0) / pb.length : Infinity;
        return xa - xb || getEntry(a).name.localeCompare(getEntry(b).name);
      });
      const out = [];
      for (const id of row) { if (out.includes(id)) continue; out.push(id); for (const p of partnerOf(id)) if (row.includes(p) && !out.includes(p)) out.push(p); }
      out.forEach((id, i) => { pos[id] = { x: (i - (out.length - 1) / 2) * CW, y: g * RH }; });
      // pull children under their parents where there is room
      if (g > gens[0]) for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < out.length; i++) {
          const ps = parentsOf(out[i]); if (!ps.length) continue;
          const want = ps.reduce((s, p) => s + pos[p].x, 0) / ps.length;
          const lo = i ? pos[out[i - 1]].x + CW : -Infinity;
          pos[out[i]].x = Math.max(lo, (pos[out[i]].x + want) / 2);
        }
        for (let i = 1; i < out.length; i++) pos[out[i]].x = Math.max(pos[out[i]].x, pos[out[i - 1]].x + CW);
      }
    }
    fam = { ids: [...ids], pos, pc, sp, sib, CW, RH };
  }
  function fitFamily() {
    if (!fam || !fam.ids.length) return;
    const xs = fam.ids.map(id => fam.pos[id].x), ys = fam.ids.map(id => fam.pos[id].y);
    const x0 = Math.min(...xs) - 110, x1 = Math.max(...xs) + 110, y0 = Math.min(...ys) - 80, y1 = Math.max(...ys) + 80;
    view.k = Math.max(0.25, Math.min(1.6, Math.min(W_ / (x1 - x0), H_ / (y1 - y0))));
    view.x = W_ / 2 - (x0 + x1) / 2 * view.k; view.y = H_ / 2 - (y0 + y1) / 2 * view.k;
  }
  const FW = 140, FH = 46;
  function famHit(p) { if (!fam) return null; for (const id of fam.ids) { const q = fam.pos[id]; if (Math.abs(p.x - q.x) < FW / 2 && Math.abs(p.y - q.y) < FH / 2) return id; } return null; }
  function drawFamily() {
    ctx.clearRect(0, 0, W_, H_);
    if (!fam || !fam.ids.length) {
      ctx.fillStyle = mutedCol(); ctx.font = '15px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No family relationships yet.', W_ / 2, H_ / 2 - 12);
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText('Connect two characters with “parent of”, “child of”, “married to” or “sibling of” and they appear here.', W_ / 2, H_ / 2 + 14);
      return;
    }
    ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const P = fam.pos;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // partners: a double line
    ctx.strokeStyle = REL_KINDS.love.color; ctx.lineWidth = 2;
    for (const [a, b] of fam.sp) {
      const [l, r] = P[a].x < P[b].x ? [P[a], P[b]] : [P[b], P[a]];
      for (const off of [-3, 3]) { ctx.beginPath(); ctx.moveTo(l.x + FW / 2, l.y + off); ctx.lineTo(r.x - FW / 2, r.y + off); ctx.stroke(); }
    }
    // parents → children, grouped by the pair of parents
    const groups = {};
    for (const [p, c] of fam.pc) { const ps = fam.pc.filter(([, cc]) => cc === c).map(([pp]) => pp).sort().join('|'); (groups[ps] = groups[ps] || new Set()).add(c); }
    ctx.strokeStyle = REL_KINDS.family.color; ctx.lineWidth = 2.2;
    for (const [key, kids] of Object.entries(groups)) {
      const ps = key.split('|').filter(id => P[id]); if (!ps.length) continue;
      const ox = ps.reduce((s, id) => s + P[id].x, 0) / ps.length, oy = Math.max(...ps.map(id => P[id].y)) + (ps.length > 1 ? 0 : FH / 2);
      const ks = [...kids].filter(id => P[id]); if (!ks.length) continue;
      const ky = Math.min(...ks.map(id => P[id].y)) - FH / 2, midY = (oy + ky) / 2 + (ps.length > 1 ? FH / 4 : 0);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, midY);
      const xs = [...ks.map(id => P[id].x), ox];
      ctx.moveTo(Math.min(...xs), midY); ctx.lineTo(Math.max(...xs), midY);
      for (const id of ks) { ctx.moveTo(P[id].x, midY); ctx.lineTo(P[id].x, P[id].y - FH / 2); }
      ctx.stroke();
    }
    // siblings without known parents: a bracket over the top
    ctx.strokeStyle = '#9aa4b8'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
    for (const [a, b] of fam.sib) {
      if (fam.pc.some(([, c]) => c === a) && fam.pc.some(([, c]) => c === b)) continue;
      const y = Math.min(P[a].y, P[b].y) - FH / 2 - 16;
      ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y - FH / 2); ctx.lineTo(P[a].x, y); ctx.lineTo(P[b].x, y); ctx.lineTo(P[b].x, P[b].y - FH / 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    // people
    for (const id of fam.ids) {
      const e = getEntry(id), q = P[id];
      const sel = id === selected || id === hover?.id;
      ctx.beginPath(); ctx.roundRect(q.x - FW / 2, q.y - FH / 2, FW, FH, 10);
      ctx.fillStyle = halo(); ctx.fill();
      ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? '#fff' : TYPES.character.hex; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(q.x - FW / 2, q.y - FH / 2, 6, FH, [10, 0, 0, 10]); ctx.fillStyle = TYPES.character.hex; ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = textCol(); ctx.font = '700 13px Inter, sans-serif';
      const nm = e.name.length > 18 ? e.name.slice(0, 17) + '…' : e.name;
      const sub = e.fields?.find(f => /role|title|status/i.test(f.k) && f.v)?.v || '';
      ctx.fillText(nm, q.x + 3, q.y + (sub ? -2 : 5));
      if (sub) { ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = mutedCol(); ctx.fillText(sub.length > 22 ? sub.slice(0, 21) + '…' : sub, q.x + 3, q.y + 14); }
    }
    ctx.restore();
  }

  function drawCard() {
    const e = selected && getEntry(selected);
    if (!e) { card.classList.add('hidden'); return; }
    const rels = W().relations.filter(r => r.from === e.id || r.to === e.id).length;
    const mh = mapHref(e), n = byId[e.id], kids = kidsOf[e.id]?.length || 0, pe = getEntry(parentOf(e));
    card.classList.remove('hidden');
    card.style.setProperty('--tc', typeColor(e.type));
    card.innerHTML = `<div class="type-badge" style="--tc:${typeColor(e.type)}"><span class="type-dot"></span>${TYPES[e.type]?.label}</div>
      <h3>${esc(e.name)}</h3>${e.summary ? `<p class="muted small">${esc(e.summary)}</p>` : ''}
      ${pe ? `<p class="small" style="margin:0 0 4px">Inside <a href="#/entry/${pe.id}">${esc(pe.name)}</a></p>` : ''}
      <p class="small muted">${rels} connection${rels === 1 ? '' : 's'}${n?.desc ? ` · ${n.desc} inside` : ''}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <a class="btn small" href="#/entry/${e.id}">Open</a>
        ${mh ? `<a class="btn small" href="${mh}">🗺️ Map</a>` : ''}
        ${opt.mode === 'web' ? `<button class="small" data-c="connect">🔗 Connect</button>
        <button class="small" data-c="child">＋ New linked</button>
        ${kids ? `<button class="small" data-c="fold">${collapsed.has(e.id) ? '⊕ Unfold' : '⊖ Fold'}</button>` : ''}` : ''}
        <button class="small" data-c="note">📝 Note</button>
      </div>`;
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const ent = getEntry(selected); if (!ent) return;
    if (b.dataset.c === 'connect') startLink(byId[ent.id]);
    if (b.dataset.c === 'child') spawnChild(byId[ent.id]);
    if (b.dataset.c === 'note') addNoteDialog(ent, drawCard);
    if (b.dataset.c === 'fold') toggleFold(ent.id);
  });
  function toggleFold(id) { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); rebuild(); alpha = Math.max(alpha, 0.5); }

  const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
  const hitNode = p => { for (let i = nodes.length - 1; i >= 0; i--) { const n = nodes[i]; if (Math.hypot(n.x - p.x, n.y - p.y) < R(n) + 4) return n; } return null; };
  const hitLink = p => {
    let best = null, bd = 7 / view.k;
    for (const l of links) {
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - l.s.x) * dx + (p.y - l.s.y) * dy) / len2));
      const d = Math.hypot(p.x - l.s.x - dx * t, p.y - l.s.y - dy * t);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  };

  function savePin(n) { if (n.virt) return; n.fixed = true; pinned[n.id] = [Math.round(n.x), Math.round(n.y)]; save(); }
  function center(n) { view.x = W_ / 2 - n.x * view.k; view.y = H_ / 2 - n.y * view.k; }

  function startLink(from) {
    if (!from || from.virt) return;
    linkMode = { from, x: from.x, y: from.y };
    hint.textContent = `Click another node to connect it to ${from.name} · Esc to cancel`;
    hint.classList.remove('hidden');
  }
  function endLink() { linkMode = null; hint.classList.add('hidden'); }

  function spawnChild(src) {
    newConnectedDialog(src.e, ent => {
      const a = Math.random() * Math.PI * 2;
      live.set(ent.id, { x: src.x + Math.cos(a) * 140, y: src.y + Math.sin(a) * 140, vx: 0, vy: 0 });
      selected = ent.id;
      rebuild();
    });
  }

  function masterMenu(n, x, y) {
    if (n.virt === 'root') {
      contextMenu(x, y, [
        { header: n.name },
        { icon: '⊖', label: 'Fold every type', action: () => { for (const t of Object.keys(TYPES)) collapsed.add(TN(t)); rebuild(); } },
        { icon: '⊕', label: 'Unfold everything', action: () => { collapsed.clear(); rebuild(); } },
        { icon: '◎', label: 'Hide master nodes', action: () => { opt.masters = false; drawOpts(); rebuild(); alpha = 1; } },
      ]);
      return;
    }
    const t = TYPES[n.type];
    contextMenu(x, y, [
      { header: `${t.icon} ${t.plural}` },
      { icon: collapsed.has(n.id) ? '⊕' : '⊖', label: collapsed.has(n.id) ? 'Unfold' : 'Fold away its entries', action: () => toggleFold(n.id) },
      { icon: '📚', label: `Open ${t.plural} in the World Bible`, action: () => go(`#/entries/${n.type}`) },
      { icon: '＋', label: `New ${t.label.toLowerCase()} here…`, action: () => newHere({ x: n.x + 60, y: n.y + 60 }, n.type) },
      { icon: '🙈', label: `Hide ${t.plural}`, action: () => { hidden.add(n.type); main.querySelector(`[data-type="${n.type}"]`)?.classList.remove('on'); rebuild(); } },
    ]);
  }
  function nodeMenu(n, x, y) {
    if (n.virt) return masterMenu(n, x, y);
    const e = n.e, mh = mapHref(e);
    contextMenu(x, y, [
      { header: e.name },
      { icon: '📖', label: 'Open entry', action: () => go(`#/entry/${e.id}`) },
      ...(mh ? [{ icon: '🗺️', label: 'Open its map', action: () => go(mh) }] : []),
      { icon: '🗂️', label: 'Open in side panel', action: () => { const a = document.createElement('a'); a.href = `#/entry/${e.id}`; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); a.remove(); } },
      { icon: '✎', label: 'Edit', action: () => go(`#/entry/${e.id}/edit`) },
      '-',
      { icon: '🔗', label: 'Connect to…', hint: 'click a node', action: () => startLink(n) },
      { icon: '🔎', label: 'Connect to (search)…', action: () => pickEntryDialog(`Connect ${e.name} to…`, e.id, t => connectDialog(e.id, t.id, rebuild)) },
      { icon: '⤷', label: 'Put inside…', action: () => pickEntryDialog(`${e.name} is inside…`, e.id, t => { e.parentId = t.id; save(); rebuild(); toast(`${e.name} is now inside ${t.name}`); }) },
      { icon: '＋', label: 'New connected entry…', action: () => spawnChild(n) },
      { icon: '📝', label: 'Add a note…', action: () => addNoteDialog(e, drawCard) },
      '-',
      ...(kidsOf[e.id]?.length ? [{ icon: collapsed.has(e.id) ? '⊕' : '⊖', label: collapsed.has(e.id) ? 'Unfold sub-nodes' : `Fold its ${n.desc} sub-nodes`, action: () => toggleFold(e.id) }] : []),
      { icon: '🎯', label: selected === n.id ? 'Clear focus' : 'Focus on this', action: () => { selected = selected === n.id ? null : n.id; drawCard(); } },
      n.fixed ? { icon: '📌', label: 'Unpin (let it float)', action: () => { n.fixed = false; delete pinned[n.id]; save(); alpha = Math.max(alpha, 0.3); } }
        : { icon: '📌', label: 'Pin here', action: () => savePin(n) },
      '-',
      { icon: '🗑', label: 'Delete entry', danger: true, action: async () => { if (await confirmDialog(`Delete “${e.name}”?`)) { deleteEntry(e.id); live.delete(e.id); delete pinned[e.id]; if (selected === e.id) selected = null; rebuild(); } } },
    ]);
  }
  function linkMenu(l, x, y) {
    if (!l.rel) {
      contextMenu(x, y, [
        { header: `${l.s.name} mentions ${l.t.name}` },
        { icon: '📖', label: `Open ${l.s.name}`, action: () => go(`#/entry/${l.s.id}`) },
        { icon: '🔗', label: 'Turn into a named connection…', action: () => connectDialog(l.s.id, l.t.id, rebuild) },
      ]);
      return;
    }
    contextMenu(x, y, [
      { header: `${l.s.name} → ${l.t.name}` },
      { icon: '✎', label: 'Edit connection…', action: () => connectDialog(l.rel.from, l.rel.to, rebuild, l.rel) },
      { icon: '⇄', label: 'Reverse direction', action: () => { [l.rel.from, l.rel.to] = [l.rel.to, l.rel.from]; save(); rebuild(); } },
      '-',
      { icon: '🗑', label: 'Delete connection', danger: true, action: () => { W().relations = W().relations.filter(r => r !== l.rel); save(); rebuild(); } },
    ]);
  }
  function canvasMenu(p, x, y) {
    contextMenu(x, y, [
      { icon: '＋', label: 'New entry here…', action: () => newHere(p) },
      { icon: '⤢', label: 'Fit everything in view', action: fit },
      { icon: '↺', label: 'Re-layout (unpin all)', action: relayout },
    ]);
  }
  function newHere(p, type = 'character') {
    openModal(`<h2>New entry</h2><label>Name</label><input id="hn" autofocus>
      <div class="filters" style="margin-top:10px" id="ht">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${k === type ? 'on' : ''}" style="--tc:${t.color}" data-t="${k}">${t.icon} ${t.label}</button>`).join('')}</div>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Create</button></div>`, m => {
      m.querySelector('#ht').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); } });
      const done = () => {
        const name = m.querySelector('#hn').value.trim(); if (!name) return;
        const e = newEntry(type, name);
        live.set(e.id, { x: p.x, y: p.y, vx: 0, vy: 0 });
        save(); closeModal(); selected = e.id; rebuild();
      };
      m.addEventListener('click', e => { if (e.target.dataset.a === 'no') closeModal(); if (e.target.dataset.a === 'yes') done(); });
      m.querySelector('#hn').addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    });
  }
  function fit() {
    if (opt.mode === 'family') return fitFamily();
    if (!nodes.length) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 60, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 60;
    view.k = Math.max(0.15, Math.min(2.5, Math.min(W_ / (x1 - x0), H_ / (y1 - y0))));
    view.x = W_ / 2 - (x0 + x1) / 2 * view.k; view.y = H_ / 2 - (y0 + y1) / 2 * view.k;
  }
  function relayout() { for (const n of nodes) { if (n.virt === 'root') continue; n.fixed = false; delete pinned[n.id]; n.x += (Math.random() - 0.5) * 40; n.y += (Math.random() - 0.5) * 40; } save(); alpha = 1; }

  // ----- pointer handling -----
  let dragNode = null, pan = null, moved = false, shiftLink = false;
  cv.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    if (opt.mode === 'family') { const id = famHit(toWorld(ev.clientX, ev.clientY)); if (id) nodeMenuFam(id, ev.clientX, ev.clientY); return; }
    if (linkMode) { endLink(); return; }
    const p = toWorld(ev.clientX, ev.clientY);
    const n = hitNode(p);
    if (n) return nodeMenu(n, ev.clientX, ev.clientY);
    const l = hitLink(p);
    if (l) return linkMenu(l, ev.clientX, ev.clientY);
    canvasMenu(p, ev.clientX, ev.clientY);
  });
  function nodeMenuFam(id, x, y) {
    const e = getEntry(id);
    contextMenu(x, y, [
      { header: e.name },
      { icon: '📖', label: 'Open entry', action: () => go(`#/entry/${id}`) },
      { icon: '🌳', label: `Show only ${e.name}’s family`, action: () => { opt.famFocus = id; drawOpts(); rebuild(); fitFamily(); } },
      { icon: '🔎', label: 'Add a family member…', action: () => pickEntryDialog(`${e.name} is related to…`, id, t => connectDialog(id, t.id, rebuild)) },
      { icon: '🕸️', label: 'Show in the web', action: () => { opt.mode = 'web'; go(`#/graph?focus=${id}`); } },
    ]);
  }
  cv.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    closeContextMenu();
    cv.setPointerCapture(ev.pointerId);
    const p = toWorld(ev.clientX, ev.clientY); moved = false;
    if (opt.mode === 'family') { pan = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, hit: famHit(p) }; return; }
    const n = hitNode(p);
    if (linkMode) return;
    if (n && ev.shiftKey && !n.virt) { shiftLink = true; startLink(n); return; }
    dragNode = n;
    if (!n) pan = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
  });
  cv.addEventListener('pointermove', ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    if (linkMode) { linkMode.x = p.x; linkMode.y = p.y; hover = hitNode(p); cv.style.cursor = hover ? 'copy' : 'crosshair'; return; }
    if (dragNode) { moved = true; dragNode.x = p.x; dragNode.y = p.y; alpha = Math.max(alpha, 0.2); }
    else if (pan) { if (Math.abs(ev.clientX - pan.sx) + Math.abs(ev.clientY - pan.sy) > 3) moved = true; view.x = pan.vx + ev.clientX - pan.sx; view.y = pan.vy + ev.clientY - pan.sy; }
    else if (opt.mode === 'family') { const id = famHit(p); hover = id ? { id } : null; cv.style.cursor = id ? 'pointer' : 'grab'; }
    else {
      const h = hitNode(p);
      hover = h;
      hoverLink = h ? null : hitLink(p);
      cv.style.cursor = h ? 'pointer' : hoverLink ? 'context-menu' : 'grab';
    }
  });
  cv.addEventListener('pointerup', ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    if (opt.mode === 'family') {
      if (pan && !moved) { selected = pan.hit && selected !== pan.hit ? pan.hit : null; drawCard(); }
      pan = null; return;
    }
    if (linkMode) {
      const t = hitNode(p);
      const from = linkMode.from;
      if (t && t !== from && !t.virt) { endLink(); connectDialog(from.id, t.id, rebuild); }
      else if (shiftLink || (!t && !moved)) { if (shiftLink) endLink(); }
      shiftLink = false;
      return;
    }
    if (dragNode) {
      const n = dragNode; dragNode = null;
      if (moved) savePin(n);
      else if (n.virt) { /* master nodes: double-click folds */ }
      else if (ev.ctrlKey || ev.metaKey) { const a = document.createElement('a'); a.href = `#/entry/${n.id}`; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); a.remove(); }
      else { selected = selected === n.id ? null : n.id; drawCard(); }
      return;
    }
    if (pan && !moved) { selected = null; drawCard(); }
    pan = null;
  });
  cv.addEventListener('dblclick', ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    if (opt.mode === 'family') { const id = famHit(p); if (id) go(`#/entry/${id}`); return; }
    const n = hitNode(p); if (!n) return;
    if (n.virt) { if (n.virt === 'type') toggleFold(n.id); return; }
    const mh = mapHref(n.e);
    go(mh || `#/entry/${n.id}`);
  });
  cv.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const nk = Math.min(4, Math.max(0.1, view.k * Math.exp(-ev.deltaY * 0.0015)));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk;
  }, { passive: false });
  const onKey = e => { if (e.key === 'Escape' && linkMode) endLink(); };
  document.addEventListener('keydown', onKey);

  main.querySelector('#relayout').onclick = () => opt.mode === 'family' ? fitFamily() : relayout();
  main.querySelector('#newnode').onclick = () => newHere({ x: (W_ / 2 - view.x) / view.k, y: (H_ / 2 - view.y) / view.k });
  main.querySelector('#find').addEventListener('input', e => {
    const q = e.target.value.toLowerCase(); if (!q) return;
    if (opt.mode === 'family') {
      const id = fam?.ids.find(i => getEntry(i).name.toLowerCase().includes(q));
      if (id) { selected = id; view.x = W_ / 2 - fam.pos[id].x * view.k; view.y = H_ / 2 - fam.pos[id].y * view.k; drawCard(); }
      return;
    }
    const n = nodes.find(x => x.name.toLowerCase().startsWith(q)) || nodes.find(x => x.name.toLowerCase().includes(q));
    if (n) { selected = n.virt ? null : n.id; center(n); drawCard(); }
  });

  const ro = new ResizeObserver(resize);
  ro.observe(cv);
  resize();
  drawOpts();
  rebuild();
  if (!W().entries.length) {
    card.classList.remove('hidden');
    card.innerHTML = `<h3>Your web is empty</h3><p class="muted small">Right-click anywhere to add your first entry, then right-click it to grow connections.</p>`;
  }
  if (selected && byId[selected]) setTimeout(() => center(byId[selected]), 50);
  else if (opt.mode === 'family') setTimeout(fitFamily, 30);
  else { let tries = 0; const autoFit = () => { if (opt.mode !== 'web') return; if (alpha > 0.25 && tries++ < 40) return setTimeout(autoFit, 150); if (!pinnedAny()) fit(); }; setTimeout(autoFit, 400); }
  function pinnedAny() { return Object.keys(pinned).length > 0; }
  tick();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); closeContextMenu(); };
}
