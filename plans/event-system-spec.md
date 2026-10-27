# Event system: Phase 1 spec

Status: for review. Nothing here is built. Once approved, Phase 2 starts from this.

Covers the five event tables: Starship Travel, Character, Campaign, Exploration and Trade. The book has 137 events. Splitting events that branch on a plain roll (section 7) makes 151.

## 1. Decisions this spec builds on

- Effects apply automatically, behind one **Apply** button per event. The player reads the event text and the "What will happen" ledger first.
- Selectors (who or which) are random. Decisions are prompts in the widget.
- Penalties pick items at random and say so. Opt-in deals use **offer-N**: two random candidates, and the player chooses (or declines).
- No event starts an out-of-phase battle. State that outlives an event is a **Condition**.
- Timers: "next N turns" means turns N+1 to N+N. Checked conditions follow section 5.
- The base pack is locked, shipped with the app and per campaign only through a disabled list. Imports add packs. Event ids are pack-scoped (`base:asteroids`).
- Declining a recruit means they don't join. Characters keep `baseProfile` and `profile`. Rivals and Patrons are disabled, not deleted. There is no campaign migration.
- **Splitting rule.** An event whose first step is a plain (unmodified) roll that branches is split into one event per outcome, with the weight shared in proportion to the dice. An outcome of "nothing happens" becomes a small event with its own text (*Worthless trinket* is junk). Events that start with a decision stay whole: Possible bargain, Contraband and Odd device all ask first and roll after.
- **Ship rolls use the best crew.** Where the book says "select a crew member" for a ship-wide roll, the roll uses the highest stat among crew not in Sick Bay. This is the same rule Step 0 checks use. It applies to Asteroids, Raided, Drive trouble and Distress call.
- **Weights are relative numbers and may be fractional.** The base tables sum to 100 and show a D100 range per row. A pack's weights don't have to sum to anything, and the roll shows the event rather than a die value.
- **One Rumors resource.** The Crew tab and the roster keep only `rumors`. `questRumors` and `invasionRumors` go.
- **Species caps.** Every species lists its caps, Luck included.

## 2. Pack format

```json
{
  "format": "last-parsec-events", "version": 1,
  "pack": { "id": "base", "name": "Base events", "author": "", "version": "1.0", "description": "" },
  "events":     [ Event ],
  "conditions": [ ConditionType ],
  "fragments":  [ { "id": "escape-pod", "steps": [ Step ] } ]
}
```

**Event**

```json
{
  "id": "scrap", "table": "character", "weight": 4, "group": null,
  "title": "You get in a scrap with another crew member.",
  "text": "Printed rule text, shown above the ledger. Editable.",
  "requires": Predicate,
  "steps": [ Step ],
  "fallback": [ Step ]
}
```

- `table`: `travel`, `character`, `exploration`, `trade` or `campaign`.
- `requires`: the event can only be rolled when true (e.g. at least 2 crew). It is checked when the table is rolled, and a failing event is excluded like a disabled row.
- `fallback`: steps used if the event is impossible. The base default is "+1 XP to the character" (p.126).
- The host stage supplies `$actor`, the character the event is for. It is set for Character events, the Exploration or Trade crew member, and *A bit of time on your hands*. It is empty for Travel and Campaign events.
- `group`: an optional name shared by related events. `{ "rollGroup": "escape-pod" }` picks one member by weight (Distress call uses it to "treat as the Escape pod event").
- Fragments are reusable step lists (`{ "call": "detonation" }`), for steps that several events repeat.

**Step types**

| Step | Purpose |
|---|---|
| `roll` | Dice with an optional `add` (`$actor.savvy`), `target`, `as` (bind a name), and `outcomes` (ranges, `natural`, `min` and `max`). |
| `repeat` | `{ times }` or `{ max, until }` (up to three attempts, stop on success). |
| `select` | A selector binding a variable (section 3). |
| `rollGroup` | Pick one event of a group by weight and run it. |
| `if` | A Predicate with `then` and `else`. |
| `ask` | A prompt (section 4). Its answer binds a name and branches. |
| `table` | Roll another table and run that row. `again` rolls on the current table. |
| `alternatives` | `{ n, from }` rolls n results in sandboxed ledgers, and the player picks which to keep. |
| `call` | Run a fragment. |
| `effect` | A typed effect (section 3). |
| `say` | A line of result text with `{tokens}`. It states what happened as fact, not as a choice. |

Dice expressions accept variables (`1D6+$bonus`) and the keep modes `highest` and `lowest`. Every effect also writes its own auto-description to the ledger.

## 3. Registries

Each registry is code. The editor builds its forms from the parameter schemas, so adding a registry entry in code adds it to the editor and the pack validator.

**Effects**

| Effect | Params | Notes |
|---|---|---|
| `resource` | `key`, `amount` | `credits`, `storyPoints`, `rumors`, `fuel`, `shipParts`. Credits can't go below 0. |
| `pay` | `amount`, `else` | Pay now. If the crew can't afford it, `else` runs (typically `condition.add`). |
| `xp` | `target`, `amount` | |
| `stat` | `target`, `stat`, `amount` | Stops at the species cap (`caps` in `species.js`, Luck included). |
| `sickBay` | `target`, `turns` | Positive sets or adds, negative reduces. |
| `injuryRoll` | `target` | Rolls the Injury or Bot Injury table and applies the result. |
| `hull`, `debt` | `amount` | |
| `item.add` | `table` and `row`, or `name`, `damaged?`, `to?` | |
| `item.remove`, `item.damage`, `item.repair` | `selector` | |
| `rival.add`, `patron.add` | `bindTo?` | `bindTo` links a Rival to a member. |
| `rival.disable`, `rival.enable`, `patron.disable` | `selector` | |
| `member.add` | `variant` | Opens the recruit prompt (section 4). |
| `member.remove` | `target` | Their carried items go to the Stash, unless the event says they take them. |
| `leader.set` | `target` | |
| `motivation.set` | `target`, `row` | Gives the XP the new motivation's bonuses would have given. |
| `condition.add`, `condition.remove` | `type`, `scope`, `target?`, `params?` | |
| `planets.generate` | `count` | New planets are added and never become current. |

**Selectors** pick from `crew`, `items`, `rivals` or `patrons`. Options: `where` (a Predicate on each candidate), `count`, `distinct`, `exclude` (variables), `prefer` (a Predicate that wins if anyone matches), `best: <stat>` (take the highest of that stat instead of a random pick; `count` takes the top n; ties are random), and `offer: N` (draw N random candidates, then the player chooses 1, or declines if the step allows).
- `crew` is the current roster.
- `rivals` and `patrons` come from the current planet and exclude disabled ones, unless `where: { disabled: true }`.

**Predicates:** `all`, `any`, `not`, and leaf comparisons on facts:
- `member.species`, `member.inSickBay`, `member.sickBayTurns`, `member.motivation` (the Motivation row id, e.g. `romance`), `member.canGain(stat)` (below its species cap)
- `ship.hullDamaged`, `ship.debt`
- `resource.<key>`, `stash.count`, `crew.count`, `crew.has(species)`, `crew.anyInSickBay`, `crew.damagedItems`
- `planet.rivals`, `planet.patrons`
- `hasCondition(type, scope?)`
- `battle.casualtyIds`, `battle.mission` (the battle record already holds both)
- `ask(prompt)`: a Yes/No for anything the app can't know.

**Prompt types:** `options`, `yesno` (disabled when unaffordable), `number` (min, max, and a per-unit cost), `pickList` (pick k from a list), `offer` (draw N, choose 1) and `recruit`.

## 4. Prompts and the Apply flow

1. **Confirm** the stage. The event rolls and its selectors pick. The run pauses on each prompt until it is answered. Dice are final. Undo or Restart is the only way to roll again.
2. **Review.** The widget shows the event text, the roll and selection lines, and the ledger: "Ava +1 XP", "Credits 12 → 9", "Kess's Blade is damaged". Destructive lines (a crew member leaves, items lost) are marked.
3. **Apply** commits the ledger on top of the pre-stage snapshot. The snapshot covers roster, items, ship, resources, planets, `conditions` and `turnMemory`, so Undo and Restart restore it. Nothing is changed before Apply, and the next stage is locked until the record is applied.

**Recruit prompt.** The widget shows "Generate recruit". It opens the Characters tab in a recruit-only view (also available in Play mode), preset with the variant (no equipment, +10 XP, Feral, base profile only, forced species). The player sees the character and picks Accept or Decline. The paused run is plain JSON, so it survives navigation and reload. Decline runs `onDecline` steps if the event has any, and otherwise nothing happens.

## 5. Conditions

**Condition type**

```json
{
  "id": "away", "name": "Away on business", "scope": "character",
  "text": "Shown on the Crew tab.",
  "duration": { "turns": 2, "from": "next" },
  "check": { "stat": "savvy", "dice": "1D6", "target": 5 },
  "blocks":    [ "upkeep", "tasks", "battle", "event-target" ],
  "modifiers": [ { "target": "roll.invasion", "add": 2 } ],
  "on": { "expire": [ Step ], "fail": [ Step ], "arrive": [ Step ] },
  "tickOn": "turn",
  "endsOn": "depart",
  "consumeOn": "roll.recruit",
  "bypass": { "prompt": "Take off early?", "steps": [ Step ] }
}
```

- `scope`: `crew`, `character`, `planet`, `campaign`, `ship`, `rival` or `patron`.
- `duration`: `{ turns, from: 'now' | 'next' }`, `{ until: trigger }`, or `permanent`.
- `check`: optional (see below).
- `blocks`: things the condition forbids. `bypass` lets the player pay a cost to override a block (grounded, life support unpaid).
- `modifiers` are bonuses on a named roll or cost, read when the stage rolls.
- `on.<trigger>`: steps run when a trigger fires.
- `consumeOn`: the condition is removed after its trigger fires once (single-use items, favours).
- `endsOn`: the condition is removed when a trigger fires (leaving a planet).
- Types that need parameters (the destination planets, the item snapshot, the forced rival id) read them from `params`.

**Instance** (`campaign.conditions`): `{ id, type, scope, targetId, params, activeFrom, remaining, source: { eventId, turn } }`. A condition goes away if its target does (member leaves, rival or patron removed).

**Triggers** (the points stages publish to the system):

| Trigger | Fired by |
|---|---|
| `turnStart` | Step 0 |
| `expire` | Step 0, when `remaining` reaches 0 |
| `stay` | The Travel stage, when the crew didn't travel this turn |
| `depart`, `arrive` | Travel and New world |
| `upkeep` | Upkeep |
| `jobOffers` | Job offers |
| `chooseBattle` | Choose battle |
| `battleResult` | Battle result |
| `injuryRoll` | Injuries |
| `xpAward` | Experience |
| `rivalGained` | Any rival added |
| `rivalResolved` | Rival status |
| `memberRemoved` | The roster |
| `questGained` | Rumors and Quest |
| `roll.recruit`, `roll.patron`, `roll.rival`, `roll.repair`, `roll.invasion` | The stage making that roll |
| `cost.travel`, `cost.upkeep` | Travel and Upkeep |

**Blocks:** `upkeep`, `tasks`, `battle` (optionally `except: mission invasion`), `xp`, `travel`, `event-target`, `injury`. A separate `extraAction` grant is read by Crew tasks.

**Step 0: Conditions** (new `turn/conditions.js`, registered before Start; skipped when nothing is active). At Step 0 of turn T, for each condition with `activeFrom ≤ T`:
1. If it has a `check`, roll it: `check.dice` plus the best `check.stat` among crew **not in Sick Bay** (ties random). If the crew is empty, the check fails. A pass does `remaining -= 1`. A fail runs `on.fail` if the type has one.
2. If it has no `check` and `activeFrom < T`, do `remaining -= 1`. A condition that only just became active doesn't tick.
3. If `remaining ≤ 0`, run `on.expire` and remove it, so it is not active in T.
4. Run `turnStart` hooks of what remains.

Refinement to what we agreed: a checked condition rolls on every turn from `activeFrom` onward, its first active turn included. Without this, *Where did it go?* ("roll next turn") would be checked a turn late. Without a check, the tick rule is as agreed: applied in turn N for 2 turns from next, it is active in N+1 and N+2, ticks at N+2 and N+3, and expires at the start of N+3.

Checks are a house rule: they replace the book's roll by the character themselves. A failed check keeps the counter. Where the book says "lost for good", the type's `on.fail` removes the condition.

## 6. Condition types the base pack ships

| Id | Scope | What it does |
|---|---|---|
| `refuses-battle` | character | 1 turn from next. Blocks `battle` (except invasion). |
| `refuses-tasks` | character | 1 turn from next. Blocks `tasks`. |
| `away` | character | 2 turns from next. Blocks upkeep, tasks, battle and event-target. `expire`: 1D6 XP, plus a Loot Table roll. |
| `no-xp` | character | 1 turn from next. Blocks `xp`. |
| `extra-action` | character | 1 turn from next. Grants an extra task action, even in Sick Bay. |
| `injury-ignore` | character | Until used. `consumeOn: injuryRoll`, and the roll is ignored. |
| `missing-item` | character | `params.item` holds the removed item. Check Savvy 5+. `expire`: the item comes back. `fail`: lost for good. |
| `cant-fight` | character | This turn. Blocks `battle`. |
| `package` | character | Until used. `arrive`: 3 credits, then 1D6 on 1–2 a Rival and +1 story point. Ends with the member. |
| `stay-or-pay` | character | Until `depart`. Prompt: pay 1 story point, or the member stays behind (items to the Stash). |
| `grounded` | ship | `remaining` = failed rolls, from next. Blocks `travel`. `bypass`: take off early for 2D6 hull. |
| `life-support` | ship | `params.cost`. Blocks `travel` until paid. `bypass`: pay the cost. |
| `impounded` | ship | `params.cost`. Same as above. |
| `war-rumors` | planet | `endsOn: depart`. `roll.invasion` +2. |
| `overstay` | planet | `endsOn: depart`. On `stay`: add a Rival. |
| `lockdown` | planet | 2 turns from next. Blocks `travel`. No bypass. |
| `cosmic-seen` | campaign | Permanent. The once-per-campaign flag. |
| `on-quest` | campaign | Until the Quest ends. Replaces the `onQuest` memory flag. |
| `no-invasion-next` | campaign | `consumeOn: arrive`. The next world generated can't be Invaded. |
| `destinations` | campaign | `params.planetIds`. The next arrival must choose one of these. `consumeOn: arrive`. |
| `patron-offer` | campaign | This turn. `consumeOn: jobOffers`. |
| `forced-rival` | campaign | `params.rivalId`. `consumeOn: chooseBattle`: the battle is against that Rival. |
| `tip` | campaign | This turn. `consumeOn: chooseBattle`: offers a Yes/No to fight a tracked Rival. |
| `small-job`, `reward` | campaign | This turn. Battle tab reminder. `battleResult`: Yes/No, then 2 credits. |
| `promising-lead` | campaign | This turn. `battleResult`: if the mission is Opportunity, 3 credits. |
| `roll-bonus` | campaign | `params.roll`. +1 on that roll next turn. `consumeOn` that roll. |
| `criminal-favor` | campaign | Until used. `rivalGained`: 1D6, on 4+ disable that Rival. |
| `recruit-gift` | campaign | Until used. `roll.recruit` +2. |
| `local-maps` | campaign | `tickOn: arrive`, 2 arrivals. `questGained`: Rumors +1. |
| `supplies` | campaign | Until used. `upkeep`: prompt, then skip Upkeep costs. |
| `trade-goods` | campaign | Until sold. `arrive`: prompt to roll the price, and a 1 destroys them. |
| `fuel-cell` | campaign | Until used. `cost.travel`: zero. |
| `insider-info` | campaign | Until used. `roll.patron`: automatic success. |
| `spare-parts` | ship | `roll.repair` +1. A natural 1 uses them up. |
| `follows` | rival | Until `rivalResolved`. +1 enemy. |
| `first-meeting` | rival | `consumeOn: battle`. −1 enemy. |
| `bound` | rival | `memberRemoved`: disable the Rival. Created by `rival.add` with `bindTo`. |

`fuel` and `shipParts` stay as the existing roster resources.

## 7. Classification

Rows with a weight are new or changed; the others keep the book's weight.

Class codes:
- **P** plain: rolls and effects only.
- **O** prompt: a decision, offer-N, number, pick-list or recruit.
- **C** creates a condition.
- **R** reworked: the rule differs from the book.
- **N** no effect: text only.

`$actor` is the character the event is for (Character events, the Exploration or Trade crew member). "Random crew" means a random roster member, and "Savvy" means the roll uses that member's Savvy. Item picks are random unless the row says offer.

### Starship Travel Events (16)

| Id | Class | What it does |
|---|---|---|
| asteroids | P R | Weight 4 (was 7). Go through only: the best-Savvy crew member outside Sick Bay rolls 1D6+Savvy 4+ three times, each failure 1D6 hull. If all pass: "You flew through an asteroid belt without incident." |
| navigation-trouble | P | Story points −1. If the hull is damaged, random crew rolls Injury. Table again. |
| raided | R | Best-Savvy crew member outside Sick Bay, 1D6+Savvy 6+. On failure: 1D6 hull and a Rival (no battle). |
| deep-space-wreckage | P | 2 Gear Subtable items to the Stash, both damaged. |
| drive-trouble | C | The 3 best-Savvy crew outside Sick Bay each roll 1D6+Savvy 6+. Each failure adds 1 turn of `grounded` (from next, count = failures). |
| down-time | P | Random crew +1 XP. Repair one random damaged item. |
| distress-call-detonation | P | Weight 1. "The drive must have detonated moments after you received the signal." Hull −(1D6+1). Calls `detonation`. |
| distress-call-wreckage | N | Weight 1. "Only drifting wreckage." |
| distress-call-rescue | P | Weight 2. `rollGroup escape-pod`: "Treat this as the Escape pod event". |
| distress-call-save-the-ship | P | Weight 2. Best-Savvy crew member outside Sick Bay, up to 3 rolls of 1D6+Savvy 7+, stopping at the first success. Success: 3 Gear Subtable items to the Stash. All fail: `detonation`. |
| patrol-ship | P C | Two rolls of 1D6−3. Each result above 0 removes that many random items (carried or Stash). Adds `no-invasion-next`. |
| cosmic-phenomenon | P C | Requires not `cosmic-seen`. Random crew +1 Luck (if able). A Precursor in the crew: +1 story point. Adds `cosmic-seen`. |
| escape-pod-wanted-criminal | O C | Group `escape-pod`, weight 1.17. Ask: let them go (adds `criminal-favor`) or turn them in (credits +1D6 and a Rival). |
| escape-pod-reward | P | Group `escape-pod`, weight 2.33. Credits +1D3 and a Loot Table item, both now (the book pays at the nearest world). |
| escape-pod-information | P | Group `escape-pod`, weight 1.17. Rumors +1, story points +1. |
| escape-pod-recruit | O | Group `escape-pod`, weight 1.17. Recruit prompt, no equipment. |
| escape-pod-veteran-recruit | O | Group `escape-pod`, weight 1.17. Recruit prompt, no equipment, +10 XP. |
| accident | P | Random crew: Sick Bay 1, and one item they carry is damaged. |
| travel-time | P | Everyone in Sick Bay: Sick Bay −1. |
| uneventful-trip | P | Repair one random damaged item. |
| time-to-reflect | P | Story points +1. |
| time-to-read-a-book-solo | P | Weight 1.33. Random crew +3 XP. |
| time-to-read-a-book-pair | P | Weight 1.33. A random crew member +2 XP and a second +1 XP. |
| time-to-read-a-book-group | P | Weight 1.33. Three distinct random crew +1 XP each. |
| locked-in-the-library-data-by-night | C | `planets.generate` 3 (they join the campaign, none current). Adds `destinations`. |

### Character Events (30)

| Id | Class | What it does |
|---|---|---|
| all-this-endless-violence-is-depressing-you | P C | Unless $actor is K'Erin (then nothing): story points +1, adds `refuses-battle`. |
| you-have-some-business-to-attend-to-elsewhere | C O | Swift: $actor leaves and a Swift replacement is recruited (forced species; declined means no replacement). Otherwise adds `away`. |
| you-make-some-local-friends | P | $actor +1 XP. |
| you-are-starting-to-wonder-if-it-is-time-to-move-on | P | If $actor is in Sick Bay: 1D6. At or below their remaining turns, they leave. |
| you-get-a-letter-from-home | P | Weight 2. $actor +1 XP. |
| you-get-a-letter-from-home-quest | P C | Weight 1. $actor +1 XP. If `on-quest`: Rumors +1. Otherwise adds `on-quest`. |
| you-argue-with-the-rest-of-the-crew | C | Adds `refuses-tasks`. |
| you-get-in-a-scrap-with-another-crew-member | P | Requires 2+ crew. Another crew member (prefer K'Erin). Each rolls 1D6+Combat. The lower goes to Sick Bay for 1 turn, a draw sends both. |
| the-local-food-is-sitting-well-with-you | P | Engineer: nothing. If in Sick Bay: Sick Bay −1. Otherwise +1 XP. |
| you-are-not-sure-you-are-really-the-same-person-any-longer | P | Roll Motivation. The same row id as their current one: story points +1. Otherwise `motivation.set`, plus XP for each +1 ability bonus the new motivation gives. |
| it-is-time-for-a-make-over | N | Cosmetic. |
| overhear-something-useful | P | Rumors +1. |
| earn-a-little-on-the-side | P | Credits +2. |
| have-a-heart-to-heart-talk-with-a-crew-member | P | Another random crew member. Both +1 XP. |
| time-spent-exercising-is-never-wasted | P | $actor +2 XP. |
| you-pick-up-an-unusual-hobby | P | Story points +1. Swift or Precursor: +2 XP. |
| the-scars-tell-the-story | P | If $actor was a casualty last battle or this turn: +2 XP. Uses `battle.casualtyIds`, or a Yes/No. |
| youve-had-time-to-reflect-on-your-adventures | P | $actor +1D3 XP. |
| youve-made-a-real-personal-breakthrough | P | A random ability where `profile` equals `baseProfile`: +1. None left: the fallback. |
| you-get-hurt-while-working-on-the-ship | P | $actor Sick Bay 1, hull −1. |
| you-have-finally-found-true-love-in-this-bleak-universe | P | Story points +1. If their motivation is Romance: +1D6 XP. |
| a-personal-enemy-has-tracked-you-down | P C | `rival.add` with `bindTo: $actor` (adds `bound`). |
| someone-has-sent-you-a-gift | P | Loot Table item to the Stash. |
| you-feel-great | C | Engineer: nothing. Otherwise adds `injury-ignore`. |
| you-know-someone-who-knows-someone | P | `patron.add`. |
| maybe-you-are-leading-a-charmed-existence | P | $actor +1 Luck. |
| youve-put-in-a-lot-of-hard-work-around-here | O P | Engineer: both. Otherwise ask: repair 2 hull, or repair one damaged item. |
| they-dont-make-them-like-they-used-to | P | Engineer: nothing. Otherwise a random item $actor carries is damaged. |
| where-did-it-go | C | A random item $actor carries is removed and held by `missing-item`. |
| a-deep-feeling-of-melancholy-and-despair-is-afflicting-you | C | K'Erin: nothing. Otherwise adds `no-xp`. |
| youve-had-a-lot-of-time-to-burn | C | Adds `extra-action`. |

For the Precursor rule (roll a second Character Event and take either), the stage uses `alternatives`.

### Campaign Events (28)

| Id | Class | What it does |
|---|---|---|
| youve-met-a-friendly-doc-who-doesnt-ask-too-many-questions | P | Up to 2 random crew in Sick Bay: Sick Bay −1 each. |
| the-life-support-system-on-the-ship-needs-upgrading-badly | C | Cost 1D6 (−1 with an Engineer). `pay`, else adds `life-support`. |
| a-chance-meeting-turns-into-a-new-ally | O | Recruit prompt. Decline: story points +1. |
| youve-made-friends-among-the-locals | P | Story points +1. |
| you-managed-to-mouth-off-to-the-wrong-people | P | `rival.add`. |
| an-old-nemesis-has-tracked-you-down | C | A disabled Rival (enable it), or a new one if none. Adds `follows`. |
| a-shady-character-offers-you-a-deal | O | Offer-2 items. The chosen one is removed, then a Trade Table roll. Decline ("No deal") skips both. |
| you-sell-off-some-cargo-you-acquired-on-the-last-planet | P | Credits +1D6. |
| one-of-the-crew-overheard-something-interesting | P | Rumors +1. |
| youve-managed-to-settle-some-old-business | O P | Offer-2 active Rivals: the chosen one is disabled. None: the captain +1 XP. |
| an-admirer-wants-to-come-along | O | Recruit prompt: base profile only, no equipment, Feral if any crew is Feral. |
| an-alien-merchant-offers-you-some-strange-device | O | Yes/No: pay 4 credits, then a Loot Table item. |
| equipment-malfunction | P | If the Stash has items: one random Stash item is damaged. |
| youve-earned-a-bit-of-a-bad-reputation | P | `patron.disable` on a random Patron of the current planet. None: nothing. |
| the-tax-man-is-taking-an-interest-in-your-business-conduct | P C | `pay` the higher die of 2D6, else adds `impounded`. |
| the-crew-has-decided-its-time-for-a-new-person-to-be-in-charge | P | `leader.set` on a random crew member other than the leader (prefer K'Erin), +3 XP. 1D6 of 1: the old captain leaves and takes carried items. |
| youve-made-some-business-contacts | P | `patron.add`. |
| recent-events-made-for-a-good-learning-opportunity | P | All crew +1 XP. |
| during-routine-maintenance-the-gravitational-adjuster-got-knocked-out-of-alignment | P | Hull −1D6. |
| the-crew-spends-a-night-drinking-watching-movies-and-playing-cards | P | Story points +1. |
| you-meet-up-with-an-old-arms-dealer-contact-who-owes-you-a-deal | O | Pick 3 (repeats allowed) from Hand Cannon, Military Rifle, Shotgun, Machine Pistol. |
| you-renegotiate-some-old-debts | P | If in debt: debt −(1D6+1). Otherwise credits +2. |
| the-sector-news-networks-are-awash-with-rumors-of-war | C | Adds `war-rumors` to the current planet. |
| a-bit-of-time-on-your-hands | P | 2 distinct random crew each run an Exploration event with themselves as $actor, in this ledger. |
| you-got-noticed-by-someone-youd-rather-avoid | P C | `rival.add`. If `on-quest`: adds `forced-rival` for the next turn, and `follows` on that Rival. |
| its-time-to-go | C | Adds `overstay` to the current planet. |
| unity-government-says-no-ships-are-authorized-to-leave | C | Adds `lockdown` to the current planet. |
| in-hindsight-itll-make-a-great-story | P | If someone was a casualty last battle or this turn: a random one +1 Luck. Otherwise story points +1. |

### Exploration (30)

| Id | Class | What it does |
|---|---|---|
| i-know-a-good-deal-when-i-see-one | P | Trade Table roll instead. |
| meet-a-patron | C | Adds `patron-offer`. |
| mustve-been-something-i-ate | P | Soulless and K'Erin: nothing. Otherwise $actor Sick Bay 1. |
| meet-someone-interesting | P | Rumors +1. Precursor: 1D6 on 5+ another Rumor. |
| had-a-nice-chat | P | $actor 1D6+Savvy 5+: story points +1. |
| see-the-sights-enjoy-the-view | N | |
| make-a-new-friend | O | Recruit prompt (Feral if $actor is Feral). |
| time-to-relax | N | |
| possible-bargain | O P | Offer-2 weapons $actor carries, or decline. If given: 1D6. 6: Loot Table item, otherwise credits +1. |
| alien-merchant | O P | Offer-2 items (carried or Stash), or decline. If given: a Loot Table item. |
| got-yourself-noticed | C | If the planet has an active Rival: a random one, adds `forced-rival` (this turn). Otherwise nothing. |
| you-hear-a-tip | C | Adds `tip`. |
| completely-lost | P C | $actor 1D6+Savvy 4+, otherwise adds `cant-fight` (this turn). Exploration table again either way. |
| someone-wants-a-package-delivered | C | Adds `package` to $actor. |
| a-tech-fanatic-offers-to-help-out | P | Weight 1. Engineer: +2 XP. Otherwise a random damaged item is repaired. |
| a-tech-fanatic-offers-to-help-out-no-luck | P | Weight 2. Engineer: +2 XP. Otherwise nothing: "They tinker for an afternoon, but can't fix anything." |
| got-a-few-drinks | N | |
| i-dont-have-a-gambling-problem | P | Soulless: nothing. Otherwise a random item from $actor's kit or the Stash is removed. |
| overheard-some-talk | P | Rumors +1. |
| pick-a-fight | P C | `rival.add`. If $actor is K'Erin, adds `first-meeting` to it. |
| found-a-trainer | P | $actor +2 XP. |
| information-broker | O | Number prompt: 0–3 Rumors at 2 credits each. |
| arms-dealer | O | Number prompt: Military Weapon Table rolls at 3 credits each. |
| promising-lead | C | Adds `promising-lead`. |
| just-needs-a-little-love | P | Gadget Table item, damaged unless $actor is an Engineer. |
| get-in-a-bad-fight | P | $actor Sick Bay 1D3, and one random carried item is removed. |
| offered-a-small-job | C | Adds `small-job`. |
| offered-a-reward | C | Adds `reward`. |
| you-make-a-useful-contact | O C | Ask: Recruit, Find a Patron or Track a Rival. Adds `roll-bonus` for that roll. |
| who-left-this-lying-around | O | Pick 1 of Handgun, Blade, Colony Rifle, Shotgun. |
| this-place-is-rather-nice-really | C | Adds `stay-or-pay` to $actor. |

### Trade (33)

| Id | Class | What it does |
|---|---|---|
| a-personal-weapon | P | Low-tech Weapon Table item. |
| sell-some-cargo | P | Credits +2. |
| find-something-useful | P | Gear Table item. |
| quality-food-and-booze | O | Recruit prompt. |
| instruction-book | P | Random crew +1 XP. |
| bits-of-scrap | P | Credits +1. |
| medical-pack | O | Pick 1 of Stim-pack, Med-patch. The list names one table row for each. |
| worthless-trinket | N | Weight 1.67. "Worthless? It really is. Just junk." |
| worthless-trinket-valuable | P | Weight 0.33. Story points +1: it wasn't worthless after all. |
| local-maps | C | Adds `local-maps`. |
| luxury-trinket | O C | Swift: $actor +2 XP. Otherwise ask: keep as a gift (adds `recruit-gift`), or sell it (`alternatives` of 2 Trade rolls). |
| basic-supplies | C | Adds `supplies`. |
| contraband | O P | Ask: accept or turn down. Accept: credits +1D6, and on 4–6 a Rival. |
| gun-upgrade-kit | O | Pick 1 of Laser Sight, Bipod, Beam Light. |
| useless-trinket | N | Weight 1.67. "Useless? It really is. Just junk." |
| useless-trinket-valuable | P | Weight 0.33. Story points +1. |
| trade-goods | C | Adds `trade-goods`. |
| something-interesting | P | Loot Table item. |
| fuel | P | `fuel` resource +1D6. |
| spare-parts | C | Adds `spare-parts`. |
| tourist-garbage | N | Weight 1.33. "Tourist garbage, and not worth anything." |
| tourist-garbage-valuable | P | Weight 0.67. Story points +1. |
| dont-usually-see-these-for-sale | O | Yes/No: pay 3 credits, then a Loot Table item. |
| ordnance | O | Pick 3 (repeats allowed) from Frakk grenade, Dazzle grenade (single-grenade items). |
| basic-firearms | O | Pick 1 of Handgun, Colony Rifle, Shotgun. |
| odd-device | O P | Yes/No: pay 1 credit, then 1D6. On 6 a Loot Table item, otherwise nothing. |
| military-fuel-cell | C | Adds `fuel-cell`. |
| hot-tip | P | Rumors +1. |
| insider-information | C | Adds `insider-info`. |
| army-surplus | O | Pick 1 of Auto Rifle, Blast Pistol, Glare Sword. |
| a-chance-to-unload-some-stuff | O | Number prompt: sell k random undamaged weapons for 2 credits each. |
| a-lot-of-blinking-lights | P | Gear Subtable item. |
| gently-used | P | Gear Subtable item, damaged. |
| pre-owned | P | Loot Table item, damaged. |
| medical-reserves | P | 2 Stim-packs and 2 Med-patches. |
| starship-repair-parts | P | `shipParts` resource +1D6. |

### Tally

| Table | Events | P | O | C | R | N |
|---|---|---|---|---|---|---|
| Starship Travel Events | 25 | 18 | 3 | 5 | 2 | 1 |
| Character Events | 31 | 24 | 2 | 9 | 0 | 1 |
| Campaign Events | 28 | 18 | 6 | 7 | 0 | 0 |
| Exploration | 31 | 15 | 7 | 11 | 0 | 3 |
| Trade | 36 | 18 | 11 | 7 | 0 | 3 |
| **All** | **151** | 93 | 29 | 39 | 2 | 8 |

Classes overlap (an event can be P and C), so the columns add up to more than the event count.

## 8. Archetypes, storage and editor constraints

- A campaign stores: `eventPacks` (user packs), `eventsDisabled` (ids from any pack), `conditions` (instances). The base pack is not stored.
- Archetype event lists hold pack-scoped ids. An event is rollable when its pack has it, it isn't disabled, `requires` is true, and the planet's archetype allows it. New and imported events join the "All options" archetype only.
- Duplicating a base event copies it into a user pack ("My events") with a new id. The editor shows the source and has "Replace the original" (disable the base, enable the copy).
- Imports validate against the registries (unknown effects, facts, triggers and types are errors that name the step), then add the pack. An id that already exists in another pack is renamed on import, and a message says so.
- Publishing a corrected base pack updates every campaign. Events a campaign disabled stay disabled.

## 9. Open items

Resolved:

1. **Rumors.** One `rumors` resource. Phase 2 removes `questRumors` and `invasionRumors` from `roster.js`, the Crew tab, `charactersTab.js`, `crewSection.js`, `crewTab.js`, `crew.js`, `character.js`, `effects.js` ("Quest Rumor" origin effects credit `rumors`), the `species.js` bonuses, the Quest-progress stage in `postBattle.js`, and the tests.
2. **Grenades.** Single-grenade items. The Grenades Subtable rows ("3 Frakk Grenades") become three single items each, so *Ordnance* and the loot table agree.
3. **Item names.** Each pick-list option names one table and row. A combined loot table that pick lists can reference is a later item.
4. **Motivation.** Conditions and predicates compare the Motivation row id (`romance`), not text.
5. **Species caps.** Phase 2 adds `caps.luck` to every species and replaces `human` and `noLuck` with it. `character.js` and `crewSection.js` read the cap instead. `stat` effects stop at the cap.
6. **Lockdown** blocks normal travel only, not fleeing an invasion.
7. **Stay trigger.** `travel.js` publishes `stay`.
8. **Casualty facts.** The casualty list is kept in `turnMemory` for "last turn".
9. **Quest refactor.** `on-quest` replaces `onQuest`, as its own phase.
10. **Time on hands.** Nested events share one ledger.

New, from the changes in this round:

- **Distress call and Escape pod lose their opening choice.** Splitting them means the crew always answers and always rescues. The risk the old choice carried is now in the weights. If you want the choice back, an `ask` can go at the front of each variant, but the player would then see the outcome before deciding.
- **Fractional weights.** The roll shows the event, not a die value, for any table with fractional weights. Archetype lists and the Models odds display already handle weights, so this should only touch the table roll display.
- **Asteroids weight.** I picked 4. Say if you'd prefer another figure.
- **Best-crew rule.** Asteroids was your call. I also applied it to Raided, Drive trouble and Distress call, since they also say "select a crew member". Say if you'd rather leave those random.

## 10. Changes made while building Phase 2

- **Selectors.** Disabled Rivals and Patrons are picked with `disabled: true` on the selector (not inside `where`). Items take `carrier: '$actor' | 'stash' | 'any'`.
- **Condition syntax.** Leaves are `{ fact, of?, ...settings, <op> }`, `{ var: '$x', <op> }` and `{ ask }`, with ops `eq ne gt gte lt lte in includes`. `hasCondition` is the fact `condition.has`; `member.motivation` is `member.motivations` (a list; use `includes`).
- **Steps.** Added `forEach`, `again`, `manual` and `__bind` (internal). Prompts are one step, `ask`, with `yesno`, `options`, `number`, `pickList`, `offer` and `recruit`.
- **Disabled contacts** live in `planet.disabledRivals` and `planet.disabledPatrons`, so nothing else needed changing.
- **Species caps.** Humans have a Luck cap of 3. This is my assumption: the old code allowed any amount, and I couldn't check the rulebook.
- **Snapshots** leave portraits out; the turn keeps one copy.
- **Not yet built:** `injuryRoll`, the recruit generator, condition types, Step 0.

## 11. Changes made while building Phase 3

- **Condition types** are in `js/data/basePack.js` (37; `bound` was dropped because `rival.add` with `bindTo` and `member.remove` handle it). Asks are separate from hooks: `asks: [{ key, trigger, label }]`. Modifiers support `add`, `set` and `floor`, and an `ask` that must be answered Yes.
- **Hook questions** are Yes/No fields on the stage form, answered before Confirm.
- **Wired stages** are ledger stages with optional ops; a stage with no ops needs no Apply. The Turn tab shows "What will happen" and Apply.
- **Numbering:** Step 0 is Conditions; Start of turn is 0.5.
- **Spare parts** are used up when the Repair roll's first die is 1, decided in Crew tasks.
- **First meeting** is used up at Battle result, not when the battle is chosen, because the Battle tab needs the modifier.
- **Humans' Luck cap of 3** is confirmed by the Experience stage text ("Luck 10 (max 1, or 3 for Humans)").
- **Not wired:** the Quest stages (`onQuest`), `xpAward` and `memberRemoved` triggers (nothing needs them yet).

## 12. Changes made while building Phase 4

- **Authored events are Python** (`tools/events/*.py` with helpers), not JSON, so steps can share shorthand. `tools/build-events.py` writes `js/data/baseEvents.js`.
- **151 events**, with the book text for unchanged rows and short texts of my own for split and reworked events.
- **New engine pieces:** `injuryRoll`, `stat.raiseRandom` (an effect can report "impossible", which plays the event's `fallback`), `actor` on `table` and `rollGroup`, `item.add` by name, `condition` uniqueness `extend` (Grounded adds up), `as` on `rival.add`, `patron.add` and `planets.generate`, selector `count` and `repeat` `times` as variables, `list` on `select`, `turn.casualtyCount`.
- **Single grenades:** `LP.items.makeAll` turns a pack row into single items; Loot and result-card lines use it.
- **Quest:** `on-quest` replaces `turnMemory.onQuest`. The Rumor count stays in `turnMemory.rumors` until the stages move to the event runner.
- **Step 0** applies only at the very start of a turn, so a condition added mid-turn doesn't send the turn back.
- **Archetype event ids** are `packId:eventId`; the live follow-up rolls still honour them through a title bridge in `disabledMap()`.

## 13. Changes made while building Phase 5

- **Campaign Turn tab** is closed until a crew is finalized, and event stages always assume a crew.
- **Old event scripts are gone** from `followups.js` (Company store is now a note), and so is the title bridge in `disabledMap()`.
- **Undo** on an applied record first takes back Apply, then the answers.
- **Recruit variants:** `species`, `feral`, `baseProfileOnly` (the character has no origin rolls), `equipment: false`, `xp`. `member.add` ops carry the recruit's items.
- **Rumors** with a crew are the roster's `rumors`; a new Quest uses them up, a step closer adds one, and a finished Quest clears them.

## 14. Changes made while building Phase 6

- **Schema layer** (`js/rules/events/schema.js`): step kinds, prompts, selector options and summaries; the editor forms and the reference come from it and the registries.
- **Pack management** (`js/rules/events/packs.js`): ids are fixed once made; duplicates go in "My events"; import adds a new pack and its events join "All options".
- **Events tab** with Events, Conditions, Packs and Reference views; locked base events are read-only; a test roll plays one event on a copy of the campaign.
- **Broken events** of the campaign's own packs are left out of rolls.
