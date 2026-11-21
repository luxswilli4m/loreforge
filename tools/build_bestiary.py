# Builds compact bestiary files for Loreforge from open-licensed sources:
#  - D&D 5e SRD 5.1 (CC-BY-4.0, via 5e-bits/5e-database)
#  - Pathfinder Monster Core (ORC License, via foundryvtt/pf2e)
import json, re, glob, html, sys
OUT = '/home/claude/loreforge/data/bestiary/'
def frac(cr):
    return {0.125: '1/8', 0.25: '1/4', 0.5: '1/2'}.get(cr, str(int(cr)) if float(cr).is_integer() else str(cr))
# ---------- 5e ----------
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/srd/5e-database/src/2014/en/5e-SRD-Monsters.json'))
out = []
for m in d:
    saves, skills = {}, {}
    for p in m.get('proficiencies', []):
        n = p['proficiency']['name']
        if n.startswith('Saving Throw: '): saves[n[14:].lower()] = p['value']
        elif n.startswith('Skill: '): skills[n[7:]] = p['value']
    acts = lambda key: [{'n': a['name'], 'd': a.get('desc', ''), **({'hit': a['attack_bonus']} if 'attack_bonus' in a else {}),
        **({'dmg': [{'dice': x.get('damage_dice', ''), 'type': (x.get('damage_type') or {}).get('name', '').lower()} for x in a.get('damage', []) if 'damage_dice' in x]} if a.get('damage') else {}),
        **({'use': f"{a['usage']['times']}/{a['usage']['type'].replace('per ', '')}" if a['usage'].get('times') else a['usage'].get('type', '')} if a.get('usage') else {})} for a in m.get(key, []) or []]
    ac = m['armor_class'][0] if m.get('armor_class') else {'value': 10}
    out.append({
        'id': m['index'], 'name': m['name'], 'size': m['size'], 'type': m['type'] + (f" ({m['subtype']})" if m.get('subtype') else ''), 'align': m.get('alignment', ''),
        'ac': ac.get('value', 10), 'acNote': ac.get('type', '') if ac.get('type') not in ('dex', None) else '', 'hp': m['hit_points'], 'hpRoll': m.get('hit_points_roll') or m.get('hit_dice', ''),
        'speed': {k: int(re.sub(r'\D', '', v) or 0) for k, v in m.get('speed', {}).items() if isinstance(v, str) and re.search(r'\d', v)},
        'abil': {k[:3]: m[k] for k in ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']},
        'saves': saves, 'skills': skills, 'vuln': m.get('damage_vulnerabilities', []), 'resist': m.get('damage_resistances', []), 'immune': m.get('damage_immunities', []),
        'condImmune': [c['name'] for c in m.get('condition_immunities', [])], 'senses': ', '.join(f"{k.replace('_', ' ')} {v}" for k, v in m.get('senses', {}).items()),
        'langs': m.get('languages', ''), 'cr': frac(m['challenge_rating']), 'xp': m.get('xp', 0),
        'traits': acts('special_abilities'), 'actions': acts('actions'), 'reactions': acts('reactions'), 'legendary': acts('legendary_actions'),
    })
json.dump({'system': '5e', 'source': 'System Reference Document 5.1', 'license': 'CC-BY-4.0', 'monsters': out}, open(OUT + 'dnd5e.json', 'w'), separators=(',', ':'))
print('5e', len(out))
# ---------- Pathfinder 2e ----------
def clean(t):
    t = re.sub(r'@Localize\[[^\]]*\]', '', t or '')
    t = re.sub(r'@(?:UUID|Compendium)\[[^\]]*\]\{([^}]*)\}', r'\1', t)
    t = re.sub(r'@(?:UUID|Compendium)\[[^\]]*?([^.\]]+)\]', r'\1', t)
    t = re.sub(r'@Damage\[\(?([^\[\]]*?)\)?\[([^\]]*)\][^\]]*\](?:\{([^}]*)\})?', lambda m: m.group(3) or f"{m.group(1)} {m.group(2).split(',')[0]}", t)
    t = re.sub(r'@Check\[([^|\]]*)[^\]]*\](?:\{([^}]*)\})?', lambda m: m.group(2) or m.group(1).replace('-', ' ') + ' save', t)
    t = re.sub(r'@Template\[([^|\]]*)\|distance:(\d+)[^\]]*\](?:\{([^}]*)\})?', lambda m: m.group(3) or f"{m.group(2)}-foot {m.group(1)}", t)
    t = re.sub(r'\[\[/\w+ [^\]]*\]\](?:\{([^}]*)\})?', lambda m: m.group(1) or '', t)
    t = re.sub(r'<[^>]+>', ' ', t); t = html.unescape(t); t = re.sub(r'\s+', ' ', t).strip()
    return t
pf = []
for f in sorted(glob.glob('/tmp/srd/pf2e/packs/pf2e/pathfinder-monster-core/*.json')):
    m = json.load(open(f)); s = m['system']; a = s['attributes']
    strikes, acts = [], []
    for it in m['items']:
        sy = it['system']
        if it['type'] == 'melee':
            strikes.append({'n': it['name'], 'hit': sy['bonus']['value'], 'dmg': [{'dice': r.get('damage', ''), 'type': r.get('damageType', '')} for r in (sy.get('damageRolls') or {}).values()],
                            'tr': (sy.get('traits') or {}).get('value', []), 'ranged': bool(sy.get('range'))})
        elif it['type'] == 'action':
            desc = clean((sy.get('description') or {}).get('value', ''))
            if len(desc) > 600: desc = desc[:597].rsplit(' ', 1)[0] + '…'
            acts.append({'n': it['name'], 'd': desc, 'a': (sy.get('actionType') or {}).get('value', ''), 'cost': (sy.get('actions') or {}).get('value')})
        elif it['type'] == 'spellcastingEntry':
            acts.append({'n': it['name'], 'd': f"DC {sy.get('spelldc', {}).get('dc', '?')}, attack +{sy.get('spelldc', {}).get('value', '?')}", 'a': 'passive'})
    sizes = {'tiny': 'Tiny', 'sm': 'Small', 'med': 'Medium', 'lg': 'Large', 'huge': 'Huge', 'grg': 'Gargantuan'}
    pf.append({
        'id': f.split('/')[-1][:-5], 'name': m['name'], 'level': s['details']['level']['value'], 'rarity': s['traits']['rarity'], 'size': sizes.get(s['traits']['size']['value'], ''), 'traits': s['traits']['value'],
        'ac': a['ac']['value'], 'acNote': a['ac'].get('details', ''), 'hp': a['hp']['max'], 'speed': {'walk': a['speed']['value'], **{o['type']: o['value'] for o in a['speed'].get('otherSpeeds', [])}},
        'per': s['perception']['mod'], 'senses': ', '.join((x['type'] + (f" {x['acuity']}" if x.get('acuity') else '') + (f" {x['range']} ft" if x.get('range') else '')) for x in s['perception'].get('senses', [])),
        'saves': {k: v['value'] for k, v in s['saves'].items()}, 'abil': {k: v['mod'] for k, v in s['abilities'].items()}, 'skills': {k: v['base'] for k, v in (s.get('skills') or {}).items()},
        'langs': ', '.join(s['details']['languages']['value']), 'immune': [x['type'] for x in a.get('immunities') or []], 'resist': [f"{x['type']} {x['value']}" for x in a.get('resistances') or []], 'weak': [f"{x['type']} {x['value']}" for x in a.get('weaknesses') or []],
        'strikes': strikes, 'actions': acts,
    })
json.dump({'system': 'pf2e', 'source': 'Pathfinder Monster Core', 'license': 'ORC', 'monsters': pf}, open(OUT + 'pf2e.json', 'w'), separators=(',', ':'))
print('pf2e', len(pf))
# ---------- the SRD's NPC stat blocks, bundled for Story Forge (so NPCs get stats without loading the whole bestiary) ----------
NPCS = ['acolyte', 'archmage', 'assassin', 'bandit', 'bandit-captain', 'berserker', 'commoner', 'cult-fanatic', 'cultist', 'druid', 'gladiator', 'guard', 'knight', 'mage', 'noble', 'priest', 'scout', 'spy', 'thug', 'tribal-warrior', 'veteran']
npcs = [m for m in out if m['id'] in NPCS]
open('/home/claude/loreforge/js/gen/srdNpcs.js', 'w').write('// The NPC stat blocks from the D&D 5e System Reference Document 5.1 (CC-BY-4.0), generated by tools/build_bestiary.py.\n// Story Forge builds NPCs on these; see the Bestiary page for the full library and credits.\nexport const SRD_NPCS = ' + json.dumps(npcs, separators=(',', ':')) + ';\n')
print('npcs', len(npcs))
