#!/usr/bin/env node
// Turns a Claude Design self-extracting export into plain static HTML.
//
// The export ships every font, image and script as base64 inside a
// `__bundler/manifest` script tag, which a loader unpacks into blob URLs on
// DOMContentLoaded. That makes each page multi-megabyte and uncacheable: the
// same ~100 woff2 subsets ride along in all three pages, and nothing is shared
// between them. This writes each asset out once, keyed by content hash so the
// pages share what is identical, and rewrites the template's uuid references
// to point at those files. The result is ordinary HTML the browser streams and
// caches normally.
//
// Usage: node tools/unbundle.mjs <src-dir> <out-dir>
//   <src-dir>  directory holding the bundled exports (index/archive/resume.html)
//   <out-dir>  directory to write static pages + assets/ into

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('usage: node tools/unbundle.mjs <src-dir> <out-dir>');
  process.exit(1);
}

// Page title and description are absent from the bundled template — the loader
// keeps them on the throwaway wrapper document that gets replaced. Restore them
// as real markup so they exist before any script runs.
const PAGES = {
  'index.html': {
    title: 'Jaeha Park — Digital Business & Delivery Leader',
    description:
      '전략에서 딜리버리까지 — 디지털 비즈니스, 프로젝트, 경험, 조직을 하나의 시스템으로 운영합니다. 경력 22년, 금융권 대형 딜리버리 사업관리 · PMO.',
  },
  'archive.html': {
    title: 'Project Archive 2000–2027 — Jaeha Park',
    description: '2000년부터 2027년까지 수행한 프로젝트 39건의 아카이브.',
  },
  'resume.html': {
    title: 'Resume — Jaeha Park',
    description: '박재하 이력서 — Digital Business & Delivery Leader, 와일리(WYLIE) 본부장.',
  },
};

const SITE_URL = 'https://parkh37t.github.io/portfolio/';

const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'text/css': 'css',
};

// Widest the image is ever painted, from the template's own CSS, times two so
// it still resolves on a HiDPI screen. Anything past that is bytes the layout
// can never use: the hero ships at 3600px to fill a 470px box.
const IMAGE_MAX_WIDTH = { c2719e89: 1200, '5f6b11ac': 900 };

function readIsland(html, type) {
  const m = html.match(
    new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`)
  );
  return m ? JSON.parse(m[1]) : null;
}

const assetsDir = path.join(outDir, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const written = new Map(); // content hash -> asset filename
let totalIn = 0;

async function emitAsset(uuid, entry) {
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = zlib.gunzipSync(bytes);
  totalIn += bytes.length;

  let mime = entry.mime;
  const cap = IMAGE_MAX_WIDTH[uuid.slice(0, 8)];
  if (cap) {
    const img = sharp(bytes);
    const meta = await img.metadata();
    if (meta.width > cap) {
      // WebP at q82 is visually indistinguishable here and roughly a quarter
      // the size of equivalent JPEG. Every target browser has supported it
      // since 2020.
      bytes = await img.resize({ width: cap }).webp({ quality: 82 }).toBuffer();
      mime = 'image/webp';
    }
  }

  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const name = `${hash}.${EXT[mime] || 'bin'}`;
  if (!written.has(hash)) {
    fs.writeFileSync(path.join(assetsDir, name), bytes);
    written.set(hash, name);
  }
  return `assets/${written.get(hash)}`;
}

function metaTags(page, file) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const url = SITE_URL + (file === 'index.html' ? '' : file);
  return (
    `<title>${esc(page.title)}</title>` +
    `<meta name="description" content="${esc(page.description)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:url" content="${esc(url)}">` +
    `<meta property="og:title" content="${esc(page.title)}">` +
    `<meta property="og:description" content="${esc(page.description)}">` +
    `<meta name="twitter:card" content="summary_large_image">`
  );
}

for (const [file, page] of Object.entries(PAGES)) {
  const bundled = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const manifest = readIsland(bundled, 'manifest');
  const extResources = readIsland(bundled, 'ext_resources') || [];
  const pageOrder = readIsland(bundled, 'page_order') || [];
  if (pageOrder.length) {
    throw new Error(`${file}: nested page bundles are not supported by this script`);
  }
  let template = readIsland(bundled, 'template');

  const urls = {};
  for (const [uuid, entry] of Object.entries(manifest)) {
    urls[uuid] = await emitAsset(uuid, entry);
  }

  for (const [uuid, url] of Object.entries(urls)) {
    template = template.split(uuid).join(url);
  }

  // The runtime resolves CDN imports (React, ReactDOM) through this map rather
  // than the network. The loader built it at unpack time; build it here instead.
  const resourceMap = {};
  for (const entry of extResources) {
    if (urls[entry.uuid]) resourceMap[entry.id] = urls[entry.uuid];
  }
  const resourceScript =
    '<script>window.__resources = ' +
    JSON.stringify(resourceMap).replace(/<\//g, '<\\/') +
    ';</' + 'script>';

  // SRI hashes describe the CDN copies, not these local ones, and crossorigin
  // forces a CORS fetch that would then fail the check.
  template = template
    .replace(/\s+integrity="[^"]*"/gi, '')
    .replace(/\s+crossorigin="[^"]*"/gi, '');

  const headOpen = template.match(/<head[^>]*>/i);
  if (!headOpen) throw new Error(`${file}: template has no <head>`);
  const at = headOpen.index + headOpen[0].length;
  template = template.slice(0, at) + metaTags(page, file) + resourceScript + template.slice(at);

  fs.writeFileSync(path.join(outDir, file), template);
  const kb = (Buffer.byteLength(template) / 1024).toFixed(0);
  const was = (Buffer.byteLength(bundled) / 1024 / 1024).toFixed(1);
  console.log(`${file.padEnd(13)} ${was}MB bundled -> ${kb}KB html`);
}

const assetBytes = [...written.values()].reduce(
  (n, f) => n + fs.statSync(path.join(assetsDir, f)).size, 0
);
console.log(
  `\n${written.size} unique assets, ${(assetBytes / 1024 / 1024).toFixed(2)}MB ` +
  `(from ${(totalIn / 1024 / 1024).toFixed(2)}MB of per-page copies)`
);
