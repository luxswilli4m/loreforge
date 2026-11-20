import { state, createWorld, openWorld, deleteWorld, importWorld, W, TYPES, formatDate, dateKey } from '../store.js';
import { esc, promptDialog, confirmDialog, pickFile, readText, toast, go, typeColor, typeBadge } from '../util.js';
import { sampleWorld } from '../sample.js';
import { downloadBackup } from './settings.js';

export function renderPicker(main) {
  const worlds = state.worlds;
  main.innerHTML = `
    <div class="hero">
      <h1>Lore<span style="color:var(--accent)">forge</span></h1>
      <p class="muted">Build your world, map it, and run your campaign — all in one place. Everything is saved privately in this browser.</p>
      <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
        <button class="primary shrink" id="new">＋ New world</button>
        <button class="shrink" id="sample">✨ Try a sample world</button>
        <button class="shrink" id="import">⬆ Import backup</button>
      </div>
    </div>
    ${worlds.length ? `<h2>Your worlds</h2><div class="grid">${worlds.map(w => `
      <div class="card world-card" data-id="${w.id}">
        <h3>${esc(w.name)}</h3>
        <p class="muted small">${w.entries.length} entries · ${w.maps.length} maps · ${w.sessions.length} sessions</p>
        <p class="muted small">Edited ${new Date(w.updated).toLocaleDateString()}</p>
        <button class="icon danger small" data-del="${w.id}" title="Delete world">🗑 Delete</button>
      </div>`).join('')}</div>` : `<div class="empty"><div class="big">🌍</div>No worlds yet. Create one or try the sample to see how everything fits together.</div>`}
  `;
  const open = id => { openWorld(id); go('#/'); };
  main.querySelector('#new').onclick = async () => {
    const name = await promptDialog('Name your world', '', 'e.g. The Shattered Coast');
    if (name) { const w = await createWorld(name); open(w.id); }
  };
  main.querySelector('#sample').onclick = async () => {
    const w = await createWorld('Vael — sample world', sampleWorld());
    toast('Sample world created');
    open(w.id);
  };
  main.querySelector('#import').onclick = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try { const w = await importWorld(await readText(f)); toast('World imported'); open(w.id); }
    catch (e) { toast(e.message || 'Import failed'); }
  };
  main.addEventListener('click', async e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const w = state.worlds.find(x => x.id === del.dataset.del);
      if (await confirmDialog(`Delete “${w.name}” and everything in it? Export a backup first if you might want it back.`)) {
        await deleteWorld(w.id); renderPicker(main);
      }
      return;
    }
    const card = e.target.closest('.world-card');
    if (card) open(card.dataset.id);
  });
}

export function render(main) {
  const w = W();
  const counts = Object.keys(TYPES).map(t => ({ t, n: w.entries.filter(e => e.type === t).length }));
  const recent = [...w.entries].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 6);
  const upcoming = w.sessions.filter(s => s.status === 'planned').sort((a, b) => a.number - b.number)[0];
  const cal = w.calendar;
  main.innerHTML = `
    <div class="page-head"><h1>${esc(w.name)}</h1>
      <a class="btn" href="#/settings">Edit world</a></div>
    ${w.entries.length >= 5 && (!w.lastExport || Date.now() - w.lastExport > 14 * 864e5) ? `<div class="backup-nag">💾 <span>${w.lastExport ? `It’s been ${Math.floor((Date.now() - w.lastExport) / 864e5)} days since your last backup.` : 'You haven’t exported a backup of this world yet.'} Your world only lives in this browser.</span><button class="primary small" id="nagexp">Back up now</button></div>` : ''}
    ${w.description ? `<p class="muted" style="max-width:75ch">${esc(w.description)}</p>` : ''}
    <p><span class="muted">Today in-world:</span> <b>${esc(formatDate(cal.current, true))}</b></p>
    <div class="stats">
      ${counts.map(c => `<a class="card stat" href="#/entries/${c.t}" style="text-decoration:none;color:inherit"><b style="color:${TYPES[c.t].color}">${c.n}</b>${TYPES[c.t].icon} ${TYPES[c.t].plural}</a>`).join('')}
      <a class="card stat" href="#/maps" style="text-decoration:none;color:inherit"><b>${w.maps.length}</b>🗺️ Maps</a>
      <a class="card stat" href="#/campaign" style="text-decoration:none;color:inherit"><b>${w.sessions.length}</b>🎲 Sessions</a>
    </div>
    <div class="entry-layout">
      <div>
        <h2>Recently edited</h2>
        ${recent.length ? `<div class="grid">${recent.map(e => `
          <a class="card entry-card" href="#/entry/${e.id}" style="--tc:${typeColor(e.type)};text-decoration:none;color:inherit">
            ${typeBadge(e.type)}<h3>${esc(e.name)}</h3><p>${esc(e.summary)}</p></a>`).join('')}</div>`
          : `<div class="empty"><div class="big">📚</div>Your World Bible is empty. <a href="#/entries">Add your first entry</a>.</div>`}
      </div>
      <div>
        <div class="card side-box">
          <h4>Next session</h4>
          ${upcoming ? `<a href="#/session/${upcoming.id}"><b>#${upcoming.number} ${esc(upcoming.title)}</b></a>
            <p class="muted small">${upcoming.beats.filter(b => b.done).length}/${upcoming.beats.length} beats ready${upcoming.realDate ? ' · ' + esc(upcoming.realDate) : ''}</p>`
            : `<p class="muted small">No planned sessions. <a href="#/campaign">Plan one</a>.</p>`}
        </div>
        <div class="card side-box">
          <h4>Active quests</h4>
          ${w.quests.filter(q => q.status === 'active').slice(0, 4).map(q => `<p style="margin:0 0 6px"><a href="#/quest/${q.id}">🧭 ${esc(q.title)}</a> <span class="muted small">${q.objectives.filter(o => o.done).length}/${q.objectives.length}</span></p>`).join('') || '<p class="muted small" style="margin:0">None yet. <a href="#/quests">Start one</a>.</p>'}
        </div>
        <div class="card side-box">
          <h4>Latest world events</h4>
          ${[...w.events].sort((a, b) => dateKey(b.date) - dateKey(a.date)).slice(0, 4).map(ev =>
            `<p style="margin:0 0 8px"><span class="tl-date">${esc(formatDate(ev.date))}</span><br>${esc(ev.title)}</p>`).join('') || '<p class="muted small">Nothing on the timeline yet.</p>'}
          <a class="small" href="#/timeline">Open timeline →</a>
        </div>
        <div class="card side-box">
          <h4>Tips</h4>
          <p class="small muted" style="margin:0">Type <b>@</b> in any text box to link an entry. <b>Ctrl+click</b> any link to open it in a side panel. <b>Ctrl+K</b> searches everything, <b>D</b> rolls dice, and <b>?</b> shows every shortcut.</p>
        </div>
      </div>
    </div>`;
  const nag = main.querySelector('#nagexp');
  if (nag) nag.onclick = async () => { await downloadBackup(); render(main); };
}
