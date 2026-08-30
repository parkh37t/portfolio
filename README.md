# Jaeha Park — Portfolio

Digital Business & Delivery Leader. Personal portfolio site, served as static
files by GitHub Pages.

**https://parkh37t.github.io/portfolio/**

## Pages

| File | Description |
| --- | --- |
| `index.html` | 메인 포트폴리오 (PC / Tablet / Mobile 반응형) |
| `archive.html` | 프로젝트 아카이브 39건 (2000–2027) |
| `resume.html` | A4 인쇄용 이력서 (브라우저에서 인쇄 → PDF 저장, 2페이지) |
| `assets/` | 빌드 산출물 — 폰트 · 이미지 · 스크립트, 내용 해시로 이름을 매김 |

## Editing

`src/*.dc.html` are the editable Claude Design sources. To change the site:

1. Edit the design in Claude Design and export it.
2. Drop the exported `index.html` / `archive.html` / `resume.html` into `src/bundled/`.
3. Run the build and commit the result.

```sh
npm install
npm run build
```

## Why the build step

The Claude Design export is self-extracting: every font, image, and script
rides inside the HTML as base64 in a `__bundler/manifest` tag, which a loader
unpacks into blob URLs on `DOMContentLoaded`. That made `index.html` 11.9MB and
shipped the same ~100 woff2 subsets separately in all three pages, so nothing
could be cached and nothing was shared between them.

`tools/unbundle.mjs` writes each asset out as its own file, keyed by content
hash so the pages share what is byte-identical, and rewrites the template's
uuid references to point at those files. It also restores the `<title>` and
description tags the loader left behind on the throwaway wrapper document, and
downscales the two photographs to twice their largest painted size.

| | Bundled | Static |
| --- | --- | --- |
| `index.html` | 11.9 MB | 116 KB |
| `archive.html` | 4.3 MB | 86 KB |
| `resume.html` | 4.3 MB | 72 KB |
| First load (index, cold cache) | ~12 MB | ~232 KB |

Fonts declare `unicode-range`, so a visitor downloads only the subsets their
text actually needs, and those are then shared across all three pages.
