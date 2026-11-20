// Milestone backups: deliberate, named copies of a world you can restore later.
// Where they go: your GitHub repo (if your server has one connected) → your server → this device.
import { state, save } from './store.js';
import { assetGet, assetPut } from './db.js';
import { worldAssetIds } from './assets.js';
import { connected, getCloud, pushWorld, health, fetchFile } from './cloud.js';

const b64u = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b); });
const msId = (w, name) => `${Date.now()}__${w.entries.length}__${b64u(name.slice(0, 80))}`;

let whereCache = null;
export async function where() {
  if (!connected()) return 'device';
  if (whereCache) return whereCache;
  try { const h = await health(getCloud().url); whereCache = h.milestones || 'server'; } catch { whereCache = 'server'; }
  return whereCache;
}
export const WHERE_LABEL = { github: 'your GitHub repo', server: 'your Cloudflare server', device: 'this device' };

async function api(path, opts = {}) {
  const c = getCloud();
  const res = await fetch(c.url + path, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + c.token } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server error ${res.status}`); }
  return res;
}

// ---- create ----
export async function createMilestone(w, name) {
  const dest = await where();
  const id = msId(w, name);
  const json = JSON.stringify(w);
  if (dest === 'device') {
    const list = (await assetGet('ms:' + w.id)) || [];
    list.unshift({ id, at: Date.now(), name, entries: w.entries.length, size: json.length, json });
    await assetPut('ms:' + w.id, list);
    return dest;
  }
  await pushWorld(w).catch(() => {});                      // make sure the server has the current save & pictures
  if (dest === 'github') {                                 // a GitHub backup should hold its own copy of the pictures
    const have = new Set(await (await api('/api/milestone-assets')).json());
    for (const aid of worldAssetIds(w)) {
      if (have.has(aid)) continue;
      const blob = await assetGet('img:' + aid); if (!blob) continue;
      await api('/api/milestone-assets/' + aid, { method: 'PUT', body: await blobB64(blob) });
    }
  }
  await api(`/api/milestones/${w.id}/${encodeURIComponent(id)}`, { method: 'PUT', body: await blobB64(new Blob([json])) });
  return dest;
}

// ---- list / restore / delete ----
export async function listMilestones(worldId) {
  const dest = await where();
  if (dest === 'device') return ((await assetGet('ms:' + worldId)) || []).map(({ json, ...m }) => ({ ...m, where: 'device' }));
  return (await api('/api/milestones/' + worldId)).json();
}
async function loadMilestone(worldId, m) {
  if (m.where === 'device') return JSON.parse(((await assetGet('ms:' + worldId)) || []).find(x => x.id === m.id).json);
  return (await api(`/api/milestones/${worldId}/${encodeURIComponent(m.id)}`)).json();
}
export async function restoreMilestone(w, m) {
  const data = await loadMilestone(w.id, m);
  // keep today's version too, so a restore can be undone
  await createMilestone(w, `Before restoring “${m.name}”`);
  // make sure every picture the old version used is available here
  for (const aid of worldAssetIds(data)) {
    if (await assetGet('img:' + aid)) continue;
    let blob = connected() ? await fetchFile(aid, 'img:').catch(() => null) : null;
    if (!blob && m.where === 'github') { const r = await api('/api/milestone-assets/' + aid).catch(() => null); if (r) { blob = await r.blob(); await assetPut('img:' + aid, blob); } }
  }
  for (const k of Object.keys(w)) if (k !== 'id') delete w[k];
  Object.assign(w, data, { id: w.id, updated: Date.now() });
  save();
  if (connected()) await pushWorld(w).catch(() => {});      // send the restored version to your other devices right away
}
export async function deleteMilestone(worldId, m) {
  if (m.where === 'device') {
    const list = ((await assetGet('ms:' + worldId)) || []).filter(x => x.id !== m.id);
    await assetPut('ms:' + worldId, list);
    return;
  }
  await api(`/api/milestones/${worldId}/${encodeURIComponent(m.id)}`, { method: 'DELETE' });
}
export function resetWhere() { whereCache = null; }
window.addEventListener('lf-auth', resetWhere);
