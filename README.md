# Last Parsec

An unofficial companion web app for **Five Parsecs From Home** (Third Edition). It generates characters, crew, campaign turns and battles, and keeps track of your crew, their gear and the planets you visit.

Not affiliated with or endorsed by Modiphius Entertainment. You need the rulebook to play.

## Using it

- **Online:** open the GitHub Pages site.
- **Offline:** download or clone this repository and double-click `index.html`. No server or install needed.

Everything is saved in your browser's local storage. Use **Export** on the Campaigns screen to back up to a JSON file, and **Import** to restore it or move it to another browser.

### Tabs

- **Crew:** your crew as it is now: each member's stats, XP, status, portrait and gear, plus the Stash, the ship and the crew's resources (credits, story points, Rumors and more).
- **Planets:** the worlds you've visited, with their traits, named Patrons and Rivals, and invasions.
- **Campaign Turn:** a step-by-step campaign turn. Each step shows a short summary and what to change by hand; a button shows the full dice working.
- **Battle:** generates the battle for this turn.

In **Edit mode** (the toggle at the right of the tab bar), the setup tabs also appear:
- **Characters:** generate the starting crew or recruits, then press **Finalize**.
- **Models:** which enemies you have models for.
- **Species:** the species odds.
- **Archetypes:** kinds of planet.
- **Equipment:** the equipment tables.

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
js/data/followups.js      follow-up rolls for table results
js/core/                  rng (dice, weighted tables), effects parser, storage, router
js/rules/                 game rules and the campaign turn (no DOM)
js/ui/                    screens and components
tests/                    test runner and tests
tools/                    build-tables.py, bump-version.py
docs/                     developer docs (start with CLAUDE.md)
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
