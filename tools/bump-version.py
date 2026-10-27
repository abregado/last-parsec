"""Stamp a fresh ?v=... on every local script and stylesheet link.

Usage (from the repository root, before publishing an update):
    python tools/bump-version.py

GitHub Pages lets browsers cache files for about 10 minutes, so without a
new query string returning visitors can get a mix of old and new scripts
right after an update.
"""

import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "tests.html", "table.html"]

# src="js/..." or href="css/..." (local paths only), with or without an existing ?v=
PATTERN = re.compile(r'((?:src|href)="(?!https?:|data:|#)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"')


def write_with_retry(path, text, attempts=5):
    """Editors and file watchers on Windows can hold a file open for a moment."""
    for attempt in range(attempts):
        try:
            path.write_text(text, encoding="utf-8", newline="\n")
            return
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.3)


def main():
    version = time.strftime("%Y%m%d%H%M%S")
    for name in PAGES:
        path = ROOT / name
        text = path.read_text(encoding="utf-8")
        stamped, count = PATTERN.subn(r'\1?v=' + version + '"', text)
        write_with_retry(path, stamped)
        print("%s: stamped %d files with v=%s" % (name, count, version))
    return 0


if __name__ == "__main__":
    sys.exit(main())
