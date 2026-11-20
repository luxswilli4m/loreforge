// Story Forge page: request → story grounded in the world → save as quest / entries / handout.
import { W, TYPES, getEntry, newEntry, uid, save } from '../store.js';
import { esc, md, go, toast, openModal, closeModal, typeColor, mentionLink, query } from '../util.js';
import { KINDS, TONES, gatherContext, offlineStory, aiPrompt, parseAI } from '../tools/storyforge.js';
import { PROVIDERS, getAI, setAI, aiReady, complete } from '../tools/ai.js';
import { connected } from '../cloud.js';

const req = { kind: 'bounty', text: '', location: '', ties: [], tone: 'Heroic', level: 3, engine: '' };
let result = null;
const PLACEHOLDER = {
  bounty: 'e.g. a cult assassin hiding in the docks who killed a priest',
  quest: 'e.g. recover a stolen relic before the festival',
  rumours: 'e.g. gossip about the new governor',
  npc: 'e.g. a nervous priest who knows too much',
  encounter: 'e.g. smugglers caught unloading at night',
  custom: 'Describe anything — a festival, a heist, a prophecy, a dungeon…',
};

export function render(main) {
  const w = W();
  const q = query();
  if (q.loc && getEntry(q.loc)) { req.location = q.loc; history.replaceState(null, '', '#/forge'); }
  if (q.kind && KINDS[q.kind]) req.kind = q.kind;
  if (!req.engine) req.engine = aiReady() ? 'ai' : 'offline';
  const locs = w.entries.filter(e => e.type === 'location').sort((a, b) => a.name.localeCompare(b.name));
  const ctx = gatherContext(req.location, []);
  const tieCands = w.entries.filter(e => e.type === 'faction' || e.type === 'lore' || (e.type === 'character' && ctx.people.includes(e)))
    .sort((a, b) => (ctx.factions.includes(b) - ctx.factions.includes(a)) || a.name.localeCompare(b.name));
  const ai = getAI();
  main.innerHTML = `
    <div class="page-head"><h1>Story Forge</h1><span class="muted small">Describe what you need — it’s woven into your world’s places, factions and faiths.</span>
      <button id="aiset">⚙️ AI settings</button></div>
    <div class="forge">
      <div class="card forge-form">
        <label>What should I forge?</label>
        <div class="kind-grid">${Object.entries(KINDS).map(([k, v]) => `<button class="kind ${req.kind === k ? 'on' : ''}" data-kind="${k}" title="${v.desc}"><span>${v.icon}</span>${v.label}</button>`).join('')}</div>
        <label>Your request <span class="muted">(optional)</span></label>
        <textarea id="ftext" rows="3" placeholder="${esc(PLACEHOLDER[req.kind])}">${esc(req.text)}</textarea>
        <label>Set in</label>
        <select id="floc"><option value="">— anywhere (invent a place) —</option>${locs.map(l => `<option value="${l.id}" ${req.location === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
        ${ctx.loc ? `<p class="small muted ctx-note">Knows about: ${[ctx.ruler && `ruler ${esc(ctx.ruler.name)}`, ctx.places.length && `${ctx.places.length} districts/landmarks`, ctx.people.length && `${ctx.people.length} locals`, ctx.factions.length && `${ctx.factions.length} factions`].filter(Boolean).join(' · ') || 'just the place itself — add links to it for richer stories'}</p>` : ''}
        <label>Tie it into <span class="muted">(factions, religions, lore)</span></label>
        <div class="filters tie-list">${tieCands.length ? tieCands.map(e => `<button class="chip ${req.ties.includes(e.id) ? 'on' : ''}" style="--tc:${typeColor(e.type)}" data-tie="${e.id}">${TYPES[e.type].icon} ${esc(e.name)}</button>`).join('') : '<span class="muted small">Add factions or lore (e.g. a religion) to your World Bible to tie them in.</span>'}</div>
        <div class="row">
          <div><label>Tone</label><select id="ftone">${TONES.map(t => `<option ${req.tone === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="shrink" style="width:110px"><label>Party level</label><input id="flvl" type="number" min="1" max="20" value="${req.level}"></div>
        </div>
        <label>Engine</label>
        <div class="seg small" id="feng">
          <button data-eng="offline" class="${req.engine === 'offline' ? 'on' : ''}">⚙️ Built-in (free)</button>
          <button data-eng="ai" class="${req.engine === 'ai' ? 'on' : ''}">🤖 AI ${aiReady(ai) ? `· ${esc(ai.provider === 'cloud' ? 'my server' : ai.model || PROVIDERS[ai.provider].models[0])}` : '(set up)'}</button>
        </div>
        <button class="primary forge-go" id="fgo">🔮 Forge it</button>
      </div>
      <div class="forge-out" id="fout">${result ? '' : `<div class="empty forge-empty"><div class="big">🔮</div><b>Your story will appear here.</b><br>Pick what you need, where it happens and what it ties into, then press <b>Forge it</b>.</div>`}</div>
    </div>`;
  const $m = s => main.querySelector(s);
  if (result) drawResult();

  main.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { req.kind = b.dataset.kind; if (req.kind === 'custom' && aiReady()) req.engine = 'ai'; render(main); });
  $m('#ftext').oninput = e => req.text = e.target.value;
  $m('#floc').onchange = e => { req.location = e.target.value; render(main); };
  main.querySelectorAll('[data-tie]').forEach(b => b.onclick = () => { const id = b.dataset.tie; req.ties = req.ties.includes(id) ? req.ties.filter(x => x !== id) : [...req.ties, id]; b.classList.toggle('on'); });
  $m('#ftone').onchange = e => req.tone = e.target.value;
  $m('#flvl').oninput = e => req.level = +e.target.value || 1;
  $m('#feng').onclick = e => {
    const b = e.target.closest('[data-eng]'); if (!b) return;
    if (b.dataset.eng === 'ai' && !aiReady()) return aiSettings(() => { req.engine = 'ai'; render(main); });
    req.engine = b.dataset.eng; render(main);
  };
  $m('#aiset').onclick = () => aiSettings(() => render(main));
  $m('#fgo').onclick = forge;

  async function forge() {
    const out = $m('#fout');
    if (req.kind === 'custom' && req.engine === 'offline') {
      toast('“Anything” needs AI — using a quest instead');
    }
    out.innerHTML = `<div class="forge-busy"><div class="spinner"></div><span>${req.engine === 'ai' ? 'The AI is writing your story…' : 'Forging…'}</span></div>`;
    $m('#fgo').disabled = true;
    try {
      if (req.engine === 'ai') {
        const p = aiPrompt(req, null);
        const text = await complete({ system: p.system, user: p.user, maxTokens: 2200 });
        result = parseAI(text);
      } else {
        await new Promise(r => setTimeout(r, 250));
        result = offlineStory({ ...req, kind: req.kind === 'custom' ? 'quest' : req.kind });
      }
      result.kind = req.kind === 'custom' && req.engine === 'offline' ? 'quest' : req.kind;
      result.location = req.location;
      drawResult();
    } catch (e) {
      out.innerHTML = `<div class="card forge-error"><h3>That didn’t work</h3><p>${esc(e.message)}</p>
        <div class="row" style="gap:8px"><button class="shrink" id="ferrset">⚙️ AI settings</button><button class="primary shrink" id="ferroff">Use the built-in generator</button></div></div>`;
      out.querySelector('#ferrset').onclick = () => aiSettings(() => render(main));
      out.querySelector('#ferroff').onclick = () => { req.engine = 'offline'; render(main); main.querySelector('#fgo').click(); };
    }
    const g = $m('#fgo'); if (g) g.disabled = false;
  }

  function refHTML(x) {
    if (!x) return '';
    if (x.id && getEntry(x.id)) return mentionLink(x.id);
    return `<b>${esc(x.name)}</b>`;
  }

  function drawResult() {
    const r = result, out = $m('#fout');
    const list = (title, arr, cls = '') => arr?.length ? `<h4>${title}</h4><ul class="${cls}">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const loc = getEntry(r.location);
    out.innerHTML = `
      ${r.kind === 'bounty' && r.target ? `<div class="wanted">
        <div class="wanted-nail l"></div><div class="wanted-nail r"></div>
        <div class="wanted-head">WANTED</div>
        <div class="wanted-sub">${r.target.type === 'creature' ? 'for the slaying of' : 'dead or alive'}</div>
        <div class="wanted-portrait">${r.target.type === 'creature' ? '🐉' : '👤'}</div>
        <div class="wanted-name">${esc(r.target.name)}</div>
        <p class="wanted-crime">${esc(r.target.crime ? `For having ${r.target.crime}.` : r.target.description)}</p>
        <div class="wanted-reward">REWARD<br><span>${esc(r.reward)}</span></div>
        <div class="wanted-foot">Apply to ${esc(r.giver?.name || 'the authorities')}${loc ? ` · ${esc(loc.name)}` : ''}</div>
      </div>` : ''}
      <div class="card forge-result">
        <div class="row" style="align-items:flex-start"><div>
          <span class="tag">${KINDS[r.kind]?.icon} ${KINDS[r.kind]?.label} · ${r.engine === 'ai' ? '🤖 AI' : '⚙️ built-in'}</span>
          <h2 style="margin:6px 0">${esc(r.title)}</h2></div></div>
        ${r.hook ? `<blockquote class="forge-hook">${esc(r.hook)}</blockquote>` : ''}
        ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
        <div class="forge-cols">
          <div>
            ${r.target ? `<h4>${r.kind === 'npc' ? 'Character' : 'Target'}</h4><p>${refHTML(r.target)}${r.target.id ? '' : ` <span class="muted small">(new ${TYPES[r.target.type]?.label.toLowerCase()})</span>`}<br>${esc(r.target.description || '')}</p>` : ''}
            ${r.giver ? `<h4>Quest giver</h4><p>${refHTML(r.giver)}${r.giver.description && !r.giver.id ? `<br><span class="muted small">${esc(r.giver.description)}</span>` : ''}</p>` : ''}
            ${r.reward ? `<h4>Reward</h4><p>${esc(r.reward)}</p>` : ''}
            ${r.ties?.length ? `<h4>Woven into</h4><ul class="link-list">${r.ties.map(t => `<li>${t.id && getEntry(t.id) ? `<span class="type-dot" style="--tc:${typeColor(getEntry(t.id).type)}"></span>${mentionLink(t.id)}` : `<b>${esc(t.name)}</b>`}<span class="muted small">${esc(t.detail || '')}</span></li>`).join('')}</ul>` : ''}
          </div>
          <div>
            ${list('Objectives', r.objectives, 'checks-list')}
            ${list('Clues', r.clues)}
            ${list('Complications', r.complications)}
            ${list('Rumours', r.rumours)}
          </div>
        </div>
        ${r.twist || r.target?.secret ? `<div class="secret"><div class="secret-label">🔒 GM only</div>${r.twist ? `<p><b>Twist:</b> ${esc(r.twist)}</p>` : ''}${r.target?.secret ? `<p><b>Secret:</b> ${esc(r.target.secret)}</p>` : ''}</div>` : ''}
        ${r.newEntries?.length ? `<h4>Suggested new entries</h4><p class="small muted">${r.newEntries.map(n => `${TYPES[n.type]?.icon} ${esc(n.name)}`).join(' · ')} — created when you save.</p>` : ''}
        <div class="forge-actions">
          ${['bounty', 'quest', 'encounter', 'custom'].includes(r.kind) ? '<button class="primary" data-act="quest">💾 Save as quest</button>' : ''}
          ${r.kind === 'npc' ? '<button class="primary" data-act="npc">💾 Save to World Bible</button>' : ''}
          ${r.kind === 'rumours' ? '<button class="primary" data-act="rumours">💾 Save as journal</button>' : ''}
          ${r.kind === 'bounty' ? '<button data-act="poster">📜 Save poster as player handout</button>' : ''}
          <button data-act="again">🔁 Forge another</button>
          <button data-act="copy">📋 Copy</button>
        </div>
      </div>`;
    out.querySelector('.forge-actions').onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'again') return main.querySelector('#fgo').click();
      if (act === 'copy') { navigator.clipboard?.writeText(asText(r)); return toast('Copied'); }
      if (act === 'quest') { const q = saveQuest(r); toast('Quest saved — target and links created'); go(`#/quest/${q.id}`); }
      if (act === 'npc') { const ent = ensureEntry(r.target, r); save(); toast(`${ent.name} added`); go(`#/entry/${ent.id}`); }
      if (act === 'rumours') { const j = saveJournal(r.title, 'Notes', `${r.hook}\n\n${r.rumours.map(x => '- ' + linkify(x, r)).join('\n')}`); go(`#/journal/${j.id}`); }
      if (act === 'poster') {
        ensureEntry(r.target, r);
        const j = saveJournal(`Wanted: ${r.target.name}`, 'Player handout', `# WANTED\n## ${r.target.name}\n\n${r.target.crime ? `For having ${r.target.crime}.` : r.target.description}\n\n**Reward:** ${r.reward}\n\n*Apply to ${r.giver?.name || 'the authorities'}${loc ? ` in ${loc.name}` : ''}.*`, r);
        toast('Poster saved as a player handout'); go(`#/journal/${j.id}`);
      }
    };
  }
}

// ---------- saving ----------
function ensureEntry(x, r) {
  if (!x) return null;
  if (x.id && getEntry(x.id)) return getEntry(x.id);
  const existing = W().entries.find(e => e.name.toLowerCase() === x.name.toLowerCase());
  if (existing) { x.id = existing.id; return existing; }
  const e = newEntry(x.type || 'character', x.name);
  e.summary = (x.description || '').split('. ')[0].slice(0, 200);
  e.body = x.description || '';
  e.secret = x.secret || '';
  e.tags = ['story-forge'];
  x.id = e.id;
  const loc = getEntry(r.location);
  if (loc && e.type !== 'location') W().relations.push({ id: uid(), from: e.id, to: loc.id, label: e.type === 'creature' ? 'lairs near' : r.kind === 'bounty' ? 'hiding in' : 'found in' });
  if (x.memberOf) W().relations.push({ id: uid(), from: e.id, to: x.memberOf.id, label: 'member of' });
  return e;
}
function linkify(text, r) {
  if (!text) return '';
  const known = [r.target, r.giver, ...(r.ties || [])].filter(x => x?.id && getEntry(x.id)).map(x => ({ name: getEntry(x.id).name, id: x.id }));
  const loc = getEntry(r.location); if (loc) known.push({ name: loc.name, id: loc.id });
  let out = text;
  for (const k of known.sort((a, b) => b.name.length - a.name.length)) {
    // only replace outside existing @[...](...) links
    const parts = out.split(/(@\[[^\]]*\]\([a-z0-9]+\))/);
    const variants = [k.name, k.name.replace(/^the /i, '')].filter(v => v.length > 2);
    let done = false;
    for (let i = 0; i < parts.length && !done; i += 2) {
      for (const v of variants) {
        const lower = parts[i].toLowerCase();
        let j = lower.indexOf(v.toLowerCase());
        if (j < 0) continue;
        let len = v.length;
        if (v !== k.name && lower.slice(Math.max(0, j - 4), j) === 'the ') { j -= 4; len += 4; }
        parts[i] = parts[i].slice(0, j) + `@[${k.name}](${k.id})` + parts[i].slice(j + len);
        done = true; break;
      }
    }
    out = parts.join('');
  }
  return out;
}
function saveJournal(title, category, body, r) {
  const j = { id: uid(), title, category, body: r ? linkify(body, r) : body, created: Date.now(), updated: Date.now() };
  W().journals.push(j); save();
  return j;
}
function saveQuest(r) {
  const w = W();
  if (r.target) ensureEntry(r.target, r);
  if (r.giver && !r.giver.id) ensureEntry({ ...r.giver, type: 'character' }, { ...r, kind: 'giver' });
  for (const n of r.newEntries || []) { const e = newEntry(n.type, n.name); e.summary = n.summary; e.tags = ['story-forge']; }
  if (r.giver?.id && r.target?.id && r.kind === 'bounty') w.relations.push({ id: uid(), from: r.giver.id, to: r.target.id, label: 'put a bounty on' });
  const L = t => linkify(t, r);
  const desc = [
    r.summary && L(r.summary),
    r.target && `### ${r.kind === 'bounty' ? 'The target' : 'Key figure'}\n${L(r.target.name)} — ${L(r.target.description || '')}`,
    r.clues?.length && `### Clues\n${r.clues.map(c => '- ' + L(c)).join('\n')}`,
    r.complications?.length && `### Complications\n${r.complications.map(c => '- ' + L(c)).join('\n')}`,
    r.ties?.length && `### Woven into\n${r.ties.map(t => `- ${t.id && getEntry(t.id) ? `@[${getEntry(t.id).name}](${t.id})` : t.name}${t.detail ? ' — ' + t.detail : ''}`).join('\n')}`,
    (r.twist || r.target?.secret) && `### 🔒 GM notes\n${r.twist ? `**Twist:** ${L(r.twist)}\n\n` : ''}${r.target?.secret ? `**Secret:** ${L(r.target.secret)}` : ''}`,
  ].filter(Boolean).join('\n\n');
  const q = { id: uid(), title: r.title, status: 'active', giver: r.giver ? L(r.giver.name) : '', reward: r.reward || '', summary: L(r.hook || ''), desc,
    objectives: (r.objectives || []).map(t => ({ id: uid(), text: L(t), done: false })), created: Date.now(), updated: Date.now() };
  w.quests.push(q);
  save();
  return q;
}
function asText(r) {
  return [r.title, r.hook, r.summary, r.target && `Target: ${r.target.name} — ${r.target.description}`, r.giver && `Giver: ${r.giver.name}`, r.reward && `Reward: ${r.reward}`,
    r.objectives?.length && 'Objectives:\n' + r.objectives.map(x => '- ' + x).join('\n'), r.clues?.length && 'Clues:\n' + r.clues.map(x => '- ' + x).join('\n'),
    r.complications?.length && 'Complications:\n' + r.complications.map(x => '- ' + x).join('\n'), r.rumours?.length && 'Rumours:\n' + r.rumours.map(x => '- ' + x).join('\n'),
    r.twist && `Twist: ${r.twist}`].filter(Boolean).join('\n\n');
}

// ---------- AI settings ----------
export function aiSettings(onSaved) {
  const cfg = getAI();
  const draw = m => {
    const p = PROVIDERS[cfg.provider];
    m.innerHTML = `<h2>🤖 AI settings</h2>
      <p class="muted small" style="margin-top:-4px">Optional. Connect your own AI account to let Story Forge write with a real model. Without it, the free built-in generator is used.</p>
      <label>Provider</label>
      <select id="ap">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${cfg.provider === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <p class="small muted">${esc(p.help)}</p>
      ${p.needsKey ? `<label>API key</label><div class="row"><input id="ak" type="password" value="${esc(cfg.key)}" placeholder="${cfg.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}" autocomplete="off"><button class="shrink" id="ashow">👁</button></div>` : ''}
      ${cfg.provider === 'openai' || cfg.provider === 'ollama' ? `<label>Base URL</label><input id="ab" value="${esc(cfg.base || p.base)}">` : ''}
      ${p.server ? `<p class="small">${connected() ? '✅ Signed in to your server.' : '⚠️ Not signed in yet — open <a href="#/cloud">☁️ Cloud & devices</a>.'}</p>`
        : `<label>Model</label><input id="am" list="am-l" value="${esc(cfg.model || p.models[0])}"><datalist id="am-l">${p.models.map(x => `<option value="${x}">`).join('')}</datalist>`}
      <div class="ai-note">${p.server ? '🔒 Requests go to your own server, which talks to the AI. No keys are stored on this device.' : '🔒 Your key is saved only in this browser'} ${p.server ? '' : ' (never in backups or on GitHub). When you forge with AI, your request and the related parts of your world are sent to the provider. Any charges are billed to your account with them.'}</div>
      <div id="atest" class="small"></div>
      <div class="modal-actions">${cfg.key ? '<button class="danger" data-a="forget">Forget key</button>' : ''}<span style="flex:1"></span><button data-a="test">Test connection</button><button data-a="no">Cancel</button><button class="primary" data-a="save">Save</button></div>`;
  };
  const read = m => {
    cfg.key = m.querySelector('#ak')?.value.trim() ?? cfg.key;
    cfg.model = m.querySelector('#am')?.value.trim() ?? cfg.model ?? '';
    if (m.querySelector('#ab')) cfg.base = m.querySelector('#ab').value.trim();
  };
  openModal('', m => {
    draw(m);
    m.addEventListener('change', e => { if (e.target.id === 'ap') { read(m); cfg.provider = e.target.value; cfg.model = ''; cfg.base = ''; draw(m); } });
    m.addEventListener('click', async e => {
      if (e.target.id === 'ashow') { const k = m.querySelector('#ak'); k.type = k.type === 'password' ? 'text' : 'password'; return; }
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'no') return closeModal();
      read(m);
      if (a === 'forget') { cfg.key = ''; setAI(cfg); draw(m); toast('Key removed from this browser'); return; }
      if (a === 'test') {
        const t = m.querySelector('#atest'); t.textContent = 'Testing…'; t.className = 'small muted';
        try { const reply = await complete({ system: 'You are a connection test.', user: 'Reply with exactly: The forge is lit.', maxTokens: 20 }, cfg); t.textContent = '✅ Connected — the model replied: ' + reply.slice(0, 80); t.className = 'small ok-text'; }
        catch (err) { t.textContent = '❌ ' + err.message; t.className = 'small danger-text'; }
        return;
      }
      if (a === 'save') { setAI(cfg); closeModal(); toast(aiReady(cfg) ? 'AI connected' : 'Saved'); onSaved?.(); }
    });
  });
}
