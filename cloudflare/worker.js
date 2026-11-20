// Loreforge cloud server — a single Cloudflare Worker.
// Jobs: user accounts, syncing worlds + library files between devices, and an AI proxy for Story Forge.
//
// Bindings (set in the Cloudflare dashboard → your Worker → Settings → Bindings):
//   STORE   KV namespace   (required unless you bind BUCKET) — stores accounts, worlds and files
//   BUCKET  R2 bucket      (optional, preferred for big libraries — used instead of STORE for data)
//   AI      Workers AI     (optional) — free AI if no OpenRouter key is set
// Variables & secrets:
//   TOKEN_SECRET        (secret, required) — any long random text; signs login tokens
//   INVITE_CODE         (secret, recommended) — needed to create an account, so strangers can't sign up
//   ADMIN_CODE          (secret, optional) — lets the server owner reset any account's password
//   OPENROUTER_API_KEY  (secret, optional) — use OpenRouter models (e.g. free ones) for Story Forge
//   AI_MODEL            (optional) — OpenRouter model (default openrouter/free), or the Workers AI model if no OpenRouter key
//   WORKERS_AI_MODEL    (optional) — Workers AI model used as the fallback (default @cf/meta/llama-3.3-70b-instruct-fp8-fast)

const OPENROUTER_DEFAULT = 'openrouter/free';
const WORKERS_AI_DEFAULT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const TOKEN_DAYS = 90;
const enc = new TextEncoder();

// ---------- helpers ----------
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-world-name, x-world-updated, x-base-updated, x-file-type',
  'access-control-expose-headers': 'x-world-updated, x-world-name, x-file-type',
  'access-control-max-age': '86400',
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors, ...extra } });
const err = (status, message) => json({ error: message }, status);
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cleanUser = u => String(u || '').trim().toLowerCase();
const validId = id => /^[a-z0-9_-]{4,40}$/i.test(id);

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function hashPassword(password, salt, pepper) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password + pepper), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64u(salt), iterations: 10000, hash: 'SHA-256' }, key, 256);
  return b64u(bits);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function makeToken(env, user, v = 0) {
  const payload = b64u(enc.encode(JSON.stringify({ u: user, v, exp: Date.now() + TOKEN_DAYS * 864e5 })));
  return `${payload}.${await hmac(env.TOKEN_SECRET, payload)}`;
}
async function readToken(env, req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(env.TOKEN_SECRET, payload))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    return p.exp > Date.now() ? { u: p.u, v: p.v || 0 } : null;
  } catch { return null; }
}

// recovery keys look like ABCD-EFGH-JKLM-NPQR (no easily-confused letters)
function newRecoveryKey() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(16));
  return [...r].map((b, i) => A[b % A.length] + ((i % 4 === 3 && i < 15) ? '-' : '')).join('');
}
const normKey = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function setCredentials(S, env, u, rec, password) {
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const rsalt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const recoveryKey = newRecoveryKey();
  const next = { ...rec, salt, hash: await hashPassword(password, salt, env.TOKEN_SECRET), rsalt, rhash: await hashPassword(normKey(recoveryKey), rsalt, env.TOKEN_SECRET), v: rec.v || 0 };
  await S.put(`u/${u}`, JSON.stringify(next));
  return { rec: next, recoveryKey };
}

// ---------- storage: R2 if bound, otherwise KV ----------
function storage(env) {
  if (env.BUCKET) return {
    async get(key, type = 'text') { const o = await env.BUCKET.get(key); if (!o) return null; return { body: type === 'stream' ? o.body : type === 'json' ? await o.json() : await o.text(), meta: o.customMetadata || {} }; },
    put: (key, value, meta = {}) => env.BUCKET.put(key, value, { customMetadata: meta }),
    async meta(key) { const o = await env.BUCKET.head(key); return o ? (o.customMetadata || {}) : null; },
    del: key => env.BUCKET.delete(key),
    async list(prefix) {
      const out = []; let cursor;
      do { const r = await env.BUCKET.list({ prefix, cursor, include: ['customMetadata'] }); out.push(...r.objects.map(o => ({ key: o.key, size: o.size, meta: o.customMetadata || {} }))); cursor = r.truncated ? r.cursor : null; } while (cursor);
      return out;
    },
  };
  if (env.STORE) return {
    async get(key, type = 'text') { const r = await env.STORE.getWithMetadata(key, type === 'stream' ? 'stream' : type === 'json' ? 'json' : 'text'); return r.value === null ? null : { body: r.value, meta: r.metadata || {} }; },
    put: (key, value, meta = {}) => env.STORE.put(key, value, { metadata: meta }),
    async meta(key) { const r = await env.STORE.getWithMetadata(key, 'stream'); if (r.value === null) return null; r.value.cancel?.(); return r.metadata || {}; },
    del: key => env.STORE.delete(key),
    async list(prefix) {
      const out = []; let cursor;
      do { const r = await env.STORE.list({ prefix, cursor }); out.push(...r.keys.map(k => ({ key: k.name, size: +(k.metadata?.size || 0), meta: k.metadata || {} }))); cursor = r.list_complete ? null : r.cursor; } while (cursor);
      return out;
    },
  };
  return null;
}

// ---------- AI ----------
async function runAI(env, { system, user, max_tokens = 2000 }) {
  const messages = [{ role: 'system', content: String(system || '').slice(0, 8000) }, { role: 'user', content: String(user || '').slice(0, 30000) }];
  const tokens = Math.min(4000, Math.max(16, +max_tokens || 2000));
  if (env.OPENROUTER_API_KEY) {
    try { return await openRouter(env, messages, tokens); }
    catch (e) { if (!env.AI) throw e; }   // e.g. free daily limit reached → fall back to Workers AI
  }
  if (env.AI) {
    const model = (env.OPENROUTER_API_KEY ? env.WORKERS_AI_MODEL : env.AI_MODEL || env.WORKERS_AI_MODEL) || WORKERS_AI_DEFAULT;
    const res = await env.AI.run(model, { messages, max_tokens: tokens });
    const text = typeof res === 'string' ? res : res?.response ?? res?.choices?.[0]?.message?.content ?? res?.result?.response ?? '';
    return { text: typeof text === 'string' ? text : JSON.stringify(text), model, via: 'workers-ai' };
  }
  throw new Error('No AI is set up on the server. Add an OPENROUTER_API_KEY secret or a Workers AI binding named AI.');
}

async function openRouter(env, messages, tokens) {
  {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'x-title': 'Loreforge' },
      body: JSON.stringify({ model: env.AI_MODEL || OPENROUTER_DEFAULT, messages, max_tokens: tokens, temperature: 0.9 }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `OpenRouter error ${r.status}`);
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('OpenRouter returned an empty answer');
    return { text, model: data.model || env.AI_MODEL || OPENROUTER_DEFAULT, via: 'openrouter' };
  }
}

// ---------- routes ----------
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const S = storage(env);

    try {
      if (path === '' || path === '/' || path === '/api/health') {
        return json({ ok: true, app: 'loreforge', storage: env.BUCKET ? 'r2' : env.STORE ? 'kv' : 'none', ai: env.OPENROUTER_API_KEY ? (env.AI ? 'openrouter+workers-ai' : 'openrouter') : env.AI ? 'workers-ai' : 'none', inviteRequired: !!env.INVITE_CODE, ready: !!(S && env.TOKEN_SECRET) });
      }
      if (!S) return err(500, 'Server storage is not set up: bind a KV namespace named STORE (or an R2 bucket named BUCKET).');
      if (!env.TOKEN_SECRET) return err(500, 'Server is missing the TOKEN_SECRET secret.');

      // --- accounts ---
      if (path === '/api/register' && req.method === 'POST') {
        const { username, password, invite } = await req.json();
        const u = cleanUser(username);
        if (!/^[a-z0-9_.-]{3,32}$/.test(u)) return err(400, 'Usernames are 3–32 letters, numbers, dots, dashes or underscores.');
        if (String(password || '').length < 8) return err(400, 'Use a password of at least 8 characters.');
        if (env.INVITE_CODE && invite !== env.INVITE_CODE) return err(403, 'That invite code is not right.');
        if (await S.get(`u/${u}`)) return err(409, 'That username is taken.');
        const { recoveryKey } = await setCredentials(S, env, u, { created: Date.now(), v: 0 }, password);
        return json({ token: await makeToken(env, u, 0), username: u, recoveryKey });
      }
      if (path === '/api/login' && req.method === 'POST') {
        const { username, password } = await req.json();
        const u = cleanUser(username);
        const rec = await S.get(`u/${u}`, 'json');
        if (!rec) return err(401, 'Wrong username or password.');
        const hash = await hashPassword(String(password || ''), rec.body.salt, env.TOKEN_SECRET);
        if (!safeEqual(hash, rec.body.hash)) return err(401, 'Wrong username or password.');
        return json({ token: await makeToken(env, u, rec.body.v || 0), username: u, hasRecovery: !!rec.body.rhash });
      }
      // forgot password: prove it with your recovery key (or the server owner's ADMIN_CODE)
      if (path === '/api/reset' && req.method === 'POST') {
        const { username, recoveryKey, adminCode, newPassword } = await req.json();
        const u = cleanUser(username);
        if (String(newPassword || '').length < 8) return err(400, 'Use a new password of at least 8 characters.');
        const r = await S.get(`u/${u}`, 'json');
        let ok = false;
        if (r && recoveryKey && r.body.rhash) ok = safeEqual(await hashPassword(normKey(recoveryKey), r.body.rsalt, env.TOKEN_SECRET), r.body.rhash);
        if (r && !ok && adminCode && env.ADMIN_CODE) ok = safeEqual(String(adminCode), env.ADMIN_CODE);
        if (!ok) return err(403, 'That username and recovery key don’t match.');
        const rec = { ...r.body, v: (r.body.v || 0) + 1 };            // signs out every other device
        const out = await setCredentials(S, env, u, rec, newPassword);
        return json({ token: await makeToken(env, u, out.rec.v), username: u, recoveryKey: out.recoveryKey });
      }

      const tok = await readToken(env, req);
      const userRec = tok && await S.get(`u/${tok.u}`, 'json');
      if (!tok || !userRec || (userRec.body.v || 0) !== tok.v) return err(401, 'Please sign in again.');
      const user = tok.u;

      if (path === '/api/me') return json({ username: user, hasRecovery: !!userRec.body.rhash });

      // --- account security (signed in) ---
      if (path.startsWith('/api/account/') && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const rec = userRec.body;
        const pwOK = async p => safeEqual(await hashPassword(String(p || ''), rec.salt, env.TOKEN_SECRET), rec.hash);
        if (path === '/api/account/password') {
          if (!(await pwOK(b.current))) return err(403, 'Your current password is not right.');
          if (String(b.newPassword || '').length < 8) return err(400, 'Use a new password of at least 8 characters.');
          const out = await setCredentials(S, env, user, rec, b.newPassword);
          return json({ token: await makeToken(env, user, out.rec.v), recoveryKey: out.recoveryKey });
        }
        if (path === '/api/account/recovery') {
          if (!(await pwOK(b.password))) return err(403, 'Your password is not right.');
          const rsalt = b64u(crypto.getRandomValues(new Uint8Array(16)));
          const recoveryKey = newRecoveryKey();
          await S.put(`u/${user}`, JSON.stringify({ ...rec, rsalt, rhash: await hashPassword(normKey(recoveryKey), rsalt, env.TOKEN_SECRET) }));
          return json({ recoveryKey });
        }
        if (path === '/api/account/signout-all') {
          const next = { ...rec, v: (rec.v || 0) + 1 };
          await S.put(`u/${user}`, JSON.stringify(next));
          return json({ token: await makeToken(env, user, next.v) });
        }
      }

      // --- worlds ---
      if (path === '/api/worlds' && req.method === 'GET') {
        const list = await S.list(`w/${user}/`);
        return json(list.map(o => ({ id: o.key.split('/').pop(), name: o.meta.name || 'Untitled', updated: +o.meta.updated || 0, size: o.size || +o.meta.size || 0 })));
      }
      let m = path.match(/^\/api\/worlds\/([^/]+)$/);
      if (m) {
        const id = m[1];
        if (!validId(id)) return err(400, 'Bad world id.');
        const key = `w/${user}/${id}`;
        if (req.method === 'GET') {
          const o = await S.get(key, 'stream');
          if (!o) return err(404, 'Not found.');
          return new Response(o.body, { headers: { 'content-type': 'application/json', 'x-world-updated': String(o.meta.updated || 0), 'x-world-name': encodeURIComponent(o.meta.name || ''), ...cors } });
        }
        if (req.method === 'PUT') {
          const updated = +req.headers.get('x-world-updated') || Date.now();
          const base = req.headers.get('x-base-updated');
          const force = url.searchParams.get('force') === '1';
          const existing = await S.meta(key);
          const serverUpdated = existing ? +existing.updated || 0 : 0;
          // someone else changed it since this device last synced → conflict
          if (existing && !force && base !== null && +base !== serverUpdated && serverUpdated > +base) {
            return json({ error: 'conflict', serverUpdated }, 409);
          }
          const body = await req.text();
          if (body.length > 24 * 1048576 && !env.BUCKET) return err(413, 'This world is over 24 MB — bind an R2 bucket (BUCKET) for bigger worlds.');
          const name = decodeURIComponent(req.headers.get('x-world-name') || '').slice(0, 120);
          await S.put(key, body, { name, updated: String(updated), size: String(body.length) });
          return json({ ok: true, updated });
        }
        if (req.method === 'DELETE') { await S.del(key); return json({ ok: true }); }
      }

      // --- library files ---
      if (path === '/api/files' && req.method === 'GET') {
        const list = await S.list(`f/${user}/`);
        return json(list.map(o => o.key.split('/').pop()));
      }
      m = path.match(/^\/api\/files\/([^/]+)$/);
      if (m) {
        const id = m[1];
        if (!validId(id)) return err(400, 'Bad file id.');
        const key = `f/${user}/${id}`;
        if (req.method === 'GET') {
          const o = await S.get(key, 'stream');
          if (!o) return err(404, 'Not found.');
          return new Response(o.body, { headers: { 'content-type': o.meta.type || 'application/octet-stream', 'x-file-type': o.meta.type || '', ...cors } });
        }
        if (req.method === 'PUT') {
          const buf = await req.arrayBuffer();
          if (buf.byteLength > 24 * 1048576 && !env.BUCKET) return err(413, 'Files over 24 MB need an R2 bucket (BUCKET) on the server.');
          await S.put(key, buf, { type: req.headers.get('x-file-type') || '', size: String(buf.byteLength) });
          return json({ ok: true });
        }
        if (req.method === 'DELETE') { await S.del(key); return json({ ok: true }); }
      }

      // --- AI ---
      if (path === '/api/ai' && req.method === 'POST') {
        const body = await req.json();
        try { return json(await runAI(env, body)); }
        catch (e) { return err(502, e.message || 'AI request failed.'); }
      }

      return err(404, 'Unknown endpoint.');
    } catch (e) {
      return err(500, e.message || 'Server error.');
    }
  },
};
