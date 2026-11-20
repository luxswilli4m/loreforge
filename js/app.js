import { state, loadWorlds, openWorld, saveNow, W, TYPES, getEntry, getSession, getJournal, getMap, getQuest, getDoc } from './store.js';
import { $, esc, openModal, closeModal, typeColor, plain } from './util.js';
import * as home from './views/home.js';
import * as entries from './views/entries.js';
import * as maps from './views/maps.js';
import * as graph from './views/graph.js';
import * as campaign from './views/campaign.js';
import * as timeline from './views/timeline.js';
import * as journals from './views/journals.js';
import * as settings from './views/settings.js';
import * as generator from './views/generator.js';
import * as codex from './views/codex.js';
import * as appearance from './views/appearance.js';
import { applyTheme, applyBackground, getPrefs } from './theme.js';
import * as gm from './views/gm.js';
import * as quests from './views/quests.js';
import * as library from './views/library.js';
import { initTray } from './tools/tray.js';
import { newEntryDialog } from './views/entries.js';

const NAV = [
  { href: '#/', icon: '🏠', label: 'Overview', match: /^$/ },
  { href: '#/entries', icon: '📚', label: 'World Bible', match: /^(entries|entry)/ },
  { href: '#/codex', icon: '📜', label: 'Encyclopedia', match: /^codex/ },
  { href: '#/maps', icon: '🗺️', label: 'Maps', match: /^(maps|map)(\/|$)/ },
  { href: '#/generate', icon: '✨', label: 'Map generator', match: /^generate/ },
  { href: '#/graph', icon: '🕸️', label: 'World Web', match: /^graph/ },
  null,
  { href: '#/campaign', icon: '🎲', label: 'Campaign', match: /^(campaign|session)/ },
  { href: '#/timeline', icon: '⏳', label: 'Timeline', match: /^timeline/ },
  { href: '#/quests', icon: '🧭', label: 'Quests', match: /^(quests|quest)(\/|$)/ },
  { href: '#/journals', icon: '✒️', label: 'Journals', match: /^(journals|journal)/ },
  { href: '#/gm', icon: '🛡️', label: 'GM Screen', match: /^gm/ },
  { href: '#/library', icon: '🏛️', label: 'Library', match: /^(library|doc)/ },
  null,
  { href: '#/settings', icon: '⚙️', label: 'World settings', match: /^settings/ },
  { href: '#/appearance', icon: '🎨', label: 'Appearance', match: /^appearance/ },
  { href: '#/worlds', icon: '🌍', label: 'Switch world', match: /^worlds/ },
];

let cleanup = null;
let lastWorldId = null;

function renderNav(path) {
  const nav = $('#nav');
  if (!W()) { nav.innerHTML = ''; $('#world-name').textContent = ''; return; }
  $('#world-name').textContent = W().name;
  const favs = W().entries.filter(e => e.fav).sort((a, b) => a.name.localeCompare(b.name));
  nav.innerHTML = NAV.map(n => n ? `<a href="${n.href}" class="${n.match.test(path) ? 'active' : ''}"><span>${n.icon}</span>${n.label}</a>` : '<div class="nav-sep"></div>').join('')
    + (favs.length ? `<div class="nav-sep"></div><div class="nav-pins-head">⭐ Pinned</div>${favs.map(e => `<a href="#/entry/${e.id}" class="nav-pin ${path === 'entry/' + e.id ? 'active' : ''}"><span class="type-dot" style="--tc:${typeColor(e.type)}"></span>${esc(e.name)}</a>`).join('')}` : '');
}

export function route() {
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [view, a, b] = path.split('/').map(decodeURIComponent);
  const main = $('#main');
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  closeModal();

  // a world-specific background (one of its maps) follows the open world
  const wid = W()?.id || '';
  if (wid !== lastWorldId) { lastWorldId = wid; if (getPrefs().bg.kind === 'map') applyBackground(W()); }
  if (!W() && view !== 'worlds' && view !== 'appearance') {
    renderNav('worlds');
    cleanup = home.renderPicker(main);
    return;
  }
  renderNav(path);
  main.scrollTop = 0;
  const r = {
    '': () => home.render(main),
    worlds: () => home.renderPicker(main),
    entries: () => entries.renderList(main, a),
    entry: () => b === 'edit' ? entries.renderEdit(main, a) : entries.renderView(main, a),
    maps: () => maps.renderList(main),
    map: () => maps.renderMap(main, a),
    graph: () => graph.render(main),
    campaign: () => campaign.renderList(main),
    session: () => campaign.renderSession(main, a),
    timeline: () => timeline.render(main),
    journals: () => journals.renderList(main),
    journal: () => b === 'edit' ? journals.renderEdit(main, a) : journals.renderView(main, a),
    settings: () => settings.render(main),
    generate: () => generator.render(main),
    codex: () => codex.render(main),
    appearance: () => appearance.render(main),
    gm: () => gm.render(main),
    quests: () => quests.renderList(main),
    quest: () => quests.renderQuest(main, a),
    library: () => library.renderList(main),
    doc: () => library.renderDoc(main, a),
  }[view];
  cleanup = r ? r() : home.render(main);
}

// ---------- Side panel (Ctrl/Cmd+click any link) ----------
export function openPeek(hash) {
  const [view, id] = hash.replace(/^#\/?/, '').split('?')[0].split('/');
  let html = '';
  if (view === 'entry' && getEntry(id)) html = entries.readHTML(getEntry(id), true);
  else if (view === 'session' && getSession(id)) html = campaign.readHTML(getSession(id));
  else if (view === 'journal' && getJournal(id)) html = journals.readHTML(getJournal(id));
  else if (view === 'map' && getMap(id)) html = maps.peekHTML(getMap(id));
  else if (view === 'quest' && getQuest(id)) html = quests.readHTML(getQuest(id));
  else if (view === 'doc' && getDoc(id)) {
    const d = getDoc(id);
    html = `<h2>${esc(d.name)}</h2><div id="peek-doc"><p class="muted">Opening…</p></div>`;
    library.viewerHTML(d, 'calc(100vh - 220px)').then(h => { const el = document.getElementById('peek-doc'); if (el) el.innerHTML = h; });
  }
  else return false;
  $('#peek-body').innerHTML = html + `<p style="margin-top:20px"><a class="btn" href="${hash}">Open full page →</a></p>`;
  $('#peek-wrap').classList.remove('hidden');
  return true;
}
$('#peek-close').onclick = () => $('#peek-wrap').classList.add('hidden');

document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#/"]');
  if (a && (e.ctrlKey || e.metaKey)) {
    if (openPeek(a.getAttribute('href'))) e.preventDefault();
  }
});

// ---------- Search ----------
function openSearch() {
  if (!W()) return;
  const m = openModal(`<input id="q" placeholder="Search entries, sessions, journals…" autofocus><div class="search-results" id="sr"></div>
    <p class="muted small" style="margin:10px 0 0">Enter to open · Ctrl+Enter to open in side panel</p>`);
  const q = m.querySelector('#q'), sr = m.querySelector('#sr');
  let results = [], sel = 0;
  const run = () => {
    const s = q.value.trim().toLowerCase();
    const w = W();
    const all = [
      ...w.entries.map(e => ({ href: `#/entry/${e.id}`, name: e.name, sub: TYPES[e.type]?.label, color: typeColor(e.type), text: e.name + ' ' + e.summary + ' ' + plain(e.body) + ' ' + e.tags.join(' ') })),
      ...w.sessions.map(x => ({ href: `#/session/${x.id}`, name: x.title, sub: 'Session', color: 'var(--accent)', text: x.title + ' ' + plain(x.notes) })),
      ...w.journals.map(x => ({ href: `#/journal/${x.id}`, name: x.title, sub: 'Journal', color: 'var(--muted)', text: x.title + ' ' + plain(x.body) })),
      ...w.maps.map(x => ({ href: `#/map/${x.id}`, name: x.name, sub: 'Map', color: 'var(--muted)', text: x.name })),
      ...w.quests.map(x => ({ href: `#/quest/${x.id}`, name: x.title, sub: 'Quest', color: 'var(--accent)', text: x.title + ' ' + plain(x.summary) + ' ' + plain(x.desc) })),
      ...w.library.map(x => ({ href: `#/doc/${x.id}`, name: x.name, sub: 'Library · ' + x.cat, color: 'var(--muted)', text: x.name + ' ' + x.cat })),
    ];
    results = s ? all.filter(r => r.text.toLowerCase().includes(s))
      .sort((a, b) => (b.name.toLowerCase().includes(s) - a.name.toLowerCase().includes(s))).slice(0, 12) : all.slice(0, 8);
    sel = 0;
    draw();
  };
  const draw = () => {
    sr.innerHTML = results.map((r, i) => `<div class="res ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="type-dot" style="--tc:${r.color}"></span><b>${esc(r.name)}</b><span class="muted small">${esc(r.sub || '')}</span></div>`).join('') || '<p class="muted">No matches.</p>';
  };
  const go = (i, peek) => { const r = results[i]; if (!r) return; closeModal(); if (peek) openPeek(r.href); else location.hash = r.href; };
  q.addEventListener('input', run);
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, results.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter') go(sel, e.ctrlKey || e.metaKey);
    if (e.key === 'Escape') closeModal();
  });
  sr.addEventListener('click', e => { const d = e.target.closest('.res'); if (d) go(+d.dataset.i, e.ctrlKey || e.metaKey); });
  run();
}
$('#btn-search').onclick = openSearch;
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
});


window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { saveNow(); });

(async function init() {
  applyTheme();
  await loadWorlds();
  const last = localStorage.getItem('loreforge:last');
  if (last && state.worlds.some(w => w.id === last)) openWorld(last);
  route();
  setTimeout(() => applyBackground(W()), 60);
})();

// ---------- Dice tray & keyboard shortcuts ----------
const tray = initTray();
function shortcutsHelp() {
  openModal(`<h2>Keyboard shortcuts</h2><table class="fields-table">
    ${[['Ctrl / ⌘ + K', 'Search everything'], ['N', 'New World Bible entry'], ['D', 'Open / close the dice tray'], ['?', 'This list'], ['Ctrl / ⌘ + click a link', 'Open it in the side panel'],
      ['@ (while typing)', 'Link an entry'], ['Esc', 'Close dialogs and menus'], ['Right-click (World Web)', 'Connect, add notes, create entries'], ['Shift + drag (World Web)', 'Connect two nodes']]
      .map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>
    <div class="modal-actions"><button class="primary" onclick="document.getElementById('modal-root').innerHTML=''">Got it</button></div>`);
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  if ($('#modal-root').innerHTML) return;
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); tray.toggle(); }
  else if ((e.key === 'n' || e.key === 'N') && W()) { e.preventDefault(); newEntryDialog('character'); }
  else if (e.key === '?') { e.preventDefault(); shortcutsHelp(); }
});
