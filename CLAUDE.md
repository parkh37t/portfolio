# CLAUDE.md

Jaeha Park's personal portfolio, published at **https://parkh37t.github.io/portfolio/**.

## What this repo is

Three hand-editable HTML pages plus the assets they load. There is **no build
step**: the files in the repo root are exactly what GitHub Pages serves. Edit
them, verify, push to `main`, done.

```
index.html      메인 포트폴리오 (반응형)
archive.html    프로젝트 아카이브 40건 (2000–2027)
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
markup; they work. The runtime keeps `class`, `data-*`, `aria-*`, inline
`<svg>` (markers, `text-anchor`) and `var()` in inline styles intact, so all of
those are safe to use in new markup.

## Themes (dark / light)

index.html and archive.html have a dark/light toggle. The design is two inks —
ink `10,10,10` and paper `244,242,237` — whose roles flip by section: on a
dark section ink is the ground, on a light one it is the type. So colours are
written as tokens of the **ink**, never the role:

| write | instead of |
| --- | --- |
| `rgb(var(--ink))` / `rgba(var(--ink),.16)` | `#0A0A0A` / `rgba(10,10,10,.16)` |
| `rgb(var(--paper))` / `rgba(var(--paper),.5)` | `#F4F2ED` / `rgba(244,242,237,.5)` |
| `rgb(var(--ink2))` | `#55524B` (secondary text on light sections) |

Every `<section data-sec>` carries `data-tone="dark"` or `data-tone="light"`
(archive puts `data-tone="light"` on `<html>`). A theme swaps the two inks only
inside sections of the *other* tone — see the `theme tokens` block in each
page's `<style>`. With no `data-theme` the page renders exactly as originally
designed (alternating black and paper); the head script always sets one,
following the OS until the visitor picks, then remembering the pick in
`localStorage.theme`. The fixed nav sits outside every section, so its colours
come from `--tL-*`/`--tD-*` via the runtime's `navFg`/`navBg`/`tickFg`.

`#8A877F` (muted), `#1B44FE` (accent, lifted to `#4D73FF` in dark), and the
white logo pills stay literal — they read on both grounds. resume.html is a
print document and is not themed.

`npm run check` fails on a literal ink/paper value in a themed page and loads
each themed page in both themes, failing if any section ground stays the
wrong tone — the two ways a new section breaks the toggle.

## Visuals and how to maintain them

- **WORK timeline** (`figure.wt`) — bars are positioned by month on a 33-month
  axis, 2025.01–2027.09: `left = months since 2025.01 / 33`,
  `width = months inclusive / 33`. The `×4` band marks the peak-overlap window,
  also computed from the dates. Adding a project means recomputing those, the
  peak, and the axis if it extends past 2027.09; keep it in step with the list
  below it, which is the text version of the same data.
- **AX pipeline** (`figure.axd`, AI section) — inline SVG, shown ≥1024px; below
  that the `.ax-narrow` cards carry the same content. Source: the WYLIE AX deck,
  slides 32–34.
- **CAREER nested scope** (`figure.xp`) — each role nests the one before it;
  pure HTML/CSS, so text stays real size on phones.
- **SYSTEM flow** (`div.of`) — the seven stages split at WIN (수주 · 계약) into
  before and after the contract; stacks vertically under 900px.

All four use the ink tokens and `--accent`, so they follow the theme.

- **Section plates** (`div.plate`) — one 21:9 image under the heading of WORK,
  SYSTEM, AI and CAREER, always in the same slot (heading → plate → content).
  Files are `assets/plate-<section>-2000.webp` and `-1000.webp`, served through
  `srcset`, lazy-loaded, `alt=""` because they are mood rather than content.
  They are one series from Higgsfield (gpt_image_2_5, high, 2k): monochrome
  architecture with a single cobalt-blue line, no text, logos or people — keep
  any replacement in that direction or the set stops reading as one. Phones
  crop them to 2:1. Higgsfield serves results from
  `d8j0ntlcm91z4.cloudfront.net`; if that host is not in the environment's
  allowed domains, ask the user to attach the files instead.

## Working on it

**Always run `npm run check` before pushing.** It serves the site under
`/portfolio/` the way Pages does, loads every page in Chromium (themed pages in
both themes), and fails on broken references, script errors, undecoded images,
dropped webfonts, missing head tags, dead links, theme breakage, mobile
overflow, and page-weight blowups. It writes
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

**Commit to `main`.** Pages serves it, so a commit anywhere else never reaches
the site. The cloud container checks out a per-session scratch branch
(`claude/…`) at startup; the SessionStart hook moves off it onto `main` when
the tree is clean and the branch holds nothing `main` lacks, and says so. If it
reports that it stayed put, deal with what it found — do not just commit there.
If you ever do land a commit on a scratch branch, fast-forward `main` onto it
and push `main`, rather than pushing the scratch branch.

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
