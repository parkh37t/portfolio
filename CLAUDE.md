# CLAUDE.md

Jaeha Park's personal portfolio, published at **https://parkh37t.github.io/portfolio/**.

## What this repo is

Three hand-editable HTML pages plus the assets they load. There is **no build
step**: the files in the repo root are exactly what GitHub Pages serves. Edit
them, verify, push to `main`, done.

```
index.html      메인 포트폴리오 (반응형)
archive.html    프로젝트 아카이브 39건 (2000–2027)
resume.html     A4 인쇄용 이력서 (2페이지)
assets/         fonts, images, scripts — filenames are content hashes
assets/pretendard.css   shared Korean webfont @font-face block
.nojekyll       tells Pages to serve the tree as-is
tools/check.mjs the verification harness (npm run check)
```

The pages are plain HTML with inline styles. Accent colour is
`:root{--accent:#1B44FE}` inside each page's `<style>`. Copy lives directly in
the markup. `archive.html` repeats one block shape per project.

`{{ ... }}` bindings, `<image-slot>`, and `sc-camel-on-click` attributes are
handled at runtime by scripts in `assets/`. Leave them alone when editing
markup; they work.

## Working on it

**Always run `npm run check` before pushing.** It serves the site under
`/portfolio/` the way Pages does, loads every page in Chromium, and fails on
broken references, script errors, undecoded images, dropped webfonts, missing
head tags, dead links, mobile overflow, and page-weight blowups. It writes
screenshots to `.check/` — read those to judge how a design change actually
looks, since the harness only decides whether the page is broken.

A SessionStart hook installs its one dependency (playwright) in web sessions.

```sh
npm run check     # verify — do this before every push
npm run serve     # http://localhost:8000 for a manual look
```

`file://` does not work: the runtime scripts need a real origin.

## Rules that matter here

These are the ways this site has actually broken. `npm run check` enforces all
of them, but knowing why saves a cycle:

- **Keep every path relative.** Pages serves this as a *project* site under
  `/portfolio/`, so a root-relative `/assets/…` points outside the site and
  404s in production while working fine locally.
- **`url()` in CSS resolves against the stylesheet, not the page.** Font paths
  in `assets/pretendard.css` are bare filenames because the file sits in
  `assets/`. Moving CSS between directories silently drops every webfont — the
  page still renders, in fallback type.
- **Never inline large payloads into the HTML.** This site began as a
  self-extracting export with every font base64'd inline; `index.html` was
  11.9MB and nothing could be cached. Images and fonts belong in `assets/` as
  their own files.
- **Resize photographs before adding them.** Roughly twice their largest
  painted size, saved as WebP. The original hero shipped at 3600×2400 to fill a
  470px box.
- **`og:` URLs must stay absolute** (`https://parkh37t.github.io/portfolio/…`);
  everything else relative.
- **Do not delete `.nojekyll`.** Without it Pages runs the tree through Jekyll.

## Shipping

Push to `main`; Pages redeploys in a minute or two.

**`parkh37t.github.io` is blocked by this sandbox's egress proxy**, so the live
URL cannot be fetched from here — `npm run check` against the local server is
the real verification. Confirm the deploy landed through the API instead:

```sh
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/parkh37t/portfolio/deployments?per_page=1"
# then .../deployments/<id>/statuses — look for state "success" on your sha
```

That same proxy blocks repository *settings* writes, so enabling Pages,
renaming branches, and similar have to be done by the user in the GitHub UI.

## History

The site started as a Claude Design export and was unbundled into static files;
`src/*.dc.html` and the conversion script were removed once Claude Design was
retired, so the served HTML is now the only source. Recover them if ever needed:

```sh
git show 79bd489:'src/Park Jaeha Portfolio.dc.html'   # design source
git show 32c04cf:tools/unbundle.mjs                   # the converter
```

`79bd489`'s bundled HTML still carries the full-resolution originals
(hero 3600×2400, portrait 1463×1955) as base64, for re-cropping.
