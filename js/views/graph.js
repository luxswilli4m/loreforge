// World Web: an interactive relationship map of every entry, with right-click tools.
import { W, TYPES, mentionsIn, getEntry, newEntry, deleteEntry, save, uid } from '../store.js';
import { esc, query, go, toast, openModal, closeModal, confirmDialog, contextMenu, closeContextMenu, editorHTML, attachEditor, REL_SUGGESTIONS, typeColor } from '../util.js';

const hidden = new Set();
let showMentions = true;
const live = new Map(); // id -> {x,y,vx,vy} kept between visits

function pinnedStore() { const w = W(); if (!w.graph) w.graph = { pinned: {} }; if (!w.graph.pinned) w.graph.pinned = {}; return w.graph.pinned; }

// ---------- dialogs shared with other views ----------
export function connectDialog(fromId, toId, onDone, rel = null) {
  let a = fromId, b = toId;
  const draw = m => {
    const A = getEntry(a), B = getEntry(b);
    m.innerHTML = `<h2>${rel ? 'Edit connection' : 'New connection'}</h2>
      <div class="conn-preview"><span class="mention" style="--tc:${typeColor(A.type)}">${esc(A.name)}</span>
        <input id="cl" list="cl-s" value="${esc(rel?.label || '')}" placeholder="is… (e.g. ally of)" autofocus>
        <span class="mention" style="--tc:${typeColor(B.type)}">${esc(B.name)}</span></div>
      <datalist id="cl-s">${REL_SUGGESTIONS.map(s => `<option value="${s}">`).join('')}</datalist>
      <div class="filters" style="margin-top:12px">${REL_SUGGESTIONS.slice(0, 12).map(s => `<button class="chip" data-s="${s}">${s}</button>`).join('')}</div>
      <div class="modal-actions"><button data-a="swap" title="Swap direction">⇄ Swap</button><span style="flex:1"></span><button data-a="no">Cancel</button><button class="primary" data-a="yes">${rel ? 'Save' : 'Connect'}</button></div>`;
    setTimeout(() => m.querySelector('#cl')?.focus(), 20);
  };
  openModal('', m => {
    draw(m);
    const done = () => {
      const label = m.querySelector('#cl').value.trim();
      const w = W();
      if (rel) Object.assign(rel, { from: a, to: b, label });
      else w.relations.push({ id: uid(), from: a, to: b, label });
      save(); closeModal(); onDone?.();
    };
    m.addEventListener('click', e => {
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
export function render(main) {
  const w = W();
  const focusQ = query().focus;
  main.innerHTML = `
    <div class="page-head"><h1>World Web</h1>
      <input id="find" placeholder="Find a node…" style="max-width:200px">
      <label class="row shrink" style="margin:0;gap:6px;color:var(--text)"><input type="checkbox" id="mentions" ${showMentions ? 'checked' : ''}> @mentions</label>
      <button id="relayout" title="Unpin everything and re-arrange">↺ Re-layout</button>
      <button class="primary" id="newnode">＋ New entry</button>
    </div>
    <div class="filters">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${hidden.has(k) ? '' : 'on'}" style="--tc:${t.color}" data-type="${k}">${t.icon} ${t.plural}</button>`).join('')}</div>
    <div class="graph-stage" id="stage"><canvas id="cv"></canvas>
      <div class="graph-legend">
        <div><svg width="26" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#d4a24c" stroke-width="2"/><path d="M26 4 L19 0.5 L19 7.5 Z" fill="#d4a24c"/></svg> connection</div>
        <div><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#888" stroke-width="1.5" stroke-dasharray="4 3"/></svg> @mention</div>
        <div class="muted legend-help"><b>Right-click</b> anything for options<br><b>Shift + drag</b> node → node to connect<br>Double-click to open · drag to arrange</div>
      </div>
      <div class="graph-card hidden" id="card"></div>
      <div class="graph-hint hidden" id="hint"></div>
    </div>`;

  main.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { hidden.has(b.dataset.type) ? hidden.delete(b.dataset.type) : hidden.add(b.dataset.type); rebuild(); });
  main.querySelector('#mentions').onchange = e => { showMentions = e.target.checked; rebuild(); };

  const cv = main.querySelector('#cv'), stage = main.querySelector('#stage');
  const card = main.querySelector('#card'), hint = main.querySelector('#hint');
  const ctx = cv.getContext('2d');
  const view = { x: 0, y: 0, k: 1, inited: false };
  let W_ = 0, H_ = 0, alpha = 1, hover = null, hoverLink = null, raf, selected = focusQ && getEntry(focusQ) ? focusQ : null;
  let nodes = [], links = [], byId = {};
  let linkMode = null; // { from: node, x, y }
  const pinned = pinnedStore();

  function rebuild() {
    const ents = W().entries.filter(e => !hidden.has(e.type));
    nodes = ents.map((e, i) => {
      let st = live.get(e.id);
      if (!st) {
        const p = pinned[e.id];
        const a = i * 2.4;
        st = p ? { x: p[0], y: p[1], vx: 0, vy: 0 } : { x: Math.cos(a) * (40 + i * 6), y: Math.sin(a) * (40 + i * 6), vx: 0, vy: 0 };
        live.set(e.id, st);
      }
      return Object.assign(st, { id: e.id, e, deg: 0, fixed: !!pinned[e.id] });
    });
    byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    links = [];
    const seen = new Set();
    for (const r of W().relations) {
      if (byId[r.from] && byId[r.to]) { links.push({ s: byId[r.from], t: byId[r.to], label: r.label, rel: r }); seen.add(r.from + r.to); seen.add(r.to + r.from); }
    }
    if (showMentions) for (const e of ents) {
      for (const id of mentionsIn(e.body + ' ' + e.summary)) {
        if (id !== e.id && byId[id] && !seen.has(e.id + id)) { links.push({ s: byId[e.id], t: byId[id], rel: null }); seen.add(e.id + id); seen.add(id + e.id); }
      }
    }
    for (const l of links) { l.s.deg++; l.t.deg++; }
    alpha = Math.max(alpha, 0.5);
    drawCard();
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

  function tick() {
    if (alpha > 0.005) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy || 1;
          if (d2 > 640000) continue;
          const f = 7000 / d2 * alpha, d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
        const f = (d - (l.rel ? 170 : 210)) / d * 0.04 * alpha * (l.rel ? 1 : 0.6);
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of nodes) {
        if (n.fixed || n === dragNode) { n.vx = n.vy = 0; continue; }
        n.vx -= n.x * 0.003 * alpha; n.vy -= n.y * 0.003 * alpha;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      }
      alpha *= 0.994;
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  const R = n => 8 + Math.min(10, n.deg * 1.5);
  const neighbours = id => { const s = new Set([id]); for (const l of links) { if (l.s.id === id) s.add(l.t.id); if (l.t.id === id) s.add(l.s.id); } return s; };

  function draw() {
    ctx.clearRect(0, 0, W_, H_);
    ctx.save();
    ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const focus = selected || (hover && hover.id);
    const near = focus ? neighbours(focus) : null;
    const sk = Math.sqrt(view.k);
    for (const l of links) {
      const active = focus && (l.s.id === focus || l.t.id === focus);
      const isHover = l === hoverLink;
      ctx.globalAlpha = focus && !active && !isHover ? 0.1 : (l.rel ? 0.85 : 0.45);
      const col = l.rel ? accent() : '#888';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.lineWidth = (isHover ? 4 : l.rel ? 2 : 1.2) / sk;
      ctx.setLineDash(l.rel ? [] : [4, 3]);
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const ex = l.t.x - ux * (R(l.t) + 3), ey = l.t.y - uy * (R(l.t) + 3);
      ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(ex, ey); ctx.stroke();
      if (l.rel) {
        const ah = 9 / sk;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * ah - uy * ah * 0.5, ey - uy * ah + ux * ah * 0.5); ctx.lineTo(ex - ux * ah + uy * ah * 0.5, ey - uy * ah - ux * ah * 0.5); ctx.closePath(); ctx.fill();
        if (l.label && (active || isHover || view.k > 1.3)) {
          ctx.globalAlpha = 1;
          ctx.font = `600 ${11 / sk}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          const mx = (l.s.x + l.t.x) / 2, my = (l.s.y + l.t.y) / 2;
          ctx.lineWidth = 3 / sk; ctx.strokeStyle = halo(); ctx.strokeText(l.label, mx, my - 5 / sk);
          ctx.fillStyle = mutedCol(); ctx.fillText(l.label, mx, my - 5 / sk);
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
      const r = R(n);
      ctx.fillStyle = TYPES[n.e.type]?.hex || '#aaa';
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
      if (n.id === selected || n === hover || (linkMode && n === hover)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
      if (n.fixed) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = `${n === hover || n.id === selected ? 700 : 500} ${12.5 / sk}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      const ty = n.y + r + 14 / sk;
      ctx.lineWidth = 3.5 / sk; ctx.strokeStyle = halo(); ctx.strokeText(n.e.name, n.x, ty);
      ctx.fillStyle = textCol(); ctx.fillText(n.e.name, n.x, ty);
    }
    ctx.restore();
  }

  function drawCard() {
    const e = selected && getEntry(selected);
    if (!e) { card.classList.add('hidden'); return; }
    const rels = W().relations.filter(r => r.from === e.id || r.to === e.id).length;
    card.classList.remove('hidden');
    card.style.setProperty('--tc', typeColor(e.type));
    card.innerHTML = `<div class="type-badge" style="--tc:${typeColor(e.type)}"><span class="type-dot"></span>${TYPES[e.type]?.label}</div>
      <h3>${esc(e.name)}</h3>${e.summary ? `<p class="muted small">${esc(e.summary)}</p>` : ''}
      <p class="small muted">${rels} connection${rels === 1 ? '' : 's'}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <a class="btn small" href="#/entry/${e.id}">Open</a>
        <button class="small" data-c="connect">🔗 Connect</button>
        <button class="small" data-c="child">＋ New linked</button>
        <button class="small" data-c="note">📝 Note</button>
      </div>`;
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const ent = getEntry(selected); if (!ent) return;
    if (b.dataset.c === 'connect') startLink(byId[ent.id]);
    if (b.dataset.c === 'child') spawnChild(byId[ent.id]);
    if (b.dataset.c === 'note') addNoteDialog(ent, drawCard);
  });

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

  function savePin(n) { n.fixed = true; pinned[n.id] = [Math.round(n.x), Math.round(n.y)]; save(); }
  function center(n) { view.x = W_ / 2 - n.x * view.k; view.y = H_ / 2 - n.y * view.k; }

  function startLink(from) {
    linkMode = { from, x: from.x, y: from.y };
    hint.textContent = `Click another node to connect it to ${from.e.name} · Esc to cancel`;
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

  function nodeMenu(n, x, y) {
    const e = n.e;
    contextMenu(x, y, [
      { header: e.name },
      { icon: '📖', label: 'Open entry', action: () => go(`#/entry/${e.id}`) },
      { icon: '🗂️', label: 'Open in side panel', action: () => { const a = document.createElement('a'); a.href = `#/entry/${e.id}`; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); a.remove(); } },
      { icon: '✎', label: 'Edit', action: () => go(`#/entry/${e.id}/edit`) },
      '-',
      { icon: '🔗', label: 'Connect to…', hint: 'click a node', action: () => startLink(n) },
      { icon: '🔎', label: 'Connect to (search)…', action: () => pickEntryDialog(`Connect ${e.name} to…`, e.id, t => connectDialog(e.id, t.id, rebuild)) },
      { icon: '＋', label: 'New connected entry…', action: () => spawnChild(n) },
      { icon: '📝', label: 'Add a note…', action: () => addNoteDialog(e, drawCard) },
      '-',
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
        { header: `${l.s.e.name} mentions ${l.t.e.name}` },
        { icon: '📖', label: `Open ${l.s.e.name}`, action: () => go(`#/entry/${l.s.id}`) },
        { icon: '🔗', label: 'Turn into a named connection…', action: () => connectDialog(l.s.id, l.t.id, rebuild) },
      ]);
      return;
    }
    contextMenu(x, y, [
      { header: `${l.s.e.name} → ${l.t.e.name}` },
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
  function newHere(p) {
    let type = 'character';
    openModal(`<h2>New entry</h2><label>Name</label><input id="hn" autofocus>
      <div class="filters" style="margin-top:10px" id="ht">${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${k === type ? 'on' : ''}" style="--tc:${t.color}" data-t="${k}">${t.icon} ${t.label}</button>`).join('')}</div>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Create</button></div>`, m => {
      m.querySelector('#ht').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); } });
      const done = () => {
        const name = m.querySelector('#hn').value.trim(); if (!name) return;
        const e = newEntry(type, name);
        live.set(e.id, { x: p.x, y: p.y, vx: 0, vy: 0 });
        pinned[e.id] = [Math.round(p.x), Math.round(p.y)];
        save(); closeModal(); selected = e.id; rebuild();
      };
      m.addEventListener('click', e => { if (e.target.dataset.a === 'no') closeModal(); if (e.target.dataset.a === 'yes') done(); });
      m.querySelector('#hn').addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    });
  }
  function fit() {
    if (!nodes.length) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 60, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 60;
    view.k = Math.max(0.2, Math.min(2.5, Math.min(W_ / (x1 - x0), H_ / (y1 - y0))));
    view.x = W_ / 2 - (x0 + x1) / 2 * view.k; view.y = H_ / 2 - (y0 + y1) / 2 * view.k;
  }
  function relayout() { for (const n of nodes) { n.fixed = false; delete pinned[n.id]; n.x += (Math.random() - 0.5) * 40; n.y += (Math.random() - 0.5) * 40; } save(); alpha = 1; }

  // ----- pointer handling -----
  let dragNode = null, pan = null, moved = false, shiftLink = false;
  cv.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    if (linkMode) { endLink(); return; }
    const p = toWorld(ev.clientX, ev.clientY);
    const n = hitNode(p);
    if (n) return nodeMenu(n, ev.clientX, ev.clientY);
    const l = hitLink(p);
    if (l) return linkMenu(l, ev.clientX, ev.clientY);
    canvasMenu(p, ev.clientX, ev.clientY);
  });
  cv.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    closeContextMenu();
    cv.setPointerCapture(ev.pointerId);
    const p = toWorld(ev.clientX, ev.clientY); moved = false;
    const n = hitNode(p);
    if (linkMode) return;
    if (n && ev.shiftKey) { shiftLink = true; startLink(n); return; }
    dragNode = n;
    if (!n) pan = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
  });
  cv.addEventListener('pointermove', ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    if (linkMode) { linkMode.x = p.x; linkMode.y = p.y; hover = hitNode(p); cv.style.cursor = hover ? 'copy' : 'crosshair'; return; }
    if (dragNode) { moved = true; dragNode.x = p.x; dragNode.y = p.y; alpha = Math.max(alpha, 0.2); }
    else if (pan) { if (Math.abs(ev.clientX - pan.sx) + Math.abs(ev.clientY - pan.sy) > 3) moved = true; view.x = pan.vx + ev.clientX - pan.sx; view.y = pan.vy + ev.clientY - pan.sy; }
    else {
      const h = hitNode(p);
      hover = h;
      hoverLink = h ? null : hitLink(p);
      cv.style.cursor = h ? 'pointer' : hoverLink ? 'context-menu' : 'grab';
    }
  });
  cv.addEventListener('pointerup', ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    if (linkMode) {
      const t = hitNode(p);
      const from = linkMode.from;
      if (t && t !== from) { endLink(); connectDialog(from.id, t.id, rebuild); }
      else if (shiftLink || (!t && !moved)) { if (shiftLink) endLink(); }
      shiftLink = false;
      return;
    }
    if (dragNode) {
      const n = dragNode; dragNode = null;
      if (moved) savePin(n);
      else if (ev.ctrlKey || ev.metaKey) { const a = document.createElement('a'); a.href = `#/entry/${n.id}`; document.body.appendChild(a); a.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); a.remove(); }
      else { selected = selected === n.id ? null : n.id; drawCard(); }
      return;
    }
    if (pan && !moved) { selected = null; drawCard(); }
    pan = null;
  });
  cv.addEventListener('dblclick', ev => { const n = hitNode(toWorld(ev.clientX, ev.clientY)); if (n) go(`#/entry/${n.id}`); });
  cv.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const nk = Math.min(4, Math.max(0.15, view.k * Math.exp(-ev.deltaY * 0.0015)));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk;
  }, { passive: false });
  const onKey = e => { if (e.key === 'Escape' && linkMode) endLink(); };
  document.addEventListener('keydown', onKey);

  main.querySelector('#relayout').onclick = relayout;
  main.querySelector('#newnode').onclick = () => newHere({ x: (W_ / 2 - view.x) / view.k, y: (H_ / 2 - view.y) / view.k });
  main.querySelector('#find').addEventListener('input', e => {
    const q = e.target.value.toLowerCase(); if (!q) return;
    const n = nodes.find(x => x.e.name.toLowerCase().startsWith(q)) || nodes.find(x => x.e.name.toLowerCase().includes(q));
    if (n) { selected = n.id; center(n); drawCard(); }
  });

  const ro = new ResizeObserver(resize);
  ro.observe(cv);
  resize();
  rebuild();
  if (!W().entries.length) {
    card.classList.remove('hidden');
    card.innerHTML = `<h3>Your web is empty</h3><p class="muted small">Right-click anywhere to add your first entry, then right-click it to grow connections.</p>`;
  }
  if (selected && byId[selected]) setTimeout(() => center(byId[selected]), 50);
  tick();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); closeContextMenu(); };
}
