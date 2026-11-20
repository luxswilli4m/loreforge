// Quests: a board of plot threads with objectives, rewards and links to the world.
import { W, uid, save, getQuest, getEntry, mentionsIn } from '../store.js';
import { esc, md, plain, go, confirmDialog, editorHTML, attachEditor, mentionLink, typeColor } from '../util.js';

export const QSTATUS = [
  { k: 'rumoured', label: 'Rumoured', icon: '👂' },
  { k: 'active', label: 'Active', icon: '🔥' },
  { k: 'completed', label: 'Completed', icon: '✅' },
  { k: 'failed', label: 'Failed', icon: '💀' },
];

export function newQuest(status = 'active') {
  const q = { id: uid(), title: 'New quest', status, giver: '', reward: '', summary: '', desc: '', objectives: [], created: Date.now(), updated: Date.now() };
  W().quests.push(q); save();
  return q;
}
const linked = q => [...mentionsIn([q.giver, q.summary, q.desc, ...q.objectives.map(o => o.text)].join(' '))].filter(getEntry);

export function renderList(main) {
  const w = W();
  main.innerHTML = `
    <div class="page-head"><h1>Quests</h1><span class="muted small">Drag cards between columns.</span><button class="primary" id="new">＋ New quest</button></div>
    <div class="board">${QSTATUS.map(s => {
      const qs = w.quests.filter(q => q.status === s.k).sort((a, b) => b.updated - a.updated);
      return `<div class="board-col" data-status="${s.k}">
        <div class="board-head">${s.icon} ${s.label} <span class="muted small">${qs.length}</span></div>
        <div class="board-cards">${qs.map(q => {
          const done = q.objectives.filter(o => o.done).length;
          const links = linked(q).slice(0, 6);
          return `<a class="card quest-card" draggable="true" data-id="${q.id}" href="#/quest/${q.id}">
            <b>${esc(q.title)}</b>
            ${q.summary ? `<p class="muted small">${esc(plain(q.summary)).slice(0, 120)}</p>` : ''}
            ${q.objectives.length ? `<div class="row" style="gap:8px;margin-top:6px"><div class="progress" style="flex:1"><div style="width:${done / q.objectives.length * 100}%"></div></div><span class="small muted shrink">${done}/${q.objectives.length}</span></div>` : ''}
            ${links.length ? `<div class="quest-links">${links.map(id => `<span class="type-dot" title="${esc(getEntry(id).name)}" style="--tc:${typeColor(getEntry(id).type)}"></span>`).join('')}</div>` : ''}
          </a>`;
        }).join('')}</div>
        <button class="ghost small board-add" data-add="${s.k}">＋ Add</button>
      </div>`;
    }).join('')}</div>`;
  main.querySelector('#new').onclick = () => go(`#/quest/${newQuest().id}`);
  main.querySelectorAll('[data-add]').forEach(b => b.onclick = () => go(`#/quest/${newQuest(b.dataset.add).id}`));
  let dragId = null;
  main.addEventListener('dragstart', e => { const c = e.target.closest('.quest-card'); if (c) { dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); } });
  main.addEventListener('dragend', e => e.target.closest?.('.quest-card')?.classList.remove('dragging'));
  main.querySelectorAll('.board-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('over');
      const q = getQuest(dragId); if (!q) return;
      q.status = col.dataset.status; q.updated = Date.now(); save(); renderList(main);
    });
  });
}

export function readHTML(q) {
  const st = QSTATUS.find(s => s.k === q.status);
  const links = linked(q);
  return `<span class="tag">${st?.icon} ${st?.label}</span><h1 style="margin-top:6px">${esc(q.title)}</h1>
    ${q.summary ? `<p class="muted" style="font-style:italic">${md(q.summary).replace(/^<p>|<\/p>$/g, '')}</p>` : ''}
    ${q.giver ? `<p><b>Quest giver:</b> ${md(q.giver).replace(/^<p>|<\/p>$/g, '')}</p>` : ''}
    ${q.reward ? `<p><b>Reward:</b> ${md(q.reward).replace(/^<p>|<\/p>$/g, '')}</p>` : ''}
    ${q.objectives.length ? `<h3>Objectives</h3>${q.objectives.map(o => `<div class="beat ${o.done ? 'done' : ''}"><span>${o.done ? '☑' : '☐'}</span><div class="beat-text prose">${md(o.text)}</div></div>`).join('')}` : ''}
    <div class="prose">${md(q.desc)}</div>
    ${links.length ? `<h3>Involves</h3><ul class="link-list">${links.map(id => `<li><span class="type-dot" style="--tc:${typeColor(getEntry(id).type)}"></span>${mentionLink(id)}</li>`).join('')}</ul>` : ''}`;
}

export function renderQuest(main, id) {
  const q = getQuest(id);
  if (!q) { main.innerHTML = `<div class="empty">Quest not found. <a href="#/quests">Back to quests</a></div>`; return; }
  const touch = () => { q.updated = Date.now(); save(); };
  let editing = null;
  function draw() {
    const links = linked(q);
    main.innerHTML = `
      <div class="breadcrumbs"><a href="#/quests">Quests</a></div>
      <div class="page-head">
        <input id="qt" value="${esc(q.title)}" style="flex:1;font-size:1.7em;font-family:var(--display);font-weight:700;background:transparent;border-color:transparent">
        <button class="danger" id="qdel">Delete</button>
      </div>
      <div class="seg" id="qs" style="max-width:520px;margin-bottom:16px">${QSTATUS.map(s => `<button data-s="${s.k}" class="${q.status === s.k ? 'on' : ''}">${s.icon} ${s.label}</button>`).join('')}</div>
      <div class="entry-layout">
        <div>
          <label>One-line summary</label>${editorHTML('qsum', q.summary, 2, 'What’s this quest about?')}
          <h2 style="margin-top:22px">Objectives</h2>
          <div id="objs">${q.objectives.map((o, i) => `
            <div class="beat ${o.done ? 'done' : ''}">
              <input type="checkbox" data-done="${i}" ${o.done ? 'checked' : ''}>
              ${editing === i ? `<div class="beat-text editor-wrap"><textarea id="obj-ed" rows="1" style="min-height:0">${esc(o.text)}</textarea></div>`
                : `<div class="beat-text prose" data-edit="${i}" style="cursor:text">${md(o.text) || '<span class="muted">Empty — click to write</span>'}</div>`}
              <button class="icon small" data-up="${i}">↑</button><button class="icon small" data-del="${i}">✕</button>
            </div>`).join('')}</div>
          <div class="editor-wrap"><input id="newobj" placeholder="Add an objective — e.g. Find @… (Enter to add)"></div>
          <h2 style="margin-top:22px">Details</h2>${editorHTML('qdesc', q.desc, 10, 'Background, clues, consequences… type @ to link')}
        </div>
        <div>
          <div class="card side-box">
            <h4>Quest</h4>
            <label>Given by</label><div class="editor-wrap"><input id="qgiver" value="${esc(q.giver)}" placeholder="Type @ to link a character"></div>
            <label>Reward</label><input id="qreward" value="${esc(q.reward)}" placeholder="e.g. 200 gp and a favour">
          </div>
          ${links.length ? `<div class="card side-box"><h4>Involves</h4><ul class="link-list">${links.map(lid => `<li><span class="type-dot" style="--tc:${typeColor(getEntry(lid).type)}"></span>${mentionLink(lid)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>`;
    bind();
  }
  function bind() {
    const $m = s => main.querySelector(s);
    $m('#qt').oninput = e => { q.title = e.target.value || 'Untitled quest'; touch(); };
    $m('#qs').onclick = e => { const b = e.target.closest('[data-s]'); if (b) { q.status = b.dataset.s; touch(); draw(); } };
    $m('#qdel').onclick = async () => { if (await confirmDialog(`Delete the quest “${q.title}”?`)) { W().quests = W().quests.filter(x => x !== q); save(); go('#/quests'); } };
    attachEditor($m('#qsum'), v => { q.summary = v; touch(); });
    attachEditor($m('#qdesc'), v => { q.desc = v; touch(); });
    attachEditor($m('#qgiver'), v => { q.giver = v; touch(); });
    $m('#qreward').oninput = e => { q.reward = e.target.value; touch(); };
    const nb = $m('#newobj');
    attachEditor(nb);
    nb.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.defaultPrevented && nb.value.trim()) { q.objectives.push({ id: uid(), text: nb.value.trim(), done: false }); touch(); draw(); main.querySelector('#newobj').focus(); }
    });
    const ed = $m('#obj-ed');
    if (ed) {
      attachEditor(ed, v => { q.objectives[editing].text = v; touch(); });
      ed.focus(); ed.selectionStart = ed.value.length;
      ed.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ed) { editing = null; draw(); } }, 200));
      ed.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); ed.blur(); } });
    }
    $m('#objs').onclick = e => {
      if (e.target.closest('a')) return;
      const t = e.target.closest('[data-done],[data-edit],[data-up],[data-del]'); if (!t) return;
      const d = t.dataset;
      if (d.done != null) { q.objectives[+d.done].done = t.checked; touch(); draw(); }
      else if (d.edit != null) { editing = +d.edit; draw(); }
      else if (d.up != null) { const i = +d.up; if (i > 0) { [q.objectives[i - 1], q.objectives[i]] = [q.objectives[i], q.objectives[i - 1]]; touch(); draw(); } }
      else if (d.del != null) { q.objectives.splice(+d.del, 1); touch(); draw(); }
    };
  }
  draw();
}
