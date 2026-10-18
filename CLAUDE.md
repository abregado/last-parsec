# Last Parsec

Companion web app for Five Parsecs From Home. Plain HTML, CSS and vanilla JS, no build step. It runs from GitHub Pages and from `file://`.

## Read before working on…

| Feature | Read |
|---|---|
| Anything (start here) | `docs/architecture.md` |
| Characters tab, Finalize, Crew tab, items and Stash | `docs/characters-and-crew.md` |
| Campaign Turn tab, stages, follow-up scripts, result cards | `docs/campaign-turn.md` |
| Battle tab | `docs/battle.md` (and `docs/campaign-turn.md` for Post-Battle) |
| Species, Archetypes, Planets, Rivals and Patrons, Models | `docs/planets.md` |
| Equipment tab, roll tables | `docs/architecture.md` (Tables) |
| Writing docs or code comments | `docs/writing-docs.md` |

## Rules that always apply

- Classic `<script>` tags on the global `LP` namespace only: no ES modules, no `fetch()` (both break on `file://`).
- Rules code (`js/core`, `js/rules`) never touches the DOM; UI code lives in `js/ui`.
- Run `python tools/bump-version.py` after changing any JS or CSS file, and add new scripts to both `index.html` and (for rules code) `tests.html`.
- Tests: open `tests.html` (served or as a file). All tests must pass.
- Keep the docs current when a feature changes (see `docs/writing-docs.md`).
- The rulebook PDF is copyrighted: never commit or publish it.
