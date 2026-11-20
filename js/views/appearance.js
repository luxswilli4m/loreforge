import { W } from '../store.js';
import { esc, pickFile, imageToDataURL, toast } from '../util.js';
import { THEMES, PRESETS, getPrefs, setPrefs, applyBackground } from '../theme.js';
import { assetGet, assetPut } from '../db.js';
import { randomSeed } from '../gen/core.js';
import * as A from '../assets.js';

export function render(main) {
  const p = getPrefs();
  const maps = W()?.maps || [];
  const bg = p.bg;
  main.innerHTML = `
    <div class="page-head"><h1>Appearance</h1><span class="muted small">Changes apply instantly and are saved in this browser.</span></div>

    <section class="appearance-section">
      <h2>Vibe</h2><p class="muted">Pick the mood of the whole app.</p>
      <div class="theme-grid">${Object.entries(THEMES).map(([k, t]) => `
        <button class="card theme-card ${p.theme === k ? 'on' : ''}" data-theme="${k}">
          <div class="tc-prev" style="background:${t.swatch[0]}"><b style="color:${t.swatch[2]}">Aa</b><i style="background:${t.swatch[1]}"></i></div>
          <div class="tc-body"><b>${t.label}</b><small>${t.desc}</small></div>
        </button>`).join('')}</div>
    </section>

    <section class="appearance-section">
      <h2>Paper</h2>
      <label class="check"><input type="checkbox" id="torn" ${p.torn ? 'checked' : ''}> Torn paper edges on panels</label>
      <div class="slider-row"><span>Tear depth</span><input type="range" id="tear" min="0.4" max="2.2" step="0.1" value="${p.tear}" ${p.torn ? '' : 'disabled'}><span id="tearv">${Math.round(p.tear * 100)}%</span></div>
      <div class="slider-row"><span>Panel opacity</span><input type="range" id="op" min="0.6" max="1" step="0.01" value="${p.panelOpacity}"><span id="opv">${Math.round(p.panelOpacity * 100)}%</span></div>
    </section>

    <section class="appearance-section">
      <h2>Background</h2><p class="muted">By default Loreforge draws you a fresh fantasy map to sit behind everything.</p>
      <div class="bg-grid" id="bgs">
        <button class="card bg-card ${bg.kind === 'generated' ? 'on' : ''}" data-kind="generated"><div class="bg-prev" id="genprev">🗺️</div>Generated world</button>
        ${Object.entries(PRESETS).map(([k, pr]) => `<button class="card bg-card ${bg.kind === 'preset' && bg.preset === k ? 'on' : ''}" data-kind="preset" data-preset="${k}"><div class="bg-prev" style="background:${pr.css}"></div>${pr.label}</button>`).join('')}
        ${maps.map(m => `<button class="card bg-card ${bg.kind === 'map' && bg.mapId === m.id ? 'on' : ''}" data-kind="map" data-map="${m.id}"><div class="bg-prev" ${A.bg(m.image)}></div>${esc(m.name)}</button>`).join('')}
        <button class="card bg-card ${bg.kind === 'upload' ? 'on' : ''}" data-kind="upload"><div class="bg-prev" id="upprev">⬆</div>Your own image</button>
        <button class="card bg-card ${bg.kind === 'none' ? 'on' : ''}" data-kind="none"><div class="bg-prev" style="background:var(--bg)">∅</div>Plain</button>
      </div>
      <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px">
        <button id="regen" ${bg.kind === 'generated' ? '' : 'disabled'}>🎲 Generate a new background map</button>
        <button id="upload">⬆ Upload an image…</button>
      </div>
      <div class="slider-row"><span>Darken</span><input type="range" id="dim" min="0" max="0.85" step="0.01" value="${bg.dim}"><span id="dimv">${Math.round(bg.dim * 100)}%</span></div>
      <div class="slider-row"><span>Soft focus</span><input type="range" id="blur" min="0" max="12" step="1" value="${bg.blur}"><span id="blurv">${bg.blur}px</span></div>
    </section>

    <section class="appearance-section">
      <h2>Reading</h2>
      <div class="slider-row"><span>Text size</span><input type="range" id="fs" min="13" max="21" value="${p.fontSize}"><span id="fsv">${p.fontSize}px</span></div>
      <label class="check"><input type="checkbox" id="er" ${p.easyRead ? 'checked' : ''}> Easy-read font (Atkinson Hyperlegible)</label>
    </section>`;

  const $m = s => main.querySelector(s);
  // previews
  assetGet('bg:generated').then(a => { if (a?.url) $m('#genprev').style.background = `url('${a.url}')`, $m('#genprev').textContent = ''; });
  assetGet('bg:upload').then(a => { if (a) { $m('#upprev').style.background = `url('${a}')`; $m('#upprev').textContent = ''; } });

  const rerender = () => render(main);
  main.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => {
    const before = getPrefs();
    setPrefs({ theme: b.dataset.theme });
    rerender();
    if (before.bg.kind === 'generated' && THEMES[before.theme]?.mapStyle !== THEMES[b.dataset.theme]?.mapStyle) { toast('Repainting the background…'); await applyBackground(W()); rerender(); }
  });
  $m('#torn').onchange = e => { setPrefs({ torn: e.target.checked }); rerender(); };
  $m('#tear').oninput = e => { setPrefs({ tear: +e.target.value }); $m('#tearv').textContent = Math.round(e.target.value * 100) + '%'; };
  $m('#op').oninput = e => { setPrefs({ panelOpacity: +e.target.value }); $m('#opv').textContent = Math.round(e.target.value * 100) + '%'; };
  $m('#dim').oninput = e => { setPrefs({ bg: { dim: +e.target.value } }); $m('#dimv').textContent = Math.round(e.target.value * 100) + '%'; };
  $m('#blur').oninput = e => { setPrefs({ bg: { blur: +e.target.value } }); $m('#blurv').textContent = e.target.value + 'px'; applyBackground(W()); };
  $m('#fs').oninput = e => { setPrefs({ fontSize: +e.target.value }); $m('#fsv').textContent = e.target.value + 'px'; };
  $m('#er').onchange = e => setPrefs({ easyRead: e.target.checked });

  const upload = async () => {
    const f = await pickFile('image/*'); if (!f) return;
    try {
      const img = await imageToDataURL(f, 2400);
      await assetPut('bg:upload', img.src);
      setPrefs({ bg: { kind: 'upload' } });
      await applyBackground(W()); rerender();
    } catch { toast('Could not read that image'); }
  };
  $m('#upload').onclick = upload;
  $m('#regen').onclick = async () => {
    setPrefs({ bg: { kind: 'generated', seed: randomSeed() } });
    toast('Drawing a new world…');
    await applyBackground(W()); rerender();
  };
  $m('#bgs').addEventListener('click', async e => {
    const b = e.target.closest('[data-kind]'); if (!b) return;
    const kind = b.dataset.kind;
    if (kind === 'upload' && !(await assetGet('bg:upload'))) return upload();
    setPrefs({ bg: { kind, preset: b.dataset.preset || getPrefs().bg.preset, mapId: b.dataset.map || getPrefs().bg.mapId } });
    main.querySelectorAll('.bg-card').forEach(x => x.classList.toggle('on', x === b));
    $m('#regen').disabled = kind !== 'generated';
    await applyBackground(W());
    if (kind === 'generated') rerender();
  });
}
