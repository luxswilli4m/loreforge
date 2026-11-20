import { W, uid, save, getJournal, getEntry, mentionsIn } from '../store.js';
import { esc, md, plain, confirmDialog, editorHTML, attachEditor, go, mentionLink, typeColor } from '../util.js';

const CATS = ['Notes', 'Session log', 'History', 'Player handout', 'Rules'];
let catFilter = '';

export function renderList(main) {
  const w = W();
  const list = [...w.journals].filter(j => !catFilter || j.category === catFilter).sort((a, b) => b.updated - a.updated);
  main.innerHTML = `
    <div class="page-head"><h1>Journals</h1><button class="primary" id="new">＋ New journal</button></div>
    <div class="filters"><button class="chip ${!catFilter ? 'on' : ''}" data-c="">All</button>${CATS.map(c => `<button class="chip ${catFilter === c ? 'on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
    <div class="journal-list">${list.map(j => `<a class="card" href="#/journal/${j.id}" style="display:block;text-decoration:none;color:inherit">
      <div class="row"><h3 style="margin:0">${esc(j.title)}</h3><span class="tag shrink">${esc(j.category)}</span></div>
      <p class="muted small" style="margin:4px 0 0">${esc(plain(j.body).slice(0, 180))}${plain(j.body).length > 180 ? '…' : ''}</p></a>`).join('')
      || `<div class="empty"><div class="big">✒️</div>Long-form writing lives here: session logs, histories, handouts. Type @ to link anything in your world.</div>`}</div>`;
  main.querySelector('#new').onclick = () => {
    const j = { id: uid(), title: 'Untitled journal', category: catFilter || 'Notes', body: '', created: Date.now(), updated: Date.now() };
    w.journals.push(j); save(); go(`#/journal/${j.id}/edit`);
  };
  main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { catFilter = b.dataset.c; renderList(main); });
}

export function readHTML(j) {
  return `<span class="tag">${esc(j.category)}</span><h1 style="margin-top:6px">${esc(j.title)}</h1>
    <p class="muted small">Last edited ${new Date(j.updated).toLocaleString()}</p>
    <div class="prose">${md(j.body) || '<p class="muted">Empty.</p>'}</div>`;
}

export function renderView(main, id) {
  const j = getJournal(id);
  if (!j) { main.innerHTML = `<div class="empty">Journal not found. <a href="#/journals">Back</a></div>`; return; }
  const linked = [...mentionsIn(j.body)].filter(getEntry);
  main.innerHTML = `
    <div class="page-head"><div class="breadcrumbs" style="flex:1"><a href="#/journals">Journals</a></div>
      <a class="btn" href="#/journal/${j.id}/edit">✎ Edit</a><button class="danger" id="del">Delete</button></div>
    <div class="entry-layout"><div>${readHTML(j)}</div>
      <div>${linked.length ? `<div class="card side-box"><h4>Linked</h4><ul class="link-list">${linked.map(i => `<li><span class="type-dot" style="--tc:${typeColor(getEntry(i).type)}"></span>${mentionLink(i)}</li>`).join('')}</ul></div>` : ''}</div></div>`;
  main.querySelector('#del').onclick = async () => {
    if (await confirmDialog(`Delete “${j.title}”?`)) { W().journals = W().journals.filter(x => x !== j); save(); go('#/journals'); }
  };
}

export function renderEdit(main, id) {
  const j = getJournal(id);
  if (!j) { main.innerHTML = `<div class="empty">Journal not found.</div>`; return; }
  const touch = () => { j.updated = Date.now(); save(); };
  main.innerHTML = `
    <div class="page-head"><input id="t" value="${esc(j.title)}" style="flex:1;font-size:1.6em;font-family:var(--display);font-weight:700">
      <select id="c" style="width:auto">${CATS.map(c => `<option ${c === j.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <a class="btn primary" href="#/journal/${j.id}" style="background:var(--accent);color:#1a1408">✓ Done</a></div>
    <div class="prose" style="max-width:85ch">${editorHTML('body', j.body, 26, 'Start writing… type @ to link characters, places and more.')}</div>
    <p class="muted small">Formatting: **bold**, *italic*, # Heading, - list, > quote. Saves automatically.</p>`;
  main.querySelector('#t').oninput = e => { j.title = e.target.value || 'Untitled journal'; touch(); };
  main.querySelector('#c').onchange = e => { j.category = e.target.value; touch(); };
  attachEditor(main.querySelector('#body'), v => { j.body = v; touch(); });
  main.querySelector('#body').focus();
}
