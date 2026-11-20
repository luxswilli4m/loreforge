// Library: PDFs (rulebooks, modules), handouts and images, readable in-app and in the side panel.
import { W, uid, save, getDoc } from '../store.js';
import { esc, go, toast, confirmDialog, pickFile, promptDialog } from '../util.js';
import { assetGet, assetPut, assetDel } from '../db.js';
import { fetchFile } from '../cloud.js';

export const DOC_CATS = ['Rulebook', 'Adventure', 'Handout', 'Image', 'Other'];
let cat = '';
const urls = new Set();
const kindOf = type => type === 'application/pdf' ? 'pdf' : type.startsWith('image/') ? 'image' : type.startsWith('text/') ? 'text' : 'other';
const icon = k => ({ pdf: '📕', image: '🖼️', text: '📄', other: '📦' }[k] || '📦');
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export async function blobURL(id) {
  let blob = await assetGet('lib:' + id);
  if (!blob) blob = await fetchFile(id).catch(() => null);   // added on another device → fetch from your server
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
function revokeAll() { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); }

export async function addFiles(files) {
  let n = 0;
  for (const f of files) {
    if (f.size > 200 * 1048576) { toast(`${f.name} is over 200 MB — skipped`); continue; }
    const id = uid(), kind = kindOf(f.type || '');
    await assetPut('lib:' + id, f);
    W().library.push({ id, name: f.name.replace(/\.[^.]+$/, ''), file: f.name, type: f.type, size: f.size, kind, cat: kind === 'pdf' ? 'Rulebook' : kind === 'image' ? 'Image' : 'Other', created: Date.now() });
    n++;
  }
  save();
  return n;
}

export function renderList(main) {
  revokeAll();
  const w = W();
  const docs = w.library.filter(d => !cat || d.cat === cat).sort((a, b) => a.name.localeCompare(b.name));
  main.innerHTML = `
    <div class="page-head"><h1>Library</h1><span class="muted small">Rulebooks, adventures, handouts and art — Ctrl+click any item to read it beside your notes.</span><button class="primary" id="up">⬆ Add files</button></div>
    <div class="filters"><button class="chip ${!cat ? 'on' : ''}" data-c="">All (${w.library.length})</button>${DOC_CATS.map(c => `<button class="chip ${cat === c ? 'on' : ''}" data-c="${c}">${c} (${w.library.filter(d => d.cat === c).length})</button>`).join('')}</div>
    <div class="dropzone" id="drop">${docs.length ? `<div class="grid">${docs.map(d => `
      <a class="card doc-card" href="#/doc/${d.id}">
        <div class="doc-thumb" data-thumb="${d.kind === 'image' ? d.id : ''}">${icon(d.kind)}</div>
        <b>${esc(d.name)}</b><span class="muted small">${d.cat} · ${fmtSize(d.size)}</span></a>`).join('')}</div>`
      : `<div class="empty"><div class="big">📚</div>Drop PDFs, images or text files here, or use “Add files”. They’re stored privately in this browser.</div>`}</div>`;
  main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; renderList(main); });
  main.querySelectorAll('[data-thumb]').forEach(async el => {
    if (!el.dataset.thumb) return;
    const u = await blobURL(el.dataset.thumb);
    if (u) { el.style.background = `center/cover url('${u}')`; el.textContent = ''; }
  });
  const upload = async files => { if (!files.length) return; toast('Adding…'); const n = await addFiles(files); toast(`${n} file${n === 1 ? '' : 's'} added`); renderList(main); };
  main.querySelector('#up').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,image/*,.txt,.md';
    inp.onchange = () => upload([...inp.files]); inp.click();
  };
  const drop = main.querySelector('#drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); });
  return revokeAll;
}

export async function viewerHTML(d, height = '100%') {
  const u = await blobURL(d.id);
  if (!u) return '<p class="muted">This file isn’t stored in this browser (it may have been added on another device).</p>';
  if (d.kind === 'pdf') return `<iframe class="doc-frame" src="${u}" style="height:${height}" title="${esc(d.name)}"></iframe>`;
  if (d.kind === 'image') return `<img src="${u}" alt="${esc(d.name)}" style="max-width:100%;border-radius:8px">`;
  if (d.kind === 'text') { const t = await (await (await fetch(u)).blob()).text(); return `<pre class="doc-text">${esc(t)}</pre>`; }
  return `<p><a class="btn" href="${u}" download="${esc(d.file)}">⬇ Download ${esc(d.file)}</a></p>`;
}

export function renderDoc(main, id) {
  revokeAll();
  const d = getDoc(id);
  if (!d) { main.innerHTML = `<div class="empty">File not found. <a href="#/library">Back to the library</a></div>`; return; }
  main.innerHTML = `
    <div class="breadcrumbs"><a href="#/library">Library</a> › ${esc(d.cat)}</div>
    <div class="page-head"><h1>${esc(d.name)}</h1>
      <select id="dc" style="width:auto">${DOC_CATS.map(c => `<option ${c === d.cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <button id="dren">Rename</button><button id="ddl">⬇ Download</button><button class="danger" id="ddel">Delete</button></div>
    <div class="doc-view" id="dv"><p class="muted">Opening…</p></div>`;
  viewerHTML(d, 'calc(100vh - 190px)').then(h => { const dv = main.querySelector('#dv'); if (dv) dv.innerHTML = h; });
  main.querySelector('#dc').onchange = e => { d.cat = e.target.value; save(); };
  main.querySelector('#dren').onclick = async () => { const n = await promptDialog('Rename', d.name); if (n) { d.name = n; save(); renderDoc(main, id); } };
  main.querySelector('#ddl').onclick = async () => { const u = await blobURL(d.id); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = d.file; a.click(); };
  main.querySelector('#ddel').onclick = async () => {
    if (await confirmDialog(`Remove “${d.name}” from the library?`)) { W().library = W().library.filter(x => x !== d); await assetDel('lib:' + d.id); save(); go('#/library'); }
  };
  return revokeAll;
}
