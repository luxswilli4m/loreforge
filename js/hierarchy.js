// Places inside places, and what kind of relationship a connection is.
// A place's parent is set by hand (entry.parentId) or worked out from the map it sits on:
// a map attached to a planet in the Cosmos, opened from a town's pin, or marked "This map shows…".
import { W, getEntry, getMap } from './store.js';

// ---------- relationship kinds (colours in the World Web) ----------
export const REL_KINDS = {
  hostile: { label: 'Hostile', color: '#e5484d', words: ['hunt', 'enemy', 'enemies', 'rival', 'hate', 'kill', 'murder', 'betray', 'war', 'fight', 'nemesis', 'attack', 'oppose', 'curse', 'feud', 'threat', 'hostile', 'vengeance', 'revenge', 'stalk', 'prey', 'captor', 'imprison', 'wants dead', 'despise'] },
  love: { label: 'Love', color: '#f06aa6', words: ['love', 'lover', 'married', 'spouse', 'wife', 'husband', 'betrothed', 'engaged', 'crush', 'romance', 'romantic', 'sweetheart', 'courting', 'beloved', 'affair', 'partner of'] },
  family: { label: 'Family', color: '#f2a93b', words: ['parent', 'child', 'son', 'daughter', 'mother', 'father', 'sibling', 'brother', 'sister', 'cousin', 'ancestor', 'descendant', 'heir', 'uncle', 'aunt', 'niece', 'nephew', 'grand', 'twin', 'family', 'kin', 'adopted', 'ward of'] },
  friend: { label: 'Friendly', color: '#4cc38a', words: ['ally', 'allied', 'friend', 'mentor', 'student', 'apprentice', 'protect', 'trust', 'companion', 'trades with', 'owes', 'helps', 'saved', 'loyal', 'admire'] },
  power: { label: 'Power', color: '#b58cf0', words: ['member', 'leader', 'leads', 'rules', 'ruler', 'serves', 'servant', 'works for', 'employ', 'command', 'founded', 'founder', 'worship', 'commands', 'vassal', 'sworn', 'agent', 'spy', 'reports to', 'controls'] },
  place: { label: 'Place', color: '#5fa8d3', words: ['lives in', 'located', 'part of', 'born in', 'from', 'visits', 'guards', 'rules from', 'home', 'based in', 'stationed', 'buried', 'hides in', 'travels'] },
  thing: { label: 'Owns & made', color: '#3fc1c9', words: ['owns', 'owned', 'wields', 'carries', 'created', 'made', 'forged', 'crafted', 'holds', 'stole', 'seeks', 'guards the'] },
  other: { label: 'Other', color: '#d4a24c', words: [] },
};
export function relKind(r) {
  if (r.kind && REL_KINDS[r.kind]) return r.kind;
  const lab = (r.label || '').toLowerCase();
  if (!lab) return 'other';
  for (const [k, v] of Object.entries(REL_KINDS)) if (v.words.some(wd => lab.includes(wd))) return k;
  return 'other';
}
export const relColor = r => REL_KINDS[relKind(r)].color;

// ---------- family tree reading ----------
// returns { parent, child } ids, or { spouse:[a,b] }, or { sibling:[a,b] } for a family-ish relationship
export function familyLink(r) {
  const lab = (r.label || '').toLowerCase();
  if (/\b(parent|mother|father|mum|mom|dad)\b/.test(lab) && /\bof\b/.test(lab) || /^(parent|mother|father) to/.test(lab)) return { parent: r.from, child: r.to };
  if (/\b(child|son|daughter|heir|adopted)\b/.test(lab)) return { parent: r.to, child: r.from };
  if (/\b(married|spouse|wife|husband|betrothed|consort|partner)\b/.test(lab)) return { spouse: [r.from, r.to] };
  if (/\b(sibling|brother|sister|twin)\b/.test(lab)) return { sibling: [r.from, r.to] };
  return null;
}

// ---------- places inside places ----------
// the entry a map depicts (if any)
export function placeOfMap(mapId) {
  if (!mapId) return '';
  const w = W(), m = getMap(mapId);
  if (m?.placeId && getEntry(m.placeId)) return m.placeId;
  for (const b of w.cosmos?.bodies || []) if (b.entryId && (b.mapIds || []).includes(mapId) && getEntry(b.entryId)) return b.entryId;
  for (const mm of w.maps) for (const p of mm.pins || []) if (p.submapId === mapId && p.entryId && getEntry(p.entryId)) return p.entryId;
  return '';
}
function rawParent(e) {
  if (e.parentId && getEntry(e.parentId)) return e.parentId;
  if (e.type === 'character' || !e.mapId) return '';
  const p = placeOfMap(e.mapId);
  return p && p !== e.id ? p : '';
}
// parent id, guarded against loops
export function parentOf(e) {
  const p = rawParent(e);
  if (!p) return '';
  let cur = p;
  for (let i = 0; i < 60 && cur; i++) { if (cur === e.id) return ''; const ce = getEntry(cur); cur = ce ? rawParent(ce) : ''; }
  return p;
}
export function childrenOf(id) { return W().entries.filter(e => parentOf(e) === id); }
export function ancestorsOf(e) {
  const out = [];
  let p = parentOf(e);
  while (p && out.length < 30) { const pe = getEntry(p); if (!pe || out.includes(pe)) break; out.unshift(pe); p = parentOf(pe); }
  return out;
}
export function isDescendant(id, ofId) {
  let e = getEntry(id);
  for (let i = 0; i < 60 && e; i++) { const p = parentOf(e); if (!p) return false; if (p === ofId) return true; e = getEntry(p); }
  return false;
}

// maps that show this entry: its own maps first, then maps it is pinned on
export function mapsFor(e) {
  const w = W(), own = [], on = [];
  for (const b of w.cosmos?.bodies || []) if (b.entryId === e.id) for (const id of b.mapIds || []) own.push(id);
  for (const m of w.maps) {
    if (m.placeId === e.id) own.push(m.id);
    for (const p of m.pins || []) if (p.entryId === e.id) { if (p.submapId) own.push(p.submapId); on.push({ mapId: m.id, pinId: p.id }); }
  }
  const ownU = [...new Set(own)].filter(id => getMap(id));
  if (!on.length && e.mapId && getMap(e.mapId)) on.push({ mapId: e.mapId });
  return { own: ownU, on };
}
// where double-clicking a place should go
export function mapHref(e) {
  const { own, on } = mapsFor(e);
  if (own.length) return `#/map/${own[0]}`;
  if (on.length) return `#/map/${on[0].mapId}${on[0].pinId ? `?pin=${on[0].pinId}` : ''}`;
  return '';
}

// chips to pick a relationship kind ('' = work it out from the words)
export function relKindPicker(sel = '') {
  return `<div class="rk-pick"><button type="button" class="chip ${!sel ? 'on' : ''}" data-rk="">✨ Auto</button>${Object.entries(REL_KINDS).map(([k, v]) =>
    `<button type="button" class="chip ${sel === k ? 'on' : ''}" data-rk="${k}" style="--tc:${v.color}"><span class="rk-dot" style="background:${v.color}"></span>${v.label}</button>`).join('')}</div>`;
}
export function wireRelKindPicker(root, onPick) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-rk]'); if (!b || !root.contains(b)) return;
    root.querySelectorAll('[data-rk]').forEach(x => x.classList.toggle('on', x === b));
    onPick(b.dataset.rk);
  });
}
