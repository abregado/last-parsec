# Events

The event system plays Character, Trade, Exploration, Starship Travel and Campaign events from data. Code is in `js/rules/events/` (no DOM) with the helpers in `js/core/registry.js`, `predicate.js` and `snapshot.js`. The module headers have the data shapes; this page says how the pieces fit.

## Flow

1. **Run** (`run.js`): `E.run.start()` plays an event's steps. Dice are rolled, people and items are picked, and every change is planned as an **op**. Nothing touches the campaign. A prompt pauses the run (`E.run.prompt()`); `E.run.answer()` resumes it. The state is plain JSON.
2. **Review** (`ledger.js`): `E.ledger.preview()` lists what the ops will do, with before and after values.
3. **Apply**: `E.ledger.commit()` applies the ops. For a turn stage, set `ledger: true` and use `LP.turn.applyLedger()` (see `campaign-turn.md`).

Each step of a run sees the effect of the earlier ones, because the runner keeps a preview campaign with the ops already applied.

## Registries

Code registers; data refers to ids. Each entry lists its `params`, which the pack validator checks and the editor will build forms from.

| Registry | File | Holds |
|---|---|---|
| `E.effects` | `effects.js` | What an event changes: resources, XP, stats, Sick Bay, hull, items, Rivals and Patrons, crew, conditions, new planets. |
| `E.facts` | `facts.js` | What conditions can ask: members, items, ship, resources, crew, planet, conditions, this turn's battle. |

Selectors (`selectors.js`) pick crew, items, Rivals and Patrons: random by default, with `where`, `exclude`, `prefer`, `best` and `offer`. Rivals and Patrons come from the current planet.

## Packs

`pack.js` validates a pack and imports one on top of a campaign's packs (renaming a taken id). Event ids are `packId:eventId`. The pack format and every step type are in the headers of `pack.js` and `run.js`.

## In the turn

- **Event stages** (`js/rules/turn/eventStage.js`): Travel event (1.3), Campaign event (4.12), Character event (4.13), and Trade and Explore in Crew tasks. A stage starts a run with `T.eventStage.start`; the run's JSON state is kept in `record.output.run`, its planned changes in `output.ops`, and its prompt in `pending`.
- **Prompts** are answered through `T.choose`. Yes/No, options and questions are buttons; number, pick-list, offer, alternatives and recruit prompts are `free` (the run checks the answer) and are drawn by `js/ui/promptPanel.js`.
- **Recruits** (`js/rules/recruit.js`): the recruit prompt's button opens the Characters tab on a freshly generated character (`campaign.pendingRecruit`). Accepting answers the prompt with the member and their items; they join when the stage is applied. The turn no longer waiting for a recruit drops it.
- **Undo** on an applied event first takes back Apply, then goes back through its answers.
- The Campaign Turn tab is only open once a crew is finalized, so event stages always have a crew.

## The Events tab

`js/ui/eventsTab.js` (Edit mode) has four views: Events, Conditions, Packs and Reference. The data it changes is `campaign.eventPacks` and `campaign.eventsDisabled`; the rules for that are `js/rules/events/packs.js`, and the editors are generated from `schema.js` and the registries.
- **Locked base events** open read-only. Duplicate one (into "My events", an editable pack), replace it with a copy (the original is switched off), or switch it off.
- **Editing:** `eventEditor.js` (the form), `stepEditor.js` (step cards), `predicateEditor.js` (conditions), `eventForm.js` (the field widgets), `conditionTypesEditor.js`, `eventTester.js` (a test roll on a copy of the campaign).
- **Packs:** `packsPanel.js`. Import always adds a new pack (renamed if its id is taken) and its events join "All options". Export writes a pack, or chosen events with the condition types and fragments they use.
- **Reference:** `eventsReference.js` lists every step, change, fact and trigger from the registries. The guide for authors is `event-authoring.md`.
- Events of the campaign's own packs that don't validate are left out of rolls (`E.pack.env`).

## The base pack

151 events for the five tables (Starship Travel 25, Character 31, Campaign 28, Exploration 31, Trade 36) and the condition types.
- **Edit** `tools/events/*.py` (shorthand in `helpers.py`), then run `python tools/build-events.py` (after `build-tables.py`). It writes `js/data/baseEvents.js`, which `js/data/basePack.js` wraps. Never edit the generated file.
- **Source rows:** `ev('asteroids', steps)` takes its title, text and weight from that row of the roll table. A row whose first step is a plain dice roll is split into one event per answer (weights shared; Escape pod's are a `group`). The build fails if a row has no event or a split's weights don't add up.
- **House rules in the data:** a ship-wide roll uses the best crew member outside Sick Bay, picks of items are random (or an `offer` of two), and nothing starts a battle out of turn.
- **Archetypes** list events by `packId:eventId` (`A.eventList`, `A.eventFilter`). `E.pack.env(campaign)` builds what a stage passes the runner.

## Conditions

Lasting state an event leaves behind. `js/rules/conditions.js` has the data shapes; the types are data in a pack (`js/data/basePack.js` for the base ones) and instances live in `campaign.conditions`.

- **Reads for stages:** `blocked()` (an activity a member or the ship can't do), `modifiers()` (bonuses and single-use items on a roll or cost), `grants()`, `fields()` (Yes/No form fields a hook needs) and `run()` (plays a trigger's hooks). Each wired stage lists what it calls in its code; `campaign-turn.md` lists the stages.
- **Hook questions are stage form fields.** The player answers before pressing Confirm, and the hook sees the answer as a `$variable`.
- **Step 0** (`js/rules/turn/conditions.js`) rolls checks, counts timers and plays `expire` and `turnStart` hooks. Timer rule: a condition counts a turn off once it has been active for a turn; a checked condition rolls from its first active turn and counts one off on a pass.
- **Hooks fired from events:** the runner plays `rivalGained` and `questGained` hooks when the effect happens (`FIRES` in `run.js`).

## Limits

- `injuryRoll` applies Sick Bay and XP and flags deaths; surgery costs and lost Speed or Toughness are left to the player.
- Extra actions are shown as a note in Crew tasks; the second task is resolved by hand.
- Prompts can't be asked inside `alternatives`, or inside a selector's `where`.
