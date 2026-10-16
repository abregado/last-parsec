# Last Parsec

An unofficial companion web app for **Five Parsecs From Home** (Third Edition). It generates results: characters, crew equipment, ship, and later campaign turns and battles. It doesn't track your campaign. Record the results on your printed sheets.

Not affiliated with or endorsed by Modiphius Entertainment. You need the rulebook to play.

## Using it

- **Online:** open the GitHub Pages site.
- **Offline:** download or clone this repository and double-click `index.html`. No server or install needed.

Everything is saved in your browser's local storage. Use **Export** on the Campaigns screen to back up to a JSON file, and **Import** to restore it or move it to another browser.

### Characters tab

- **+ Add character** adds an empty character. Every field starts as *Random*.
- Pick a value in any dropdown to fix it. **Generate** rolls every field still set to Random. **Generate all** does this for every character.
- After generating, each Random field gets a **↻ reroll** button. A reroll never gives the same result. Fixed fields can't be rerolled. Fields set by a species rule (e.g. De-converted → Revenge) are locked.
- Results that cause extra rolls (credits dice, starting weapons and gear) appear as indented rows with their own dropdown and reroll button.
- The **Crew** section covers the Leader, totals (credits, story points, Patrons, Rivals, Quest Rumors), the crew's starting equipment (Military rolls can switch to High-tech once per Savvy-increase character), the ship and debt, and the flavour tables.

## Development

Plain HTML, CSS and JavaScript. There's no build step or dependencies.

- All scripts are classic `<script>` tags attached to one global `LP` namespace. ES modules and `fetch()` are blocked on `file://`.
- `tests.html` runs the test suite in the browser (open it like `index.html`).
- Local server, if you prefer one: `python -m http.server 8123`, then open http://localhost:8123.

### Project layout

```
index.html, tests.html
css/styles.css
js/lp.js                  global namespace
js/data/tables.js         GENERATED roll tables (do not edit)
js/data/species.js        the 26 crew species and their rules
js/core/                  rng (dice, weighted tables), effects parser, storage, router
js/rules/                 character and crew rules (no DOM)
js/ui/                    screens and components
tests/                    test runner and tests
tools/                    build-tables.py, bump-version.py
roll_tables/json|csv      source table data
```

### Editing roll tables

Edit `roll_tables/json/*.json`, then regenerate the script the app loads:

```
python tools/build-tables.py
```

It reports tables whose weights don't add up to a standard die. Then open `tests.html` and check that everything passes.

### Publishing an update

GitHub Pages lets browsers cache files for about 10 minutes. Before pushing, stamp fresh version numbers on the script and stylesheet links so returning visitors get the new files together:

```
python tools/bump-version.py
```

### GitHub Pages setup

In the repository's **Settings → Pages**, set **Source: Deploy from a branch**, choose `main` and `/ (root)`. The `.nojekyll` file makes Pages serve the files as they are.
