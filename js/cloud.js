// Cloud sync with a personal Loreforge server (a Cloudflare Worker): accounts, worlds, library files, AI.
import { state, hooks, putWorldRecord, uid } from './store.js';
import { assetGet, assetPut } from './db.js';

const KEY = 'loreforge:cloud';
const SYNC_KEY = 'loreforge:syncstate';
const PUSH_EVERY = 45e3;   // at most one upload per world every 45 s while editing (keeps within free limits)
const PULL_EVERY = 60e3;

export function getCloud() { try { return { url: '', token: '', username: '', auto: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { url: '', token: '', username: '', auto: true }; } }
export function setCloud(patch) { const c = { ...getCloud(), ...patch }; localStorage.setItem(KEY, JSON.stringify(c)); emit(); return c; }
export const connected = () => { const c = getCloud(); return !!(c.url && c.token); };
const syncState = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); } catch { return {}; } };
const setBase = (id, v) => { const s = syncState(); if (v == null) delete s[id]; else s[id] = v; localStorage.setItem(SYNC_KEY, JSON.stringify(s)); };
export const baseOf = id => syncState()[id];

// ---------- status ----------
export const status = { state: 'off', at: 0, msg: '' };
function emit(patch) { if (patch) Object.assign(status, patch); window.dispatchEvent(new CustomEvent('lf-sync', { detail: status })); }

// ---------- api ----------
export const normUrl = u => String(u || '').trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');
async function api(path, opts = {}, cfg = getCloud()) {
  let res;
  try {
    res = await fetch(cfg.url + path, { ...opts, headers: { ...(opts.headers || {}), ...(cfg.token ? { authorization: 'Bearer ' + cfg.token } : {}) } });
  } catch {
    emit({ state: 'offline', msg: 'Can’t reach your server — working offline. Changes will sync later.' });
    throw new Error('Can’t reach the server. Check the address and your internet connection.');
  }
  if (res.status === 401 && cfg.token) { setCloud({ token: '' }); emit({ state: 'off', msg: 'Signed out — please sign in again.' }); }
  return res;
}
async function apiJSON(path, opts, cfg) {
  const res = await api(path, opts, cfg);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Server error ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

export async function health(url) {
  const res = await fetch(normUrl(url) + '/api/health').catch(() => null);
  if (!res) throw new Error('Couldn’t reach that address. Check it’s your Worker’s URL (it ends in .workers.dev).');
  const data = await res.json().catch(() => null);
  if (!data || data.app !== 'loreforge') throw new Error('That address answered, but it isn’t a Loreforge server.');
  return data;
}
export async function signIn(url, username, password, register = false, invite = '') {
  const cfg = { url: normUrl(url), token: '' };
  const data = await apiJSON(register ? '/api/register' : '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, invite }) }, cfg);
  localStorage.removeItem(SYNC_KEY);
  setCloud({ url: cfg.url, token: data.token, username: data.username });
  emit({ state: 'idle', msg: 'Signed in' });
  return data;
}
export async function resetPassword(url, username, recoveryKey, newPassword, adminCode = '') {
  const cfg = { url: normUrl(url), token: '' };
  const data = await apiJSON('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, recoveryKey, adminCode, newPassword }) }, cfg);
  localStorage.removeItem(SYNC_KEY);
  setCloud({ url: cfg.url, token: data.token, username: data.username });
  emit({ state: 'idle', msg: 'Password reset' });
  return data;
}
const post = (path, body) => apiJSON(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
export const me = () => apiJSON('/api/me');
export async function changePassword(current, newPassword) { const d = await post('/api/account/password', { current, newPassword }); setCloud({ token: d.token }); return d; }
export const newRecoveryKey = password => post('/api/account/recovery', { password });
export async function signOutEverywhere() { const d = await post('/api/account/signout-all', {}); setCloud({ token: d.token }); return d; }
export function signOut() { setCloud({ token: '' }); localStorage.removeItem(SYNC_KEY); emit({ state: 'off', msg: '' }); }

// ---------- worlds ----------
export const listCloud = () => apiJSON('/api/worlds');
async function download(id) {
  const res = await api('/api/worlds/' + id);
  if (!res.ok) throw new Error('Download failed');
  const updated = +res.headers.get('x-world-updated') || 0;
  const w = await res.json();
  return { w, updated };
}
const lastPush = {}, pending = {};
export async function pushWorld(w, { force = false } = {}) {
  if (!connected() || !w) return;
  emit({ state: 'syncing', msg: `Saving “${w.name}” to the cloud…` });
  const base = baseOf(w.id);
  const res = await api(`/api/worlds/${w.id}${force ? '?force=1' : ''}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-world-name': encodeURIComponent(w.name), 'x-world-updated': String(w.updated || Date.now()), ...(base != null ? { 'x-base-updated': String(base) } : {}) },
    body: JSON.stringify(w),
  });
  if (res.status === 409) { emit({ state: 'conflict', msg: `“${w.name}” was changed on another device.` }); await resolveConflict(w); return; }
  if (!res.ok) { const d = await res.json().catch(() => ({})); emit({ state: 'error', msg: d.error || 'Upload failed' }); return; }
  setBase(w.id, w.updated);
  lastPush[w.id] = Date.now();
  await syncFiles(w).catch(e => console.warn('file sync', e));
  emit({ state: 'idle', at: Date.now(), msg: 'All changes saved to the cloud' });
}
function schedulePush(w) {
  if (!connected() || !getCloud().auto || !w) return;
  clearTimeout(pending[w.id]);
  const wait = Math.max(3000, PUSH_EVERY - (Date.now() - (lastPush[w.id] || 0)));
  emit({ state: 'pending', msg: 'Changes waiting to sync…' });
  pending[w.id] = setTimeout(() => { delete pending[w.id]; pushWorld(state.worlds.find(x => x.id === w.id) || w).catch(e => emit({ state: 'error', msg: e.message })); }, wait);
}
export async function flush() {
  for (const id of Object.keys(pending)) {
    clearTimeout(pending[id]); delete pending[id];
    const w = state.worlds.find(x => x.id === id);
    if (w) await pushWorld(w).catch(() => {});
  }
}

let conflictUI = null;          // set by the UI layer: async (localWorld, cloudInfo) => 'local' | 'cloud' | 'both'
export function onConflict(fn) { conflictUI = fn; }
async function resolveConflict(local) {
  const { w: remote, updated } = await download(local.id);
  const choice = conflictUI ? await conflictUI(local, remote) : 'both';
  if (choice === 'local') { setBase(local.id, updated); await pushWorld(local, { force: true }); }
  else if (choice === 'cloud') { await putWorldRecord(remote); setBase(local.id, updated); emit({ state: 'idle', at: Date.now(), msg: 'Using the cloud version', reload: local.id }); }
  else {
    const copy = { ...remote, id: uid(), name: remote.name + ' (from other device)' };
    await putWorldRecord(copy); setBase(copy.id, null);
    await pushWorld(state.worlds.find(x => x.id === copy.id));
    setBase(local.id, updated); await pushWorld(local, { force: true });
    emit({ state: 'idle', at: Date.now(), msg: 'Kept both versions', reload: local.id });
  }
}

let pulling = null, lastPull = 0;
export function pullAll(force = false) {
  if (!connected()) return Promise.resolve();
  if (pulling) return pulling;
  if (!force && Date.now() - lastPull < PULL_EVERY) return Promise.resolve();
  pulling = (async () => {
    emit({ state: 'syncing', msg: 'Checking the cloud…' });
    try {
      const cloud = await listCloud();
      let changed = false;
      for (const c of cloud) {
        const local = state.worlds.find(w => w.id === c.id);
        const base = baseOf(c.id);
        if (!local) {
          if (base != null) continue;            // deleted on this device on purpose
          const { w, updated } = await download(c.id);
          await putWorldRecord(w); setBase(c.id, updated); changed = true;
        } else if (c.updated > (base ?? 0) && c.updated !== local.updated) {
          if (base != null && (local.updated || 0) <= base) {           // only the cloud changed
            const { w, updated } = await download(c.id);
            await putWorldRecord(w); setBase(c.id, updated); changed = true;
          } else if (base == null && c.updated > (local.updated || 0)) { // first sync on this device: cloud is newer
            const { w, updated } = await download(c.id);
            await putWorldRecord(w); setBase(c.id, updated); changed = true;
          } else await resolveConflict(local);                          // both changed
        } else if ((local.updated || 0) > (base ?? 0)) {
          await pushWorld(local);                                      // this device has unsynced changes
        } else if (base == null) setBase(c.id, c.updated);
      }
      // worlds that exist only here and were never synced → upload
      for (const w of state.worlds) if (!cloud.some(c => c.id === w.id) && baseOf(w.id) == null) await pushWorld(w);
      lastPull = Date.now();
      emit({ state: 'idle', at: Date.now(), msg: 'Up to date', reload: changed ? '*' : '' });
    } catch (e) {
      if (status.state !== 'offline') emit({ state: 'error', msg: e.message });
    } finally { pulling = null; }
  })();
  return pulling;
}
export async function deleteRemote(id) {
  if (!connected()) return;
  await api('/api/worlds/' + id, { method: 'DELETE' }).catch(() => {});
}
export async function uploadWorld(w) { setBase(w.id, null); await pushWorld(w); }
export async function downloadWorld(id) { const { w, updated } = await download(id); const rec = await putWorldRecord(w); setBase(id, updated); return rec; }

// ---------- library files ----------
let cloudFiles = null;
async function syncFiles(w) {
  if (!w.library?.length) return;
  if (!cloudFiles) cloudFiles = new Set(await apiJSON('/api/files'));
  for (const d of w.library) {
    if (cloudFiles.has(d.id)) continue;
    const blob = await assetGet('lib:' + d.id);
    if (!blob) continue;
    const res = await api('/api/files/' + d.id, { method: 'PUT', headers: { 'x-file-type': d.type || blob.type || '' }, body: blob });
    if (res.ok) cloudFiles.add(d.id);
  }
}
export async function fetchFile(id) {
  if (!connected()) return null;
  const res = await api('/api/files/' + id);
  if (!res.ok) return null;
  const blob = await res.blob();
  await assetPut('lib:' + id, blob);
  return blob;
}

// ---------- AI through the server ----------
export async function serverAI({ system, user, maxTokens }) {
  if (!connected()) throw new Error('Sign in to your Loreforge server first (☁️ Cloud & devices).');
  const data = await apiJSON('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, user, max_tokens: maxTokens }) });
  if (!data.text) throw new Error('The server’s AI returned an empty answer.');
  return data.text;
}

// ---------- start ----------
export function initCloud() {
  hooks.afterSave.push(w => schedulePush(w));
  hooks.afterDelete.push(id => { deleteRemote(id); setBase(id, null); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else pullAll();
  });
  window.addEventListener('online', () => pullAll(true));
  if (connected()) { emit({ state: 'idle', msg: '' }); setTimeout(() => pullAll(true), 800); }
  else emit({ state: 'off' });
}
