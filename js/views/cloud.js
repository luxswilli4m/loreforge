// Cloud & devices: connect to your own Loreforge server, sign in, and see sync status per world.
import { state, openWorld } from '../store.js';
import { esc, toast, confirmDialog, openModal, closeModal, go } from '../util.js';
import { getCloud, setCloud, connected, health, signIn, signOut, listCloud, pullAll, pushWorld, uploadWorld, downloadWorld, deleteRemote, baseOf, status, normUrl, resetPassword, me, changePassword, newRecoveryKey, signOutEverywhere } from '../cloud.js';
import { getAI, setAI } from '../tools/ai.js';

const SETUP_URL = 'https://github.com/luxswilli4m/loreforge/blob/main/cloudflare/SETUP.md';
let mode = 'signin';

export function render(main) {
  const c = getCloud();
  main.innerHTML = `
    <div class="page-head"><h1>Cloud & devices</h1><span class="muted small">Keep your worlds in sync across your laptop, desktop and phone using your own free Cloudflare server.</span></div>
    <div id="cloud-body"><p class="muted">Loading…</p></div>`;
  const body = main.querySelector('#cloud-body');
  if (connected()) return drawSignedIn(body, main);
  drawConnect(body, main, c);
}

function drawConnect(body, main, c) {
  body.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr));align-items:start">
      <div class="card">
        <h3>1 · Your server</h3>
        <p class="muted small">Paste the address of your Loreforge Worker. Don’t have one yet? It’s free and takes about 15 minutes — <a href="${SETUP_URL}" target="_blank" rel="noopener">follow the setup guide</a>.</p>
        <label>Server address</label>
        <div class="row"><input id="curl" placeholder="https://loreforge-server.yourname.workers.dev" value="${esc(c.url)}"><button class="shrink" id="ccheck">Check</button></div>
        <div id="chealth" class="small" style="margin-top:8px"></div>
      </div>
      <div class="card" id="cauth">
        <h3>2 · ${{ signin: 'Sign in', register: 'Create your account', reset: 'Reset your password' }[mode]}</h3>
        <div class="seg small" style="margin-bottom:6px"><button data-m="signin" class="${mode === 'signin' ? 'on' : ''}">Sign in</button><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Create account</button><button data-m="reset" class="${mode === 'reset' ? 'on' : ''}">Forgot password</button></div>
        <label>Username</label><input id="cuser" autocomplete="username" value="${esc(c.username)}">
        ${mode === 'reset' ? `<label>Recovery key <span class="muted">(shown when you created your account)</span></label><input id="crec" placeholder="ABCD-EFGH-JKLM-NPQR" autocomplete="off">
          <details class="small muted" style="margin-top:6px"><summary>Lost your recovery key too?</summary>If you own the server, add an <b>ADMIN_CODE</b> secret to your Worker in Cloudflare (Settings → Variables and Secrets), then enter it here instead.<input id="cadm" placeholder="Admin code" style="margin-top:6px"></details>` : ''}
        <label>${mode === 'reset' ? 'New password' : 'Password'}</label><input id="cpass" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}">
        ${mode === 'register' ? '<label>Invite code <span class="muted">(the INVITE_CODE you set on the server)</span></label><input id="cinv">' : ''}
        <button class="primary" id="cgo" style="width:100%;justify-content:center;margin-top:14px">${{ signin: 'Sign in', register: 'Create account & sign in', reset: 'Reset password & sign in' }[mode]}</button>
        <p class="muted small" style="margin-bottom:0">${{ signin: 'Use the same username and password on every device.', register: 'Do this once — then sign in with it on your other devices.', reset: 'Resetting signs out your other devices; sign in again there with the new password.' }[mode]}</p>
      </div>
    </div>`;
  const $ = s => body.querySelector(s);
  const check = async () => {
    const h = $('#chealth');
    h.textContent = 'Checking…'; h.className = 'small muted';
    try {
      const d = await health($('#curl').value);
      h.innerHTML = d.ready ? `✅ Found your server · storage: <b>${d.storage.toUpperCase()}</b> · AI: <b>${d.ai === 'none' ? 'not set up' : d.ai}</b>${d.inviteRequired ? ' · invite code required to register' : ''}`
        : `⚠️ Server found, but setup isn’t finished: ${d.storage === 'none' ? 'add the STORE (KV) binding. ' : ''}${d.ready ? '' : 'Check the TOKEN_SECRET secret.'}`;
      h.className = 'small ' + (d.ready ? 'ok-text' : 'danger-text');
      return d;
    } catch (e) { h.textContent = '❌ ' + e.message; h.className = 'small danger-text'; return null; }
  };
  $('#ccheck').onclick = check;
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; setCloud({ url: normUrl($('#curl').value) }); render(main); });
  $('#cgo').onclick = async () => {
    const btn = $('#cgo'); btn.disabled = true;
    try {
      if (!$('#curl').value.trim()) throw new Error('Enter your server address first.');
      const res = mode === 'reset'
        ? await resetPassword($('#curl').value, $('#cuser').value, $('#crec').value, $('#cpass').value, $('#cadm')?.value || '')
        : await signIn($('#curl').value, $('#cuser').value, $('#cpass').value, mode === 'register', $('#cinv')?.value || '');
      toast(mode === 'reset' ? 'Password reset — you’re signed in' : 'Signed in — syncing your worlds');
      if (res.recoveryKey) await showRecoveryKey(res.recoveryKey, res.username);
      mode = 'signin';
      const ai = getAI(); if (!ai.key) setAI({ ...ai, provider: 'cloud' });
      await pullAll(true);
      render(main);
    } catch (e) { toast(e.message); btn.disabled = false; }
  };
  $('#cpass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#cgo').click(); });
}

function drawSignedIn(body, main) {
  const c = getCloud();
  body.innerHTML = `
    <div class="card cloud-head">
      <div class="cloud-avatar">${esc(c.username[0]?.toUpperCase() || '?')}</div>
      <div style="flex:1"><b>Signed in as ${esc(c.username)}</b><br><span class="muted small">${esc(c.url)}</span><br><span class="small" id="cstat"></span></div>
      <label class="check shrink"><input type="checkbox" id="cauto" ${c.auto ? 'checked' : ''}> Sync automatically</label>
      <button class="primary shrink" id="csync">↻ Sync now</button>
      <button class="shrink" id="cout">Sign out</button>
    </div>
    <h2 style="margin-top:22px">Your worlds</h2>
    <div id="clist"><p class="muted">Checking the cloud…</p></div>
    <div class="card" style="margin-top:20px">
      <h3>🤖 AI on your server</h3>
      <p class="muted small" id="caiinfo">…</p>
      <button id="caiuse">Use my server for Story Forge</button>
    </div>
    <div class="card" style="margin-top:20px">
      <h3>🔐 Account security</h3>
      <div id="crecwarn"></div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button id="cchpw">Change password</button>
        <button id="cnewrec">New recovery key</button>
        <button id="csoall">Sign out all other devices</button>
      </div>
      <p class="muted small" style="margin-bottom:0">Your recovery key lets you reset a forgotten password. Keep it somewhere safe outside Loreforge, such as a password manager or on paper.</p>
    </div>
    <p class="muted small" style="margin-top:14px">Each device keeps a full offline copy, so Loreforge still works without internet — changes upload when you’re back online. Snapshots stay on each device.</p>`;
  const $ = s => body.querySelector(s);
  const drawStat = () => {
    const el = $('#cstat'); if (!el) return;
    const icon = { idle: '✅', syncing: '↻', pending: '•', error: '⚠️', offline: '📴', conflict: '⚠️', off: '' }[status.state] || '';
    el.textContent = `${icon} ${status.msg || (status.at ? 'Last synced ' + new Date(status.at).toLocaleTimeString() : '')}`;
  };
  drawStat();
  const onSync = () => drawStat();
  window.addEventListener('lf-sync', onSync);
  $('#cauto').onchange = e => setCloud({ auto: e.target.checked });
  $('#csync').onclick = async () => { await pullAll(true); for (const w of state.worlds) if ((w.updated || 0) > (baseOf(w.id) ?? 0) && baseOf(w.id) != null) await pushWorld(w); drawList(); };
  $('#cout').onclick = async () => { if (await confirmDialog('Sign out on this device? Your worlds stay here; they just stop syncing.', 'Sign out')) { signOut(); render(main); } };
  $('#caiuse').onclick = () => { setAI({ ...getAI(), provider: 'cloud' }); toast('Story Forge will use your server'); };
  health(c.url).then(d => { const el = $('#caiinfo'); if (el) el.innerHTML = d.ai === 'none' ? 'No AI is configured on your server yet. Add an <b>OPENROUTER_API_KEY</b> secret (free models) or a Workers AI binding named <b>AI</b> — see the setup guide.' : `Your server uses <b>${{ openrouter: 'OpenRouter', 'openrouter+workers-ai': 'OpenRouter, with Cloudflare Workers AI as backup', 'workers-ai': 'Cloudflare Workers AI' }[d.ai] || d.ai}</b>. Keys stay on the server, so every signed-in device can use it.`; }).catch(() => {});

  async function drawList() {
    const el = $('#clist'); if (!el) return;
    let cloud = [];
    try { cloud = await listCloud(); } catch (e) { el.innerHTML = `<p class="danger-text">${esc(e.message)}</p>`; return; }
    const ids = [...new Set([...state.worlds.map(w => w.id), ...cloud.map(c2 => c2.id)])];
    el.innerHTML = `<table class="cloud-table"><tr><th>World</th><th>This device</th><th>Cloud</th><th>Status</th><th></th></tr>${ids.map(id => {
      const l = state.worlds.find(w => w.id === id), r = cloud.find(x => x.id === id), base = baseOf(id);
      const st = !r ? (base != null ? ['Removed from cloud', 'warn'] : ['Not uploaded yet', 'warn']) : !l ? ['Only in the cloud', 'warn']
        : (l.updated || 0) > (base ?? 0) && base != null ? ['Changes waiting', 'warn'] : r.updated > (base ?? 0) ? ['Newer in cloud', 'warn'] : ['Synced', 'ok'];
      return `<tr data-id="${id}"><td><b>${esc(l?.name || r?.name)}</b></td>
        <td>${l ? '✓' : '—'}</td><td>${r ? `✓ <span class="muted small">${new Date(r.updated).toLocaleString()} · ${r.size > 1048576 ? (r.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(r.size / 1024)) + ' KB'}</span>` : '—'}</td>
        <td><span class="sync-pill ${st[1]}">${st[0]}</span></td>
        <td class="row" style="gap:4px;justify-content:flex-end">${!l ? '<button class="small" data-a="down">⬇ Download</button>' : ''}${l && (!r || st[0] !== 'Synced') ? '<button class="small" data-a="up">⬆ Upload</button>' : ''}${l ? '<button class="small" data-a="open">Open</button>' : ''}${r ? '<button class="small danger" data-a="del" title="Delete the cloud copy">🗑</button>' : ''}</td></tr>`;
    }).join('')}</table>`;
  }
  $('#clist').addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('tr').dataset.id;
    const a = b.dataset.a;
    b.disabled = true;
    try {
      if (a === 'down') { await downloadWorld(id); toast('Downloaded'); }
      if (a === 'up') { await uploadWorld(state.worlds.find(w => w.id === id)); toast('Uploaded'); }
      if (a === 'open') { openWorld(id); go('#/'); return; }
      if (a === 'del' && await confirmDialog('Delete the cloud copy of this world? Copies already on your devices are kept.', 'Delete cloud copy')) { await deleteRemote(id); toast('Cloud copy deleted'); }
    } catch (err) { toast(err.message); }
    drawList();
  });
  me().then(d => { const el = $('#crecwarn'); if (el && !d.hasRecovery) el.innerHTML = '<p class="danger-text small" style="margin-top:0">⚠️ Your account has no recovery key yet. Create one so you can reset a forgotten password.</p>'; }).catch(() => {});
  const askPw = (title, fields) => new Promise(resolve => {
    openModal(`<h2>${title}</h2>${fields.map(f => `<label>${f[1]}</label><input type="password" data-f="${f[0]}" autocomplete="${f[0] === 'current' || f[0] === 'password' ? 'current-password' : 'new-password'}">`).join('')}
      <div class="modal-actions"><button data-a="no">Cancel</button><button class="primary" data-a="yes">Continue</button></div>`, m => {
      m.addEventListener('click', e => {
        const a = e.target.dataset.a; if (!a) return;
        const vals = Object.fromEntries([...m.querySelectorAll('[data-f]')].map(i => [i.dataset.f, i.value]));
        closeModal(); resolve(a === 'yes' ? vals : null);
      });
    });
  });
  $('#cchpw').onclick = async () => {
    const v = await askPw('Change password', [['current', 'Current password'], ['next', 'New password (8+ characters)']]); if (!v) return;
    try { const d = await changePassword(v.current, v.next); toast('Password changed'); await showRecoveryKey(d.recoveryKey, c.username); } catch (e) { toast(e.message); }
  };
  $('#cnewrec').onclick = async () => {
    const v = await askPw('New recovery key', [['password', 'Your password']]); if (!v) return;
    try { const d = await newRecoveryKey(v.password); await showRecoveryKey(d.recoveryKey, c.username); const el = $('#crecwarn'); if (el) el.innerHTML = ''; } catch (e) { toast(e.message); }
  };
  $('#csoall').onclick = async () => {
    if (!(await confirmDialog('Sign out every other device? They’ll need your password to sign in again. This device stays signed in.', 'Sign them out'))) return;
    try { await signOutEverywhere(); toast('Other devices signed out'); } catch (e) { toast(e.message); }
  };
  drawList();
  return () => window.removeEventListener('lf-sync', onSync);
}

// conflict prompt used by the sync engine
export function conflictPrompt(local, remote) {
  return new Promise(resolve => {
    openModal(`<h2>⚠️ Edited on two devices</h2>
      <p><b>${esc(local.name)}</b> was changed on this device <i>and</i> on another device since they last synced.</p>
      <table class="fields-table"><tr><td>This device</td><td>${new Date(local.updated).toLocaleString()} · ${local.entries.length} entries</td></tr>
      <tr><td>Other device</td><td>${new Date(remote.updated).toLocaleString()} · ${remote.entries.length} entries</td></tr></table>
      <p class="muted small">Not sure? “Keep both” is always safe — you’ll get two copies to compare.</p>
      <div class="modal-actions" style="flex-wrap:wrap"><button data-c="cloud">Use the other device’s</button><button data-c="local">Keep this device’s</button><button class="primary" data-c="both">Keep both</button></div>`, m => {
      m.addEventListener('click', e => { const c = e.target.dataset.c; if (c) { closeModal(); resolve(c); } });
    });
  });
}

// shown once after creating an account, resetting or changing a password
export function showRecoveryKey(key, username) {
  return new Promise(resolve => {
    openModal(`<h2>🔑 Save your recovery key</h2>
      <p>If you ever forget your password, this key lets you reset it. <b>It won’t be shown again.</b></p>
      <div class="recovery-key">${esc(key)}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="shrink" data-a="copy">📋 Copy</button><button class="shrink" data-a="dl">⬇ Download as a file</button></div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="rk-ok"> I’ve saved it somewhere safe (password manager, paper…)</label>
      <div class="modal-actions"><button class="primary" data-a="done" disabled>Done</button></div>`, m => {
      const done = m.querySelector('[data-a=done]');
      const watch = setInterval(() => { if (!document.querySelector('.recovery-key')) { clearInterval(watch); resolve(); } }, 300);
      m.querySelector('#rk-ok').onchange = e => { done.disabled = !e.target.checked; };
      m.addEventListener('click', e => {
        const a = e.target.dataset.a;
        if (a === 'copy') { navigator.clipboard?.writeText(key); toast('Copied'); }
        if (a === 'dl') {
          const blob = new Blob([`Loreforge recovery key\nUsername: ${username}\nServer: ${getCloud().url}\nRecovery key: ${key}\n\nUse it under Cloud & devices → Forgot password.\n`], { type: 'text/plain' });
          const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'loreforge-recovery-key.txt'; l.click();
        }
        if (a === 'done' && !done.disabled) { closeModal(); resolve(); }
      });
    });
  });
}
