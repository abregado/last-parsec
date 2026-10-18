# Campaign turn

## Engine

`js/rules/turn/engine.js` (`LP.turn`). Its header documents `campaign.turn`, the stage definition hooks and `ctx`.
- **Stages:** each stage registers in order from `travel.js` (Start, 1.1–1.4), `world.js` (2.1–2.6) and `postBattle.js` (4.0–4.14). `walk()` finds the current stage. A stage is skipped when `applies()` returns a reason.
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

## Named crew

When `LP.roster.hasCrew()` is true, stages use the roster instead of typed counts:
- **Upkeep:** Sick Bay is picked by name, and the form shows crew credits and the coming debt interest.
- **Crew tasks:** each member gets a task (the `assign` field). Savvy rolls use that member's Savvy. Known Patrons and Rivals come from the current planet.
- **Travel events and Character Events:** pick named crew.
- **Battle result:** participants and casualties are picked by name. Injuries roll per member (Bots and Soulless use the Bot Injury Table), and XP is listed per member.

XP, injuries, credits and story points are never applied automatically. They appear in the result card's to-do list for the player to change on the Crew tab.

## UI

- **Turn tab:** `js/ui/turnTab.js`.
- **Forms:** `js/ui/stageForm.js` (field types are listed in its header).
- **Result cards:** `js/ui/resultCard.js`. Each card opens on a summary: results only, no dice or rule notes, routing tables skipped, plus "Change by hand". A button at the top right switches to the full working.
- **Stash badges:** "→ Stash" for items added automatically, and a "+ Stash" button for items only gained if a condition holds.
