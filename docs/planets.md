# Species, archetypes and planets

## Species

All species form one weighted table: Crew Type weight × subtable weight (`LP.archetypes.speciesTable()`). Species rules are in `js/data/species.js`. The tab is `js/ui/speciesTab.js` (read-only).

## Archetypes

`js/rules/archetypes.js` (its shape is in the header); the tab is `js/ui/archetypesTab.js`. An archetype limits:
- world traits;
- species weights;
- allowed event rows (Campaign, Character, Exploration, Trade, Travel);
- named Patron entries (type, forces, Uniques);
- named Rival entries (forces, Uniques).

An empty list means the full table. The "All options" default plays as written.
- `disabledMap()` combines the Models-tab exclusions with the archetype's event limits, for follow-up runs.

## Planets

`js/rules/planets.js` (its shape is in the header); the tab is `js/ui/planetsTab.js`.
- **New planets:** `createPlanet` / `rollWorld` roll the licence and traits from an archetype.
- **Contacts:**
  - `newPatron`, `newRival` and `patronToRival` create named contacts.
  - Each has editable `notes`, which start with where it came from (`contactNote()`, "Met during a campaign event on turn 4.").
  - `addStartingContacts()` places the crew's starting Rivals and Patrons on the first planet.
- **In the turn:**
  - Travel moves following Rivals and Persistent Patrons (`moveContacts`).
  - Fleeing an invasion deletes the planet's contacts.
  - Stage 4.6 starts an invasion.
  - Stage 4.14 rolls Galactic War for every other invaded planet. It is skipped when there are none.
- **ctx.memory:** the turn engine reads Rival and Patron counts, traits and invasion from the current planet.

## Models

`js/rules/models.js`: per-enemy "have models" toggles (with live chances) and Invasion ticks. The tab is `js/ui/modelsTab.js`.
