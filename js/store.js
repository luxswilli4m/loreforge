import { dbAll, dbPut, dbDel } from './db.js';

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
};

export const state = { world: null, worlds: [] };

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

let saveTimer;
export function save() {
  if (!state.world) return;
  state.world.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => dbPut(state.world).catch(e => console.error('Save failed', e)), 250);
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
  for (const k of ['entries', 'maps', 'relations', 'events', 'arcs', 'sessions', 'journals']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  out.calendar = Object.assign(blankWorld('').calendar, w.calendar || {});
  out.settings = Object.assign(blankWorld('').settings, w.settings || {});
  return out;
}

export function blankWorld(name) {
  return {
    id: uid(), name, description: '', created: Date.now(), updated: Date.now(),
    entries: [], maps: [], relations: [], events: [], arcs: [], sessions: [], journals: [],
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
  return w;
}

export async function deleteWorld(id) {
  await dbDel(id);
  state.worlds = state.worlds.filter(w => w.id !== id);
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
  for (const ev of w.events) if (mentionsIn(ev.desc).has(id) || (ev.entryIds || []).includes(id)) out.push({ kind: 'event', item: ev });
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
export async function importWorld(json) {
  const data = JSON.parse(json);
  const world = data.world || data;
  if (!world || !Array.isArray(world.entries)) throw new Error('This file does not look like a Loreforge world.');
  return createWorld(world.name + (state.worlds.some(w => w.name === world.name) ? ' (imported)' : ''), world);
}
