# Architecture

## Loading

`index.html` loads every script in dependency order: `lp.js`, then data, core, rules, turn stages, and UI, with `app.js` last. Each file is an IIFE that attaches to `window.LP`, for example `LP.rng`, `LP.turn` or `LP.tabs.crew`. `tests.html` loads the same non-UI scripts plus `tests/*.js`.

## Layout

| Path | Contents |
|---|---|
| `js/data/tables.js` | GENERATED roll tables (`LP.data.tables`). Never edit by hand. |
| `js/data/species.js` | The 26 species and their rules. |
| `js/data/baseEvents.js`, `basePack.js` | The base event pack: events (GENERATED) and condition types. |
| `js/data/nameTables.js` | Starter name tables and each species' default tables. |
| `js/data/followups.js` | Follow-up scripts per table row (see `campaign-turn.md`). |
| `js/core/rng.js` | Dice, weighted picks, table rolls, rerolls that never repeat. |
| `js/core/effects.js` | Parses origin-table effect text into stats and resources. |
| `js/core/followup.js` | Runs follow-up scripts. |
| `js/core/registry.js`, `predicate.js`, `snapshot.js` | Registries of definitions, event conditions, and snapshots for Undo. |
| `js/core/storage.js` | localStorage, campaign normalizing, import and export. |
| `js/core/router.js` | Hash routes: `#/` and `#/campaign/<id>/<tab>`. |
| `js/rules/*.js` | Game rules, with no DOM access. |
| `js/rules/turn/*.js` | The turn engine and its stages. |
| `js/rules/events/*.js` | The event system (see `events.md`). |
| `js/rules/conditions.js`, `recruit.js` | Conditions, and recruits for events. |
| `js/ui/*.js` | Screens and components. |
| `tools/build-tables.py` | `roll_tables/json` → `js/data/tables.js`. |
| `tools/build-events.py` | `tools/events/*.py` + the roll tables → `js/data/baseEvents.js` (GENERATED, the base pack's events). |
| `tools/bump-version.py` | Stamps `?v=` on script and style links (cache busting). |

## Tables

Edit `roll_tables/json/*.json`, then run `python tools/build-tables.py`. Each table gets:
- `labelColumn`;
- `die`;
- `weightColumns`;
- for each row, an `id` (a slug) and printed `ranges`.

Saved data refers to rows by `id`. Roll tables with `LP.rng.rollTable`, or with `LP.rng.rollOn` when the output should show the die result. The read-only Equipment tab is `js/ui/equipmentTab.js`.

## Campaign data

One campaign object holds everything (`storage.normalizeCampaign` repairs it on load):

| Field | Owner |
|---|---|
| `settings` | `js/rules/settings.js` |
| `characters`, `crew` (the generator) | `js/rules/character.js`, `js/rules/crew.js` |
| `nameTables`, `speciesNames` | `js/rules/names.js` |
| `roster`, `turnNumber` (the current crew) | `js/rules/roster.js` |
| `models` | `js/rules/models.js` |
| `archetypes`, `planets`, `currentPlanetId` | `js/rules/archetypes.js`, `js/rules/planets.js` |
| `turn`, `turnMemory` | `js/rules/turn/engine.js` |
| `battle` | `js/rules/battle.js` |

Each module's header comment documents its data shape. Call `LP.storage.touchCampaign(c)` after any change.

## UI

- **Tabs:** `js/ui/campaignView.js` lists them. State tabs are Crew, Planets, Campaign Turn and Battle. Config tabs (Characters, Models, Species, Names, Archetypes, Events, Equipment) only show in Edit mode; Play mode hides them. The mode is saved in localStorage as `lastParsec.mode`.
- **Rendering:** each tab is `LP.tabs.<id>(container, campaign)`. Tabs redraw fully on change and restore focus through `data-focus` attributes. Text inputs save without redrawing, so typing keeps focus.
- **Helpers:**
  - `LP.dom.el()` builds elements.
  - `LP.ui.notify`, `confirm` and `form` live in `js/ui/dialogs.js`.
  - `js/ui/rollField.js` is the "dropdown + result + reroll" row.
- **Styles:** `css/styles.css`. Colours are CSS variables, with a dark default and light via `[data-theme="light"]`.

## Testing

`tests/runner.js` provides `group`, `test` and assertions. There is one file per area. Use `LP.rng.setSource(fn)` or `LP.rng.seeded(n)` for fixed dice; the runner resets the source after each test. Test campaigns are plain objects (see the `campaign()` helpers in `tests/planetTurn.test.js` and `tests/roster.test.js`).
