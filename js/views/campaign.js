import { W, uid, save, getSession, getArc, getEntry, mentionsIn, formatDate } from '../store.js';
import { esc, md, promptDialog, confirmDialog, editorHTML, attachEditor, go, toast, mentionLink, typeColor, openModal, closeModal } from '../util.js';
import { datePickerHTML, readDatePicker } from './timeline.js';

const STATUSES = ['planned', 'played', 'cancelled'];

function sessionsOf(arcId) {
  return W().sessions.filter(s => (s.arcId || '') === arcId).sort((a, b) => a.number - b.number);
}
function nextNumber() { return W().sessions.reduce((m, s) => Math.max(m, s.number || 0), 0) + 1; }

export function newSession(arcId = '') {
  const s = { id: uid(), arcId, number: nextNumber(), title: 'New session', status: 'planned', realDate: '', date: null, beats: [], notes: '', recap: '' };
  W().sessions.push(s); save();
  return s;
}

function sessionRow(s) {
  const done = s.beats.filter(b => b.done).length;
  return `<a class="card session-row" href="#/session/${s.id}" style="text-decoration:none;color:inherit">
    <span class="session-num">${s.number}</span>
    <div style="flex:1;min-width:0"><b>${esc(s.title)}</b><div class="muted small">${[s.realDate, s.date ? formatDate(s.date) : ''].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div></div>
    ${s.beats.length ? `<div class="progress" title="${done}/${s.beats.length} beats"><div style="width:${done / s.beats.length * 100}%"></div></div>` : ''}
    <span class="status ${s.status}">${s.status}</span></a>`;
}

export function renderList(main) {
  const w = W();
  const arcs = [...w.arcs].sort((a, b) => a.order - b.order);
  const loose = sessionsOf('');
  main.innerHTML = `
    <div class="page-head"><h1>Campaign</h1><button id="newarc">＋ New arc</button><button class="primary" id="newsess">＋ New session</button></div>
    <p class="muted" style="max-width:70ch;margin-top:-6px">Organise your story into arcs, then plan each session as a list of beats you can tick off at the table.</p>
    ${!arcs.length && !loose.length ? `<div class="empty"><div class="big">🎲</div>Start with an arc (e.g. “Act I: The Drowned Crown”) or jump straight to planning a session.</div>` : ''}
    ${arcs.map((a, i) => `<div class="arc">
      <div class="arc-head"><h2>${esc(a.name)}</h2>
        <button class="icon" data-up="${a.id}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button class="icon" data-ren="${a.id}" title="Rename">✎</button>
        <button class="icon" data-delarc="${a.id}" title="Delete arc">🗑</button>
        <button class="small" data-addsess="${a.id}">＋ Session</button></div>
      ${a.desc ? `<p class="muted" style="margin-top:-4px">${esc(a.desc)}</p>` : ''}
      <div class="sessions">${sessionsOf(a.id).map(sessionRow).join('') || '<p class="muted small" style="margin:0">No sessions in this arc yet.</p>'}</div>
    </div>`).join('')}
    ${loose.length ? `<div class="arc"><div class="arc-head"><h2 class="muted">Not in an arc</h2></div><div class="sessions">${loose.map(sessionRow).join('')}</div></div>` : ''}`;

  const $m = s => main.querySelector(s);
  $m('#newarc').onclick = async () => {
    const name = await promptDialog('New arc', '', 'e.g. Act I: The Drowned Crown');
    if (name) { w.arcs.push({ id: uid(), name, desc: '', order: w.arcs.length }); save(); renderList(main); }
  };
  $m('#newsess').onclick = () => { const s = newSession(arcs.at(-1)?.id || ''); go(`#/session/${s.id}`); };
  main.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.addsess) { const s = newSession(d.addsess); go(`#/session/${s.id}`); }
    if (d.ren) {
      const a = getArc(d.ren);
      openModal(`<h2>Edit arc</h2><label>Name</label><input id="an" value="${esc(a.name)}"><label>Description</label><textarea id="ad" rows="3">${esc(a.desc)}</textarea>
        <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save</button></div>`, m => {
        m.addEventListener('click', ev => {
          if (ev.target.dataset.a === 'yes') { a.name = m.querySelector('#an').value || a.name; a.desc = m.querySelector('#ad').value; save(); }
          if (ev.target.dataset.a) { closeModal(); renderList(main); }
        });
      });
    }
    if (d.delarc && await confirmDialog('Delete this arc? Its sessions are kept and moved to “Not in an arc”.')) {
      w.arcs = w.arcs.filter(a => a.id !== d.delarc);
      w.sessions.forEach(s => { if (s.arcId === d.delarc) s.arcId = ''; });
      save(); renderList(main);
    }
    if (d.up) {
      const i = arcs.findIndex(a => a.id === d.up);
      if (i > 0) { [arcs[i - 1], arcs[i]] = [arcs[i], arcs[i - 1]]; arcs.forEach((a, j) => a.order = j); save(); renderList(main); }
    }
  });
}

export function readHTML(s) {
  const done = s.beats.filter(b => b.done).length;
  return `<span class="status ${s.status}">${s.status}</span>
    <h1 style="margin-top:6px">Session ${s.number}: ${esc(s.title)}</h1>
    <p class="muted small">${[getArc(s.arcId)?.name, s.realDate, s.date ? formatDate(s.date) : ''].filter(Boolean).map(esc).join(' · ')}</p>
    <h3>Beats (${done}/${s.beats.length})</h3>
    ${s.beats.map(b => `<div class="beat ${b.done ? 'done' : ''}"><span>${b.done ? '☑' : '☐'}</span><div class="beat-text prose">${md(b.text)}</div></div>`).join('') || '<p class="muted">No beats.</p>'}
    ${s.notes ? `<h3>Prep notes</h3><div class="prose">${md(s.notes)}</div>` : ''}
    ${s.recap ? `<h3>Recap</h3><div class="prose">${md(s.recap)}</div>` : ''}`;
}

export function renderSession(main, id) {
  const s = getSession(id);
  if (!s) { main.innerHTML = `<div class="empty">Session not found. <a href="#/campaign">Back</a></div>`; return; }
  const w = W();
  let editing = null;

  function draw() {
    const cast = [...mentionsIn(s.notes + ' ' + s.recap + ' ' + s.beats.map(b => b.text).join(' '))].filter(getEntry);
    main.innerHTML = `
      <div class="breadcrumbs"><a href="#/campaign">Campaign</a> › ${esc(getArc(s.arcId)?.name || 'Not in an arc')}</div>
      <div class="page-head">
        <span class="session-num" style="font-size:2em">${s.number}</span>
        <input id="title" value="${esc(s.title)}" style="flex:1;font-size:1.6em;font-family:var(--display);font-weight:700;background:transparent;border-color:transparent">
        <select id="status" style="width:auto">${STATUSES.map(x => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <button class="danger" id="del">Delete</button>
      </div>
      <div class="entry-layout">
        <div>
          <div class="row" style="align-items:end"><h2 style="margin:0">Beats</h2><span class="muted small shrink">Tick them off as you play · type @ to link</span></div>
          <div id="beats" style="margin-top:10px">${s.beats.map((b, i) => `
            <div class="beat ${b.done ? 'done' : ''}" data-i="${i}">
              <input type="checkbox" data-done="${i}" ${b.done ? 'checked' : ''}>
              ${editing === i ? `<div class="beat-text editor-wrap"><textarea id="beat-ed" rows="2" style="min-height:0">${esc(b.text)}</textarea></div>`
                : `<div class="beat-text prose" data-edit="${i}" style="cursor:text">${md(b.text) || '<span class="muted">Empty beat — click to write</span>'}</div>`}
              <button class="icon small" data-bup="${i}" title="Move up">↑</button>
              <button class="icon small" data-bdel="${i}" title="Delete">✕</button>
            </div>`).join('')}</div>
          <div class="row"><input id="newbeat" placeholder="Add a beat — e.g. The party arrives at @…  (Enter to add)"></div>
          <h2 style="margin-top:28px">Prep notes</h2>${editorHTML('notes', s.notes, 8, 'Secrets & clues, encounters, NPC voices… type @ to link')}
          <h2 style="margin-top:28px">Recap</h2>${editorHTML('recap', s.recap, 6, 'What actually happened at the table')}
        </div>
        <div>
          <div class="card side-box">
            <h4>Details</h4>
            <label>Arc</label><select id="arc"><option value="">— none —</option>${w.arcs.map(a => `<option value="${a.id}" ${a.id === s.arcId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
            <label>Session number</label><input id="num" type="number" value="${s.number}">
            <label>Real-world date</label><input id="real" type="date" value="${esc(s.realDate)}">
            <label>In-world date <span class="muted">(shows on the timeline)</span></label>${datePickerHTML('wd', s.date)}
            <div class="row" style="margin-top:10px;flex-wrap:wrap">
              <button class="small" id="settoday" title="Set the world's current date to this session's date">Make this “today”</button>
            </div>
          </div>
          ${cast.length ? `<div class="card side-box"><h4>Featured</h4><ul class="link-list">${cast.map(cid => `<li><span class="type-dot" style="--tc:${typeColor(getEntry(cid).type)}"></span>${mentionLink(cid)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>`;
    bind();
  }

  function bind() {
    const $m = q => main.querySelector(q);
    $m('#title').oninput = e => { s.title = e.target.value || 'Untitled session'; save(); };
    $m('#status').onchange = e => { s.status = e.target.value; save(); draw(); };
    $m('#arc').onchange = e => { s.arcId = e.target.value; save(); };
    $m('#num').oninput = e => { s.number = +e.target.value || s.number; save(); };
    $m('#real').onchange = e => { s.realDate = e.target.value; save(); };
    main.querySelector('#wd').addEventListener('change', () => { s.date = readDatePicker(main, 'wd'); save(); });
    $m('#settoday').onclick = () => { if (!s.date) return toast('Set an in-world date first'); w.calendar.current = { ...s.date }; save(); toast('World date updated'); };
    $m('#del').onclick = async () => { if (await confirmDialog(`Delete session ${s.number}?`)) { w.sessions = w.sessions.filter(x => x !== s); save(); go('#/campaign'); } };
    attachEditor($m('#notes'), v => { s.notes = v; save(); });
    attachEditor($m('#recap'), v => { s.recap = v; save(); });
    const nb = $m('#newbeat');
    const wrap = document.createElement('div'); wrap.className = 'editor-wrap'; wrap.style.flex = '1';
    nb.replaceWith(wrap); wrap.appendChild(nb);
    attachEditor(nb);
    nb.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.defaultPrevented && nb.value.trim()) {
        s.beats.push({ id: uid(), text: nb.value.trim(), done: false }); save(); draw(); main.querySelector('#newbeat').focus();
      }
    });
    const ed = $m('#beat-ed');
    if (ed) {
      attachEditor(ed, v => { s.beats[editing].text = v; save(); });
      ed.focus(); ed.selectionStart = ed.value.length;
      ed.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ed) { editing = null; draw(); } }, 200));
      ed.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) { e.preventDefault(); ed.blur(); } });
    }
    $m('#beats').onclick = e => {
      if (e.target.closest('a')) return;
      const t = e.target.closest('[data-done],[data-edit],[data-bup],[data-bdel]'); if (!t) return;
      const d = t.dataset;
      if (d.done != null) { s.beats[+d.done].done = t.checked; save(); draw(); }
      else if (d.edit != null) { editing = +d.edit; draw(); }
      else if (d.bup != null) { const i = +d.bup; if (i > 0) { [s.beats[i - 1], s.beats[i]] = [s.beats[i], s.beats[i - 1]]; save(); draw(); } }
      else if (d.bdel != null) { s.beats.splice(+d.bdel, 1); save(); draw(); }
    };
  }
  draw();
}
