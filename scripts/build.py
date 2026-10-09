#!/usr/bin/env python3
"""Generate the checked-in static pages using only the Python standard library."""

import argparse
import hashlib
import html
import json
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
NAVIGATION = (("about", "index.html", "About"),
              ("research", "research.html", "Research"))


def asset_url(filename):
    digest = hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()[:12]
    return f"{filename}?v={digest}"


def render_page(page, layout):
    title = html.escape(page["title"], quote=True)
    description = html.escape(page["description"], quote=True)
    navigation = []
    for key, url, label in NAVIGATION:
        current = ' aria-current="page"' if key == page["navigation"] else ""
        navigation.append(f'        <a href="{url}"{current}>{label}</a>')
    social_metadata = ""
    if page["social"]:
        social_metadata = '\n'.join((
            '    <meta property="og:type" content="website">',
            f'    <meta property="og:title" content="{title}">',
            f'    <meta property="og:description" content="{html.escape(page.get("social_description", page["description"]), quote=True)}">',
            '    <meta property="og:image" content="prof.jpg">',
            '    <meta name="twitter:card" content="summary">',
        ))
    return layout.substitute(
        title=title, description=description, social_metadata=social_metadata,
        style_version=asset_url("style.css").split("?v=")[1],
        main_version=asset_url("main.js").split("?v=")[1],
        navigation='\n'.join(navigation),
        content=(TEMPLATES / "pages" / page["file"]).read_text().rstrip(),
        scripts=''.join(f'    <script src="{asset_url(script)}"></script>\n'
                        for script in page["scripts"]),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify generated pages without writing files")
    args = parser.parse_args()
    layout = Template((TEMPLATES / "layout.html").read_text())
    pages = json.loads((TEMPLATES / "site.json").read_text())["pages"]
    stale = []
    for page in pages:
        output = render_page(page, layout)
        target = ROOT / page["file"]
        if args.check:
            if not target.exists() or target.read_text() != output:
                stale.append(page["file"])
        else:
            target.write_text(output)
    if stale:
        parser.exit(1, "Outdated pages: " + ", ".join(stale) + ". Run python3 scripts/build.py\n")
    print("Generated pages are current." if args.check else f"Generated {len(pages)} pages.")


if __name__ == "__main__":
    main()
