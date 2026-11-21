// Pictures (entry art, maps) are stored as separate files instead of inside the world data.
// A world refers to them as "asset:<id>"; the files live in IndexedDB (and on your server when syncing).
import { assetGet, assetPut } from './db.js';
import { uid } from './store.js';

export const isAsset = ref => typeof ref === 'string' && ref.startsWith('asset:');
const idOf = ref => ref.slice(6);
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const cache = new Map();       // id -> object URL
let remoteFetch = null;        // set by cloud sync: async id => Blob | null
export function setRemoteFetch(fn) { remoteFetch = fn; }

export async function getBlob(ref) {
  const id = isAsset(ref) ? idOf(ref) : ref;
  let b = await assetGet('img:' + id);
  if (!b && remoteFetch) { b = await remoteFetch(id).catch(() => null); if (b) await assetPut('img:' + id, b); }
  return b || null;
}
export async function url(ref) {
  if (!ref) return '';
  if (!isAsset(ref)) return ref;
  const id = idOf(ref);
  if (cache.has(id)) return cache.get(id);
  const b = await getBlob(id);
  if (!b) return '';
  const u = URL.createObjectURL(b);
  cache.set(id, u);
  return u;
}
export async function dataURL(ref) {
  if (!isAsset(ref)) return ref || '';
  const b = await getBlob(ref);
  if (!b) return '';
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
}

// ---- HTML helpers: render now, fill the picture in as soon as it's loaded ----
export function src(ref) {
  if (!ref) return `src="${PIXEL}"`;
  if (!isAsset(ref)) return `src="${ref}"`;
  const id = idOf(ref);
  return cache.has(id) ? `src="${cache.get(id)}"` : `data-asset="${id}" src="${PIXEL}"`;
}
export function href(ref) {
  if (!isAsset(ref)) return `href="${ref || ''}"`;
  const id = idOf(ref);
  return cache.has(id) ? `href="${cache.get(id)}"` : `data-asset-href="${id}" href="${PIXEL}"`;
}
export function bg(ref) {
  if (!isAsset(ref)) return `style="background:center/cover url('${ref || ''}')"`;
  const id = idOf(ref);
  return cache.has(id) ? `style="background:center/cover url('${cache.get(id)}')"` : `data-asset-bg="${id}"`;
}
async function hydrate(root) {
  const els = root.querySelectorAll ? root.querySelectorAll('[data-asset],[data-asset-href],[data-asset-bg]') : [];
  for (const el of els) {
    const id = el.dataset.asset || el.dataset.assetHref || el.dataset.assetBg;
    const kind = el.dataset.asset ? 'src' : el.dataset.assetHref ? 'href' : 'bg';
    delete el.dataset.asset; delete el.dataset.assetHref; delete el.dataset.assetBg;
    url('asset:' + id).then(u => {
      if (!u) return;
      if (kind === 'src') el.src = u;
      else if (kind === 'href') el.setAttribute('href', u);
      else { el.style.background = `center/cover url('${u}')`; el.textContent = ''; }
    });
  }
}
export function initAssets() {
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('[data-asset],[data-asset-href],[data-asset-bg]')) hydrate(n.parentNode || n); else hydrate(n); } })
    .observe(document.body, { childList: true, subtree: true });
}

// ---- storing pictures ----
// input: File | Blob | canvas | data URL. Returns { ref, w, h }.
export async function storeImage(input, { maxDim = 0, quality = 0.85 } = {}) {
  let canvas;
  if (input instanceof HTMLCanvasElement) canvas = input;
  else {
    const img = await loadImage(input);
    const scale = maxDim ? Math.min(1, maxDim / Math.max(img.width, img.height)) : 1;
    canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality)); // older Safari can't write WebP
  const id = uid();
  await assetPut('img:' + id, blob);
  cache.set(id, URL.createObjectURL(blob));
  return { ref: 'asset:' + id, w: canvas.width, h: canvas.height, size: blob.size };
}
// any other file that belongs to a world (e.g. a map's editable terrain); synced like pictures
export async function storeBlob(blob) {
  const id = uid();
  await assetPut('img:' + id, blob);
  return 'asset:' + id;
}
function loadImage(input) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = typeof input === 'string' ? input : URL.createObjectURL(input);
  });
}

// every picture a world uses
export function worldAssetIds(w) {
  const ids = new Set();
  for (const e of w.entries || []) if (isAsset(e.image)) ids.add(idOf(e.image));
  for (const m of w.maps || []) {
    if (isAsset(m.image)) ids.add(idOf(m.image));
    if (isAsset(m.gen?.edit)) ids.add(idOf(m.gen.edit));
    for (const sh of m.shots || []) if (isAsset(sh.image)) ids.add(idOf(sh.image));
  }
  for (const a of w.assets || []) if (isAsset(a.trace)) ids.add(idOf(a.trace));
  return [...ids];
}

// older worlds kept pictures inside the data — move big ones out (small vector maps stay as they are)
export async function migrateWorld(w) {
  let changed = false;
  const big = s => typeof s === 'string' && s.startsWith('data:') && s.length > 60000;
  for (const e of w.entries || []) if (big(e.image)) { try { e.image = (await storeImage(e.image)).ref; changed = true; } catch { /* keep as is */ } }
  for (const m of w.maps || []) if (big(m.image)) { try { m.image = (await storeImage(m.image, { quality: 0.88 })).ref; changed = true; } catch { /* keep */ } }
  return changed;
}
