// Character creator: pick a class (or make your own), level, species and background, set ability scores and skills,
// then it fills in the character sheet. Nothing is locked afterwards: every field on the sheet stays editable.
import { W, save, uid } from '../store.js';
import { esc, openModal, closeModal, toast } from '../util.js';
import { rollAndLog } from '../tools/dice.js';
import { CLASSES, SPECIES, BACKGROUNDS, CAST_TYPES, slotsFor, GEAR, STANDARD_ARRAY, POINT_COST } from '../gen/classes.js';
import { CLASS_ART, artURL } from '../gen/classArt.js';
import { ABIL, SKILLS, SLOTS, ensureSheet, mod, sgn, speedText } from './sheet.js';

// looked up when needed (the sheet module loads this one, so its lists aren't ready at load time)
const SK = new Proxy({}, { get: (_, k) => { const s = SKILLS.find(x => x[0] === k); return s && { l: s[1], a: s[2] }; } });
const AB = new Proxy({}, { get: (_, k) => ABIL.find(x => x[0] === k)?.[1] });
// every class you can pick: the standard ones, then this world's own
function allClasses() {
  const own = (W().classes || []).map(c => [`c:${c.id}`, { ...c, custom: true }]);
  return [...Object.entries(CLASSES), ...own];
}
const classOf = key => allClasses().find(([k]) => k === key)?.[1];

export function openCreator(e, onDone) {
  const sh = ensureSheet(e);
  const guess = allClasses().find(([, c]) => String(sh.cls || '').toLowerCase().includes(c.name.toLowerCase()))?.[0];
  const st = { step: 0, cls: guess || '', level: +sh.level || 1, species: Object.entries(SPECIES).find(([, s]) => s.name === (e.fields.find(f => f.k === 'Race')?.v))?.[0] || 'human', bg: 'custom',
    method: 'standard', assign: {}, pool: [], manual: { ...sh.abil }, point: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, ownBonus: false, plus2: 'str', plus1: 'dex',
    skills: new Set(), hp: 'average', gear: true, replace: true, editing: null };
  const STEPS = ['Class', 'Level & origin', 'Ability scores', 'Skills', 'Finish'];

  // ---------- the numbers ----------
  const base = () => {
    if (st.method === 'manual') return Object.fromEntries(ABIL.map(([k]) => [k, +st.manual[k] || 10]));
    if (st.method === 'point') return { ...st.point };
    const pool = st.method === 'standard' ? STANDARD_ARRAY : st.pool;
    return Object.fromEntries(ABIL.map(([k]) => [k, st.assign[k] != null && pool[st.assign[k]] != null ? pool[st.assign[k]] : 8]));
  };
  const bonus = () => st.ownBonus ? { [st.plus2]: 2, [st.plus1]: (st.plus1 === st.plus2 ? 3 : 1) } : { ...SPECIES[st.species].bonus };
  const finalScores = () => { const b = base(), bo = bonus(); return Object.fromEntries(ABIL.map(([k]) => [k, Math.min(20, b[k] + (bo[k] || 0))])); };
  const pointsLeft = () => 27 - ABIL.reduce((t, [k]) => t + POINT_COST[st.point[k]], 0);
  const lockedSkills = () => new Set([...(BACKGROUNDS[st.bg]?.[1] || []), ...(SPECIES[st.species].skills || [])]);
  const classSkillList = C => C.skills === 'any' ? SKILLS.map(([k]) => k) : C.skills || [];

  // ---------- the steps ----------
  function stepHTML() {
    const C = classOf(st.cls);
    if (st.editing) return classEditorHTML(st.editing);
    if (st.step === 0) return `<p class="muted small">Choose a class. It fills in hit dice, saving throws, proficiencies, spell slots and features, but you can still change anything on the sheet afterwards (and any character can cast spells).</p>
      <div class="cr-classes">${allClasses().map(([k, c]) => `<button class="cr-class ${st.cls === k ? 'on' : ''}" data-cls="${k}"><img src="${c.custom ? artURL(c.art || 'fighter', c.name) : artURL(k)}" alt=""><b>${esc(c.name)}</b><span>d${c.die} · ${c.cast ? 'caster' : 'martial'}</span>${c.custom ? `<i class="cr-edit" data-editcls="${k}" title="Edit this class">✎</i>` : ''}</button>`).join('')}
        <button class="cr-class cr-new" data-act="newclass"><span class="big">＋</span><b>Make your own class</b><span>homebrew</span></button></div>`;
    if (st.step === 1) return `<div class="row"><div><label>Level</label><select id="cr-level">${Array.from({ length: 20 }, (_, i) => `<option ${st.level === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
        <div><label>Hit points</label><select id="cr-hp"><option value="average" ${st.hp === 'average' ? 'selected' : ''}>Average after level 1</option><option value="roll" ${st.hp === 'roll' ? 'selected' : ''}>Roll for each level</option></select></div></div>
      <label>Species</label><div class="cr-pills">${Object.entries(SPECIES).map(([k, s]) => `<button class="chip ${st.species === k ? 'on' : ''}" data-sp="${k}">${esc(s.name)}</button>`).join('')}</div>
      <p class="small muted">${esc(SPECIES[st.species].traits || '')}${SPECIES[st.species].traits ? ' · ' : ''}Speed ${speedText(SPECIES[st.species].speed)}${Object.keys(SPECIES[st.species].bonus).length ? ` · ${Object.entries(SPECIES[st.species].bonus).map(([a, v]) => `${a.toUpperCase()} +${v}`).join(', ')}` : ''}</p>
      <label>Background</label><div class="cr-pills">${Object.entries(BACKGROUNDS).map(([k, [n]]) => `<button class="chip ${st.bg === k ? 'on' : ''}" data-bg="${k}">${esc(n)}</button>`).join('')}</div>
      ${BACKGROUNDS[st.bg][1].length ? `<p class="small muted">Skills: ${BACKGROUNDS[st.bg][1].map(s => SK[s].l).join(', ')}</p>` : ''}`;
    if (st.step === 2) {
      const pool = st.method === 'standard' ? STANDARD_ARRAY : st.pool, fs = finalScores(), bo = bonus();
      const used = Object.values(st.assign);
      const cell = k => {
        if (st.method === 'manual') return `<input type="number" min="1" max="30" data-man="${k}" value="${st.manual[k] || 10}">`;
        if (st.method === 'point') return `<div class="cr-pb"><button data-pb="${k}" data-d="-1">−</button><b>${st.point[k]}</b><button data-pb="${k}" data-d="1">＋</button></div>`;
        return `<select data-asg="${k}"><option value="">—</option>${pool.map((v, i) => `<option value="${i}" ${st.assign[k] === i ? 'selected' : ''} ${used.includes(i) && st.assign[k] !== i ? 'disabled' : ''}>${v}</option>`).join('')}</select>`;
      };
      return `<div class="seg small">${[['standard', 'Standard array'], ['point', 'Point buy'], ['roll', 'Roll 4d6'], ['manual', 'Type them in']].map(([k, l]) => `<button data-method="${k}" class="${st.method === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${st.method === 'point' ? `<p class="small">Points left: <b>${pointsLeft()}</b> of 27 (scores 8–15)</p>` : ''}
        ${st.method === 'roll' ? `<p><button class="small" data-act="roll">🎲 ${st.pool.length ? 'Roll again' : 'Roll 4d6, keep the best 3 — six times'}</button> ${st.pool.length ? `<span class="small muted">Rolled: ${st.pool.join(', ')}</span>` : ''}</p>` : ''}
        <table class="cr-scores"><tr><th></th><th>Score</th><th>Bonus</th><th>Total</th><th>Mod</th></tr>
          ${ABIL.map(([k, l]) => `<tr><td>${l}${C?.saves?.includes(k) ? ' <span class="small muted">(save)</span>' : ''}</td><td>${cell(k)}</td><td>${bo[k] ? '+' + bo[k] : ''}</td><td><b>${fs[k]}</b></td><td>${sgn(mod(fs[k]))}</td></tr>`).join('')}</table>
        <label class="check"><input type="checkbox" id="cr-own" ${st.ownBonus ? 'checked' : ''}> Choose my own bonuses (+2 and +1), as in Tasha’s or the 2024 rules</label>
        ${st.ownBonus ? `<div class="row"><div><label>+2 to</label><select id="cr-p2">${ABIL.map(([k, l]) => `<option value="${k}" ${st.plus2 === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label>+1 to</label><select id="cr-p1">${ABIL.map(([k, l]) => `<option value="${k}" ${st.plus1 === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>` : ''}`;
    }
    if (st.step === 3) {
      const list = classSkillList(C), locked = lockedSkills(), n = C.skillN || 0, picked = [...st.skills].filter(s => !locked.has(s) && list.includes(s)).length;
      return `<p>Choose <b>${n}</b> skill${n === 1 ? '' : 's'} from your class (${picked}/${n}). Skills from your background and species are already ticked.</p>
        <div class="cr-skills">${SKILLS.map(([k, l, a]) => { const lock = locked.has(k), on = lock || st.skills.has(k), avail = list.includes(k); return `<label class="check ${!avail && !lock ? 'muted' : ''}"><input type="checkbox" data-skill="${k}" ${on ? 'checked' : ''} ${lock || (!avail) || (!on && picked >= n) ? 'disabled' : ''}> ${l} <span class="small muted">${a.toUpperCase()}${lock ? ' · ' + (BACKGROUNDS[st.bg][1].includes(k) ? 'background' : 'species') : ''}</span></label>`; }).join('')}</div>`;
    }
    const fs = finalScores(), L = st.level, slots = slotsFor(C.cast, L);
    const hpAvg = C.die + mod(fs.con) + (L - 1) * (Math.floor(C.die / 2) + 1 + mod(fs.con));
    return `<div class="cr-review"><img src="${C.custom ? artURL(C.art || 'fighter', C.name) : artURL(st.cls)}" alt=""><div>
        <h3 style="margin:0">${esc(C.name)} ${L}</h3><p class="muted" style="margin:2px 0 8px">${esc(SPECIES[st.species].name)} · ${esc(BACKGROUNDS[st.bg][0])}</p>
        <p class="small">${ABIL.map(([k]) => `<b>${k.toUpperCase()}</b> ${fs[k]} (${sgn(mod(fs[k]))})`).join(' · ')}</p>
        <p class="small">Hit points ${st.hp === 'roll' ? `rolled (about ${hpAvg})` : hpAvg} · hit dice ${L}d${C.die} · saves ${C.saves.map(s => s.toUpperCase()).join(', ')}</p>
        ${slots.some(Boolean) ? `<p class="small">Spell slots: ${slots.map((n, i) => n ? `L${i + 1}×${n}` : '').filter(Boolean).join(', ')} (${AB[C.ability] || ''})</p>` : ''}
        <p class="small muted">${C.features.filter(([l]) => l <= L).map(([, t]) => esc(t)).join(' · ')}</p></div></div>
      <label class="check"><input type="checkbox" id="cr-replace" ${st.replace ? 'checked' : ''}> Replace the scores, skills, saves and features already on the sheet</label>
      ${C.gear?.length ? `<label class="check"><input type="checkbox" id="cr-gear" ${st.gear ? 'checked' : ''}> Add starting equipment and put it on</label>` : ''}`;
  }

  // ---------- making your own class ----------
  function classEditorHTML(c) {
    const chk = (name, list, opts) => opts.map(([k, l]) => `<label class="check"><input type="checkbox" data-${name}="${k}" ${list.includes(k) ? 'checked' : ''}> ${l}</label>`).join('');
    const featText = (c.features || []).map(([l, t]) => `${l}: ${t}`).join('\n');
    return `<div class="row"><div style="flex:2"><label>Class name</label><input id="ce-name" value="${esc(c.name || '')}" placeholder="e.g. Blood Hunter"></div>
        <div><label>Hit die</label><select id="ce-die">${[6, 8, 10, 12].map(n => `<option value="${n}" ${+c.die === n ? 'selected' : ''}>d${n}</option>`).join('')}</select></div></div>
      <label>Saving throws</label><div class="cr-checks">${chk('save', c.saves || [], ABIL)}</div>
      <label>Armour & weapons</label><div class="cr-checks">${chk('prof', [...(c.armour || []), ...(c.weapons || [])], [['simple', 'Simple weapons'], ['martial', 'Martial weapons'], ['light', 'Light armour'], ['medium', 'Medium armour'], ['heavy', 'Heavy armour'], ['shield', 'Shields']])}</div>
      <div class="row"><div><label>Skills to choose</label><input id="ce-skn" type="number" min="0" max="18" value="${c.skillN ?? 2}"></div><div style="flex:3"><label>Tools & other proficiencies</label><input id="ce-tools" value="${esc(c.tools || '')}" placeholder="e.g. Alchemist’s supplies"></div></div>
      <label>Skills they choose from</label><div class="cr-checks">${chk('csk', c.skills === 'any' ? SKILLS.map(([k]) => k) : c.skills || [], SKILLS.map(([k, l]) => [k, l]))}</div>
      <div class="row"><div><label>Spellcasting</label><select id="ce-cast">${Object.entries(CAST_TYPES).map(([k, l]) => `<option value="${k}" ${(c.cast || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label>Casting ability</label><select id="ce-ab"><option value="">—</option>${ABIL.map(([k, l]) => `<option value="${k}" ${c.ability === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label>Unarmoured defence adds</label><select id="ce-un"><option value="">Nothing extra</option>${ABIL.map(([k, l]) => `<option value="${k}" ${c.unarmored === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label>Features — one line per level, like “3: Blood Curse, Crimson Rite”</label><textarea id="ce-feat" rows="6" placeholder="1: Hunter's Bane, Crimson Rite&#10;2: Fighting Style&#10;3: Order feature">${esc(featText)}</textarea>
      <label>Card</label><div class="cr-arts">${Object.entries(CLASS_ART).map(([k, a]) => `<button class="${(c.art || '') === k ? 'on' : ''}" data-art="${k}" title="${a.label}"><img src="${artURL(k)}" alt=""></button>`).join('')}</div>`;
  }
  function readClassEditor(m, c) {
    const q = s => m.querySelector(s);
    const all = name => [...m.querySelectorAll(`[data-${name}]`)].filter(x => x.checked).map(x => x.dataset[name]);
    const profs = all('prof');
    return { ...c, name: q('#ce-name').value.trim() || 'New class', die: +q('#ce-die').value, saves: all('save'), armour: profs.filter(p => ['light', 'medium', 'heavy', 'shield'].includes(p)), weapons: profs.filter(p => ['simple', 'martial'].includes(p)),
      skillN: +q('#ce-skn').value || 0, skills: all('csk'), tools: q('#ce-tools').value.trim(), cast: q('#ce-cast').value, ability: q('#ce-ab').value, unarmored: q('#ce-un').value,
      features: q('#ce-feat').value.split('\n').map(l => /^\s*(\d+)\s*[:.-]\s*(.+)$/.exec(l)).filter(Boolean).map(mm => [+mm[1], mm[2].trim()]).sort((a, b) => a[0] - b[0]), art: m.querySelector('.cr-arts .on')?.dataset.art || c.art || '' };
  }

  // ---------- the window ----------
  function render() {
    const C = classOf(st.cls), ed = st.editing;
    openModal(`<div class="cr">
      <h2>${ed ? (ed.id ? 'Edit class' : 'Make your own class') : `🧙 Build ${esc(e.name)}`}</h2>
      ${ed ? '' : `<div class="cr-steps">${STEPS.map((s, i) => `<button class="${i === st.step ? 'on' : ''} ${i < st.step ? 'done' : ''}" data-go="${i}" ${i > st.step && !C ? 'disabled' : ''}>${i + 1}. ${s}</button>`).join('')}</div>`}
      <div class="cr-body">${stepHTML()}</div>
      <div class="modal-actions">${ed ? `${ed.id ? '<button class="danger" data-act="delclass">Delete class</button>' : ''}<span style="flex:1"></span><button data-act="cancelclass">Back</button><button class="primary" data-act="saveclass">Save class</button>`
        : `<button data-act="close">Cancel</button><span style="flex:1"></span>${st.step ? '<button data-act="back">◀ Back</button>' : ''}${st.step < 4 ? `<button class="primary" data-act="next" ${C ? '' : 'disabled'}>Next ▶</button>` : '<button class="primary" data-act="create">✨ Fill in the sheet</button>'}`}</div></div>`, m => {
      m.closest('.modal')?.classList.add('modal-wide');
      m.addEventListener('click', ev => {
        const t = ev.target.closest('button, [data-editcls]'); if (!t) return;
        if (t.dataset.editcls) { ev.stopPropagation(); st.editing = { ...classOf(t.dataset.editcls) }; render(); return; }
        if (t.dataset.cls) { st.cls = t.dataset.cls; render(); return; }
        if (t.dataset.go) { st.step = +t.dataset.go; render(); return; }
        if (t.dataset.sp) { st.species = t.dataset.sp; render(); return; }
        if (t.dataset.bg) { st.bg = t.dataset.bg; render(); return; }
        if (t.dataset.method) { st.method = t.dataset.method; st.assign = {}; render(); return; }
        if (t.dataset.pb) { const k = t.dataset.pb, v = st.point[k] + +t.dataset.d; if (v >= 8 && v <= 15) { const old = st.point[k]; st.point[k] = v; if (pointsLeft() < 0) st.point[k] = old; } render(); return; }
        if (t.dataset.art) { m.querySelectorAll('.cr-arts button').forEach(b => b.classList.toggle('on', b === t)); return; }
        const a = t.dataset.act;
        if (a === 'close') return closeModal();
        if (a === 'next') { st.step = Math.min(4, st.step + 1); render(); }
        if (a === 'back') { st.step = Math.max(0, st.step - 1); render(); }
        if (a === 'roll') { st.pool = Array.from({ length: 6 }, () => rollAndLog('4d6kh3').total).sort((x, y) => y - x); st.assign = {}; render(); }
        if (a === 'newclass') { st.editing = { name: '', die: 8, saves: [], armour: [], weapons: ['simple'], skillN: 2, skills: [], cast: '', features: [] }; render(); }
        if (a === 'cancelclass') { st.editing = null; render(); }
        if (a === 'saveclass') {
          const c = readClassEditor(m, st.editing), w = W();
          w.classes = w.classes || [];
          if (c.id) w.classes[w.classes.findIndex(x => x.id === c.id)] = c; else { c.id = uid(); w.classes.push(c); }
          delete c.custom; save(); st.cls = `c:${c.id}`; st.editing = null; toast(`${c.name} saved to this world’s classes`); render();
        }
        if (a === 'delclass') { const w = W(); w.classes = (w.classes || []).filter(x => x.id !== st.editing.id); if (st.cls === `c:${st.editing.id}`) st.cls = ''; save(); st.editing = null; render(); }
        if (a === 'create') { apply(); closeModal(); onDone(); }
      });
      m.addEventListener('change', ev => {
        const t = ev.target;
        if (t.id === 'cr-level') st.level = +t.value;
        else if (t.id === 'cr-hp') st.hp = t.value;
        else if (t.dataset.asg) { st.assign[t.dataset.asg] = t.value === '' ? undefined : +t.value; render(); }
        else if (t.dataset.man) { st.manual[t.dataset.man] = +t.value || 10; render(); }
        else if (t.id === 'cr-own') { st.ownBonus = t.checked; render(); }
        else if (t.id === 'cr-p2') { st.plus2 = t.value; render(); }
        else if (t.id === 'cr-p1') { st.plus1 = t.value; render(); }
        else if (t.dataset.skill) { if (t.checked) st.skills.add(t.dataset.skill); else st.skills.delete(t.dataset.skill); render(); }
        else if (t.id === 'cr-replace') st.replace = t.checked;
        else if (t.id === 'cr-gear') st.gear = t.checked;
      });
    });
  }

  // ---------- writing it onto the sheet ----------
  function apply() {
    const C = classOf(st.cls), L = st.level, sp = SPECIES[st.species], [bgName, bgSkills] = BACKGROUNDS[st.bg], fs = finalScores(), con = mod(fs.con);
    sh.abil = fs;
    sh.cls = `${C.name} ${L}`; sh.level = L;
    if (st.bg !== 'custom') sh.background = bgName;
    if (st.species !== 'custom') { let f = e.fields.find(x => x.k === 'Race'); if (!f) e.fields.push(f = { k: 'Race', v: '' }); f.v = sp.name; }
    if (st.replace) { sh.saves = {}; sh.skills = {}; }
    for (const s of C.saves || []) sh.saves[s] = true;
    for (const s of [...st.skills, ...bgSkills, ...(sp.skills || [])]) if (!+sh.skills[s]) sh.skills[s] = 1;
    sh.wprof = Object.fromEntries(['simple', 'martial', 'light', 'medium', 'heavy', 'shield'].map(k => [k, [...(C.weapons || []), ...(C.armour || [])].includes(k)]));
    if (C.tools) sh.profs = st.replace ? C.tools : [sh.profs, C.tools].filter(Boolean).join('\n');
    if (sp.langs) sh.languages = sp.langs;
    if (sp.dark) sh.senses = `Darkvision ${speedText(sp.dark)}`;
    if (sp.resist) sh.resist = sp.resist;
    sh.speedFt = sp.speed; sh.size = sp.size || 'Medium';
    sh.unarmored = C.unarmored || '';
    // hit points: the full die at level 1, then the average (or a roll) each level
    let hp = C.die + con;
    for (let l = 2; l <= L; l++) hp += (st.hp === 'roll' ? rollAndLog(`1d${C.die}`).total : Math.floor(C.die / 2) + 1) + con;
    sh.hpMax = Math.max(1, hp); sh.hp = ''; sh.temp = ''; sh.hitDice = `${L}d${C.die}`; sh.hitDiceUsed = ''; sh.hpRoll = '';
    // spellcasting (any character can still use the spell section)
    if (C.cast) { sh.spell.ability = C.ability || sh.spell.ability; sh.spell.slots = Object.fromEntries(slotsFor(C.cast, L).map((n, i) => [i + 1, { max: n || '', used: 0 }]).filter(([, s]) => s.max)); }
    const feats = C.features.filter(([l]) => l <= L).map(([l, t]) => `Level ${l}: ${t}`);
    const extra = C.extra?.(L);
    const lines = [`${C.name} ${L}`, ...feats, extra, sp.traits && `${sp.name}: ${sp.traits}`, st.bg !== 'custom' && `Background: ${bgName}`].filter(Boolean).join('\n');
    sh.features = st.replace || !sh.features ? lines : `${sh.features}\n\n${lines}`;
    if (!sh.portrait?.img) sh.portrait = C.custom ? { art: C.art || 'fighter', label: C.name } : { art: st.cls };
    // starting gear, put on where it fits
    if (st.gear && C.gear?.length) {
      const used = new Set(sh.items.filter(i => !i.slot).map(i => i.cell));
      const free = () => { let c = 0; while (used.has(c)) c++; used.add(c); return c; };
      const taken = s => sh.items.some(i => i.slot === s);
      for (const g of C.gear) {
        // a class's starting kit is always gear it's proficient with (rogues and rapiers, bards and longswords…)
        const it = { id: uid(), qty: 1, rarity: 'common', cur: 'gp', slot: '', profMode: ['weapon', 'armor', 'shield'].includes(GEAR[g].kind) ? 'yes' : '', ...JSON.parse(JSON.stringify(GEAR[g])) };
        let slot = '';
        if (it.kind === 'armor' && !taken('body')) slot = 'body';
        else if (it.kind === 'shield' && !taken('off') && !sh.items.some(i => i.slot === 'main' && i.two)) slot = 'off';
        else if (it.kind === 'weapon' && it.ranged && !taken('ranged')) slot = 'ranged';
        else if (it.kind === 'weapon' && !it.ranged && !taken('main')) slot = 'main';
        else if (it.kind === 'trinket' && !taken('trinket1')) slot = 'trinket1';
        if (slot === 'main' && it.two) { const off = sh.items.find(i => i.slot === 'off'); if (off) { off.slot = ''; off.cell = free(); } }
        it.slot = slot; if (!slot) it.cell = free();
        if (slot && !SLOTS[slot]) it.slot = '';
        sh.items.push(it);
      }
    }
    e.updated = Date.now(); save();
    toast(`${e.name} is now a level ${L} ${C.name}`);
  }
  if (!st.cls) st.step = 0;
  render();
}
