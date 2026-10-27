"""Exploration (30 rows, 31 events). $actor is the character who went exploring."""

from helpers import *

TABLE = 'Exploration Table'
KEY = 'exploration'

FRAGMENTS = []

SAVVY = [{'label': 'Savvy', 'value': '$actor.savvy'}]
GADGET = 'Gadget Table'

EVENTS = [
    ev('i-know-a-good-deal-when-i-see-one', [table('trade')]),

    ev('meet-a-patron', [condition('patron-offer')]),

    ev('mustve-been-something-i-ate', [
        if_(species(A, 'soulless', 'kerin'), [say('Soulless and K’Erin ignore this event.')], [sick(A, 1)]),
    ]),

    ev('meet-someone-interesting', [
        rumors(1),
        if_(species(A, 'precursor'), [{'roll': '1D6', 'label': 'Second Rumor (5+)', 'target': 5, 'pass': [rumors(1)]}]),
    ]),

    ev('had-a-nice-chat', [
        {'roll': '1D6', 'label': 'Chat (1D6 + Savvy, needs 5+)', 'add': SAVVY, 'target': 5, 'pass': [story(1)]},
    ]),

    ev('see-the-sights-enjoy-the-view', []),

    ev('make-a-new-friend', [
        if_(species(A, 'feral'), [recruit({'feral': True})], [recruit({})]),
    ]),

    ev('time-to-relax', []),

    ev('possible-bargain', [
        offer('Give up which weapon for a chance at a bargain?',
              {'from': 'items', 'carrier': A, 'where': fact('item.category', eq='weapon'), 'offer': 2},
              [effect('item.remove', target='$weapon'),
               {'roll': '1D6', 'label': 'Bargain', 'outcomes': [
                   {'min': 6, 'text': 'A real bargain!', 'steps': [table('Loot Table')]},
                   {'max': 5, 'text': 'You get 1 credit.', 'steps': [credits(1)]}]}],
              **{'as': 'weapon'}),
    ], text='Possible bargain. Give up one of two weapons the character carries, chosen at random, then roll 1D6. On a 6, get a roll on the Loot Table. Otherwise get 1 credit.'),

    ev('alien-merchant', [
        offer('Give the merchant which item?', {'from': 'items', 'offer': 2},
              [effect('item.remove', target='$gift'), table('Loot Table')], [say('You walk away.')], **{'as': 'gift'}),
    ], text='Alien merchant. Give him one of two items, chosen at random, then roll on the Loot Table.'),

    ev('got-yourself-noticed', [
        if_(fact('planet.rivals', gt=0),
            [select('rivals', 'r', label='Noticed by'), condition('forced-rival', params={'rivalId': '$r.id'})],
            [say('You have no Rivals, so nobody takes notice.')]),
    ]),

    ev('you-hear-a-tip', [condition('tip')]),

    ev('completely-lost', [
        {'roll': '1D6', 'label': 'Find the way back (1D6 + Savvy, needs 4+)', 'add': SAVVY, 'target': 4,
         'pass': [say('They find their way back in time.', 'good')],
         'fail': [say('They miss this campaign turn’s battle.', 'bad'), condition('cant-fight', target=A)]},
        again(),
    ]),

    ev('someone-wants-a-package-delivered', [condition('package', target=A)]),

    # The tech fanatic: a 5-6 on the 1D6 fixes something. An Engineer talks shop either way.
    ev('a-tech-fanatic-offers-to-help-out', [
        if_(is_engineer(), [say('The Engineer spends the afternoon talking shop instead.'), xp(A, 2)],
            [select('items', 'broken', where=fact('item.damaged'), label='Fixed for free'), effect('item.repair', target='$broken')]),
    ], weight=1, text='A tech fanatic offers to help out. They fix a damaged item for free. An Engineer instead spends the afternoon talking shop, earning +2 XP.'),
    ev('a-tech-fanatic-offers-to-help-out', [
        if_(is_engineer(), [say('The Engineer spends the afternoon talking shop instead.'), xp(A, 2)],
            [say('They tinker for an afternoon, but can’t fix anything.')]),
    ], id='a-tech-fanatic-offers-to-help-out-no-luck', weight=2,
       text='A tech fanatic offers to help out, but nothing comes of it. An Engineer spends the afternoon talking shop, earning +2 XP.'),

    ev('got-a-few-drinks', []),

    ev('i-dont-have-a-gambling-problem', [
        if_(species(A, 'soulless'), [say('Soulless ignore this event.')], [
            select('items', 'lost', where=any_(fact('item.carrier', eq=A), fact('item.carrier', eq='stash')), label='Gambled away'),
            effect('item.remove', target='$lost'),
        ]),
    ], text='I don’t have a gambling problem! A random item from the character’s equipment or the crew Stash is gambled away. Soulless ignore this event.'),

    ev('overheard-some-talk', [rumors(1)]),

    ev('pick-a-fight', [
        rival(**{'as': 'nr'}),
        if_(species(A, 'kerin'), [condition('first-meeting', target='$nr')]),
    ]),

    ev('found-a-trainer', [xp(A, 2)]),

    ev('information-broker', [
        number('Buy how many Rumors (2 credits each)?', 3, [rumors('$n')], per={'key': 'credits', 'amount': 2}, **{'as': 'n'}),
    ]),

    ev('arms-dealer', [
        number('How many Military Weapon Table rolls (3 credits each)?', 10,
               [repeat('$n', [table('Military Weapon Table')])], per={'key': 'credits', 'amount': 3}, **{'as': 'n'}),
    ]),

    ev('promising-lead', [condition('promising-lead')]),

    ev('just-needs-a-little-love', [
        if_(is_engineer(), [say('The Engineer has it working right away.'), table(GADGET)], [table(GADGET, damaged=True)]),
    ]),

    ev('get-in-a-bad-fight', [
        sick(A, '1D3'),
        select('items', 'lost', carrier=A, label='Lost in the fight'), effect('item.remove', target='$lost'),
    ], text='Get in a bad fight. The character spends 1D3 campaign turns in Sick Bay, and loses one random item of carried equipment.'),

    ev('offered-a-small-job', [condition('small-job')]),

    ev('offered-a-reward', [condition('reward')]),

    ev('you-make-a-useful-contact', [
        options('Add +1 next campaign turn to which roll?', [
            ('recruit', 'Recruit', [condition('roll-bonus', params={'roll': 'recruit'})]),
            ('patron', 'Find a Patron', [condition('roll-bonus', params={'roll': 'patron'})]),
            ('rival', 'Track a Rival', [condition('roll-bonus', params={'roll': 'rival'})]),
        ]),
    ]),

    ev('who-left-this-lying-around', [
        pick('Take which weapon?', 1, [
            ('handgun', 'Handgun', [item('Handgun', table='Low-tech Weapon Table')]),
            ('blade', 'Blade', [item('Blade', table='Low-tech Weapon Table')]),
            ('colony-rifle', 'Colony Rifle', [item('Colony Rifle', table='Low-tech Weapon Table')]),
            ('shotgun', 'Shotgun', [item('Shotgun', table='Low-tech Weapon Table')]),
        ]),
    ]),

    ev('this-place-is-rather-nice-really', [condition('stay-or-pay', target=A)]),
]
