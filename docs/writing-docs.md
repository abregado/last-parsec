# Writing docs and comments

## Docs

- **What they cover:** the project as it is now. No history, plans or changelogs; git holds those.
- **Length:** as short as possible. Point to the code (file and function names) instead of repeating it.
- **Structure:** one file per feature area in `docs/`. When you add an area, add a row to the table in `CLAUDE.md`.
- **Keeping them current:** update a doc in the same change as the feature. Delete anything that is no longer true.
- **Data shapes** live in the owning module's header comment. Docs link to them; they don't copy them.
- **Style:** plain words, short sentences, lists over paragraphs. Use the rulebook's terms (Rival, Stash, Upkeep).

## Code comments

- **Length:** one line when possible.
- **Content:** only what the code can't say: why, rule page references, data shapes, units, edge cases, and the effect on other code.
- **Never** narrate what the next line obviously does (`// Loop over members`), or repeat a function's name as a sentence.
- **Module header:** what the module is for and the shape of the data it owns.
- **Function docs** (`/** … */`): return shapes and option keys that aren't obvious from the parameters. Leave them out when the name says it all.
- **Section dividers** (`/* ---- */` with a title) are fine for finding your way in long files.
- **Keeping them current:** update or delete a comment when the code changes. A wrong comment is worse than none.
