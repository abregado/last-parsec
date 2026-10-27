"""Campaign Events (28 rows, 28 events). No $actor: these happen to the crew as a whole."""

from helpers import *

TABLE = 'Campaign Events Table'
KEY = 'campaign'

FRAGMENTS = []

WEAPONS = [
    ('hand-cannon', 'Hand Cannon', [item('Hand Cannon', table='High-tech Weapon Table')]),
    ('military-rifle', 'Military Rifle', [item('Military Rifle', table='Military Weapon Table')]),
    ('shotgun', 'Shotgun', [item('Shotgun', table='Low-tech Weapon Table')]),
    ('machine-pistol', 'Machine Pistol', [item('Machine Pistol', table='Low-tech Weapon Table')]),
]

EVENTS = [
    ev('youve-met-a-friendly-doc-who-doesnt-ask-too-many-questions', [
        select('crew', 'patients', count=2, list=True, where=fact('member.inSickBay'), label='Treated'),
        for_each('$patients', [sick('$each', -1)]),
    ], text='You’ve met a friendly doc who doesn’t ask too many questions. Up to two random crew members in Sick Bay have their Recovery time reduced by one campaign turn each. If they recover, they can act normally next campaign turn.'),

    ev('the-life-support-system-on-the-ship-needs-upgrading-badly', [
        if_(fact('crew.has', species='engineer'),
            [{'roll': '1D6', 'as': 'cost', 'label': 'Upgrade cost (credits)', 'add': [{'label': 'Engineer', 'value': -1}]}],
            [{'roll': '1D6', 'as': 'cost', 'label': 'Upgrade cost (credits)'}]),
        effect('pay', amount='$cost', **{'else': [say('The crew can’t pay yet: the ship can’t be flown until they do.', 'bad'),
                                                  condition('life-support', params={'cost': '$cost'})]}),
    ]),

    ev('a-chance-meeting-turns-into-a-new-ally', [
        recruit({}, decline=[story(1)], prompt='Roll up the new character, or take +1 story point instead.'),
    ]),

    ev('youve-made-friends-among-the-locals', [story(1)]),

    ev('you-managed-to-mouth-off-to-the-wrong-people', [rival()]),

    ev('an-old-nemesis-has-tracked-you-down', [
        if_(fact('planet.disabledRivals', gt=0),
            [select('rivals', 'old', disabled=True, label='A prior Rival'), effect('rival.enable', target='$old'), condition('follows', target='$old')],
            [rival(**{'as': 'nr'}), condition('follows', target='$nr')]),
    ], text='An old nemesis has tracked you down. A prior Rival is chosen at random, or a new one is rolled up if you have none. They follow you from planet to planet until resolved and receive +1 when rolling for the number of enemies in a battle.'),

    ev('a-shady-character-offers-you-a-deal', [
        offer('Give him which item?', {'from': 'items', 'offer': 2}, [
            effect('item.remove', target='$gift'), say('The item changes hands for a roll on the Trade Table.'), table('trade'),
        ], [say('No deal.')], **{'as': 'gift'}),
    ], text='A shady character offers you a deal. Give him one of two items you carry, chosen at random, and roll on the Trade Table.'),

    ev('you-sell-off-some-cargo-you-acquired-on-the-last-planet', [credits('1D6')]),

    ev('one-of-the-crew-overheard-something-interesting', [rumors(1)]),

    ev('youve-managed-to-settle-some-old-business', [
        if_(fact('planet.rivals', gt=0),
            [offer('Settle which old business?', {'from': 'rivals', 'offer': 2}, [effect('rival.disable', target='$old', reason='old business settled')], [], **{'as': 'old'})],
            [select('crew', 'captain', where=fact('member.isLeader'), label='Captain'), xp('$captain', 1)]),
    ], text='You’ve managed to settle some old “business”. If you have any Rivals, you may remove one of two chosen at random. If you have no Rivals, your captain earns +1 XP instead.'),

    ev('an-admirer-wants-to-come-along', [
        recruit({'baseProfileOnly': True, 'equipment': False, 'feralIfCrewFeral': True}),
    ]),

    ev('an-alien-merchant-offers-you-some-strange-device', [
        yesno('Pay 4 credits for the device?', yes=[table('Loot Table')], cost={'key': 'credits', 'amount': 4}),
    ]),

    ev('equipment-malfunction', [
        select('items', 'broken', carrier='stash', where=not_(fact('item.damaged')), label='Malfunctions'),
        effect('item.damage', target='$broken'),
    ]),

    ev('youve-earned-a-bit-of-a-bad-reputation', [
        select('patrons', 'p', label='Will no longer work with you'),
        effect('patron.disable', target='$p', reason='bad reputation'),
    ]),

    ev('the-tax-man-is-taking-an-interest-in-your-business-conduct', [
        {'roll': '2D6', 'keep': 'highest', 'as': 't', 'label': 'Tax (credits, the higher die)'},
        effect('pay', amount='$t', **{'else': [say('The crew can’t pay: the ship is impounded.', 'bad'), condition('impounded', params={'cost': '$t'})]}),
    ]),

    ev('the-crew-has-decided-its-time-for-a-new-person-to-be-in-charge', [
        select('crew', 'old', where=fact('member.isLeader'), label='Old captain'),
        select('crew', 'new', where=not_(fact('member.isLeader')), prefer=species('$this', 'kerin'), label='New captain'),
        effect('leader.set', target='$new'), xp('$new', 3),
        {'roll': '1D6', 'as': 'r', 'label': 'Does the old captain stay?'},
        if_(var('$r', eq=1), [
            say('The old captain leaves the campaign for good, taking what they carry.', 'bad'),
            select('items', 'theirs', carrier='$old', count=50, list=True),
            for_each('$theirs', [effect('item.remove', target='$each')]),
            remove_member('$old'),
        ]),
    ]),

    ev('youve-made-some-business-contacts', [patron()]),

    ev('recent-events-made-for-a-good-learning-opportunity', [
        select('crew', 'everyone', count=50, list=True), for_each('$everyone', [xp('$each', 1)]),
    ]),

    ev('during-routine-maintenance-the-gravitational-adjuster-got-knocked-out-of-alignment', [
        {'roll': '1D6', 'as': 'd', 'label': 'Hull Point damage'}, hull('-$d'),
    ]),

    ev('the-crew-spends-a-night-drinking-watching-movies-and-playing-cards', [story(1)]),

    ev('you-meet-up-with-an-old-arms-dealer-contact-who-owes-you-a-deal', [
        pick('Choose three weapons (the same one more than once is fine).', 3, WEAPONS, repeats=True),
    ]),

    ev('you-renegotiate-some-old-debts', [
        if_(fact('ship.debt', gt=0),
            [{'roll': '1D6+1', 'as': 'd', 'label': 'Debt reduction (credits)'}, debt('-$d')],
            [say('You owe nothing, so you earn 2 credits for being prudent with your money.'), credits(2)]),
    ]),

    ev('the-sector-news-networks-are-awash-with-rumors-of-war', [condition('war-rumors')]),

    ev('a-bit-of-time-on-your-hands', [
        select('crew', 'explorers', count=2, list=True, label='Exploring'),
        for_each('$explorers', [table('exploration', actor='$each')]),
    ]),

    ev('you-got-noticed-by-someone-youd-rather-avoid', [
        rival(**{'as': 'nr'}),
        if_(has_condition('on-quest'), [
            say('Because you are on a Quest, next turn you will have to fight them, and they add +1 enemy.', 'bad'),
            condition('forced-rival', params={'rivalId': '$nr.id'}, turns=1, **{'from': 'next'}),
            condition('follows', target='$nr'),
        ]),
    ]),

    ev('its-time-to-go', [condition('overstay')]),

    ev('unity-government-says-no-ships-are-authorized-to-leave', [condition('lockdown')]),

    ev('in-hindsight-itll-make-a-great-story', [
        if_(fact('turn.casualtyCount', gt=0),
            [select('crew', 'hero', where=fact('turn.casualtyIds', includes='$this'), label='A great story'), luck('$hero')],
            [say('Nobody got hurt, so you receive +1 story point instead.'), story(1)]),
    ], text='In hindsight, it’ll make a great story. A crew member who was a casualty in the last battle receives +1 Luck. If nobody got hurt, receive +1 story point instead.'),
]
