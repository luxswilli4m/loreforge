import { TYPES, getEntry, W, newEntry, MENTION_RE } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function typeColor(type) { return TYPES[type]?.color || 'var(--accent)'; }

export function typeBadge(type) {
  const t = TYPES[type] || TYPES.lore;
  return `<span class="type-badge" style="--tc:${t.color}"><span class="type-dot"></span>${t.label}</span>`;
}

export function mentionLink(id, fallbackName) {
  const e = getEntry(id);
  if (!e) return `<span class="mention broken" title="Deleted entry">${esc(fallbackName)}</span>`;
  return `<a class="mention" data-entry="${e.id}" style="--tc:${typeColor(e.type)}" href="#/entry/${e.id}">${esc(e.name)}</a>`;
}

function inline(text) {
  let s = esc(text);
  s = s.replace(/@\[([^\]]+)\]\(([a-z0-9]+)\)/g, (_, name, id) => mentionLink(id, name));
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s;
}

// Minimal markdown: headings, quotes, lists, rules, paragraphs, bold/italic, @mentions
export function md(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r/g, '').split('\n');
  let html = '', para = [], list = null;
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flushPara(); flushList(); const n = m[1].length + 1; html += `<h${n}>${inline(m[2])}</h${n}>`; continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); html += '<hr>'; continue; }
    if ((m = line.match(/^>\s?(.*)/))) { flushPara(); flushList(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)/))) { flushPara(); if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushPara(); if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return html;
}

export function plain(src) {
  return String(src || '').replace(MENTION_RE, (_, n, id) => getEntry(id)?.name || n).replace(/[#*>~_`]/g, '').trim();
}

// ---------- Toast & modals ----------
let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export function openModal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  const back = root.firstElementChild;
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  const modal = back.firstElementChild;
  onMount?.(modal);
  setTimeout(() => modal.querySelector('[autofocus], input, textarea, select')?.focus(), 20);
  return modal;
}
export function closeModal() { $('#modal-root').innerHTML = ''; }

export function confirmDialog(message, okLabel = 'Delete') {
  return new Promise(resolve => {
    openModal(`<h2>Are you sure?</h2><p>${esc(message)}</p>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">${esc(okLabel)}</button></div>`, m => {
      m.addEventListener('click', e => {
        const a = e.target.dataset.a;
        if (a) { closeModal(); resolve(a === 'yes'); }
      });
    });
  });
}

export function promptDialog(title, value = '', placeholder = '') {
  return new Promise(resolve => {
    openModal(`<h2>${esc(title)}</h2><input id="pd" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">OK</button></div>`, m => {
      const input = m.querySelector('#pd');
      const done = ok => { const v = input.value.trim(); closeModal(); resolve(ok && v ? v : null); };
      m.addEventListener('click', e => { if (e.target.dataset.a) done(e.target.dataset.a === 'yes'); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      setTimeout(() => input.select(), 30);
    });
  });
}

// ---------- Files & images ----------
export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

export function readText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}

// Load an image file and downscale it so worlds stay a manageable size
export function imageToDataURL(file, maxDim = 1400) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const isPng = file.type === 'image/png' || file.type === 'image/svg+xml';
        resolve({ src: c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88), w: c.width, h: c.height });
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function query() {
  const q = location.hash.split('?')[1] || '';
  return Object.fromEntries(new URLSearchParams(q));
}
export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
export function go(hash) { if (location.hash === hash) rerender(); else location.hash = hash; }

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';

// ---------- Rich text editor with @mentions ----------
const MIRROR_PROPS = ['boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize'];

function caretCoords(ta, pos) {
  const div = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const p of MIRROR_PROPS) div.style[p] = cs[p];
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word', top: '0', left: '-9999px' });
  div.textContent = ta.value.slice(0, pos);
  const span = document.createElement('span');
  span.textContent = ta.value.slice(pos) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop + parseInt(cs.borderTopWidth) - ta.scrollTop;
  const left = span.offsetLeft + parseInt(cs.borderLeftWidth);
  document.body.removeChild(div);
  return { top, left, lh: parseInt(cs.lineHeight) || 22 };
}

export function editorHTML(id, value, rows = 12, placeholder = 'Write here… type @ to link an entry') {
  return `<div class="editor-wrap">
    <div class="toolbar" data-for="${id}">
      <button type="button" data-md="bold" title="Bold"><b>B</b></button>
      <button type="button" data-md="italic" title="Italic"><i>I</i></button>
      <button type="button" data-md="h2" title="Heading">H2</button>
      <button type="button" data-md="h3" title="Subheading">H3</button>
      <button type="button" data-md="list" title="List">• List</button>
      <button type="button" data-md="quote" title="Quote">❝ Quote</button>
      <button type="button" data-md="mention" title="Link an entry">@ Link</button>
    </div>
    <textarea id="${id}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
  </div>`;
}

export function attachEditor(ta, onChange) {
  const wrap = ta.parentElement;
  const toolbar = wrap.querySelector('.toolbar');
  let pop = null, items = [], sel = 0, start = -1;

  const fire = () => onChange?.(ta.value);

  function wrapSel(before, after = before) {
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const inner = value.slice(a, b) || 'text';
    ta.setRangeText(before + inner + after, a, b, 'end');
    ta.selectionStart = a + before.length; ta.selectionEnd = a + before.length + inner.length;
    ta.focus(); fire();
  }
  function prefixLine(prefix) {
    const a = ta.selectionStart;
    const ls = ta.value.lastIndexOf('\n', a - 1) + 1;
    ta.setRangeText(prefix, ls, ls, 'end');
    ta.focus(); fire();
  }
  toolbar?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.md;
    if (k === 'bold') wrapSel('**');
    else if (k === 'italic') wrapSel('*');
    else if (k === 'h2') prefixLine('## ');
    else if (k === 'h3') prefixLine('### ');
    else if (k === 'list') prefixLine('- ');
    else if (k === 'quote') prefixLine('> ');
    else if (k === 'mention') { ta.setRangeText('@', ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); check(); }
  });

  function close() { pop?.remove(); pop = null; start = -1; }

  function render(q) {
    const ql = q.toLowerCase();
    const matches = W().entries
      .filter(e => e.name.toLowerCase().includes(ql))
      .sort((a, b) => (b.name.toLowerCase().startsWith(ql) - a.name.toLowerCase().startsWith(ql)) || a.name.localeCompare(b.name))
      .slice(0, 8);
    items = matches.map(e => ({ entry: e }));
    if (q.trim()) items.push({ create: q.trim() });
    if (!items.length) { close(); return; }
    sel = Math.min(sel, items.length - 1);
    if (!pop) { pop = document.createElement('div'); pop.className = 'mention-pop'; wrap.appendChild(pop); }
    pop.innerHTML = items.map((it, i) => it.entry
      ? `<div data-i="${i}" class="${i === sel ? 'sel' : ''}"><span class="type-dot" style="--tc:${typeColor(it.entry.type)}"></span>${esc(it.entry.name)}<span class="muted small" style="margin-left:auto">${TYPES[it.entry.type]?.label || ''}</span></div>`
      : `<div data-i="${i}" class="${i === sel ? 'sel' : ''}">＋ Create “${esc(it.create)}”</div>`).join('');
    const c = caretCoords(ta, ta.selectionStart);
    pop.style.top = (ta.offsetTop + c.top + c.lh + 4) + 'px';
    pop.style.left = Math.min(ta.offsetLeft + c.left, ta.offsetLeft + ta.clientWidth - 250) + 'px';
  }

  function choose(i) {
    const it = items[i]; if (!it) return;
    const e = it.entry || newEntry('character', it.create);
    const token = `@[${e.name}](${e.id}) `;
    ta.setRangeText(token, start, ta.selectionStart, 'end');
    close(); ta.focus(); fire();
    if (it.create) toast(`Created “${e.name}” — set its type on its page`);
  }

  function check() {
    const pos = ta.selectionStart;
    const before = ta.value.slice(Math.max(0, pos - 40), pos);
    const m = before.match(/(?:^|[\s(])@([^\n@\[\]()]{0,30})$/);
    if (!m) { close(); return; }
    start = pos - m[1].length - 1;
    render(m[1]);
  }

  ta.addEventListener('input', () => { sel = 0; fire(); check(); });
  ta.addEventListener('click', check);
  ta.addEventListener('blur', () => setTimeout(close, 150));
  ta.addEventListener('keydown', e => {
    if (!pop) return;
    if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; render(ta.value.slice(start + 1, ta.selectionStart)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; render(ta.value.slice(start + 1, ta.selectionStart)); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { choose(sel); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); }
  });
  wrap.addEventListener('mousedown', e => {
    const d = e.target.closest('.mention-pop div');
    if (d) { e.preventDefault(); choose(+d.dataset.i); }
  });
}
