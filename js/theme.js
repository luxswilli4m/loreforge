// Appearance: theme "vibes", torn-paper panels, and backgrounds (generated world map by default).
import { assetGet, assetPut } from './db.js';
import { rng, makeNoise, randomSeed, ensureFonts } from './gen/core.js';

export const THEMES = {
  tavern: { label: 'Tavern', desc: 'Candlelit dark wood & gold', swatch: ['#1d1a24', '#d4a24c', '#ebe5d8'], mapStyle: 'night' },
  parchment: { label: 'Parchment', desc: 'Inked pages on old paper', swatch: ['#efe6d2', '#9a6b12', '#2b2520'], mapStyle: 'parchment' },
  arcane: { label: 'Arcane', desc: 'Starlit blues & glowing runes', swatch: ['#171b33', '#7cc4ff', '#e4e6f5'], mapStyle: 'night' },
  verdant: { label: 'Verdant', desc: 'Mossy forest & druid green', swatch: ['#17221b', '#9ccf6b', '#e6efe3'], mapStyle: 'atlas' },
  ember: { label: 'Ember', desc: 'Forge-fire reds & ash', swatch: ['#261512', '#ff8a4c', '#f3e3d6'], mapStyle: 'night' },
};

export const PRESETS = {
  night: { label: 'Night sky', css: 'radial-gradient(ellipse at 20% 10%, #2a2350 0%, transparent 55%), radial-gradient(ellipse at 85% 90%, #3b1d3a 0%, transparent 50%), #0c0b14' },
  ember: { label: 'Ember glow', css: 'radial-gradient(ellipse at 50% 110%, #a1401c 0%, #4a160c 35%, #160807 75%)' },
  forest: { label: 'Forest mist', css: 'radial-gradient(ellipse at 30% 20%, #3c5a3e 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, #22382a 0%, transparent 60%), #0d1510' },
  sea: { label: 'Deep sea', css: 'radial-gradient(ellipse at 50% 0%, #2d6a8a 0%, #12324a 45%, #07131f 85%)' },
  desk: { label: 'Wooden desk', css: 'repeating-linear-gradient(92deg, rgba(0,0,0,.08) 0 3px, transparent 3px 22px), linear-gradient(180deg, #5b3a22, #3b2414)' },
  dusk: { label: 'Dusk', css: 'linear-gradient(160deg, #3d2a52 0%, #8a4b5e 45%, #e09a6b 100%)' },
};

const DEFAULTS = {
  theme: 'tavern', torn: true, tear: 1, panelOpacity: 0.9, fontSize: 15, easyRead: false,
  bg: { kind: 'generated', seed: '', preset: 'night', dim: 0.22, blur: 0, mapId: '' },
};

export function getPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('loreforge:prefs') || '{}'); } catch { /* ignore */ }
  if (p.light && !p.theme) p.theme = 'parchment';
  const out = { ...DEFAULTS, ...p, bg: { ...DEFAULTS.bg, ...(p.bg || {}) } };
  if (!out.bg.seed) { out.bg.seed = randomSeed(); localStorage.setItem('loreforge:prefs', JSON.stringify(out)); }
  return out;
}
export function setPrefs(patch) {
  const p = getPrefs();
  const next = { ...p, ...patch, bg: { ...p.bg, ...(patch.bg || {}) } };
  localStorage.setItem('loreforge:prefs', JSON.stringify(next));
  applyTheme();
  return next;
}

// ---------- grain texture ----------
let grainURL = null;
function grain() {
  if (grainURL) return grainURL;
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const ctx = c.getContext('2d'), img = ctx.createImageData(220, 220);
  const r = rng('grain'), n = makeNoise(r);
  for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) {
    const i = (y * 220 + x) * 4;
    const v = (r() - 0.5) * 60 + n.fbm(x / 40, y / 40, 3) * 80;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0 ? 255 : 0;
    img.data[i + 3] = Math.min(255, Math.abs(v) * 0.16);
  }
  ctx.putImageData(img, 0, 0);
  grainURL = c.toDataURL('image/png');
  return grainURL;
}

// ---------- torn edges ----------
const tornObservers = new Map();
function tornPolygon(w, h, seed, depth) {
  const r = rng(seed), n = makeNoise(r);
  const pts = [];
  const step = 6;
  const off = t => {
    const base = 1.5 + depth * (0.55 + 0.45 * n(t / 55, 0.5));
    const notch = n(t / 18, 7.3) > 0.42 ? depth * 0.9 * (n(t / 18, 7.3) - 0.42) * 4 : 0;
    return Math.min(depth * 2.4, base + notch + r() * depth * 0.35);
  };
  let t = 0;
  const c = depth * 1.6; // corners are nipped off so edges meet cleanly
  for (let x = c; x <= w - c; x += step, t += step) pts.push([x, off(t)]);
  for (let y = c; y <= h - c; y += step, t += step) pts.push([w - off(t), y]);
  for (let x = w - c; x >= c; x -= step, t += step) pts.push([x, h - off(t)]);
  for (let y = h - c; y >= c; y -= step, t += step) pts.push([off(t), y]);
  return `polygon(${pts.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`;
}
function applyTorn(enabled, depth) {
  document.querySelectorAll('.paper').forEach(el => {
    const old = tornObservers.get(el);
    if (old) { old.disconnect(); tornObservers.delete(el); }
    if (!enabled || innerWidth < 700) { el.style.clipPath = ''; return; }
    const seed = el.id || 'paper';
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) el.style.clipPath = tornPolygon(width, height, seed, 7 * depth);
    });
    ro.observe(el);
    tornObservers.set(el, ro);
  });
}

// ---------- background ----------
let bgToken = 0;
async function generatedBackground(seed, style, force = false) {
  const key = `bg:gen:${seed}:${style}`;
  if (!force) { const cached = await assetGet('bg:generated'); if (cached && cached.key === key) return cached.url; }
  const { generateWorld, renderWorld } = await import('./gen/world.js');
  await ensureFonts();
  const r = rng(seed + ':bg');
  const data = generateWorld({ seed, shape: r.pick(['continent', 'large', 'twin', 'archipelago']), land: r.range(0.38, 0.5), realms: r.int(3, 6), towns: r.int(12, 20), name: '' });
  const c = document.createElement('canvas');
  renderWorld(data, c, style, { furniture: false });
  const url = c.toDataURL('image/jpeg', 0.8);
  await assetPut('bg:generated', { key, url });
  return url;
}

export async function resolveBackground(p, world) {
  const bg = p.bg;
  if (bg.kind === 'none') return { css: 'none' };
  if (bg.kind === 'preset') return { css: PRESETS[bg.preset]?.css || PRESETS.night.css };
  if (bg.kind === 'upload') { const a = await assetGet('bg:upload'); return a ? { url: a } : { css: PRESETS.night.css }; }
  if (bg.kind === 'map') { const m = world?.maps.find(x => x.id === bg.mapId); return m ? { url: m.image } : { css: PRESETS.night.css }; }
  return { url: await generatedBackground(bg.seed, THEMES[p.theme]?.mapStyle || 'night') };
}

function setBackdrop(res, p) {
  const el = document.getElementById('backdrop');
  if (!el) return;
  const img = el.querySelector('.bd-img');
  if (res.url) { img.style.background = `center / cover no-repeat url("${res.url}")`; }
  else img.style.background = res.css === 'none' ? 'var(--bg)' : res.css;
  img.style.filter = p.bg.blur ? `blur(${p.bg.blur}px)` : '';
  img.style.inset = p.bg.blur ? `-${p.bg.blur * 2}px` : '0';
  el.querySelector('.bd-dim').style.background = `rgba(0,0,0,${p.bg.dim})`;
}

export async function applyBackground(world, force = false) {
  const p = getPrefs();
  const token = ++bgToken;
  const el = document.getElementById('backdrop');
  if (p.bg.kind === 'generated') {
    el?.classList.add('loading');
    if (force) await assetPut('bg:generated', null);
  }
  try {
    const res = await resolveBackground(p, world);
    if (token === bgToken) setBackdrop(res, p);
  } catch (e) { console.error(e); setBackdrop({ css: PRESETS.night.css }, p); }
  el?.classList.remove('loading');
}

export function applyTheme() {
  const p = getPrefs();
  const b = document.body;
  b.dataset.theme = THEMES[p.theme] ? p.theme : 'tavern';
  b.classList.toggle('easy-read', !!p.easyRead);
  b.classList.remove('light');
  document.documentElement.style.setProperty('--fs', (p.fontSize || 15) + 'px');
  document.documentElement.style.setProperty('--panel-a', p.panelOpacity);
  document.documentElement.style.setProperty('--grain', `url(${grain()})`);
  b.classList.toggle('torn', !!p.torn);
  applyTorn(p.torn, p.tear || 1);
  const dim = document.querySelector('#backdrop .bd-dim');
  if (dim) dim.style.background = `rgba(0,0,0,${p.bg.dim})`;
}
