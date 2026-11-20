import { W, uid, save, formatDate, dateKey, eraFor, dayIndex, getEntry, mentionsIn } from '../store.js';
import { esc, md, openModal, closeModal, confirmDialog, editorHTML, attachEditor, typeColor } from '../util.js';

export function datePickerHTML(id, d) {
  const cal = W().calendar;
  return `<div id="${id}" class="row" style="gap:6px">
    <input data-p="day" type="number" min="1" placeholder="Day" value="${d ? esc(d.day) : ''}" style="max-width:70px">
    <select data-p="month">${cal.months.map((m, i) => `<option value="${i}" ${d && +d.month === i ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
    <input data-p="year" type="number" placeholder="Year" value="${d ? esc(d.year) : ''}" style="max-width:90px">
  </div>`;
}
export function readDatePicker(root, id) {
  const el = root.querySelector('#' + id);
  const v = k => el.querySelector(`[data-p=${k}]`).value;
  if (v('year') === '') return null;
  return { year: +v('year'), month: +v('month'), day: Math.max(1, +v('day') || 1) };
}

let showSessions = true;
let calView = null;

function items() {
  const w = W();
  const out = w.events.map(ev => ({ kind: 'event', ev, date: ev.date }));
  if (showSessions) for (const s of w.sessions) if (s.date) out.push({ kind: 'session', s, date: s.date });
  return out.sort((a, b) => dateKey(a.date) - dateKey(b.date));
}

export function render(main) {
  const w = W();
  const cal = w.calendar;
  if (!calView) calView = { year: cal.current.year, month: cal.current.month };
  const list = items();
  let lastEra;
  main.innerHTML = `
    <div class="page-head"><h1>Timeline</h1>
      <label class="row shrink" style="margin:0;gap:6px;color:var(--text)"><input type="checkbox" id="ss" ${showSessions ? 'checked' : ''}> Show sessions</label>
      <button id="calset">🗓 Calendar settings</button><button class="primary" id="add">＋ Event</button></div>
    <p><span class="muted">Today in-world:</span> <b>${esc(formatDate(cal.current, true))}</b></p>
    <div class="entry-layout">
      <div>
        ${list.length ? `<div class="timeline">${list.map(it => {
          const era = eraFor(+it.date.year);
          const head = era !== lastEra ? `<div class="tl-era">${esc(era ? era.name : 'Before recorded eras')}</div>` : '';
          lastEra = era;
          if (it.kind === 'session') return head + `<div class="tl-item" style="--tc:var(--accent)"><a class="card" href="#/session/${it.s.id}" style="display:block;text-decoration:none;color:inherit">
            <div class="tl-date">${esc(formatDate(it.date, true))}</div><b>🎲 Session ${it.s.number}: ${esc(it.s.title)}</b>
            ${it.s.recap ? `<div class="prose small muted">${md(it.s.recap.split('\n')[0])}</div>` : ''}</a></div>`;
          const ev = it.ev;
          const first = [...mentionsIn(ev.desc)].map(getEntry).find(Boolean);
          return head + `<div class="tl-item" style="--tc:${first ? typeColor(first.type) : 'var(--muted)'}"><div class="card">
            <div class="row"><div class="tl-date">${esc(formatDate(ev.date, true))}</div>
              <button class="icon small shrink" data-edit="${ev.id}">✎</button><button class="icon small shrink" data-del="${ev.id}">🗑</button></div>
            <b>${esc(ev.title)}</b><div class="prose">${md(ev.desc)}</div></div></div>`;
        }).join('')}</div>` : `<div class="empty"><div class="big">⏳</div>Record wars, births, coronations and prophecies. Sessions with an in-world date appear here too.</div>`}
      </div>
      <div>
        <div class="card side-box" id="cal"></div>
        <div class="card side-box"><h4>Eras</h4>${cal.eras.map(e => `<p style="margin:0 0 4px"><b>${esc(e.name)}</b> <span class="muted small">(${esc(e.abbr)}) from year ${e.start}</span></p>`).join('') || '<p class="muted small">None</p>'}</div>
      </div>
    </div>`;
  drawCal(main);
  main.querySelector('#ss').onchange = e => { showSessions = e.target.checked; render(main); };
  main.querySelector('#add').onclick = () => eventDialog(null, main);
  main.querySelector('#calset').onclick = () => calendarDialog(main);
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => eventDialog(w.events.find(e => e.id === b.dataset.edit), main));
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (await confirmDialog('Delete this event?')) { w.events = w.events.filter(e => e.id !== b.dataset.del); save(); render(main); }
  });
}

function drawCal(main) {
  const w = W(), cal = w.calendar;
  const box = main.querySelector('#cal');
  const month = cal.months[calView.month] || cal.months[0];
  const wd = cal.weekdays.length || 7;
  const offset = dayIndex({ year: calView.year, month: calView.month, day: 1 }) % wd;
  const marks = new Set(items().filter(it => +it.date.year === +calView.year && +it.date.month === +calView.month).map(it => +it.date.day));
  const today = +cal.current.year === +calView.year && +cal.current.month === +calView.month ? +cal.current.day : -1;
  box.innerHTML = `
    <div class="row"><button class="icon shrink" id="pm">‹</button><h4 style="text-align:center;margin:0">${esc(month?.name || '')} · ${esc(formatDate({ year: calView.year, month: calView.month, day: '' }).split(', ')[1] || calView.year)}</h4><button class="icon shrink" id="nm">›</button></div>
    <div class="cal-grid" style="--cols:${wd}">
      ${cal.weekdays.map(d => `<div class="head">${esc(d.slice(0, 2))}</div>`).join('')}
      ${'<div style="background:transparent"></div>'.repeat(offset)}
      ${Array.from({ length: +month?.days || 0 }, (_, i) => i + 1).map(d => `<div class="${marks.has(d) ? 'has' : ''}" ${d === today ? 'style="outline:2px solid var(--accent)"' : ''} title="${marks.has(d) ? 'Has events' : ''}">${d}</div>`).join('')}
    </div>`;
  box.querySelector('#pm').onclick = () => { calView.month--; if (calView.month < 0) { calView.month = cal.months.length - 1; calView.year--; } drawCal(main); };
  box.querySelector('#nm').onclick = () => { calView.month++; if (calView.month >= cal.months.length) { calView.month = 0; calView.year++; } drawCal(main); };
}

function eventDialog(ev, main) {
  const isNew = !ev;
  const draft = ev ? { ...ev } : { id: uid(), title: '', date: { ...W().calendar.current }, desc: '', entryIds: [] };
  openModal(`<h2>${isNew ? 'New event' : 'Edit event'}</h2>
    <label>Title</label><input id="et" value="${esc(draft.title)}" placeholder="e.g. The Fall of Highspire" autofocus>
    <label>Date</label>${datePickerHTML('ed', draft.date)}
    <label>Description</label>${editorHTML('edesc', draft.desc, 6, 'What happened? Type @ to link who and where.')}
    <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save</button></div>`, m => {
    attachEditor(m.querySelector('#edesc'), v => draft.desc = v);
    m.addEventListener('click', e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'yes') {
        draft.title = m.querySelector('#et').value.trim() || 'Untitled event';
        draft.date = readDatePicker(m, 'ed') || { ...W().calendar.current };
        if (isNew) W().events.push(draft); else Object.assign(ev, draft);
        save();
      }
      closeModal(); render(main);
    });
  });
}

function calendarDialog(main) {
  const cal = W().calendar;
  const d = JSON.parse(JSON.stringify(cal));
  const draw = m => {
    m.innerHTML = `<h2>Calendar settings</h2>
      <p class="muted small">Make the calendar your world actually uses.</p>
      <label>Months (name · days)</label>
      <div id="months">${d.months.map((x, i) => `<div class="field-row"><input data-mn="${i}" value="${esc(x.name)}"><input data-md="${i}" type="number" min="1" value="${x.days}"><button class="icon" data-mdel="${i}">✕</button></div>`).join('')}</div>
      <button class="small" id="addm">＋ Month</button>
      <label>Weekdays (comma separated)</label><input id="wds" value="${esc(d.weekdays.join(', '))}">
      <label>Eras (name · abbreviation · starts in year)</label>
      <div id="eras">${d.eras.map((x, i) => `<div class="field-row" style="grid-template-columns:2fr 1fr 1fr auto"><input data-en="${i}" value="${esc(x.name)}"><input data-ea="${i}" value="${esc(x.abbr)}"><input data-es="${i}" type="number" value="${x.start}"><button class="icon" data-edel="${i}">✕</button></div>`).join('')}</div>
      <button class="small" id="adde">＋ Era</button>
      <label>Today’s in-world date</label>${datePickerHTML('cur', d.current)}
      <p class="muted small">Years count continuously; eras just change how they're labelled (e.g. year 1201 shown as “1 SR” if the Second Reign starts in 1201).</p>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Save</button></div>`;
  };
  openModal('', m => {
    draw(m);
    m.addEventListener('input', e => {
      const t = e.target.dataset;
      if (t.mn) d.months[+t.mn].name = e.target.value;
      if (t.md) d.months[+t.md].days = Math.max(1, +e.target.value || 1);
      if (t.en) d.eras[+t.en].name = e.target.value;
      if (t.ea) d.eras[+t.ea].abbr = e.target.value;
      if (t.es) d.eras[+t.es].start = +e.target.value || 0;
      if (e.target.closest('#cur')) d.current = readDatePicker(m, 'cur') || d.current;
      if (e.target.id === 'wds') d.weekdays = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    });
    m.addEventListener('click', e => {
      const t = e.target.dataset;
      if (t.mdel && d.months.length > 1) { d.months.splice(+t.mdel, 1); draw(m); }
      if (t.edel) { d.eras.splice(+t.edel, 1); draw(m); }
      if (e.target.id === 'addm') { d.months.push({ name: 'New month', days: 30 }); draw(m); }
      if (e.target.id === 'adde') { d.eras.push({ name: 'New era', abbr: 'NE', start: (d.eras.at(-1)?.start || 0) + 100 }); draw(m); }
      if (t.a === 'yes') {
        d.current = readDatePicker(m, 'cur') || d.current;
        if (!d.weekdays.length) d.weekdays = ['Day'];
        Object.assign(cal, d); save(); calView = null; closeModal(); render(main);
      }
      if (t.a === 'no') closeModal();
    });
  });
}
