import { W, uid, save, formatDate, dateKey, eraFor, dayIndex, yearLength, getEntry, mentionsIn } from '../store.js';
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
let tlMode = 'list';      // 'list' | 'chart'
let calZoom = 'month';    // 'month' | 'year' | 'decade'
let chartView = null;     // { t0, t1 } visible span of the overview, in years

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
  const listHTML = list.length ? `<div class="timeline">${list.map(it => {
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
        }).join('')}</div>` : `<div class="empty"><div class="big">⏳</div>Record wars, births, coronations and prophecies. Sessions with an in-world date appear here too.</div>`;
  const sideHTML = `<div class="card side-box" id="cal"></div>
        <div class="card side-box"><h4>Eras</h4>${cal.eras.map(e => `<p style="margin:0 0 4px"><b>${esc(e.name)}</b> <span class="muted small">(${esc(e.abbr)}) from year ${e.start}</span></p>`).join('') || '<p class="muted small">None</p>'}</div>`;
  main.innerHTML = `
    <div class="page-head"><h1>Timeline</h1>
      <div class="seg small" id="tlmode"><button data-tm="list" class="${tlMode === 'list' ? 'on' : ''}">☰ List</button><button data-tm="chart" class="${tlMode === 'chart' ? 'on' : ''}">⟷ Overview</button></div>
      <label class="row shrink" style="margin:0;gap:6px;color:var(--text)"><input type="checkbox" id="ss" ${showSessions ? 'checked' : ''}> Show sessions</label>
      <button id="calset">🗓 Calendar settings</button><button class="primary" id="add">＋ Event</button></div>
    <p><span class="muted">Today in-world:</span> <b>${esc(formatDate(cal.current, true))}</b></p>
    ${tlMode === 'chart' ? `
      <div class="card tl-chart-card"><div class="tl-chart-tools"><span class="muted small">Scroll to zoom · drag to move · hover for dates · click an event to open it</span>
        <button class="small" id="tz-out">－</button><button class="small" id="tz-in">＋</button><button class="small" id="tz-fit">⤢ Fit</button></div>
        <div class="tl-chart" id="chart"><canvas></canvas><div class="tl-tip hidden" id="tip"></div></div></div>
      <div class="tl-under">${sideHTML}</div>`
    : `<div class="entry-layout"><div>${listHTML}</div><div>${sideHTML}</div></div>`}`;
  drawCal(main);
  main.querySelector('#ss').onchange = e => { showSessions = e.target.checked; render(main); };
  main.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { tlMode = b.dataset.tm; render(main); });
  main.querySelector('#add').onclick = () => eventDialog(null, main);
  main.querySelector('#calset').onclick = () => calendarDialog(main);
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => eventDialog(w.events.find(e => e.id === b.dataset.edit), main));
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (await confirmDialog('Delete this event?')) { w.events = w.events.filter(e => e.id !== b.dataset.del); save(); render(main); }
  });
  if (tlMode === 'chart') return drawChart(main, list);
}

const yearLabel = y => { const era = eraFor(+y); return era ? `${+y - era.start + 1} ${era.abbr || era.name}` : `Year ${y}`; };

function drawCal(main) {
  const w = W(), cal = w.calendar;
  const box = main.querySelector('#cal');
  const all = items();
  const nav = (title, sub) => `<div class="row cal-nav"><button class="icon shrink" id="pm">‹</button>
    <button class="cal-title" id="zoomout" title="${calZoom === 'decade' ? '' : 'Zoom out'}"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button><button class="icon shrink" id="nm">›</button></div>`;
  const step = dir => {
    if (calZoom === 'month') { calView.month += dir; if (calView.month < 0) { calView.month = cal.months.length - 1; calView.year--; } if (calView.month >= cal.months.length) { calView.month = 0; calView.year++; } }
    else if (calZoom === 'year') calView.year += dir;
    else calView.year += dir * 12;
    drawCal(main);
  };
  if (calZoom === 'month') {
    const month = cal.months[calView.month] || cal.months[0];
    const wd = cal.weekdays.length || 7;
    const offset = dayIndex({ year: calView.year, month: calView.month, day: 1 }) % wd;
    const marks = new Set(all.filter(it => +it.date.year === +calView.year && +it.date.month === +calView.month).map(it => +it.date.day));
    const today = +cal.current.year === +calView.year && +cal.current.month === +calView.month ? +cal.current.day : -1;
    box.innerHTML = nav(`${month?.name || ''} · ${yearLabel(calView.year)}`, '') + `
    <div class="cal-grid" style="--cols:${wd}">
      ${cal.weekdays.map(d => `<div class="head">${esc(d.slice(0, 2))}</div>`).join('')}
      ${'<div style="background:transparent"></div>'.repeat(offset)}
      ${Array.from({ length: +month?.days || 0 }, (_, i) => i + 1).map(d => `<div class="${marks.has(d) ? 'has' : ''}" ${d === today ? 'style="outline:2px solid var(--accent)"' : ''} title="${marks.has(d) ? 'Has events' : ''}">${d}</div>`).join('')}
    </div>`;
  } else if (calZoom === 'year') {
    const count = m => all.filter(it => +it.date.year === +calView.year && +it.date.month === m).length;
    box.innerHTML = nav(yearLabel(calView.year), `Year ${calView.year}`) + `<div class="cal-year">${cal.months.map((mo, i) => {
      const n = count(i), cur = +cal.current.year === +calView.year && +cal.current.month === i;
      return `<button class="cal-cell ${n ? 'has' : ''} ${cur ? 'today' : ''}" data-month="${i}"><span>${esc(mo.name)}</span>${n ? `<small>${n} event${n > 1 ? 's' : ''}</small>` : ''}</button>`;
    }).join('')}</div>`;
  } else {
    const start = calView.year - ((calView.year % 12) + 12) % 12;
    const years = Array.from({ length: 12 }, (_, i) => start + i);
    box.innerHTML = nav(`${yearLabel(start)} – ${yearLabel(start + 11)}`, '') + `<div class="cal-year">${years.map(y => {
      const n = all.filter(it => +it.date.year === y).length, cur = +cal.current.year === y;
      return `<button class="cal-cell ${n ? 'has' : ''} ${cur ? 'today' : ''}" data-year="${y}"><span>${esc(yearLabel(y))}</span>${n ? `<small>${n} event${n > 1 ? 's' : ''}</small>` : ''}</button>`;
    }).join('')}</div>`;
  }
  box.querySelector('#pm').onclick = () => step(-1);
  box.querySelector('#nm').onclick = () => step(1);
  box.querySelector('#zoomout').onclick = () => { calZoom = calZoom === 'month' ? 'year' : 'decade'; drawCal(main); };
  box.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { calView.month = +b.dataset.month; calZoom = 'month'; drawCal(main); });
  box.querySelectorAll('[data-year]').forEach(b => b.onclick = () => { calView.year = +b.dataset.year; calZoom = 'year'; drawCal(main); });
}

// ---------- the horizontal overview ----------
const ERA_COLORS = ['#d4a24c', '#5fa8d3', '#c77dff', '#81b29a', '#e07a5f', '#e9c46a', '#6d9dc5', '#b5838d'];
function drawChart(main, list) {
  const w = W(), cal = w.calendar, months = cal.months, ylen = yearLength();
  const host = main.querySelector('#chart'), cv = host.querySelector('canvas'), tip = main.querySelector('#tip');
  const tOf = d => { let n = 0; for (let i = 0; i < +d.month; i++) n += +months[i]?.days || 0; return +d.year + (n + (+d.day || 1) - 1) / ylen; };
  const fromT = t => { const year = Math.floor(t); let rest = (t - year) * ylen, month = 0; while (month < months.length - 1 && rest >= (+months[month].days || 0)) { rest -= +months[month].days || 0; month++; } return { year, month, day: Math.floor(rest) + 1 }; };
  const pts = list.map(it => ({ ...it, t: tOf(it.date) }));
  const eras = [...cal.eras].sort((a, b) => a.start - b.start);
  const now = tOf(cal.current);
  // fit around the events themselves (era starts can be ages earlier)
  const all = pts.length ? [...pts.map(p => p.t), now] : [now, ...eras.map(e => e.start)];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.06;
  const fit = () => { chartView = { t0: lo - pad, t1: hi + pad }; };
  if (!chartView) fit();
  let hover = null, boxes = [], mouseX = null, drag = null;

  function niceStep(span, px) {
    const target = span / Math.max(2, px / 110);
    const steps = [1 / ylen, 7 / ylen, 1 / 12, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
    return steps.find(s => s >= target) || steps.at(-1);
  }
  function draw() {
    const W2 = host.clientWidth, H2 = host.clientHeight, dpr = devicePixelRatio || 1;
    cv.width = W2 * dpr; cv.height = H2 * dpr; cv.style.width = W2 + 'px'; cv.style.height = H2 + 'px';
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.body), text = css.getPropertyValue('--text') || '#eee', muted = css.getPropertyValue('--muted') || '#999', line = css.getPropertyValue('--line') || '#333', accent = css.getPropertyValue('--accent') || '#d4a24c';
    const { t0, t1 } = chartView, X = t => (t - t0) / (t1 - t0) * W2;
    const axisY = Math.round(H2 * 0.72);
    c.clearRect(0, 0, W2, H2);
    // era bands
    eras.forEach((e, i) => {
      const a = X(e.start), b = X(eras[i + 1]?.start ?? t1 + (t1 - t0));
      c.fillStyle = ERA_COLORS[i % ERA_COLORS.length] + '1c'; c.fillRect(a, 0, b - a, H2);
      c.fillStyle = ERA_COLORS[i % ERA_COLORS.length] + 'aa'; c.fillRect(a, axisY - 3, b - a, 6);
      c.font = '600 15px "Cormorant Garamond", Georgia, serif'; c.fillStyle = ERA_COLORS[i % ERA_COLORS.length];
      const lx = Math.max(a, 0) + 8, room = Math.min(b, W2) - lx - 8;
      if (room > 30) { c.save(); c.beginPath(); c.rect(lx, 0, room, 40); c.clip(); c.fillText(e.name, lx, 22); c.restore(); }
    });
    // axis ticks
    const st = niceStep(t1 - t0, W2);
    c.strokeStyle = line; c.fillStyle = muted; c.font = '12px Inter, sans-serif'; c.textAlign = 'center';
    c.beginPath(); c.moveTo(0, axisY); c.lineTo(W2, axisY); c.lineWidth = 1; c.stroke();
    for (let t = Math.ceil(t0 / st) * st; t <= t1; t += st) {
      const x = X(t); c.beginPath(); c.moveTo(x, axisY); c.lineTo(x, axisY + 7); c.stroke();
      const d = fromT(t + 1e-9);
      const lbl = st >= 1 ? yearLabel(Math.round(t)) : st >= 1 / 12 - 1e-9 ? `${months[d.month]?.name?.slice(0, 3) || ''} ${yearLabel(d.year)}` : `${d.day} ${months[d.month]?.name?.slice(0, 3) || ''}`;
      c.fillText(lbl, x, axisY + 22);
      c.strokeStyle = line + '55'; c.beginPath(); c.moveTo(x, 34); c.lineTo(x, axisY); c.stroke(); c.strokeStyle = line;
    }
    // today
    const xn = X(now);
    c.strokeStyle = accent; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(xn, 30); c.lineTo(xn, H2); c.stroke(); c.setLineDash([]);
    c.fillStyle = accent; c.font = '600 11px Inter, sans-serif'; c.fillText('Today', xn, H2 - 6);
    // events above the axis in lanes, sessions below
    boxes = [];
    const lanesUp = [], lanesDown = [];
    c.textAlign = 'left';
    for (const p of pts) {
      const x = X(p.t);
      if (x < -200 || x > W2 + 200) continue;
      const isS = p.kind === 'session';
      const title = isS ? `🎲 ${p.s.number}: ${p.s.title}` : p.ev.title;
      c.font = (isS ? '600 12px' : '600 13px') + ' Inter, sans-serif';
      const tw = Math.min(220, c.measureText(title).width) + 16;
      const lanes = isS ? lanesDown : lanesUp;
      const bx = x + tw > W2 - 4 ? x - tw : x; // flip labels that would run off the right edge
      let lane = 0; while ((lanes[lane] ?? -1e9) > bx - 4) lane++;
      lanes[lane] = bx + tw;
      const first = !isS && [...mentionsIn(p.ev.desc)].map(getEntry).find(Boolean);
      const col = isS ? accent : first ? typeColor(first.type) : '#9aa';
      const y = isS ? axisY + 34 + lane * 26 : axisY - 44 - lane * 30;
      c.strokeStyle = col; c.globalAlpha = 0.55; c.beginPath(); c.moveTo(x, axisY); c.lineTo(x, isS ? y : y + 22); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = col; c.beginPath(); c.arc(x, axisY, 5, 0, Math.PI * 2); c.fill();
      const hov = hover && hover.p === p;
      c.fillStyle = hov ? col : 'rgba(20,18,28,.88)'; c.strokeStyle = col; c.lineWidth = hov ? 2 : 1.2;
      c.beginPath(); c.roundRect ? c.roundRect(bx, y, tw, 22, 6) : c.rect(bx, y, tw, 22); c.fill(); c.stroke();
      c.save(); c.beginPath(); c.rect(bx + 6, y, tw - 10, 22); c.clip();
      c.fillStyle = hov ? '#14121c' : text; c.fillText(title, bx + 8, y + 15); c.restore();
      boxes.push({ p, x: bx, y, w: tw, h: 22 });
    }
    // cursor guide
    if (mouseX != null && !hover) {
      const t = t0 + mouseX / W2 * (t1 - t0), d = fromT(t);
      c.strokeStyle = text; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(mouseX, 30); c.lineTo(mouseX, H2); c.stroke(); c.globalAlpha = 1;
      tip.classList.remove('hidden');
      tip.innerHTML = `<b>${esc(yearLabel(d.year))}</b>${t1 - t0 < 40 ? `<br><span class="muted">${esc(formatDate(d))}</span>` : ''}<br><span class="muted small">Year ${d.year}${eraFor(d.year) ? ' · ' + esc(eraFor(d.year).name) : ''}</span>`;
      tip.style.left = Math.min(W2 - 190, mouseX + 12) + 'px'; tip.style.top = (axisY - 110) + 'px';
    } else if (hover) {
      const p = hover.p;
      tip.classList.remove('hidden');
      tip.innerHTML = p.kind === 'session'
        ? `<b>🎲 Session ${p.s.number}: ${esc(p.s.title)}</b><br><span class="muted">${esc(formatDate(p.date, true))}</span>`
        : `<b>${esc(p.ev.title)}</b><br><span class="muted">${esc(formatDate(p.date, true))}</span>${p.ev.desc ? `<div class="small" style="margin-top:4px">${esc(p.ev.desc.replace(/@\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 160))}</div>` : ''}`;
      tip.style.left = Math.min(W2 - 260, hover.x) + 'px'; tip.style.top = Math.max(4, hover.y - 70) + 'px';
    } else tip.classList.add('hidden');
  }
  const hit = (mx, my) => boxes.slice().reverse().find(b => mx >= b.x - 6 && mx <= b.x + b.w && my >= b.y - 4 && my <= b.y + b.h + 4) || null;
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (drag) { const dt = (mx - drag.x) / r.width * (drag.t1 - drag.t0); chartView = { t0: drag.t0 - dt, t1: drag.t1 - dt }; drag.moved = drag.moved || Math.abs(mx - drag.x) > 3; }
    mouseX = mx; hover = drag ? null : hit(mx, my);
    cv.style.cursor = hover ? 'pointer' : drag ? 'grabbing' : 'crosshair';
    draw();
  });
  cv.addEventListener('pointerleave', () => { mouseX = null; hover = null; draw(); });
  cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); cv.setPointerCapture(e.pointerId); drag = { x: e.clientX - r.left, ...chartView, moved: false }; });
  cv.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (d?.moved) return;
    const r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    if (h.p.kind === 'session') location.hash = `#/session/${h.p.s.id}`;
    else eventDialog(h.p.ev, main);
  });
  const zoom = (f, mx) => {
    const { t0, t1 } = chartView, Wd = host.clientWidth, at = t0 + (mx ?? Wd / 2) / Wd * (t1 - t0);
    const span = Math.max(3 / ylen, Math.min((hi - lo) * 50 + 100, (t1 - t0) * f));
    chartView = { t0: at - (at - t0) / (t1 - t0) * span, t1: at + (t1 - at) / (t1 - t0) * span }; draw();
  };
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoom(Math.exp(e.deltaY * 0.0015), e.clientX - r.left); }, { passive: false });
  main.querySelector('#tz-in').onclick = () => zoom(1 / 1.6);
  main.querySelector('#tz-out').onclick = () => zoom(1.6);
  main.querySelector('#tz-fit').onclick = () => { fit(); draw(); };
  const ro = new ResizeObserver(draw); ro.observe(host);
  draw();
  return () => ro.disconnect();
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
