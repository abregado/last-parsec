"""Build js/data/tables.js from roll_tables/json/*.json.

Usage (from the repository root):
    python tools/build-tables.py

The app cannot fetch() JSON when opened from file://, so the tables are
shipped as a plain script that assigns them to LP.data.tables.

For every table this adds:
  - labelColumn: the first non-weight column (the row's display name)
  - weightColumns: the columns holding range sizes
  - die: "D100", "D10", "D6" or "2D6" (inferred), or null when the table is
    not rolled directly (e.g. target-number tables)
  - rows[].id: a slug of the label, unique within the table
  - rows[].ranges: {weightColumn: "1-4"} printed dice ranges

It also checks the data and prints warnings for anything odd. It exits with
an error only when a table cannot be used at all.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "roll_tables" / "json"
OUTPUT = ROOT / "js" / "data" / "tables.js"

DIE_BY_TOTAL = {100: "D100", 10: "D10", 6: "D6"}
TWO_D6_COMBOS = {2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1}


def slugify(text):
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "row"


def format_range(low, high):
    return str(low) if low == high else "%d-%d" % (low, high)


def linear_ranges(weights):
    ranges, start = [], 1
    for weight in weights:
        if weight <= 0:
            ranges.append(None)
            continue
        ranges.append(format_range(start, start + weight - 1))
        start += weight
    return ranges


def two_d6_ranges(weights):
    """Map combination counts (out of 36) back to 2D6 totals, or None if they don't line up."""
    ranges, total = [], 2
    for weight in weights:
        low, combos = total, 0
        while combos < weight and total <= 12:
            combos += TWO_D6_COMBOS[total]
            total += 1
        if combos != weight:
            return None
        ranges.append(format_range(low, total - 1))
    return ranges


def build_table(path, warnings):
    data = json.loads(path.read_text(encoding="utf-8"))
    name = data.get("table") or path.stem
    columns = data.get("columns") or []
    rows = data.get("rows") or []
    note = data.get("note")

    if not rows or not columns:
        raise ValueError("%s: no rows or columns" % name)

    weight_columns = [c for c in columns if c.startswith("weight")]
    label_column = next((c for c in columns if not c.startswith("weight")), None)
    if label_column is None:
        raise ValueError("%s: no label column" % name)

    for wc in weight_columns:
        for row in rows:
            if not isinstance(row.get(wc), int) or row[wc] < 0:
                raise ValueError("%s: row %r has a bad %s" % (name, row.get(label_column), wc))

    die = None
    ranges = {}
    if weight_columns:
        is_2d6 = bool(note and "2D6" in note)
        for wc in weight_columns:
            weights = [row[wc] for row in rows]
            total = sum(weights)
            if is_2d6:
                col_die = "2D6" if total == 36 else None
                col_ranges = two_d6_ranges(weights) if col_die else None
            else:
                col_die = DIE_BY_TOTAL.get(total)
                col_ranges = linear_ranges(weights) if col_die else None
            if col_die is None:
                warnings.append("%s: %s adds up to %d, which is not a standard die" % (name, wc, total))
            elif col_ranges is None:
                warnings.append("%s: %s weights do not fit %s totals" % (name, wc, col_die))
            if die is None:
                die = col_die
            elif col_die is not None and col_die != die:
                warnings.append("%s: weight columns use different dice" % name)
            ranges[wc] = col_ranges

    seen = {}
    out_rows = []
    for index, row in enumerate(rows):
        label = row.get(label_column)
        if label in (None, ""):
            warnings.append("%s: row %d has an empty %s" % (name, index + 1, label_column))
        base = slugify(label)
        seen[base] = seen.get(base, 0) + 1
        row_id = base if seen[base] == 1 else "%s-%d" % (base, seen[base])
        out = {"id": row_id}
        out.update(row)
        if ranges:
            out["ranges"] = {wc: (r[index] if r else None) for wc, r in ranges.items()}
        out_rows.append(out)

    table = {
        "name": name,
        "pdfPages": data.get("pdf_pages") or [],
        "columns": columns,
        "labelColumn": label_column,
        "weightColumns": weight_columns,
        "die": die,
        "rows": out_rows,
    }
    if note:
        table["note"] = note
    return name, table


def main():
    warnings = []
    tables = {}
    for path in sorted(SOURCE_DIR.glob("*.json")):
        try:
            name, table = build_table(path, warnings)
        except (ValueError, json.JSONDecodeError) as error:
            print("ERROR: %s: %s" % (path.name, error), file=sys.stderr)
            return 1
        if name in tables:
            print("ERROR: duplicate table name %r" % name, file=sys.stderr)
            return 1
        tables[name] = table

    body = json.dumps(tables, indent=1, ensure_ascii=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "// GENERATED by tools/build-tables.py from roll_tables/json. Do not edit by hand.\n"
        "window.LP.data = window.LP.data || {};\n"
        "window.LP.data.tables = " + body + ";\n",
        encoding="utf-8",
        newline="\n",
    )

    print("Wrote %d tables to %s" % (len(tables), OUTPUT.relative_to(ROOT)))
    for warning in warnings:
        print("warning: " + warning)
    return 0


if __name__ == "__main__":
    sys.exit(main())
