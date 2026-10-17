# Last Parsec — Five Parsecs From Home companion app

Phase 1 (campaigns + Characters tab, build steps 1–6 below) is **done**. Phase 2 is planned at the end of this file: campaign settings and the Models tab (2A) are **done**; the Campaign Turn tab's engine, UI (Restart/Undo, pending choices) and the Start + Travel stages (0, 1.1-1.4) are **done**. The follow-up executor and scripts (Starship Travel Events, Trade, Exploration, Loot chain, Rewards) are **done**, and the travel event stage uses them. The World stages (2.1-2.6) are **done**. Phase 3 (Battle tab) and the Post-Battle stages (2C, pre-filled from the battle) are **done**: a campaign turn now runs from Start to Turn complete.

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

---

# Phase 2 — Models tab and Campaign Turn tab

## Decisions so far
- **Turn scope:** the Campaign Turn tab covers Step 1 (Travel) and Step 2 (World). After the battle it picks up again with Step 4 (Post-Battle). Step 3 (the battle itself) stays in the Battle tab. These are built in two phases: **2B** (Travel and World) and **2C** (Post-Battle).
- **Crew is generic.** Stages ask for *counts* (e.g. "2 crew Exploring"), not named characters. When Savvy or species could change a result, the output says so. For example: *"Rolled 4, needs 6+: succeeds if the character has Savvy +2 or better (+1 or better for an Engineer)."*
- **Follow-up dice are rolled automatically** (e.g. Escape pod's 1D6, Trade → Gear Table). When the player must decide first ("Rescue the pod?"), the output shows the choice and rolls once it's made.
- **The turn in progress is saved.** Reloading resumes where you left off, and **Restart turn** clears it. No history of past turns is kept.

## 2A — Models tab

**Purpose:** switch off enemy entries you have no models for, so later rolls (Battle tab) only land on enemies you can put on the table.

- The four tables are Criminal Elements (15 entries), Hired Muscle (16), Interested Parties (16) and Roving Threats (13).
- **Storage:** `campaign.models = { disabled: { "Criminal Elements": ["gangers", …], … } }`. Storing *disabled* ids means anything new in the data defaults to on.
- **Rules module `js/rules/models.js`:**
  - `isEnabled(campaign, table, rowId)`, `setEnabled(...)`, `setAll(campaign, table, on)`
  - `enabledRows(campaign, table)`, and `odds(campaign, table)`, which gives each enabled row's chance as weight ÷ enabled total
  - `rollEnemy(campaign, table)`, the helper the Battle tab will use. It's `rng.weightedPick` with the disabled ids excluded, and returns null if everything is off.
- **UI `js/ui/modelsTab.js`:** one collapsible section per table. The header shows "Criminal Elements · 13 of 15 enabled" with **All** / **None** buttons. Each row has:
  - a checkbox and the enemy name
  - the book's d100 range (e.g. `1-10`) and its fixed weight
  - its **current chance**, recalculated live: turning entries off raises the others' chances, and disabled rows show "—"
  - a small expandable line with the profile (Numbers, Speed, CS, Toughness, AI, Weapons) to help match models
- **Warning:** if a table has no entries enabled, a warning says rolls on it are impossible. Later, the Battle tab will also skip that category on the Enemy Encounter Category Table.
- **Data fix:** "Roid- gangers" → "Roid-gangers" in `Hired Muscle.json`, then re-run `build-tables.py`. I'll check the other enemy names for similar text-extraction glitches.
- **Tests:** chances add up to 100% over the enabled rows, disabled rows are never rolled, and all-off returns null.

## 2B/2C — Campaign Turn tab

### Interaction
- A vertical sequence of **stages**. Only the current stage shows its **input widget** and a **Confirm** button.
- Confirm makes the rolls and swaps the input for an **output card**, which stays read-only. The next stage's input then appears below it.
- Stages that don't apply are skipped automatically, with a one-line note saying why (e.g. "Starship travel event — skipped: not travelling").
- **Restart turn** at the top, with a confirm step, clears the turn and starts again at the first stage. **Undo last stage** steps back one confirmed stage (see Decisions).
- Output cards show for each roll:
  - the dice and the result (`D100 → 57: Escape pod`)
  - the table name and page
  - the rule text
  - any follow-up rolls, indented, with conditional notes ("needs 6+ …", "if you have a Precursor …")
- Stages ask only for what they need. Values entered earlier in the turn, or **remembered from last turn** (crew size, Rivals, Patrons, Quest Rumors, current world traits), are pre-filled and can be edited. This is convenience memory only; the app still doesn't track the campaign.

### Architecture
```
js/rules/turn/engine.js     stage registry, state machine, next-stage logic, persistence shape
js/rules/turn/travel.js     Step 1 stage definitions
js/rules/turn/world.js      Step 2 stage definitions
js/rules/turn/postBattle.js Step 4 stage definitions (phase 2C)
js/core/followup.js         runs scripted follow-ups for table rows
js/data/followups.js        hand-written follow-up scripts per table row
js/ui/turnTab.js            the tab: stage list, restart
js/ui/stageForm.js          renders a stage's input schema
js/ui/resultCard.js         renders a stage's output (rolls, follow-ups, choices)
```
A **stage definition** is plain data plus functions:
```js
{
  id: 'travel-event', step: 1, title: 'Starship travel event', page: 70,
  applies(turn)  -> true | 'reason it is skipped',
  inputs(turn)   -> [field schema, pre-filled from turn.facts / memory],
  resolve(input, turn) -> output   // all dice rolled here, via LP.rng
  facts(output)  -> values later stages need (e.g. rumorsGained, patronOffers)
}
```
**Input field types:** number (min/max), yes/no, select, multi-select (world traits), and a **task allocation** grid (count per crew task; at most 2 per task; the total can't exceed available crew).

**Stored turn:** `campaign.turn = { startedAt, facts, stages: [{ id, input, output }] }`, plus `campaign.turnMemory` for the pre-fills.

**Follow-up scripts:** a small declarative language, so rules live in data rather than code:
- `{ roll: '1D6', outcomes: [{ range: '1', text, then: [...] }, …] }`
- `{ table: 'Gear Subtable', times: 2, note: 'damaged, needs Repair' }`
- `{ check: { dice: '1D6', add: 'Savvy', target: 6, times: 3 } }`: gives the conditional Savvy text
- `{ choice: { prompt: 'Rescue the escape pod?', options: [{ label: 'Rescue', then: [...] }, { label: 'Leave it' }] } }`
- `{ rollAgain: true }`: e.g. Navigation trouble, which rolls on the same table again
- `{ randomCrew: true }`: "crew member 3 of 5" from the crew count

Rows without a script just show their text.

**Event table data cleanup:** in the event tables, the title and description have been merged into one field (e.g. "Asteroids Rocky debris…"). I'll add a separate `title` to the JSON for Starship Travel Events, then check the Campaign Events and Character Events tables. I'll also check the two-column tables (Trade, Exploration) against the book.

### Stages — Phase 2B (Travel and World)

| # | Stage | Asks for | Rolls / works out |
|---|---|---|---|
| 0 | Start of turn | First turn of the campaign? Current world's traits (multi-select, remembered). Is this world being Invaded? | Nothing. Sets up the facts. On the first turn, skips Travel and offers optional New World Arrival. |
| 1.1 | Flee Invasion *(only if Invaded)* | Have a ship? | 2D6 vs 8+. On a fail: only Assign Equipment, then an Invasion Battle. On a success: travel. |
| 1.2 | Decide whether to travel | Stay, own ship, or commercial passage; crew count | Cost (5 credits; Fuel refinery 3; Fuel shortage +1D3; commercial 1 per crew). Bureaucratic mess: 2D6, 2–4 = delayed or bribe. |
| 1.3 | Starship travel event *(own ship only)* | — | D100 Starship Travel Events, with scripted follow-ups (Asteroids, Distress call, Escape pod, Patrol ship, Time to read a book…) and "roll again" chains |
| 1.4 | New world arrival | Number of Rivals; any Persistent Patrons; try a forged License? | Each Rival 1D6, 5+ follows. Licence 1D6, 5–6 required, cost 1D6. Forged licence 1D6 (+Savvy text, natural 1 = Rival). World Trait D100 (optional Wild Galaxy: roll twice), including trait dice (Alien species restricted 1D10, Interdiction 1D3). The new traits replace the remembered ones. |
| 2.1 | Upkeep and ship repairs | Crew count (not in Sick Bay); ship debt; payment; Hull damage | Upkeep (1 for 4–6 crew, +1 per crew over 6; High cost counts 2 more). Debt interest +1 (+2 at 31+). At 75+, 2D6 2–6 = ship seized. 1 free Hull repair. |
| 2.2 | Crew tasks | Task allocation: Find a Patron, Train, Trade, Recruit, Explore, Track, Repair, Decoy. Plus known Patrons, credits spent, current crew size, Rivals. | **Patron:** 1D6 + searchers + Patrons + credits (+1 Opportunities, +2 Corporate state): 5+ = 1 offer, 6+ = 2. **Train:** +1 XP each. **Trade:** one Trade Table roll each, with follow-ups. **Recruit:** automatic below 6 crew, otherwise 1D6 + recruiters ≥ 6; recruits are rolled as species only (p.78). **Explore:** one Exploration Table roll each, with follow-ups. **Track:** 1D6 + trackers + credits ≥ 6. **Repair:** 1D6 each, with Savvy/Engineer text, natural 1 = destroyed. **Decoy:** count kept for 2.6. |
| 2.3 | Job offers *(per Patron offer from 2.2/Exploration, or an existing Patron)* | Number of offers (pre-filled) | Each offer: Patron D10. Danger Pay D10 (+1 Corporation). Time Frame D10 (+1 Secretive Group). BHC: D10 per category against that Patron type's target, then the Benefit / Hazard / Condition subtable (Negotiable rerolls Danger Pay, best kept). |
| 2.4 | Assign equipment | — | No rolls. A reminder with a **Done** button. |
| 2.5 | Resolve Rumors | On a Quest? Rumors (pre-filled + gained this turn) | If not on a Quest: D6 ≤ Rumors gives a Quest. |
| 2.6 | Choose your battle | Rivals; Decoys (pre-filled); Private Transport hazard? | D6 + Decoys ≤ Rivals means a Rival attacks: a random Rival "n of N". Lists the battles you can choose (Opportunity always, Rival if Tracked, Quest if active, Patron if offered). Your choice is stored for the Battle tab and post-battle. |

### Stages — Phase 2C (Post-Battle, p.119)
These start with a **Battle result** input: battle type, enemy category, Held the Field, Won, Invasion Threat enemy, Unique Individual killed, number of casualties (and how many are Bots/Soulless), Tracked the Rival, Quest finale, Danger Pay. If the Battle tab produced the battle, these are pre-filled from it.

1. Rival status: 1D6, with the +1s
2. Patron status: no roll
3. Quest progress: D6 + Rumors (−2 if not Won), then D6 for "next world"
4. Get paid: 1D6, with Quest-finale best of two +1, Won minimum 3, Easy +1, Booming economy, Danger Pay
5. Battlefield finds: D100, with Consumables subtable and 1D3 credits follow-ups
6. Check for Invasion: 2D6 (+evidence, −1 Held the Field, Hardcore +2, Insanity +3, trait modifiers) vs 9+
7. Gather the loot: Loot Table with its subtable chain (three rolls after a Quest finale, none after Invasion)
8. Injuries: one roll per casualty on the Injury or Bot Injury table, with Sick Bay dice and surgery cost
9. Experience: XP per outcome group (casualty / survived / won), plus first-blood, Unique, Easy and Quest bonuses
10. Advanced training: optional application, 2D6 vs 4+ (6+ with Restricted education), fee notes
11. Purchase items: number of 3-credit rolls on the Military, Gear and Gadget tables
12. Campaign event: D100 with follow-ups
13. Character event: D100, a random non-Bot crew member, Precursor "roll 2, pick one" option
14. Galactic War progress: 2D6 per Invaded planet, with modifiers

### Build order
1. **Campaign settings** (difficulty, crew size): storage defaults, header badge, settings dialog, and handling in export/import.
2. **2A Models tab:** rules, UI, tests, data-name fix.
3. **Turn engine and UI shell:** stage registry, persistence, input renderer, result card, Restart and Undo. Proven with stages 0 and 1.2.
4. **Follow-up executor + scripts** for Starship Travel Events, Trade and Exploration. Data cleanup for event titles.
5. **The rest of the Travel and World stages** (1.1–2.6), with tests: every stage's resolve() against a seeded RNG, every follow-up script parsed and run.
6. **2C Post-Battle stages** and follow-up scripts for Loot, Battlefield Finds, Injury, Campaign Events and Character Events.

### Decisions (answered)
1. **Difficulty mode and campaign crew size are campaign settings.**
   - Stored as `campaign.settings = { difficulty, crewSize }`.
   - `difficulty` is one of Easy, Normal, Challenging, Hardcore or Insanity (p.65). `crewSize` is 4, 5 or 6 (p.63).
   - New campaigns still ask only for a name and default to Normal / 6.
   - A **Settings** button in the campaign header opens a dialog to change them. The header shows them as a small badge, e.g. "Normal · crew 6".
   - Turn stages read them directly instead of asking:
     - Easy: +1 pay and +1 XP
     - Hardcore / Insanity: +2 / +3 to Invasion rolls
     - Hardcore: story point notes
     - crew size: used later for enemy numbers in the Battle tab
2. **Undo last stage**, next to Restart turn:
   - Removes the most recent confirmed stage, including its rolls, and shows its input form again with the values you entered, so you can correct them and confirm again.
   - Rerolls happen on that confirm.
   - When a stage is waiting on a follow-up choice, Undo goes back to before the choice instead.
   - Stages skipped because of the undone stage are worked out again.
   - Disabled when nothing has been confirmed.

---

# Phase 3 — Battle tab

## Decisions
- **Character-generator style:**
  - One list of fields, each with a dropdown (Random first) and a reroll button.
  - **Generate** rolls every field set to Random. Fixed fields stay as they are.
  - Fields that depend on others are rebuilt when those change, the same way character children are.
- **Linked both ways with the Campaign Turn:**
  - The mission type defaults to the turn's "Choose your battle" result (Opportunity, Patron, Quest, Attack a Rival, Rival attack, Invasion).
  - The generated battle feeds the Post-Battle stages.
  - A stand-alone battle can be generated at any time.
- **Extras:** Battle Events tracker, Seize the Initiative helper, Varied Armaments, and setup helpers.
- **Saving:** the current battle is saved per campaign (`campaign.battle`) and survives reloads. Generating a new one replaces it.

## What the rules need (pp.87–112, 116–118)

| Step | Table | Depends on |
|---|---|---|
| Mission type | — (from the turn, or chosen) | Opportunity · Patron · Quest · Quest finale · Attack a Rival · Rival attack · Invasion |
| Rival attack type | Rival Attacks (D10) | Only for a Rival attack. Attack a Rival is always a Showdown (locked). |
| Deployment condition | Deployment Conditions (D100) | Column: Opportunity/Patron, Rival or Quest. None in an Invasion. |
| Notable sight | Notable Sights (D100) | Same columns. None in an Invasion. Placed 2D6+2" in a random direction from the centre. |
| Objective | Opportunity / Patron / Quest Mission Objectives (D10) | Quest finale is locked to Fight Off. Rival fights have no objective. Invasion: survive 6 rounds. |
| Enemy category | Enemy Encounter Category (D100) | Column by mission. Rival fights use the "Unknown Rival" column, or you fix your Rival's category. Categories with no enabled models are skipped. |
| Enemy | Criminal Elements / Hired Muscle / Interested Parties / Roving Threats (D100) | Category. Disabled entries (Models tab) are never rolled, and are shown as "(no models)" in the dropdown. |
| Enemy numbers | Dice by crew size | 6: 2D6 keep higher · 5: 1D6 · 4: 2D6 keep lower. Challenging and harder reroll 1s and 2s. Interested Parties on a Quest reroll 1s once. |
| Specialists / Lieutenant | Worked out | 1–2 foes: no Specialist · 3–6: one · 7+: two (Insanity +1) · 4+ foes: one Lieutenant (+1 CS and a Blade) |
| Weapons | Varied Armaments (D6, column 1–3) and Specialists (D6, column A–C) | The enemy's code, e.g. "2 B". Some enemies list fixed weapons instead (e.g. "Claws (Damage +1)"). Aggressive AI with CS above +0 adds a Blade; Rampage/Psycho always adds a Blade. With **Varied Armaments** on, the regular enemies split into two groups with a roll each. |
| Unique Individual | 2D6 (9+), then Unique Individuals (D100) | Not in Invasions or against Roving Threats (except Insanity, where one is always present, and 2D6 11–12 means two). +1 Interested Parties, +1 Hardcore. |
| Criminal bounty | 1D6 | Criminal Elements only: on 1–3, that many bonus credits if you Hold the Field. |

**Enemy number modifiers** are shown as a labelled breakdown, like the Patron search:
- The enemy's Numbers.
- Mission: Defend objective +1, Quest finale +1, Brought friends +1, Assault +1, Invasion +2.
- Deployment: Small encounter −1 (−2 if the enemy outnumbers you).
- Job hazards (inputs): Dangerous Job +1, Security Team −1, Low Priority −1.
- Crew fielded 2 or more below the campaign crew size: −1 (input).
- Difficulty: Easy −1 at 5+, Hardcore/Insanity +1.
- World traits (from the turn's memory): Heavily enforced −1 and Rampant crime +1 against Criminal Elements; Dangerous +1 against Roving Threats.

### Enemy profile card
The full stat line, with the AI code spelled out:
- A Aggressive · C Cautious · D Defensive · G Guardian · R Rampage · T Tactical · B Beast

The force is listed as a breakdown, e.g. "7 Feral Mercenaries: 4 × Military rifle · 2 Specialists × Rattle gun · 1 Lieutenant: Military rifle + Blade, CS +1". Below that: the enemy's special rules, the Unique Individual's profile if present, and the category rules (Criminal bounty and Rival roll, Hired Muscle −1 to Seize, Roving Threats never become Rivals).

### Setup helpers
- **Battlefield edge:** a random edge for you; the enemy takes the opposite one.
- **Enemy deployment pattern** for the AI type (p.110):
  - Aggressive / Rampage: one cluster, 1" apart
  - Tactical / Defensive: three teams, 8" apart
  - Cautious: two groups, 6" apart
  - Beast: pairs spread across thirds
- **Notable sight placement:** 2D6+2" in a direction (a D12 clock face).
- **Terrain reminder:** the standard terrain set for 2×2 / 2.5×2.5 / 3×3 ft tables (p.109). Text only.

### Seize the Initiative helper (p.112)
- **Inputs:** highest Savvy in the crew, outnumbered?, a Feral in the crew?, and Motion tracker / Scanner bot.
- **Automatic modifiers:**
  - Hired Muscle −1
  - the enemy's own notes ("Careless +1", "Alert −1", "cannot Seize", "always unmodified")
  - Hardcore −2, Insanity −3
  - a Feral in the crew ignores the enemy's penalties
- **Roll:** 2D6 + modifiers, with a ✓ on 10+ and the rule reminder.

### Battle Events tracker (p.116, optional)
Two buttons, **End of round 2** and **End of round 4**, each rolling once on the Battle Events Table. Results stay on the battle. A note says to discard the second event if it contradicts the first.

### Links with the turn
- The Battle tab pre-selects the mission type from the current turn's 2.6 result and shows "From this turn's choice: Patron job".
- The turn's "Time to fight" card gets a **Generate this battle** link to the Battle tab.
- For Phase 2C (Post-Battle), the battle summary pre-fills:
  - battle type and enemy category
  - Invasion Threat
  - Unique Individual present
  - Criminal bounty
  - notable-sight gains
  - enemy perks: Pirates' extra Loot, Raiders' second Battlefield Finds roll, Cultists' Intrigue roll

## Architecture
```
js/rules/battle.js      battle model (slots like characters), dependencies, generate/reroll, resolve()
js/rules/enemies.js     parse enemy rows: weapon code or fixed weapon, AI name, Seize the Initiative
                        modifiers, Invasion Threat, Saving Throw, etc. (regex over notes + small overrides)
js/ui/battleTab.js      mission panel, field list (LP.ui.rollField), enemy card, setup helpers,
                        Seize the Initiative, Battle Events
```
`campaign.battle = { generated, createdAt, fromTurn, inputs: {...}, slots: {...}, events: [...], seize: {...} }`.

## Build order
1. **Data review:**
   - Check every enemy row's weapon field parses (code or fixed weapon).
   - Check that the notes give Seize modifiers and Invasion Threat cleanly.
   - Check the multi-column Deployment Conditions / Notable Sights / Encounter Category ranges against pp.88–96.
   - Split Battle Events titles out of the text, as for travel events.
2. **`enemies.js` and `battle.js` with tests:**
   - mission → column choices and locked fields
   - numbers dice by crew size and difficulty, and every modifier
   - Specialist and Lieutenant thresholds
   - weapon parsing and Varied Armaments
   - Unique Individual rules (including Insanity)
   - Models exclusions
3. **Battle tab UI:** mission panel, fields, enemy card, setup helpers. Phone layout.
4. **Seize the Initiative helper and Battle Events tracker.**
5. **Turn links:** mission pre-fill, "Generate this battle" link, and the battle summary for Post-Battle.

## Decisions (answered)
1. **Invasion forces are chosen on the Models tab.**
   - Each enemy entry gets a second tick box, **Invasion**, to mark which enemy types can invade.
   - The default selection is the entries the book marks "Invasion Threat": K’Erin Colonists, Converted Acquisition, Converted Infiltrators, Abductor Raiders and Swarm Brood.
   - For an Invasion battle, Random rolls among entries that are ticked for invasions **and** enabled, weighted by their printed weights.
   - Stored as `campaign.models.invasion = { tableName: [rowId, ...] }`. Until you change a table, it uses the defaults.
2. **Rival enemy types:** not remembered for now. For a Rival fight you fix the enemy in its dropdown, or roll on the Unknown Rival column.
