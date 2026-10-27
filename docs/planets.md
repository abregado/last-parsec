# Species, archetypes and planets

## Species

All species form one weighted table: Crew Type weight × subtable weight (`LP.archetypes.speciesTable()`). Species rules are in `js/data/species.js`; each species lists its stat `caps`, Luck included (`capFor`). The tab is `js/ui/speciesTab.js`. The odds are read-only; each species' name tables can be edited there (see Names below).

## Names

`js/rules/names.js` (its shape is in the header); starter tables are in `js/data/nameTables.js`.
- **Tables:** `campaign.nameTables` is editable on the Names tab (`js/ui/namesTab.js`): add, rename and delete tables, and add or remove names. One Add box takes a single name or several separated by commas; commas never stay in a name. Deleting a table removes it from every species.
- **Generic names:** a table that can't be deleted and always keeps at least one name. A species left with no table (after a delete or removing its last chip) uses it.
- **Per species:** a name is one pick from each of the species' tables, joined by a space. Defaults: Humans first name + surname, Bots prefix + suffix, each Primary Alien its own table, every Strange species the one Strange table. The Species tab stores overrides in `campaign.speciesNames`, with a Reset button.
- **Generating:** `LP.names.assign` names a character on Generate, on a species change and for event recruits, but only while the name is empty or still the rolled one (`nameAuto`); typing a name turns that off. It rerolls up to 20 times to avoid names already used by the generator or crew. The 🎲 button beside the name always rerolls.

## Archetypes

`js/rules/archetypes.js` (its shape is in the header); the tab is `js/ui/archetypesTab.js`. An archetype limits:
- world traits;
- species weights;
- allowed events (Campaign, Character, Exploration, Trade, Travel), as `packId:eventId` from the event packs (`eventList`); an empty list allows the whole kind;
- named Patron entries (type, forces, Uniques);
- named Rival entries (forces, Uniques).

An empty list means the full table. The "All options" default plays as written.
- `disabledMap()` is the Models-tab exclusions, for follow-up rolls. `eventFilter()` applies the archetype's event limits to the event runner.

## Planets

`js/rules/planets.js` (its shape is in the header); the tab is `js/ui/planetsTab.js`.
- **New planets:** `createPlanet` / `rollWorld` roll the licence and traits from an archetype.
- **Contacts:**
  - `newPatron`, `newRival` and `patronToRival` create named contacts.
  - Events can set a contact aside (`disableRival`, `disablePatron`): it moves to `disabledRivals` or `disabledPatrons`, so the rest of the code never sees it, and `enableRival` brings it back.
  - The Planets tab lists set-aside contacts in a "Set aside" block with a Bring back button, and shows the planet's conditions.
  - Each has editable `notes`, which start with where it came from (`contactNote()`, "Met during a campaign event on turn 4.").
  - `addStartingContacts()` places the crew's starting Rivals and Patrons on the first planet.
- **In the turn:**
  - Travel moves following Rivals and Persistent Patrons (`moveContacts`).
  - Fleeing an invasion deletes the planet's contacts.
  - Stage 4.6 starts an invasion.
  - Stage 4.14 rolls Galactic War for every other invaded planet. It is skipped when there are none.
- **ctx.memory:** the turn engine reads Rival and Patron counts, traits and invasion from the current planet.

## Models

`js/rules/models.js`: per-enemy "have models" toggles (with live chances), Invasion ticks, and per-weapon toggles. The tab is `js/ui/modelsTab.js`.
- **Layout:** each enemy shows its description beside the name on a wide landscape screen (otherwise inside the profile). The description is the notes text before the first special ability (`LP.enemies.splitNotes`). Expanding the Profile shows a stat block, tags such as Invasion Threat and the Saving Throw, the weapons the unit can roll (`weaponsFor`: its basic and specialist columns), and its special abilities. Each table has Expand all and Collapse all.
- **Weapons:** unticking a weapon adds its name to `campaign.models.weaponsOff`. It applies everywhere that weapon appears, and battle weapon rolls skip it (`weaponExclude`), unless that would leave a column empty.
