"""Shorthand for writing the base events (see build-events.py).

An event is written as ev(source, steps, ...). `source` is the rulebook row
(its id in js/data/tables.js); the title, rule text and weight come from the
roll table unless given. Split and invented events pass their own id, text
and weight. Everything else is the event data described in
js/rules/events/pack.js and run.js.
"""

A = '$actor'


def ev(source, steps, weight=None, id=None, text=None, title=None, group=None, requires=None, fallback=None):
    return {
        'source': source, 'id': id or source, 'weight': weight, 'text': text, 'title': title,
        'group': group, 'requires': requires, 'steps': steps, 'fallback': fallback,
    }


def fragment(id, steps):
    return {'id': id, 'steps': steps}


# ---- effects
def effect(name, **kw):
    out = {'effect': name}
    out.update(kw)
    return out


def credits(n): return effect('resource', key='credits', amount=n)
def story(n): return effect('resource', key='storyPoints', amount=n)
def rumors(n): return effect('resource', key='rumors', amount=n)
def fuel(n): return effect('resource', key='fuel', amount=n)
def ship_parts(n): return effect('resource', key='shipParts', amount=n)
def xp(who, n): return effect('xp', target=who, amount=n)
def luck(who, n=1): return effect('stat', target=who, stat='luck', amount=n)
def sick(who, n): return effect('sickBay', target=who, turns=n)
def hull(n): return effect('hull', amount=n)
def debt(n): return effect('debt', amount=n)
def injury(who): return effect('injuryRoll', target=who)
def rival(**kw): return effect('rival.add', **kw)
def patron(**kw): return effect('patron.add', **kw)
def remove_member(who): return effect('member.remove', target=who)
def condition(type, **kw): return effect('condition.add', type=type, **kw)
def item(name=None, table=None, **kw):
    out = {'effect': 'item.add'}
    if table:
        out['table'] = table
    if name:
        out['name'] = name
    out.update(kw)
    return out


# ---- steps
def say(text, tone=None):
    out = {'say': text}
    if tone:
        out['tone'] = tone
    return out


def table(name, **kw):
    out = {'table': name}
    out.update(kw)
    return out


def roll(dice, **kw):
    if 'as_' in kw:
        kw['as'] = kw.pop('as_')
    out = {'roll': dice}
    out.update(kw)
    return out


def select(source, as_, **kw):
    spec = {'from': source}
    top = {}
    for key in ('label', 'required', 'list'):
        if key in kw:
            top[key] = kw.pop(key)
    spec.update(kw)
    out = {'select': spec, 'as': as_}
    out.update(top)
    return out


def if_(pred, then, otherwise=None):
    out = {'if': pred, 'then': then}
    if otherwise is not None:
        out['else'] = otherwise
    return out


def repeat(times, steps): return {'repeat': {'times': times}, 'steps': steps}
def for_each(var, steps): return {'forEach': var, 'steps': steps}
def again(): return {'again': True}


# ---- conditions on things
def fact(name, of=None, **kw):
    out = {'fact': name}
    if of:
        out['of'] = of
    out.update(kw)
    return out


def species(who, *ids):
    return fact('member.species', who, **({'eq': ids[0]} if len(ids) == 1 else {'in': list(ids)}))


def is_engineer(who=A): return fact('member.isEngineer', who)
def not_(p): return {'not': p}
def any_(*ps): return {'any': list(ps)}
def all_(*ps): return {'all': list(ps)}
def var(name, **kw): return dict({'var': name}, **kw)
def awake(): return not_(fact('member.inSickBay'))
def has_condition(type): return fact('condition.has', type=type)


# ---- prompts
def yesno(prompt, yes=None, no=None, cost=None, **kw):
    out = {'ask': 'yesno', 'prompt': prompt, 'yes': yes or [], 'no': no or []}
    if cost:
        out['cost'] = cost
    out.update(kw)
    return out


def options(prompt, opts, **kw):
    out = {'ask': 'options', 'prompt': prompt,
           'options': [{'value': v, 'label': label, 'steps': steps} for v, label, steps in opts]}
    out.update(kw)
    return out


def number(prompt, max, steps, per=None, **kw):
    out = {'ask': 'number', 'prompt': prompt, 'max': max, 'steps': steps, 'none': []}
    if per:
        out['per'] = per
    out.update(kw)
    return out


def pick(prompt, k, choices, repeats=False):
    return {'ask': 'pickList', 'prompt': prompt, 'k': k, 'repeats': repeats,
            'list': [{'value': v, 'label': label, 'steps': steps} for v, label, steps in choices]}


def offer(prompt, sel, chosen, declined=None, **kw):
    out = {'ask': 'offer', 'prompt': prompt, 'select': sel, 'chosen': chosen, 'declined': declined or []}
    out.update(kw)
    return out


def recruit(variant=None, accept=None, decline=None, prompt=None):
    out = {'ask': 'recruit', 'variant': variant or {}, 'accept': accept or [], 'decline': decline or []}
    if prompt:
        out['prompt'] = prompt
    return out
