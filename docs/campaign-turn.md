# Campaign turn

## Engine

`js/rules/turn/engine.js` (`LP.turn`). Its header documents `campaign.turn`, the stage definition hooks and `ctx`.
- **Stages:** `turn/conditions.js` registers Step 0 (Conditions) first; then each stage registers in order from `travel.js` (Start of turn 0.5, 1.1–1.4), `world.js` (2.1–2.6) and `postBattle.js` (4.0–4.14). `walk()` finds the current stage. A stage is skipped when `applies()` returns a reason.
- **Confirm:** `confirm(input)` runs `resolve()`, which rolls all the dice. A pending choice is answered with `choose()`.
- **Undo and Restart** restore `turnMemory`, the planets (snapshots in `geoBefore` / `geoAtStart`) and the Stash items the turn added.
- **After every result** (`finish()`):
  - gained items go into the Stash (`itemSource` credits them);
  - `record.todo` is built from the stage's `todo()` plus follow-up gains (story points, Rumors).
- **Planets:** the `apply()` hook changes them. It always starts from the pre-stage snapshot, so it must be idempotent.
- **Next turn:** `nextTurn()` raises `campaign.turnNumber`.

## Follow-up scripts

The rulebook's "roll on X" chains are data in `js/data/followups.js`, keyed by table name and row id. `js/core/followup.js` runs them. Its header documents the step types:
- `table`, `roll` (with `savvy` and `who`), `when`, `group` (with `source` and `who`), `choice`, `randomCrew`, `randomRival`, `species` and `enemyNumbers`.

The run state is plain JSON, so a run paused on a choice survives a reload. `env.disabled` removes rows (Models tab and archetype restrictions).

## Event stages

Travel event, Campaign event, Character event and the Trade and Explore tasks in Crew tasks play events from the packs (see `events.md`). Their changes are ledger ops, so they wait for Apply, and their prompts show under the result.

## Ledger stages

A stage with `ledger: true` may plan changes as ops (see `docs/events.md`) in `output.ops` instead of making them. When it has any, its result waits in `walk()` as `pending` until `applyLedger()` commits the ops (the Turn tab shows "What will happen" and an Apply button). With no ops it behaves like any other stage. Undo first takes back Apply, then the answers. Undo and Restart put the roster, planets and conditions back from `record.snapBefore`, and `undoWarning()` / `restartWarning()` say when Crew-tab changes made since would be lost.

## Quest

A Quest is the campaign condition `on-quest`. Resolve any Rumors (2.5) starts it on a Quest result (the stage is a ledger stage, so it begins when applied), Choose battle offers the Quest battle while it is in play, and Quest progress (4.3) ends it when the finale is won. The Rumor count is the Crew tab's `rumors` (events and Quest rolls change it through the ledger); a new Quest uses them up.

## Conditions in the stages

These stages read conditions (see `events.md`) and are ledger stages: Conditions (0), Decide whether to travel (blocks, take-off early, fuel cell, Stay and Depart hooks), New world arrival (Arrive hooks, arrival timers, worlds from a library lookup), Upkeep (away crew, Basic supplies), Crew tasks (held-back crew, roll bonuses), Job offers, Choose battle (tip, forced Rival), Battle result (crew who can't fight, small job and reward questions), Rival status, Injuries, Experience (no XP) and Invasion check (roll bonuses, patrol nearby). Character Events skip crew who are away.

## Named crew

When `LP.roster.hasCrew()` is true, stages use the roster instead of typed counts:
- **Upkeep:** Sick Bay is picked by name, and the form shows crew credits and the coming debt interest.
- **Crew tasks:** each member gets a task (the `assign` field). Savvy rolls use that member's Savvy. Known Patrons and Rivals come from the current planet.
- **Travel events and Character Events:** pick named crew.
- **Battle result:** participants and casualties are picked by name. Injuries roll per member (Bots and Soulless use the Bot Injury Table), and XP is listed per member.

Stages that aren't ledger stages never apply XP, injuries, credits or story points; they appear in the result card's to-do list for the player to change on the Crew tab.

## UI

- **Turn tab:** `js/ui/turnTab.js`; it only opens once a crew is finalized (`needsCrew` in `campaignView.js`).
- **Forms:** `js/ui/stageForm.js` (field types are listed in its header).
- **Result cards:** `js/ui/resultCard.js`. Each card opens on a summary: results only, no dice or rule notes, routing tables skipped, plus "Change by hand". A button at the top right switches to the full working.
- **Stash badges:** "→ Stash" for items added automatically, and a "+ Stash" button for items only gained if a condition holds.
