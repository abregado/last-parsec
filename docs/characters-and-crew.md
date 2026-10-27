# Characters and crew

## Characters tab (generator)

`js/ui/charactersTab.js`, with `js/ui/crewSection.js` for crew-level rolls.
- **Rules:** `js/rules/character.js` (one character) and `js/rules/crew.js` (Leader, 8 starting equipment rolls, ship and debt, flavour tables).
- **Slots:** every rollable value is a slot `{ mode: 'random' | 'fixed' | 'forced', value }`. Generate rolls Random slots; a reroll never repeats (`LP.rng.rerollTable`); forced slots come from species rules.
- **Names:** rolled from the campaign's name tables (see `planets.md`, Names).
- **Resolving:** `character.resolve()` works out the profile, credits, items and so on from the slots. Nothing derived is stored.

## Finalize

`LP.roster.finalize(campaign)` in `js/rules/roster.js`, run from the Characters tab button.
- **First time:** the characters become roster members, their origin items go to them, the crew equipment goes to the Stash, and the ship, flavour labels, `start` totals and starting `resources` are set. `start.rivals` and `start.patrons` become named contacts on the first planet (`LP.planets.addStartingContacts`, called by the Start and New World stages).
- **Later:** the characters are added as recruits (`joinedTurn`), with only their own items.
- **Afterwards:** the generator is emptied.
- **Blockers:** `finalizeProblem()` says why it can't run yet.

## Crew tab (current state)

`js/ui/crewTab.js` edits `campaign.roster` (its shape is in the header of `roster.js`):
- **Resources:** credits, story points, Rumors, fuel and ship parts, plus free `counters`.
- **Member cards:**
  - portrait: drop or click an image; stored as a 240×480 JPEG data URL;
  - name and leader;
  - status, and Sick Bay turns;
  - stats and XP as plain text boxes (a stat's tooltip shows what the member joined with; `baseProfile` never changes);
  - carried items and notes.
- **Conditions:** badges on member cards and in a Conditions panel (crew, ship, campaign and current-planet conditions), each with a Remove button.
- **Recruits for events:** when an event offers a recruit, the Characters tab shows that one character with Accept, Reroll and Decline (`js/rules/recruit.js`).
- **Stash:** with an Add item form.
- **Ship and crew info.**

`hasCrew(campaign)` is true once a crew exists. From then on, turns and battles use named members (see `campaign-turn.md`).

## Items

`js/rules/items.js` holds the item shape and `ITEM_TABLES` (leaf tables only; the Loot routing tables are not items). Item rows on the Crew tab are compact (name, type pip, Edit). Edit opens move, damaged, source text and delete. A damaged item's name is struck through.

Items gained in a turn are added by the engine (`LP.roster.syncStageItems`). Each carries:
- `source` text, such as "Gained on Ruhr during a trade roll by Ava on turn 11.";
- a `tag`, so Undo and Restart remove it again.
