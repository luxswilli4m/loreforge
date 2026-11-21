// Scene art: framed illustrations of the town scenes at different times of day,
// to download or use as the picture for a place in your world.
import { W, save } from '../store.js';
import { esc, toast, openModal, closeModal } from '../util.js';
import * as A from '../assets.js';
import { CARDS, artCard } from '../gen/artCards.js';

const thumbs = {};
export function render(main) {
  main.innerHTML = `
    <div class="page-head"><h1>Scene art</h1><span class="muted small">Painted scenes for your places, at dawn, midday, dusk and night. Open one to download it or use it as an entry’s picture.</span></div>
    <div class="ac-grid" id="ac-grid">${CARDS.map(c => `<button class="ac-card" data-id="${c.id}" title="${esc(c.title)} — ${esc(c.sub)}"><img alt="" ${thumbs[c.id] ? `src="${thumbs[c.id]}"` : ''}><span><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></span></button>`).join('')}</div>`;
  const grid = main.querySelector('#ac-grid');
  let alive = true;
  // paint the thumbnails one at a time, so the page stays responsive
  (async () => {
    for (const c of CARDS) {
      if (!alive) return;
      if (!thumbs[c.id]) { await new Promise(r => setTimeout(r, 0)); thumbs[c.id] = artCard(c.id, { width: 800, height: 500 }).toDataURL('image/jpeg', 0.86); }
      const img = grid.querySelector(`[data-id="${c.id}"] img`); if (img) img.src = thumbs[c.id];
    }
  })();
  grid.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openCard(b.dataset.id); });
  return () => { alive = false; };
}

function openCard(id) {
  const c = CARDS.find(x => x.id === id), cv = artCard(id, { width: 1600, height: 1000 });
  const places = W().entries.filter(e => e.type === 'location').sort((a, b) => a.name.localeCompare(b.name));
  const others = W().entries.filter(e => e.type !== 'location').sort((a, b) => a.name.localeCompare(b.name));
  openModal(`<div class="ac-big"><img id="ac-img" alt=""></div>
    <div class="row" style="gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
      <b style="font-family:var(--display)">${esc(c.title)} · ${esc(c.sub)}</b><span style="flex:1"></span>
      <select id="ac-entry" style="width:auto;max-width:260px"><option value="">Use as the picture for…</option>${places.length ? `<optgroup label="Places">${places.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>` : ''}${others.length ? `<optgroup label="Everything else">${others.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>` : ''}</select>
      <button id="ac-use">🖼️ Use</button><button id="ac-dl" class="primary">⬇ Download</button><button data-a="close">Close</button>
    </div>`, m => {
    m.classList.add('modal-wide'); m.style.width = 'min(1280px, 96vw)';
    m.querySelector('#ac-img').src = cv.toDataURL('image/jpeg', 0.92);
    m.addEventListener('click', async e => {
      if (e.target.dataset.a === 'close') closeModal();
      if (e.target.id === 'ac-dl') cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${c.title} - ${c.sub}.png`.replace(/[^\w .-]+/g, ''); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
      if (e.target.id === 'ac-use') {
        const en = W().entries.find(x => x.id === m.querySelector('#ac-entry').value); if (!en) { toast('Pick an entry first'); return; }
        en.image = (await A.storeImage(cv, { quality: 0.88 })).ref; en.updated = Date.now(); save(); toast(`Now the picture for ${en.name}`); closeModal();
      }
    });
  });
}
