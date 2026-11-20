// Encyclopedia: one index of everything in the world, A–Z or by category/tag, with a reading pane.
import { W, TYPES, getEntry, formatDate, mentionsIn } from '../store.js';
import { esc, md, query, typeColor, mentionLink } from '../util.js';
import * as entries from './entries.js';
import * as journals from './journals.js';
import * as campaign from './campaign.js';
import * as maps from './maps.js';
import * as quests from './quests.js';
import * as library from './library.js';

const state = { mode: 'az', q: '', off: new Set(), collapsed: new Set() };

const KINDS = [
  ...Object.entries(TYPES).map(([k, t]) => ({ k, label: t.plural, icon: t.icon, color: t.color })),
  { k: 'journal', label: 'Journals', icon: '✒️', color: 'var(--muted)' },
  { k: 'quest', label: 'Quests', icon: '🧭', color: 'var(--accent)' },
  { k: 'session', label: 'Sessions', icon: '🎲', color: 'var(--accent)' },
  { k: 'map', label: 'Maps', icon: '🗺️', color: 'var(--muted)' },
  { k: 'event', label: 'Timeline events', icon: '⏳', color: 'var(--muted)' },
  { k: 'doc', label: 'Library', icon: '🏛️', color: 'var(--muted)' },
];
const kindInfo = Object.fromEntries(KINDS.map(k => [k.k, k]));

function allItems() {
  const w = W();
  return [
    ...w.entries.map(e => ({ key: `entry:${e.id}`, kind: e.type, name: e.name, sub: e.summary, tags: e.tags, href: `#/entry/${e.id}`, edit: `#/entry/${e.id}/edit`, html: () => entries.readHTML(e, true), text: e.summary + ' ' + e.body })),
    ...w.journals.map(j => ({ key: `journal:${j.id}`, kind: 'journal', name: j.title, sub: j.category, tags: [j.category], href: `#/journal/${j.id}`, edit: `#/journal/${j.id}/edit`, html: () => journals.readHTML(j), text: j.body })),
    ...w.sessions.map(s => ({ key: `session:${s.id}`, kind: 'session', name: `Session ${s.number}: ${s.title}`, sortName: s.title, sub: s.status, tags: [], href: `#/session/${s.id}`, html: () => campaign.readHTML(s), text: s.notes + ' ' + s.recap })),
    ...w.maps.map(m => ({ key: `map:${m.id}`, kind: 'map', name: m.name, sub: `${m.pins.length} pins`, tags: [], href: `#/map/${m.id}`, html: () => maps.peekHTML(m), text: '' })),
    ...w.quests.map(q => ({ key: `quest:${q.id}`, kind: 'quest', name: q.title, sub: q.status, tags: [q.status], href: `#/quest/${q.id}`, html: () => quests.readHTML(q), text: q.summary + ' ' + q.desc })),
    ...w.library.map(d => ({ key: `doc:${d.id}`, kind: 'doc', name: d.name, sub: d.cat, tags: [d.cat], href: `#/doc/${d.id}`, html: () => '<div id="codex-doc"><p class="muted">Opening…</p></div>', after: () => library.viewerHTML(d, '70vh').then(h => { const el = document.getElementById('codex-doc'); if (el) el.innerHTML = h; }), text: '' })),
    ...w.events.map(ev => ({ key: `event:${ev.id}`, kind: 'event', name: ev.title, sub: formatDate(ev.date), tags: [], href: '#/timeline', html: () => eventHTML(ev), text: ev.desc })),
  ];
}

function eventHTML(ev) {
  const linked = [...mentionsIn(ev.desc)].filter(getEntry);
  return `<span class="tag">Timeline event</span><h1 style="margin-top:6px">${esc(ev.title)}</h1>
    <p class="tl-date" style="font-size:1em">${esc(formatDate(ev.date, true))}</p>
    <div class="prose">${md(ev.desc) || '<p class="muted">No description.</p>'}</div>
    ${linked.length ? `<h3>Involves</h3><ul class="link-list">${linked.map(id => `<li><span class="type-dot" style="--tc:${typeColor(getEntry(id).type)}"></span>${mentionLink(id)}</li>`).join('')}</ul>` : ''}`;
}

const sortKey = it => (it.sortName || it.name).replace(/^(the|a|an)\s+/i, '').toLowerCase();

export function render(main) {
  let selected = query().item || '';
  main.innerHTML = `
    <div class="page-head"><h1>Encyclopedia</h1>
      <div class="seg shrink" id="mode" style="width:auto">
        <button data-m="az">A–Z</button><button data-m="category">By category</button><button data-m="tag">By tag</button>
      </div>
    </div>
    <div class="codex">
      <div class="codex-index card">
        <input id="cq" placeholder="Search the encyclopedia…" value="${esc(state.q)}">
        <div class="filters codex-kinds">${KINDS.map(k => `<button class="chip ${state.off.has(k.k) ? '' : 'on'}" style="--tc:${k.color}" data-k="${k.k}" title="${k.label}">${k.icon}</button>`).join('')}</div>
        <div class="letterbar" id="letters"></div>
        <div class="codex-list" id="list"></div>
      </div>
      <article class="codex-article card" id="art"></article>
    </div>`;
  const list = main.querySelector('#list'), art = main.querySelector('#art'), letters = main.querySelector('#letters');

  function drawList() {
    main.querySelectorAll('#mode [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode));
    const q = state.q.toLowerCase();
    const items = allItems().filter(it => !state.off.has(it.kind))
      .filter(it => !q || it.name.toLowerCase().includes(q) || (it.sub || '').toLowerCase().includes(q) || it.text.toLowerCase().includes(q) || it.tags.some(t => t.toLowerCase().includes(q)));
    const row = it => `<a class="codex-row ${it.key === selected ? 'sel' : ''}" data-key="${it.key}" href="${it.href}">
        <span class="type-dot" style="--tc:${kindInfo[it.kind]?.color}"></span>
        <span class="codex-name">${esc(it.name)}</span><span class="codex-kind">${kindInfo[it.kind]?.icon || ''}</span></a>`;
    let html = '';
    letters.innerHTML = '';
    if (state.mode === 'az') {
      const groups = {};
      for (const it of items.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
        const L = /[a-z]/.test(sortKey(it)[0]) ? sortKey(it)[0].toUpperCase() : '#';
        (groups[L] = groups[L] || []).push(it);
      }
      const all = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
      letters.innerHTML = all.map(L => `<button data-l="${L}" ${groups[L] ? '' : 'disabled'}>${L}</button>`).join('');
      html = all.filter(L => groups[L]).map(L => `<div class="codex-letter" id="L-${L === '#' ? 'num' : L}">${L}</div>${groups[L].map(row).join('')}`).join('');
    } else {
      let groups;
      if (state.mode === 'category') {
        groups = KINDS.map(k => ({ id: k.k, title: `${k.icon} ${k.label}`, items: items.filter(it => it.kind === k.k) }));
      } else {
        const tagMap = {};
        for (const it of items) { const tags = it.tags.length ? it.tags : ['Untagged']; for (const t of tags) (tagMap[t] = tagMap[t] || []).push(it); }
        groups = Object.keys(tagMap).sort((a, b) => a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b)).map(t => ({ id: 'tag:' + t, title: t === 'Untagged' ? 'Untagged' : '#' + t, items: tagMap[t] }));
      }
      html = groups.filter(g => g.items.length).map(g => {
        const open = !state.collapsed.has(g.id) || q;
        return `<div class="codex-group ${open ? 'open' : ''}"><button class="codex-ghead" data-g="${esc(g.id)}"><span class="caret">▸</span>${esc(g.title)}<span class="muted small" style="margin-left:auto">${g.items.length}</span></button>
          ${open ? `<div>${g.items.sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(row).join('')}</div>` : ''}</div>`;
      }).join('');
    }
    list.innerHTML = html || `<p class="muted" style="padding:10px">Nothing matches.</p>`;
  }

  function drawArticle() {
    const it = allItems().find(x => x.key === selected);
    if (!it) {
      const w = W();
      const counts = KINDS.map(k => ({ k, n: allItems().filter(x => x.kind === k.k).length })).filter(c => c.n);
      art.innerHTML = `<div class="codex-welcome">
        <div class="big">📜</div><h1>The ${esc(w.name)} Encyclopedia</h1>
        <p class="muted">Everything in your world in one place. Pick an article on the left, search, or browse by category.</p>
        <div class="stats">${counts.map(c => `<button class="card stat" data-cat="${c.k.k}"><b style="color:${c.k.color}">${c.n}</b>${c.k.icon} ${c.k.label}</button>`).join('')}</div>
      </div>`;
      return;
    }
    art.innerHTML = `<div class="codex-art-head">
        <span class="muted small">${kindInfo[it.kind]?.icon} ${esc(kindInfo[it.kind]?.label || '')}</span>
        <span style="flex:1"></span>
        ${it.edit ? `<a class="btn small" href="${it.edit}">✎ Edit</a>` : ''}
        <a class="btn small" href="${it.href}">Open full page →</a></div>
      <div class="codex-body">${it.html()}</div>`;
    it.after?.();
    art.scrollTop = 0;
  }

  function select(key) {
    selected = key;
    history.replaceState(null, '', `#/codex?item=${encodeURIComponent(key)}`);
    list.querySelectorAll('.codex-row').forEach(r => r.classList.toggle('sel', r.dataset.key === key));
    drawArticle();
  }

  main.querySelector('#mode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { state.mode = b.dataset.m; drawList(); } });
  main.querySelector('#cq').addEventListener('input', e => { state.q = e.target.value; drawList(); });
  main.querySelector('.codex-kinds').addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    state.off.has(b.dataset.k) ? state.off.delete(b.dataset.k) : state.off.add(b.dataset.k);
    b.classList.toggle('on'); drawList();
  });
  letters.addEventListener('click', e => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    list.querySelector('#L-' + (b.dataset.l === '#' ? 'num' : b.dataset.l))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  list.addEventListener('click', e => {
    const g = e.target.closest('[data-g]');
    if (g) { state.collapsed.has(g.dataset.g) ? state.collapsed.delete(g.dataset.g) : state.collapsed.add(g.dataset.g); drawList(); return; }
    const r = e.target.closest('.codex-row');
    if (r && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); select(r.dataset.key); }
  });
  // follow links inside the article without leaving the encyclopedia
  art.addEventListener('click', e => {
    const cat = e.target.closest('[data-cat]');
    if (cat) { state.mode = 'category'; state.off = new Set(KINDS.map(k => k.k).filter(k => k !== cat.dataset.cat)); render(main); return; }
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.ctrlKey || e.metaKey || a.classList.contains('btn')) return;
    const m = a.getAttribute('href').match(/^#\/(entry|journal|session|map|quest|doc)\/([a-z0-9]+)$/);
    if (m) { e.preventDefault(); select(`${m[1]}:${m[2]}`); drawList(); }
  });

  drawList();
  drawArticle();
  if (selected) setTimeout(() => list.querySelector('.codex-row.sel')?.scrollIntoView({ block: 'center' }), 30);
}
