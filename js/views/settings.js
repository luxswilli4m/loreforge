import { W, save, saveNow, TYPES, exportWorld, deleteWorld, formatDate, dateKey, getEntry } from '../store.js';
import { esc, md, download, slug, confirmDialog, toast, go, typeColor } from '../util.js';

function prefs() { return JSON.parse(localStorage.getItem('loreforge:prefs') || '{}'); }
function setPrefs(p) {
  localStorage.setItem('loreforge:prefs', JSON.stringify(p));
  document.documentElement.style.setProperty('--fs', (p.fontSize || 15) + 'px');
  document.body.classList.toggle('easy-read', !!p.easyRead);
  document.body.classList.toggle('light', !!p.light);
}

export function render(main) {
  const w = W();
  const p = prefs();
  const sp = w.settings.speeds;
  main.innerHTML = `
    <div class="page-head"><h1>World settings</h1></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));align-items:start">
      <div class="card">
        <h3>World</h3>
        <label>Name</label><input id="wn" value="${esc(w.name)}">
        <label>Description / pitch</label><textarea id="wd" rows="4">${esc(w.description)}</textarea>
      </div>
      <div class="card">
        <h3>Travel speeds</h3>
        <p class="muted small" style="margin:0">Distance covered per day, in each map’s own unit. Used by the 📏 Measure tool.</p>
        <div class="row"><div><label>🚶 On foot</label><input type="number" data-sp="foot" value="${sp.foot}"></div><div><label>🐎 Horseback</label><input type="number" data-sp="horse" value="${sp.horse}"></div></div>
        <div class="row"><div><label>🛒 Wagon</label><input type="number" data-sp="wagon" value="${sp.wagon}"></div><div><label>⛵ Ship</label><input type="number" data-sp="ship" value="${sp.ship}"></div></div>
      </div>
      <div class="card">
        <h3>Display</h3>
        <label>Text size: <span id="fsv">${p.fontSize || 15}px</span></label><input type="range" id="fs" min="13" max="21" value="${p.fontSize || 15}">
        <label class="row" style="color:var(--text)"><input type="checkbox" id="er" ${p.easyRead ? 'checked' : ''} class="shrink"> Easy-read font (Atkinson Hyperlegible)</label>
        <label class="row" style="color:var(--text)"><input type="checkbox" id="lt" ${p.light ? 'checked' : ''} class="shrink"> Light “parchment” theme</label>
      </div>
      <div class="card">
        <h3>Backup & sharing</h3>
        <p class="muted small">Your world lives only in this browser. Export a backup regularly — and use it to move your world to another computer.</p>
        <div class="row" style="flex-wrap:wrap"><button id="exp">⬇ Export backup (.json)</button></div>
        <p class="muted small" style="margin-top:14px">Publish a read-only wiki for your players: one HTML file you can send, upload, or host. GM secrets and session prep are left out.</p>
        <button class="primary" id="wiki">📜 Export player wiki (.html)</button>
        <p class="muted small" id="usage" style="margin-top:12px"></p>
      </div>
      <div class="card" style="border-color:var(--danger)">
        <h3>Danger zone</h3>
        <button class="danger" id="del">Delete this world</button>
      </div>
    </div>`;
  const $m = s => main.querySelector(s);
  $m('#wn').oninput = e => { w.name = e.target.value || 'Untitled world'; document.querySelector('#world-name').textContent = w.name; save(); };
  $m('#wd').oninput = e => { w.description = e.target.value; save(); };
  main.querySelectorAll('[data-sp]').forEach(i => i.oninput = () => { sp[i.dataset.sp] = Math.max(0.1, +i.value || 1); save(); });
  $m('#fs').oninput = e => { const q = prefs(); q.fontSize = +e.target.value; setPrefs(q); $m('#fsv').textContent = q.fontSize + 'px'; };
  $m('#er').onchange = e => { const q = prefs(); q.easyRead = e.target.checked; setPrefs(q); };
  $m('#lt').onchange = e => { const q = prefs(); q.light = e.target.checked; setPrefs(q); };
  $m('#exp').onclick = async () => { await saveNow(); download(`${slug(w.name)}-backup-${new Date().toISOString().slice(0, 10)}.json`, exportWorld()); };
  $m('#wiki').onclick = () => { download(`${slug(w.name)}-wiki.html`, buildWiki(), 'text/html'); toast('Wiki exported'); };
  $m('#del').onclick = async () => {
    if (await confirmDialog(`Permanently delete “${w.name}”? This can’t be undone unless you have a backup.`)) {
      await deleteWorld(w.id); localStorage.removeItem('loreforge:last'); go('#/worlds');
    }
  };
  navigator.storage?.estimate?.().then(e => { $m('#usage') && ($m('#usage').textContent = `World size: ${(exportWorld().length / 1048576).toFixed(1)} MB · browser storage used ${(e.usage / 1048576).toFixed(1)} MB`); });
}

// ---------- Static player wiki ----------
function buildWiki() {
  const w = W();
  const fix = html => html.replace(/href="#\/entry\/([a-z0-9]+)"/g, 'href="#e-$1"').replace(/ data-entry="[a-z0-9]+"/g, '');
  const byType = Object.keys(TYPES).map(t => ({ t, list: w.entries.filter(e => e.type === t).sort((a, b) => a.name.localeCompare(b.name)) })).filter(g => g.list.length);
  const events = [...w.events].sort((a, b) => dateKey(a.date) - dateKey(b.date));
  const journals = w.journals.filter(j => j.category === 'History' || j.category === 'Player handout');
  const entryHTML = e => {
    const rels = w.relations.filter(r => r.from === e.id || r.to === e.id);
    const fields = e.fields.filter(f => f.v);
    return `<article id="e-${e.id}" style="--tc:${TYPES[e.type].hex}">
      <div class="badge">${TYPES[e.type].icon} ${TYPES[e.type].label}</div><h2>${esc(e.name)}</h2>
      ${e.image ? `<img src="${e.image}" alt="">` : ''}
      ${e.summary ? `<p class="sum">${esc(e.summary)}</p>` : ''}
      ${fields.length ? `<table>${fields.map(f => `<tr><td>${esc(f.k)}</td><td>${fix(md(f.v).replace(/^<p>|<\/p>$/g, ''))}</td></tr>`).join('')}</table>` : ''}
      ${fix(md(e.body))}
      ${rels.length ? `<p class="rels"><b>Connections:</b> ${rels.map(r => { const o = getEntry(r.from === e.id ? r.to : r.from); return o ? `${r.from === e.id ? esc(r.label) : ''} <a href="#e-${o.id}">${esc(o.name)}</a>${r.from !== e.id && r.label ? ` (${esc(r.label)})` : ''}` : ''; }).join(' · ')}</p>` : ''}
      ${e.tags.length ? `<p class="tags">${e.tags.map(t => '#' + esc(t)).join(' ')}</p>` : ''}
    </article>`;
  };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(w.name)} — Wiki</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#15131a;color:#ebe5d8;font:16px/1.6 Inter,system-ui,sans-serif;display:grid;grid-template-columns:260px 1fr}
nav{position:sticky;top:0;height:100vh;overflow-y:auto;background:#1d1a24;border-right:1px solid #36303f;padding:20px}
nav h1{font:700 1.8em 'Cormorant Garamond',serif;margin:0 0 10px}nav h4{margin:16px 0 4px;color:#a39b8c;font-size:.75em;text-transform:uppercase;letter-spacing:.08em}
nav a{display:block;color:#ebe5d8;text-decoration:none;padding:2px 0;font-size:.92em}nav a:hover{color:#e9c27a}
input{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid #36303f;background:#15131a;color:inherit;font:inherit}
main{padding:30px 48px;max-width:900px}h2{font:700 2em 'Cormorant Garamond',serif;margin:0 0 6px}h3{font:700 1.4em 'Cormorant Garamond',serif}
article{border-left:4px solid var(--tc,#d4a24c);padding:4px 0 4px 20px;margin:0 0 50px;scroll-margin-top:20px}
article img{max-width:100%;max-height:340px;border-radius:10px;margin:8px 0}.badge{color:var(--tc);font-size:.75em;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.sum{font-style:italic;color:#a39b8c;font-size:1.1em}a{color:#e9c27a}table{border-collapse:collapse;margin:10px 0}td{padding:4px 14px 4px 0;border-bottom:1px solid #36303f}td:first-child{color:#a39b8c}
.tags{color:#a39b8c;font-size:.85em}.rels{font-size:.92em}blockquote{border-left:3px solid #d4a24c;margin:0 0 1em;padding:2px 14px;color:#a39b8c;font-style:italic}
.sec{font:700 2.4em 'Cormorant Garamond',serif;border-bottom:1px solid #36303f;margin:40px 0 24px;color:#d4a24c}.map{position:relative}.map img{width:100%;max-height:none}
.ev{margin:0 0 16px}.ev .d{color:#e9c27a;font-size:.85em;font-weight:600}
@media(max-width:800px){body{grid-template-columns:1fr}nav{position:static;height:auto}main{padding:20px}}
</style></head><body>
<nav><h1>${esc(w.name)}</h1><input id="f" placeholder="Search…">
${byType.map(g => `<h4>${TYPES[g.t].plural}</h4>${g.list.map(e => `<a href="#e-${e.id}" data-n="${esc(e.name.toLowerCase())}">${esc(e.name)}</a>`).join('')}`).join('')}
${w.maps.length ? '<h4>Maps</h4>' + w.maps.map(m => `<a href="#m-${m.id}">${esc(m.name)}</a>`).join('') : ''}
${events.length ? '<h4>History</h4><a href="#timeline">Timeline</a>' : ''}${journals.map(j => `<a href="#j-${j.id}">${esc(j.title)}</a>`).join('')}
</nav><main>
${w.description ? `<p class="sum">${esc(w.description)}</p>` : ''}
${byType.map(g => `<div class="sec">${TYPES[g.t].plural}</div>${g.list.map(entryHTML).join('')}`).join('')}
${w.maps.length ? `<div class="sec">Maps</div>${w.maps.map(m => `<article id="m-${m.id}"><h2>${esc(m.name)}</h2><div class="map"><img src="${m.image}" alt="">
  ${m.pins.map(p => { const e = getEntry(p.entryId); const t = esc(p.label || e?.name || ''); return `<a href="${e ? '#e-' + e.id : (p.submapId ? '#m-' + p.submapId : '#')}" title="${t}" style="position:absolute;left:${p.x / m.w * 100}%;top:${p.y / m.h * 100}%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:${p.color || (e ? TYPES[e.type].hex : '#d4a24c')};border:2px solid #000"></a><span style="position:absolute;left:calc(${p.x / m.w * 100}% + 10px);top:${p.y / m.h * 100}%;transform:translateY(-50%);font-weight:600;font-size:13px;text-shadow:0 0 3px #000,0 0 3px #000;pointer-events:none">${t}</span>`; }).join('')}</div></article>`).join('')}` : ''}
${events.length ? `<div class="sec" id="timeline">Timeline</div>${events.map(ev => `<div class="ev"><div class="d">${esc(formatDate(ev.date))}</div><b>${esc(ev.title)}</b>${fix(md(ev.desc))}</div>`).join('')}` : ''}
${journals.map(j => `<article id="j-${j.id}"><div class="badge">${esc(j.category)}</div><h2>${esc(j.title)}</h2>${fix(md(j.body))}</article>`).join('')}
<p style="color:#a39b8c;font-size:.8em;margin-top:60px">Made with Loreforge</p>
</main>
<script>document.getElementById('f').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('nav a[data-n]').forEach(a=>a.style.display=a.dataset.n.includes(q)?'':'none')}</script>
</body></html>`;
}
