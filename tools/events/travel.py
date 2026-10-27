"""Starship Travel Events (16 rows, 25 events)."""

from helpers import *

TABLE = 'Starship Travel Events Table'
KEY = 'travel'

# The best Savvy on board among crew who are not in Sick Bay.
def pilot(label='Pilot'):
    return select('crew', 'pilot', best='savvy', where=awake(), label=label, required=True)


SAVVY = [{'label': 'Savvy', 'value': '$pilot.savvy'}]

FRAGMENTS = [
    fragment('detonation', [
        roll('1D6+1', as_='d', label='Hull Point damage'),
        hull('-$d'),
    ]),
]

POD = 'You find an escape pod drifting through space and rescue whoever is in it. '
DISTRESS = '“This is Licensed Trader Cyberwolf.” You answer the call. '

EVENTS = [
    ev('asteroids', [
        pilot(),
        repeat(3, [{'roll': '1D6', 'as': 'r', 'label': 'Piloting', 'add': SAVVY, 'target': 4,
                    'pass': [say('Clear of the rocks.', 'good')], 'fail': [hull('-1D6')]}]),
    ], weight=4, text='Rocky debris everywhere, maybe from a recent collision? There is no way round: the best pilot on board takes the ship through. Roll 1D6+Savvy three times, requiring a 4+ to succeed each time. Each failed roll inflicts 1D6 Hull Point damage to the ship.'),

    ev('navigation-trouble', [
        story(-1),
        if_(fact('ship.hullDamaged'), [select('crew', 'unlucky', label='Hurt by the malfunctions'), injury('$unlucky')]),
        again(),
    ]),

    ev('raided', [
        pilot('Speaks for the ship'),
        {'roll': '1D6', 'label': 'Intimidate (1D6 + Savvy, needs 6+)', 'add': SAVVY, 'target': 6,
         'pass': [say('The pirates back off.', 'good')],
         'fail': [say('The pirates rake the ship and make off with what they can.', 'bad'), hull('-1D6'), rival()]},
    ], text='Your vessel catches the eye of some pirates. Intimidation might work: the best pilot on board rolls 1D6+Savvy, and a 6+ avoids trouble. Otherwise the pirates rake the ship (1D6 Hull Point damage) and you pick up a Rival.'),

    ev('deep-space-wreckage', [repeat(2, [table('Gear Subtable', damaged=True)])]),

    ev('drive-trouble', [
        select('crew', 'crew3', count=3, best='savvy', where=awake(), list=True, label='At the drive'),
        for_each('$crew3', [{'roll': '1D6', 'label': 'Drive repair (1D6 + Savvy, needs 6+)', 'add': [{'label': 'Savvy', 'value': '$each.savvy'}], 'target': 6,
                             'fail': [say('The drive stays down.', 'bad'), condition('grounded', turns=1, **{'from': 'next'})]}]),
    ], text='It’s not supposed to make that sound. The three best crew on board each roll 1D6+Savvy, and a 6+ is required for success. For each failure, you are grounded on the next world for one campaign turn while the drive is reset. Taking off before the drive is reset inflicts 2D6 Hull Point damage to the ship.'),

    ev('down-time', [
        select('crew', 'who', label='Spends the time well'), xp('$who', 1),
        select('items', 'broken', where=fact('item.damaged')), effect('item.repair', target='$broken'),
    ], text='It’s a long time to just sit here. A random crew member adds +1 XP. The crew has time to do maintenance tasks, and one damaged item is Repaired with no roll required.'),

    # Distress call, one event for each answer of the 1D6 (1, 2, 3-4, 5-6).
    ev('distress-call', [say('Too late.', 'bad'), {'call': 'detonation'}], id='distress-call-detonation', weight=1,
       text=DISTRESS + 'The ship’s drive must have detonated moments after you received the signal. Your ship is struck by a wave of debris as you approach, suffering 1D6+1 Hull Point damage.'),
    ev('distress-call', [], id='distress-call-wreckage', weight=1,
       text=DISTRESS + 'You only find drifting wreckage.'),
    ev('distress-call', [{'rollGroup': 'escape-pod'}], id='distress-call-rescue', weight=2,
       text=DISTRESS + 'You arrive in time to rescue a crew member. Treat this as the Escape pod event.'),
    ev('distress-call', [
        pilot('Takes the helm'),
        {'repeat': {'max': 3, 'until': {'var': '$r.success', 'eq': True}},
         'steps': [{'roll': '1D6', 'as': 'r', 'label': 'Attempt (1D6 + Savvy, needs 7+)', 'add': SAVVY, 'target': 7}]},
        if_(var('$r.success', eq=True),
            [say('The jubilant crew give you a bunch of stuff.', 'good'), repeat(3, [table('Gear Subtable')])],
            [say('The drive detonates.', 'bad'), {'call': 'detonation'}]),
    ], id='distress-call-save-the-ship', weight=2,
       text=DISTRESS + 'You arrive in time to help save the ship from a drive malfunction. The best pilot on board rolls 1D6+Savvy, needing 7+, with up to three attempts. If you succeed, the jubilant crew give you a bunch of stuff: roll three times on the Gear Subtable. If you fail, the drive detonates and your ship takes 1D6+1 Hull Point damage.'),

    ev('patrol-ship', [
        {'roll': '1D6-3', 'as': 'c1', 'label': 'First search'},
        if_(var('$c1', gt=0), [select('items', 't1', count='$c1', list=True), for_each('$t1', [effect('item.remove', target='$each')])]),
        {'roll': '1D6-3', 'as': 'c2', 'label': 'Second search'},
        if_(var('$c2', gt=0), [select('items', 't2', count='$c2', list=True, exclude=['$t1']), for_each('$t2', [effect('item.remove', target='$each')])]),
        condition('no-invasion-next'),
    ], text='A Unity patrol vessel hails you. Roll 1D6-3 twice. Each die that scores above a 0 results in that number of items being confiscated as contraband, taken at random from those carried or in your Stash. Due to the military presence, the next world you visit cannot be Invaded.'),

    ev('cosmic-phenomenon', [
        select('crew', 'seer', label='Sees it'), luck('$seer'),
        if_(fact('crew.has', species='precursor'), [say('The Precursor predicts it is a good omen.'), story(1)]),
        condition('cosmic-seen'),
    ], requires=not_(has_condition('cosmic-seen'))),

    # Escape pod, one event for each answer of the 1D6 (1, 2-3, 4, 5, 6).
    ev('escape-pod', [options('They’re a wanted criminal. What do you do when you reach the next world?', [
        ('let-go', 'Let them go', [condition('criminal-favor')]),
        ('turn-in', 'Turn them in', [credits('1D6'), rival()]),
    ])], id='escape-pod-wanted-criminal', weight=1.17, group='escape-pod',
       text=POD + 'They’re a wanted criminal. If you let them go when you arrive on the next world, they might do you a favor later: the next time you make a new Rival, roll 1D6 and on 4+ the Rival is removed from the campaign. If you turn them in, claim 1D6 credits, but get a Rival from their old gang.'),
    ev('escape-pod', [credits('1D3'), table('Loot Table')], id='escape-pod-reward', weight=2.33, group='escape-pod',
       text=POD + 'They reward you with 1D3 credits and a roll on the Loot Table.'),
    ev('escape-pod', [rumors(1), story(1)], id='escape-pod-information', weight=1.17, group='escape-pod',
       text=POD + 'They have nothing to pay you with, but do have some interesting information. Add 1 Rumor and 1 story point.'),
    ev('escape-pod', [recruit({'equipment': False})], id='escape-pod-recruit', weight=1.17, group='escape-pod',
       text=POD + 'They are willing to join your crew. Roll up a new character, but they come with no equipment at all. If you don’t want to hire them, they just leave at the next world.'),
    ev('escape-pod', [recruit({'equipment': False, 'xp': 10})], id='escape-pod-veteran-recruit', weight=1.17, group='escape-pod',
       text=POD + 'They are willing to join your crew, and begin play with 10 XP as yet unspent. They come with no equipment at all. If you don’t want to hire them, they just leave at the next world.'),

    ev('accident', [
        select('crew', 'hurt', label='Hurt'), sick('$hurt', 1),
        select('items', 'broken', carrier='$hurt'), effect('item.damage', target='$broken'),
    ]),

    ev('travel-time', [
        select('crew', 'resting', count=20, list=True, where=fact('member.inSickBay')),
        for_each('$resting', [sick('$each', -1)]),
    ]),

    ev('uneventful-trip', [select('items', 'broken', where=fact('item.damaged')), effect('item.repair', target='$broken')]),

    ev('time-to-reflect', [story(1)]),

    # Time to read a book, one event for each answer of the 1D6 (1-2, 3-4, 5-6).
    ev('time-to-read-a-book', [select('crew', 'reader', label='Reads'), xp('$reader', 3)], id='time-to-read-a-book-solo', weight=1.33,
       text='There’s time to sit, have a read, and maybe even indulge in a bit of education. A random crew member earns +3 XP.'),
    ev('time-to-read-a-book', [select('crew', 'two', count=2, list=True, label='Read'), xp('$two.0', 2), xp('$two.1', 1)],
       id='time-to-read-a-book-pair', weight=1.33,
       text='There’s time to sit, have a read, and maybe even indulge in a bit of education. A random crew member earns +2 XP and a second random crew member earns +1 XP.'),
    ev('time-to-read-a-book', [select('crew', 'three', count=3, list=True, label='Read'), for_each('$three', [xp('$each', 1)])],
       id='time-to-read-a-book-group', weight=1.33,
       text='There’s time to sit, have a read, and maybe even indulge in a bit of education. Three random crew each earn +1 XP.'),

    ev('locked-in-the-library-data-by-night', [
        effect('planets.generate', count=3, **{'as': 'worlds'}),
        condition('destinations', params={'planetIds': '$worlds'}),
    ]),
]
