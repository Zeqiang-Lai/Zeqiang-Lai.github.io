#!/usr/bin/env python3
"""Generate the checked-in static pages using only the Python standard library."""

import argparse
import hashlib
import html
import json
import subprocess
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
        if key == "blog" and page["navigation"] == "blog" and page.get("language") == "zh-CN":
            url = "blog-zh.html"
        current = ' aria-current="page"' if key == page["navigation"] else ""
        navigation.append(f'        <a href="{url}"{current}>{label}</a>')
    language_toggle = ""
    alternate = page.get("alternate")
    if page["navigation"] == "blog" and alternate:
        target_language = html.escape(alternate["language"], quote=True)
        target_href = html.escape(alternate["href"], quote=True)
        label = "中文" if alternate["language"] == "zh-CN" else "EN"
        action = "Switch to Chinese" if alternate["language"] == "zh-CN" else "切换到英文"
        language_toggle = f'        <a class="nav-language-toggle" href="{target_href}" lang="{target_language}" hreflang="{target_language}" rel="alternate" aria-label="{action}" title="{action}">{label}</a>'
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
        language=html.escape(page.get("language", "en"), quote=True),
        page_styles='\n'.join(f'    <link rel="stylesheet" href="{asset_url(style)}">' for style in page.get("styles", [])),
        title=title, description=description, social_metadata=social_metadata,
        style_version=asset_url("style.css").split("?v=")[1],
        main_version=asset_url("main.js").split("?v=")[1],
        navigation='\n'.join(navigation),
        language_toggle=language_toggle,
        content=page["content"] if "content" in page else (TEMPLATES / "pages" / page["file"]).read_text().rstrip(),
        scripts=''.join(f'    <script src="{asset_url(script)}"></script>\n'
                        for script in page["scripts"]),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify generated pages without writing files")
    args = parser.parse_args()
    layout = Template((TEMPLATES / "layout.html").read_text())
    pages = json.loads((TEMPLATES / "site.json").read_text())["pages"]
    try:
        posts = json.loads(subprocess.check_output(["node", str(ROOT / "scripts/blog-engine.mjs")], cwd=ROOT, text=True))
    except (OSError, subprocess.CalledProcessError):
        parser.exit(1, "Blog rendering failed. Run npm ci and check content/posts/*.md.\n")
    for page in pages:
        if page["file"] == "blog.html":
            page["content"] = posts["index"]
            page["language"] = "en"
            page["alternate"] = {"language": "zh-CN", "href": "blog-zh.html"}
    pages += posts["pages"]
    stale = []
    for filename in posts["drafts"]:
        target = ROOT / filename
        if target.exists():
            if args.check:
                stale.append(filename + " (draft still generated)")
            else:
                target.unlink()
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
