# Last Parsec — Five Parsecs From Home companion app

Plan only. Nothing has been implemented yet.

## Goals and constraints

- Plain HTML, CSS and vanilla JavaScript. No framework, no bundler, no npm dependencies.
- Runs from GitHub Pages **and** by double-clicking `index.html` (`file://`).
  - This rules out `fetch()` of the JSON tables and ES modules (`<script type="module">`), because browsers block both on `file://`.
  - So every script is a classic `<script>` that hangs off one global namespace (`window.LP`), and the roll tables are shipped as a generated JavaScript file.
- Everything is stored in `localStorage`. Users can export and import JSON files.
- The app generates results. It does not track a campaign. Players copy results onto their printed sheets.

## Project layout

```
index.html                 single page; all screens are rendered into it
css/
  styles.css               theme tokens, layout, components
js/
  data/
    tables.js              GENERATED from roll_tables/json -> LP.tables["Background Table"] = {...}
    species.js             hand-written: base profiles + special rules for every species
  core/
    rng.js                 random numbers, weighted pick, dice ("1D6", "2D6"), pick-excluding-current
    effects.js             parses table text ("+1 Savvy, +1 Luck", "+1D6 credits", "+1 Gear") into data
    storage.js             load/save/versioning, export/import
    router.js              hash routes: #/  and  #/campaign/<id>/<tab>
  rules/
    character.js           resolves a character: rolls, forced results, final profile, resources
    crew.js                crew-level rolls: starting equipment, ship, flavour, leader, totals
  ui/
    dom.js                 tiny helpers (el(), clear(), on())
    rollField.js           the reusable "dropdown + Random + reroll" control
    campaignList.js        home screen
    campaignView.js        tab shell
    charactersTab.js       character list + editor + crew section
    placeholderTab.js      Models / Campaign Turn / Battle (to be designed later)
  app.js                   boot
tools/
  build-tables.py          roll_tables/json/*.json -> js/data/tables.js (+ validation)
tests.html                 browser-run checks for rng, effects parser, character rules
.nojekyll                  so GitHub Pages serves files as-is
```

`roll_tables/` and the PDF stay where they are, as source material. Only `js/data/tables.js` is loaded by the app. The generated file is committed, so the app needs no build step to run. The script only needs re-running if a JSON table is edited.

## Data layer

### Roll tables
All 77 JSON tables use the same shape: `{table, pdf_pages, columns, rows:[{weight, ...}]}`. `weight` is the size of the d100 (or d10/d6) range. The build script:
- wraps all tables into `LP.tables`, keyed by table name
- checks that the weights add up to the die size (100, 10 or 6). Most do. Some tables are intentionally different (2D6 tables, multi-column tables like Deployment Conditions). The script reports these rather than failing on them.
- adds a stable `id` to each row (a slug of its name) so saved characters refer to rows by id, not by text or position

### Species definitions (`species.js`)
These are written by hand from pp.15–23. Each entry has:

| field | example |
|---|---|
| `id`, `name`, `group` (Human / Bot / Primary Alien / Strange) | `engineer`, "Engineer", Primary Alien |
| `crewTypeRow`, `subtableRow` | used to compute the two-step random odds |
| `profile` | `{reactions:1, speed:4, combat:0, toughness:2, savvy:1, luck:0}` |
| `rules` | short text summary shown under the field (e.g. "+1 to repair rolls; Toughness max 4") |
| `skipTables` | Bot and Assault Bot: no Background/Motivation/Class |
| `forced` | De-converted -> Motivation Revenge; Unity Agent -> Order; Emo-suppressed -> Survival; Traveler -> Truth; Mutant -> Background Lower Megacity Class; Manipulator -> Bureaucrat; Primitive -> Primitive or Regressed World |
| `extra` | Hakshan: Truth motivation in addition to the normal roll |
| `double` | Mysterious Past: 2 Backgrounds; Feeler: 2 Motivations |
| `classSubstitution` | Hulker: Technician/Scientist/Hacker are treated as Primitive |
| `resourceMods` | Mysterious Past: ignore story points; Minor Alien: -1 to credits and story points; Bio-upgrade: -2 credits; Genetic Uplift: ignore Background credits, +1 Rival |
| `extraRolls` | Minor Alien: 1D6 Minor Alien Ability; Traveler: +2 story points, 2 Quest Rumors; Hopeful Rookie: 1 Luck |
| `caps` | Engineer Toughness max 4; De-converted Savvy fixed; Emo-suppressed no Luck |

The default maximums are Reactions 6, Speed 8", Combat +5, Toughness 6, Savvy +5. Only Humans may have more than 1 Luck.

### Effects parser (`effects.js`)
This turns the `effect` / `resources` / `starting` columns into structured data:
- `+1 Savvy`, `+1 Combat Skill`, `+1 Luck`, `+2 XP` -> stat changes
- `+1D6 credits`, `+2D6 credits` -> a dice roll
- `Patron`, `Rival`, `1 Rumor`, `2 Quest Rumors`, `+1 story point` -> resource counts
- `+1 Gear`, `+1 Gadget`, `+1 Low-tech/Military/High-tech Weapon` -> a roll on that table

Any text the parser doesn't recognise is shown as-is with a warning in `tests.html`. That way a new or edited table can't silently lose an effect.

## Storage model

One `localStorage` key, `lastParsec`, holding:

```js
{
  version: 1,
  campaigns: [{
    id, name, createdAt, updatedAt,
    characters: [ Character ],
    crew: { leaderId, equipment: {...slots}, ship: Slot, metThrough: Slot, characterizedAs: Slot },
    models: [],        // tab 2, later
    turns: [],         // tab 3, later
    battles: []        // tab 4, later
  }]
}
```

Each field is a **Slot**: `{ mode: "random" | "fixed", value: rowId | number | null, children: {...} }`.
- `fixed` = the user picked the value from the dropdown. No reroll button.
- `random` = `value` is whatever the last roll gave. A reroll button is shown once `value` is set.
- `children` hold the rolls a result causes. For example, Background "Tech Guild" has a `credits` dice slot (1D6) and a `starting` slot on the High-tech Weapon table. Each child is also a Slot, so it gets its own dropdown, Random option and reroll button.

A character is `{ id, name, species: Slot, background: Slot[], motivation: Slot[], class: Slot, extras: {...} }`. Background and motivation are arrays to handle Mysterious Past and Feeler. The final profile and resource totals are **always computed** from the slots and never stored, so they can't get out of sync.

Export/import:
- **Export all** -> `last-parsec-backup-YYYY-MM-DD.json`. **Export campaign** -> one campaign.
- **Import** checks `version`, then asks whether to merge or replace. Imported campaigns that clash with an existing id get a new id.
- Saves happen automatically on every change (debounced). A failed save, such as a full quota or private mode, shows a banner and doesn't crash the app.

## Screens

### Home — campaign list
- List of campaigns showing name and last-updated time. Click one to open it.
- New campaign (asks for the name only), rename, duplicate, delete (with a confirm step).
- Export all / Import buttons.

### Campaign view — 4 tabs
Hash route `#/campaign/<id>/characters|models|turn|battle`, so refresh and browser back both work.
1. **Characters** — built now (below)
2. **Models** — placeholder ("coming soon")
3. **Campaign Turn** — placeholder
4. **Battle** — placeholder

### Characters tab

Layout: the tab header has **Add character** and **Generate all**. The crew list starts empty and shows a card for each character (name, species, key stats, and its own **Generate** and delete buttons). Below the list is the editor for the selected character. Below that, the **Crew** section.

**Character editor** (a vertical list of fields)

```
[ Generate ]                                      name: [__________]
Species      [ Random ▾ ]  Feral                   [↻]
Background   [ Random ▾ ]  Tech Guild              [↻]
   ├ Credits   [ Random ▾ ]  4  (1D6)                [↻]
   └ Starting  [ Random ▾ ]  Plasma Rifle (High-tech) [↻]
Motivation   [ Fame     ▾ ]  +1 story point          (fixed, no reroll)
Class        [ Random ▾ ]  Soldier                 [↻]
   └ Credits   [ Random ▾ ]  2  (1D6)                [↻]
----------------------------------------------------------------
Profile   R 1 | Sp 4" | CS +1 | T 3 | Sv +1 | Luck 0 | XP 0
Rules     Feral: ignore enemy Seize the Initiative penalties; ...
Resources +6 credits, +1 story point
Items     Plasma Rifle
```

`rollField` behaviour, matching your spec:
- Clicking a field opens its dropdown. **Random** is always the first option. Then the table rows, each with its d100 range (e.g. `41-44 Trader`) so it can be checked against the book.
- The Species dropdown is grouped: Human · Bot · Primary Aliens (6) · Strange Characters (18). Random rolls Crew Type and then the right subtable, so the odds match the book.
- **Generate** rolls every slot set to Random, including child slots that appear because of other results. Fixed slots are left alone.
- After Generate, every Random slot with a value gets a **reroll** button. Fixed slots never get one.
- **A reroll never gives the same result.** For table slots, the current row is removed and the pick is weighted across the remaining rows. For dice slots, the dice are rolled again until the total is different, so the odds stay the same as real dice. If only one result is possible, the reroll button is disabled.
- **Cascading:** when a parent changes, by reroll or by picking a value, its children are rebuilt and rolled. Children that are still valid keep their values. For example, rerolling Background from Tech Guild to Drifter removes the credits and High-tech children and adds a Gear child, which is rolled straight away.
- Species changes re-run the species rules:
  - Bot / Assault Bot hide Background, Motivation and Class.
  - Forced results show as a locked field ("Revenge — set by De-converted").
  - Mysterious Past adds a second Background field and Feeler a second Motivation.
  - Minor Alien adds an "Ability (1D6)" field.
  - Hulker shows the class substitution note.

**Crew section** (below the character editor)
- **Leader** — pick a character. They get +1 Luck, unless they are a Bot.
- **Starting equipment**:
  - 3 Military Weapon slots. Each can be switched to High-tech. This is allowed for as many slots as there are characters with a Savvy increase, and the app counts these.
  - 3 Low-tech slots, 1 Gear slot and 1 Gadget slot.
  - A read-only list of every item rolled through character results.
- **Credits** = 1 per crew member + all rolled credits, after species adjustments.
- **Totals** — story points, Patrons, Rivals, Quest Rumors, and XP per character.
- **Ship** — Ship Table slot. Its debt (1D6 + N) is a child dice slot. Hull and traits are shown with each trait's rule text (p.30).
- **Flavour** — We Met Through, We Are Best Characterized As.
- **Generate crew** rolls every Random slot in the crew section. It doesn't touch the characters.

## Styling
- Dark sci-fi theme with a light-mode option. Colours are CSS custom properties on `:root`.
- Layout is responsive: the list and editor sit side by side on desktop and stack on phones, so it works at the table.
- Proper `<select>`/`<button>` elements and labels, so the app is usable from the keyboard.

## Build order (each step can be tested on its own)
1. Skeleton: `index.html`, CSS theme, router, storage, campaign list (create/rename/delete), tab shell with placeholders. Export/import.
2. `build-tables.py` -> `tables.js`, `rng.js`, `effects.js`, plus `tests.html` covering weights, the parser and reroll-excludes-current.
3. `species.js` (all 26 species) + `rules/character.js` (resolution, forced results, caps, profile).
4. `rollField` component + character editor: Generate, reroll, cascading children.
5. Crew section: leader, equipment, credits/totals, ship, flavour.
6. Polish: mobile layout, empty states, error banner. Deploy to GitHub Pages and test both GitHub Pages and `file://`.

## Decisions (answered)
1. **Crew list** — The Characters tab starts empty with an **Add character** button. Each character has its own **Generate** button (in its card and at the top of its editor). A **Generate all** button at the top of the tab runs Generate on every character. Like Generate, it only rolls Random slots.
2. **Dice rerolls** — Keep the real dice odds and roll again until the result is different. This means 2D6 keeps its bell curve.
3. **Names** — Free text only.
4. **Starting items** — Shown on the character who rolled them **and** in the crew equipment pool.
5. **Forced results** — Fully locked. The field shows the value and the species that sets it, and has no dropdown and no reroll button.
