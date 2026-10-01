# Zeqiang Lai's personal website

A static website served by GitHub Pages. The root HTML files are generated and
checked into Git, so hosting does not require a build service or runtime.

## Editing

- Edit page content in `templates/pages/`.
- Edit the shared document head, analytics, and footer in `templates/layout.html`.
- Edit page titles, descriptions, and active navigation in `templates/site.json`.
- Edit navigation links in `NAVIGATION` in `scripts/build.py`.
- Edit styles in `style.css`, shared theme behavior in `main.js`, and publication
  controls in `publications.js`.

After making changes, regenerate the HTML with Python 3 (no packages required):

```sh
python3 scripts/build.py
python3 scripts/build.py --check
```

Commit both the source changes and generated root HTML files. Avoid editing the
root HTML files directly, as the next build will replace those changes. Asset
versions are derived from file contents, so CSS and JavaScript updates do not
require manually changing cache version strings on every page.

## Local preview

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. Regenerate pages after editing templates.
