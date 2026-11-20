import { dbAll, dbPut, dbDel, assetGet, assetPut } from './db.js';

export const TYPES = {
  character: { label: 'Character', plural: 'Characters', icon: '🧙', color: 'var(--c-character)', hex: '#e07a5f',
    fields: ['Race', 'Role', 'Age', 'Alignment', 'Status'] },
  location: { label: 'Location', plural: 'Locations', icon: '🏰', color: 'var(--c-location)', hex: '#5fa8d3',
    fields: ['Kind', 'Population', 'Ruler', 'Climate'] },
  faction: { label: 'Faction', plural: 'Factions', icon: '⚜️', color: 'var(--c-faction)', hex: '#c77dff',
    fields: ['Leader', 'Headquarters', 'Goals', 'Size'] },
  item: { label: 'Item', plural: 'Items', icon: '🗡️', color: 'var(--c-item)', hex: '#e9c46a',
    fields: ['Rarity', 'Owner', 'Properties'] },
  creature: { label: 'Creature', plural: 'Creatures', icon: '🐉', color: 'var(--c-creature)', hex: '#81b29a',
    fields: ['Habitat', 'Danger', 'Size'] },
  lore: { label: 'Lore', plural: 'Lore', icon: '📖', color: 'var(--c-lore)', hex: '#a5a5c7',
    fields: ['Category', 'Origin'] },
  cosmos: { label: 'Cosmos', plural: 'Cosmos', icon: '🪐', color: 'var(--c-cosmos)', hex: '#6f8cf0',
    fields: ['Kind', 'Inhabitants', 'Ruler', 'Reached by'] },
};

export const state = { world: null, worlds: [] };
// other modules (cloud sync) can listen for saves and deletions
export const hooks = { afterSave: [], afterDelete: [] };

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

let saveTimer;
export function save() {
  if (!state.world) return;
  state.world.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => dbPut(state.world).then(() => hooks.afterSave.forEach(f => f(state.world))).catch(e => console.error('Save failed', e)), 250);
}

// ---------- automatic snapshots (kept in this browser, newest first) ----------
let lastSnapCheck = Date.now();
const SNAP_EVERY = 30 * 60e3, SNAP_KEEP = 6;
export async function snapshot(force = false) {
  const w = state.world; if (!w) return;
  const key = 'snap:' + w.id;
  const list = (await assetGet(key)) || [];
  if (!force && list[0] && Date.now() - list[0].t < SNAP_EVERY) return;
  list.unshift({ t: Date.now(), json: JSON.stringify(w), counts: { entries: w.entries.length, maps: w.maps.length, sessions: w.sessions.length, quests: (w.quests || []).length } });
  while (list.length > SNAP_KEEP) list.pop();
  await assetPut(key, list);
}
export const listSnapshots = async id => (await assetGet('snap:' + id)) || [];
export async function restoreSnapshot(t) {
  const w = state.world;
  const s = (await listSnapshots(w.id)).find(x => x.t === t);
  if (!s) return false;
  await snapshot(true); // keep the current state too, in case
  const data = normalizeWorld(JSON.parse(s.json));
  data.id = w.id;
  for (const k of Object.keys(w)) delete w[k];
  Object.assign(w, data);
  await saveNow();
  return true;
}
export function saveNow() {
  clearTimeout(saveTimer);
  return state.world ? dbPut(state.world) : Promise.resolve();
}

export async function loadWorlds() {
  state.worlds = (await dbAll()) || [];
  state.worlds.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return state.worlds;
}

export function normalizeWorld(w) {
  const base = blankWorld(w.name || 'Untitled world');
  const out = Object.assign(base, w);
  for (const k of ['entries', 'maps', 'relations', 'events', 'arcs', 'sessions', 'journals', 'quests', 'tables', 'library', 'party']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  out.calendar = Object.assign(blankWorld('').calendar, w.calendar || {});
  out.settings = Object.assign(blankWorld('').settings, w.settings || {});
  out.combat = Object.assign({ round: 1, turn: 0, list: [] }, w.combat || {});
  out.cosmos = { bodies: [], links: [], ...(w.cosmos || {}) };
  if (!Array.isArray(out.cosmos.bodies)) out.cosmos.bodies = [];
  if (!Array.isArray(out.cosmos.links)) out.cosmos.links = [];
  if (!out.hierV) { migrateHierarchy(out); out.hierV = 1; }
  return out;
}

// One-time upgrade: places linked by "part of" / "located in" become real sub-places (entry.parentId),
// and every place remembers the map it sits on (entry.mapId), so the World Web can nest them.
function migrateHierarchy(w) {
  const byId = Object.fromEntries(w.entries.map(e => [e.id, e]));
  const PART = new Set(['part of', 'located in', 'lies in', 'inside', 'within', 'district of', 'province of', 'town in', 'city in', 'region of']);
  for (const r of w.relations) {
    const a = byId[r.from], b = byId[r.to], lab = (r.label || '').trim().toLowerCase();
    if (!a || !b || a === b) continue;
    if (PART.has(lab) && !a.parentId && a.type !== 'character') a.parentId = b.id;
    if (lab === 'rules from' && !b.parentId && b.type === 'location') b.parentId = a.id;
  }
  for (const m of w.maps) for (const p of m.pins || []) { const e = byId[p.entryId]; if (e && !e.mapId) e.mapId = m.id; }
  for (const e of w.entries) {
    const mm = /^A realm of (.+)\.$/.exec(e.summary || '');
    if (mm && !e.mapId) { const m = w.maps.find(x => x.name === mm[1]); if (m) e.mapId = m.id; }
  }
}

export function blankWorld(name) {
  return {
    id: uid(), name, description: '', created: Date.now(), updated: Date.now(),
    entries: [], maps: [], relations: [], events: [], arcs: [], sessions: [], journals: [], quests: [], tables: [], library: [], party: [],
    combat: { round: 1, turn: 0, list: [] },
    calendar: {
      months: [
        { name: 'Frostwane', days: 30 }, { name: 'Thawmoon', days: 30 }, { name: 'Seedtide', days: 30 },
        { name: 'Bloomrise', days: 30 }, { name: 'Highsun', days: 30 }, { name: 'Emberfall', days: 30 },
        { name: 'Goldleaf', days: 30 }, { name: 'Harvestend', days: 30 }, { name: 'Mistveil', days: 30 },
        { name: 'Duskmarch', days: 30 }, { name: 'Longnight', days: 30 }, { name: 'Deepwinter', days: 30 },
      ],
      weekdays: ['Sunday', 'Moonday', 'Tideday', 'Windsday', 'Thunderday', 'Fireday', 'Starday'],
      eras: [{ name: 'Age of Embers', abbr: 'AE', start: 1 }],
      current: { year: 1, month: 0, day: 1 },
    },
    settings: { speeds: { foot: 24, horse: 40, wagon: 16, ship: 72 } },
  };
}

export async function createWorld(name, data) {
  const w = data ? normalizeWorld({ ...data, id: uid(), name: name || data.name }) : blankWorld(name);
  await dbPut(w);
  state.worlds.unshift(w);
  hooks.afterSave.forEach(f => f(w));
  return w;
}

// replace or add a whole world record (used by cloud sync), keeping the open world object in place
export async function putWorldRecord(data) {
  const w = normalizeWorld(data);
  const i = state.worlds.findIndex(x => x.id === w.id);
  if (i >= 0) {
    const target = state.worlds[i];
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, w);
    await dbPut(target);
    return target;
  }
  await dbPut(w);
  state.worlds.push(w);
  return w;
}

export async function deleteWorld(id) {
  await dbDel(id);
  state.worlds = state.worlds.filter(w => w.id !== id);
  hooks.afterDelete.forEach(f => f(id));
  if (state.world && state.world.id === id) state.world = null;
}

export function openWorld(id) {
  const i = state.worlds.findIndex(w => w.id === id);
  if (i >= 0) {
    state.world = state.worlds[i] = normalizeWorld(state.worlds[i]);
    localStorage.setItem('loreforge:last', id);
  }
  return state.world;
}

// ---------- Entry helpers ----------
export const W = () => state.world;
export const getEntry = id => W()?.entries.find(e => e.id === id);
export const getMap = id => W()?.maps.find(m => m.id === id);
export const getSession = id => W()?.sessions.find(s => s.id === id);
export const getJournal = id => W()?.journals.find(j => j.id === id);
export const getArc = id => W()?.arcs.find(a => a.id === id);
export const getQuest = id => W()?.quests.find(q => q.id === id);
export const getDoc = id => W()?.library.find(d => d.id === id);

export function newEntry(type = 'character', name = 'New entry') {
  const e = { id: uid(), type, name, summary: '', body: '', secret: '', tags: [], image: '', fields: [], created: Date.now(), updated: Date.now() };
  e.fields = (TYPES[type]?.fields || []).map(k => ({ k, v: '' }));
  W().entries.push(e);
  save();
  return e;
}

export function deleteEntry(id) {
  const w = W();
  w.entries = w.entries.filter(e => e.id !== id);
  w.relations = w.relations.filter(r => r.from !== id && r.to !== id);
  for (const m of w.maps) for (const p of m.pins) if (p.entryId === id) p.entryId = '';
  save();
}

export const MENTION_RE = /@\[([^\]]+)\]\(([a-z0-9]+)\)/g;

export function mentionsIn(text) {
  const ids = new Set();
  if (!text) return ids;
  for (const m of text.matchAll(MENTION_RE)) ids.add(m[2]);
  return ids;
}

// Everything that mentions entry `id`: entries, sessions, journals, events
export function backlinks(id) {
  const w = W();
  const out = [];
  for (const e of w.entries) if (e.id !== id && mentionsIn(e.body + ' ' + e.summary + ' ' + e.secret).has(id)) out.push({ kind: 'entry', item: e });
  for (const s of w.sessions) if (mentionsIn(s.notes + ' ' + s.beats.map(b => b.text).join(' ')).has(id)) out.push({ kind: 'session', item: s });
  for (const j of w.journals) if (mentionsIn(j.body).has(id)) out.push({ kind: 'journal', item: j });
  for (const q of w.quests) if (mentionsIn([q.giver, q.summary, q.desc, ...q.objectives.map(o => o.text)].join(' ')).has(id)) out.push({ kind: 'quest', item: q });
  for (const ev of w.events) if (mentionsIn(ev.desc).has(id) || (ev.entryIds || []).includes(id)) out.push({ kind: 'event', item: ev });
  for (const m of w.maps) for (const sh of m.shots || []) if (mentionsIn((sh.caption || '') + ' ' + sh.name).has(id)) out.push({ kind: 'shot', item: { ...sh, mapId: m.id, mapName: m.name } });
  return out;
}

// ---------- Calendar helpers ----------
export function dateKey(d) {
  if (!d) return 0;
  return (+d.year || 0) * 100000 + (+d.month || 0) * 1000 + (+d.day || 0);
}
export function eraFor(year) {
  const eras = [...W().calendar.eras].sort((a, b) => a.start - b.start);
  let era = null;
  for (const e of eras) if (year >= e.start) era = e;
  return era;
}
export function formatDate(d, withWeekday = false) {
  if (!d || d.year === '' || d.year == null) return '';
  const cal = W().calendar;
  const era = eraFor(+d.year);
  const yr = era ? `${+d.year - era.start + 1} ${era.abbr || era.name}` : `Year ${d.year}`;
  const month = cal.months[+d.month]?.name || '';
  let s = `${d.day || ''} ${month}, ${yr}`.trim();
  if (withWeekday && cal.weekdays.length) s = `${cal.weekdays[dayIndex(d) % cal.weekdays.length]}, ${s}`;
  return s;
}
export function yearLength() {
  return W().calendar.months.reduce((a, m) => a + (+m.days || 0), 0) || 1;
}
export function dayIndex(d) {
  const cal = W().calendar;
  let n = (+d.year - 1) * yearLength();
  for (let i = 0; i < +d.month; i++) n += +cal.months[i]?.days || 0;
  return Math.max(0, n + (+d.day || 1) - 1);
}

// ---------- Import / export ----------
export function exportWorld() {
  return JSON.stringify({ app: 'loreforge', version: 1, world: W() }, null, 1);
}
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
// full backup including Library files (PDFs, images) as embedded data
export async function exportBackup() {
  const w = W();
  const libraryFiles = {}, imageFiles = {};
  for (const d of w.library || []) { const b = await assetGet('lib:' + d.id); if (b) libraryFiles[d.id] = await blobToDataURL(b); }
  for (const ref of [...w.entries.map(e => e.image), ...w.maps.map(m => m.image)]) {
    if (typeof ref !== 'string' || !ref.startsWith('asset:') || imageFiles[ref.slice(6)]) continue;
    const b = await assetGet('img:' + ref.slice(6)); if (b) imageFiles[ref.slice(6)] = await blobToDataURL(b);
  }
  w.lastExport = Date.now();
  save();
  return JSON.stringify({ app: 'loreforge', version: 3, world: w, libraryFiles, imageFiles });
}
export async function importWorld(json) {
  const data = JSON.parse(json);
  const world = data.world || data;
  if (!world || !Array.isArray(world.entries)) throw new Error('This file does not look like a Loreforge world.');
  for (const [id, url] of Object.entries(data.libraryFiles || {})) {
    try { await assetPut('lib:' + id, await (await fetch(url)).blob()); } catch (e) { console.error('Library file import failed', e); }
  }
  for (const [id, url] of Object.entries(data.imageFiles || {})) {
    try { await assetPut('img:' + id, await (await fetch(url)).blob()); } catch (e) { console.error('Picture import failed', e); }
  }
  return createWorld(world.name + (state.worlds.some(w => w.name === world.name) ? ' (imported)' : ''), world);
}
