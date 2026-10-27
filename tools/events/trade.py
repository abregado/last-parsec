"""Trade (33 rows, 36 events). $actor is the character who went trading."""

from helpers import *

TABLE = 'Trade Table'
KEY = 'trade'

FRAGMENTS = []

LOW = 'Low-tech Weapon Table'


def junk(what):
    return what + '? It really is. Just junk.'


EVENTS = [
    ev('a-personal-weapon', [table(LOW)]),

    ev('sell-some-cargo', [credits(2)]),

    ev('find-something-useful', [table('Gear Table')]),

    ev('quality-food-and-booze', [recruit({})]),

    ev('instruction-book', [select('crew', 'reader', label='Reads it'), xp('$reader', 1)],
       text='Instruction book. A random crew member can read it and earn +1 XP.'),

    ev('bits-of-scrap', [credits(1)]),

    ev('medical-pack', [
        pick('Take which?', 1, [
            ('stim-pack', 'Stim-pack', [item('Stim-pack', table='Consumables Subtable')]),
            ('med-patch', 'Med-patch', [item('Med-patch', table='Gear Table')]),
        ]),
    ]),

    # Worthless trinket: a 6 on the 1D6 is worth +1 story point.
    ev('worthless-trinket', [], weight=1.67, text=junk('Worthless')),
    ev('worthless-trinket', [story(1)], id='worthless-trinket-valuable', weight=0.33,
       text='Worthless? Not this time: it turns out to be worth something. Earn +1 story point.'),

    ev('local-maps', [condition('local-maps')]),

    ev('luxury-trinket', [
        if_(species(A, 'swift'),
            [say('A Swift keeps it for themselves.'), xp(A, 2)],
            [options('What do you do with the trinket?', [
                ('keep', 'Keep it as a Recruiting gift (+2)', [condition('recruit-gift')]),
                ('sell', 'Sell it', [{'alternatives': {'n': 2, 'table': 'trade'}, 'prompt': 'Roll twice on the Trade Table and keep the result you prefer.'}]),
            ])]),
    ]),

    ev('basic-supplies', [condition('supplies')]),

    ev('contraband', [
        yesno('Accept the contraband?', yes=[
            {'roll': '1D6', 'as': 'c', 'label': 'Credits from selling it'}, credits('$c'),
            if_(var('$c', gte=4), [say('Trouble follows.', 'bad'), rival()]),
        ], no=[say('You pass on it.')]),
    ]),

    ev('gun-upgrade-kit', [
        pick('Take which?', 1, [
            ('laser-sight', 'Laser Sight', [item('Laser Sight', table='Gun Sights Subtable')]),
            ('bipod', 'Bipod', [item('Bipod', table='Gun Mods Subtable')]),
            ('beam-light', 'Beam Light', [item('Beam Light', table='Gun Mods Subtable')]),
        ]),
    ]),

    ev('useless-trinket', [], weight=1.67, text=junk('Useless')),
    ev('useless-trinket', [story(1)], id='useless-trinket-valuable', weight=0.33,
       text='Useless? Not this time: it turns out to be worth something. Earn +1 story point.'),

    ev('trade-goods', [condition('trade-goods')]),

    ev('something-interesting', [table('Loot Table')]),

    ev('fuel', [{'roll': '1D6', 'as': 'f', 'label': 'Fuel (credits)'}, fuel('$f')]),

    ev('spare-parts', [condition('spare-parts')]),

    ev('tourist-garbage', [], weight=1.33, text='Tourist garbage, and not actually worth anything.'),
    ev('tourist-garbage', [story(1)], id='tourist-garbage-valuable', weight=0.67,
       text='Tourist garbage, but someone will pay for it. Earn +1 story point.'),

    ev('dont-usually-see-these-for-sale', [
        yesno('Pay 3 credits for a Loot Table roll?', yes=[table('Loot Table')], cost={'key': 'credits', 'amount': 3}),
    ]),

    ev('ordnance', [
        pick('Take three grenades, Frakk or Dazzle in any mix.', 3, [
            ('frakk', 'Frakk grenade', [item('Frakk grenade')]),
            ('dazzle', 'Dazzle grenade', [item('Dazzle grenade')]),
        ], repeats=True),
    ]),

    ev('basic-firearms', [
        pick('Take which?', 1, [
            ('handgun', 'Handgun', [item('Handgun', table=LOW)]),
            ('colony-rifle', 'Colony Rifle', [item('Colony Rifle', table=LOW)]),
            ('shotgun', 'Shotgun', [item('Shotgun', table=LOW)]),
        ]),
    ]),

    ev('odd-device', [
        yesno('Pay 1 credit for the odd device?', cost={'key': 'credits', 'amount': 1}, yes=[
            {'roll': '1D6', 'label': 'Is it any good?', 'outcomes': [
                {'min': 6, 'text': 'It works!', 'tone': 'good', 'steps': [table('Loot Table')]},
                {'max': 5, 'text': 'Complete garbage.', 'tone': 'bad'}]},
        ]),
    ]),

    ev('military-fuel-cell', [condition('fuel-cell')]),

    ev('hot-tip', [rumors(1)]),

    ev('insider-information', [condition('insider-info')]),

    ev('army-surplus', [
        pick('Take which?', 1, [
            ('auto-rifle', 'Auto Rifle', [item('Auto Rifle', table='Military Weapon Table')]),
            ('blast-pistol', 'Blast Pistol', [item('Blast Pistol', table='High-tech Weapon Table')]),
            ('glare-sword', 'Glare Sword', [item('Glare Sword', table='High-tech Weapon Table')]),
        ]),
    ]),

    ev('a-chance-to-unload-some-stuff', [
        number('How many weapons will you sell (2 credits each)?', 6, [
            select('items', 'sold', count='$n', list=True, where=all_(fact('item.category', eq='weapon'), not_(fact('item.damaged')))),
            for_each('$sold', [effect('item.remove', target='$each'), credits(2)]),
        ], **{'as': 'n'}),
    ], text='A chance to unload some stuff. A revolutionary will buy undamaged weapons for 2 credits each; the ones sold are chosen at random.'),

    ev('a-lot-of-blinking-lights', [table('Gear Subtable')]),

    ev('gently-used', [table('Gear Subtable', damaged=True)]),

    ev('pre-owned', [table('Loot Table', damaged=True)]),

    ev('medical-reserves', [
        repeat(2, [item('Stim-pack', table='Consumables Subtable'), item('Med-patch', table='Gear Table')]),
    ]),

    ev('starship-repair-parts', [{'roll': '1D6', 'as': 'p', 'label': 'Worth (credits of Hull repair)'}, ship_parts('$p')]),
]
