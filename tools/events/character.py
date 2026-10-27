"""Character Events (30 rows, 31 events). $actor is the character it happens to."""

from helpers import *

TABLE = 'Character Events Table'
KEY = 'character'

FRAGMENTS = []

KERIN = species(A, 'kerin')

EVENTS = [
    ev('all-this-endless-violence-is-depressing-you', [
        if_(KERIN, [say('K’Erin are unaffected by this.')],
            [condition('refuses-battle', target=A), story(1)]),
    ]),

    ev('you-have-some-business-to-attend-to-elsewhere', [
        if_(species(A, 'swift'),
            [remove_member(A), recruit({'species': 'swift'}, prompt='A brand new Swift character takes their place.')],
            [condition('away', target=A)]),
    ]),

    ev('you-make-some-local-friends', [xp(A, 1)]),

    ev('you-are-starting-to-wonder-if-it-is-time-to-move-on', [
        if_(fact('member.inSickBay', A), [
            {'roll': '1D6', 'as': 'r', 'label': 'Time to move on?'},
            if_(var('$r', lte='$actor.sickBayTurns'), [say('They decide to leave the crew.', 'bad'), remove_member(A)],
                [say('They decide to stay.')]),
        ]),
    ]),

    # Letter from home: a 5-6 on the 1D6 is a Quest.
    ev('you-get-a-letter-from-home', [xp(A, 1)], weight=2,
       text='A letter arrives from home with good news. The character earns +1 XP.'),
    ev('you-get-a-letter-from-home', [
        xp(A, 1),
        if_(has_condition('on-quest'), [say('The letter holds another lead on your Quest.'), rumors(1)],
            [say('You immediately receive a Quest!', 'good'), condition('on-quest')]),
    ], id='you-get-a-letter-from-home-quest', weight=1,
       text='A letter arrives from home, and it is more than news. The character earns +1 XP, and you immediately receive a Quest (or, if you already have one, a Rumor).'),

    ev('you-argue-with-the-rest-of-the-crew', [condition('refuses-tasks', target=A)]),

    ev('you-get-in-a-scrap-with-another-crew-member', [
        select('crew', 'foe', exclude=[A], prefer=species('$this', 'kerin'), label='Opponent'),
        {'roll': '1D6', 'as': 'a', 'label': 'This character (1D6 + Combat Skill)', 'add': [{'label': 'Combat Skill', 'value': '$actor.combat'}]},
        {'roll': '1D6', 'as': 'b', 'label': 'Opponent (1D6 + Combat Skill)', 'add': [{'label': 'Combat Skill', 'value': '$foe.combat'}]},
        if_(var('$a', lt='$b'), [say('The character loses.', 'bad'), sick(A, 1)],
            [if_(var('$b', lt='$a'), [say('The opponent loses.'), sick('$foe', 1)],
                 [say('A draw: both end up in Sick Bay.', 'bad'), sick(A, 1), sick('$foe', 1)])]),
    ], requires=fact('crew.count', gte=2)),

    ev('the-local-food-is-sitting-well-with-you', [
        if_(is_engineer(), [say('Engineers receive no benefit from this.')],
            [if_(fact('member.inSickBay', A), [sick(A, -1)], [xp(A, 1)])]),
    ]),

    ev('you-are-not-sure-you-are-really-the-same-person-any-longer', [
        {'table': 'Motivation Table', 'as': 'm', 'label': 'New motivation'},
        if_(fact('member.motivations', A, includes='$m.rowId'),
            [say('Nothing changes: the character is particularly self-assured.'), story(1)],
            [effect('motivation.set', target=A, row='$m.rowId')]),
    ]),

    ev('it-is-time-for-a-make-over', []),

    ev('overhear-something-useful', [rumors(1)]),

    ev('earn-a-little-on-the-side', [credits(2)]),

    ev('have-a-heart-to-heart-talk-with-a-crew-member', [
        select('crew', 'friend', exclude=[A], label='Talks with'),
        xp(A, 1), xp('$friend', 1),
    ]),

    ev('time-spent-exercising-is-never-wasted', [xp(A, 2)]),

    ev('you-pick-up-an-unusual-hobby', [
        story(1),
        if_(species(A, 'swift', 'precursor'), [xp(A, 2)]),
    ]),

    ev('the-scars-tell-the-story', [
        if_(any_(fact('turn.casualtyIds', includes=A), {'ask': 'Was this character injured in the last battle or this turn?'}),
            [xp(A, 2)], [say('No scars to speak of.')]),
    ]),

    ev('youve-had-time-to-reflect-on-your-adventures', [xp(A, '1D3')]),

    ev('youve-made-a-real-personal-breakthrough', [effect('stat.raiseRandom', target=A)], fallback=[xp(A, 1)]),

    ev('you-get-hurt-while-working-on-the-ship', [sick(A, 1), hull(-1)]),

    ev('you-have-finally-found-true-love-in-this-bleak-universe', [
        story(1),
        if_(fact('member.motivations', A, includes='romance'), [xp(A, '1D6')]),
    ]),

    ev('a-personal-enemy-has-tracked-you-down', [rival(bindTo=A)]),

    ev('someone-has-sent-you-a-gift', [table('Loot Table')]),

    ev('you-feel-great', [
        if_(is_engineer(), [say('Engineers cannot benefit from this event.')], [condition('injury-ignore', target=A)]),
    ]),

    ev('you-know-someone-who-knows-someone', [patron()]),

    ev('maybe-you-are-leading-a-charmed-existence', [luck(A)]),

    ev('youve-put-in-a-lot-of-hard-work-around-here', [
        if_(is_engineer(),
            [hull(2), select('items', 'broken', where=fact('item.damaged')), effect('item.repair', target='$broken')],
            [options('What does the character spend the time on?', [
                ('hull', 'Repair 2 Hull Points', [hull(2)]),
                ('item', 'Repair a damaged item', [select('items', 'broken', where=fact('item.damaged')), effect('item.repair', target='$broken')]),
            ])]),
    ]),

    ev('they-dont-make-them-like-they-used-to', [
        if_(is_engineer(), [say('Engineers are not affected by this event.')],
            [select('items', 'broken', carrier=A), effect('item.damage', target='$broken')]),
    ]),

    ev('where-did-it-go', [
        select('items', 'lost', carrier=A, required=True, label='Missing'),
        effect('item.hold', target='$lost', type='missing-item'),
    ], fallback=[xp(A, 1)]),

    ev('a-deep-feeling-of-melancholy-and-despair-is-afflicting-you', [
        if_(KERIN, [say('K’Erin are not affected by this event.')], [condition('no-xp', target=A)]),
    ]),

    ev('youve-had-a-lot-of-time-to-burn', [condition('extra-action', target=A)]),
]
