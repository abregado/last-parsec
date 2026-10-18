# Battle

`js/rules/battle.js` (`LP.battle`) handles the rules; the header documents `campaign.battle` and the field specs. The tab is `js/ui/battleTab.js`.

- **Fields:** built in order by the `FIELDS` builders (deployment, objective, enemy category, enemy, numbers, Uniques, weapons and more). Each builder can read earlier slots, and returns null when it doesn't apply. Slots use the same random/fixed/forced pattern as characters.
- **Enemy data:** profiles come from `js/rules/enemies.js`. Enemies without models (Models tab, `js/rules/models.js`) are never rolled.
- **Turn link:**
  - The mission and named Rival come from the turn (`FROM_TURN`, the `useTurn` helper in the tab).
  - A named Rival locks the enemy and limits its Uniques. Hated Rivals add +1.
  - An invaded planet locks the invader.
- **Crew:** with a crew, named members are deployed (`setDeployed` / `defaultDeployed`). This sets the crew in the field and Seize the Initiative's highest Savvy and Feral inputs.
- **Results:** `summary()` gives the facts Post-Battle stage 4.0 pre-fills from.
- **Extras:** Seize the Initiative and Battle Events are at the end of `battle.js`.
