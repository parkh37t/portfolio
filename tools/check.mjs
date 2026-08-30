#!/usr/bin/env node
// Checks the site the way GitHub Pages serves it, before you push.
//
// Pages publishes this repo as a PROJECT site, so every page loads from
// /portfolio/ rather than the domain root. That subpath is where path mistakes
// show up — an absolute /assets/... reference works locally and 404s in
// production — so the server below mounts the tree under /portfolio/ to match.
//
// Two passes:
//   static   every local reference resolves to a file that exists, and every
//            file in assets/ is reachable from somewhere. CSS url() resolves
//            against the stylesheet's own directory, not the document's, which
//            is the trap that breaks fonts when CSS moves between them.
//   runtime  each page loaded in Chromium: no script errors, no failed
//            requests, images decoded, webfonts actually applied, head tags
//            present, and no horizontal overflow on a phone viewport.
//
// Screenshots land in .check/ (untracked) — look at them to judge the design;
// this script only judges whether the page is broken.
//
// Usage: npm run check

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'archive.html', 'resume.html'];
const MOUNT = '/portfolio/';
const PORT = 8123;
const SHOTS = path.join(ROOT, '.check');

// image-slot.js probes for this sidecar to restore images dropped in the
// Claude Design editor. Outside that editor it is absent by design, and the
// component falls back to the src in the markup.
const EXPECTED_MISSING = ['.image-slots.state.json'];

// A page far above this has almost certainly had something large inlined into
// it again — the state this site was rescued from was 12MB on first load.
const MAX_PAGE_BYTES = 1_500_000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.json': 'application/json',
  '.md': 'text/markdown', '.txt': 'text/plain',
};

const failures = [];
const notes = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

// ── static pass ───────────────────────────────────────────────────────────

// Pull every local reference out of a file. `base` is the directory the file
// lives in, because that — not the document — is what a relative URL in it
// resolves against.
function localRefs(text, base) {
  const out = [];
  const add = (raw) => {
    const url = raw.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/)[0];
    if (!url || /^(https?:|data:|mailto:|tel:|blob:|about:|#|\/\/)/.test(url)) return;
    out.push({ url, abs: path.join(base, url), rooted: url.startsWith('/') });
  };
  for (const m of text.matchAll(/(?:src|href)\s*=\s*"([^"]*)"/g)) add(m[1]);
  for (const m of text.matchAll(/url\(\s*(['"]?[^)'"]+['"]?)\s*\)/g)) add(m[1]);
  // The runtime resolves its CDN imports (React, ReactDOM) through this map
  // instead of the network, so these assets are referenced by value only —
  // no tag points at them.
  for (const m of text.matchAll(/window\.__resources\s*=\s*(\{.*?\});/g)) {
    try { for (const v of Object.values(JSON.parse(m[1]))) add(v); } catch { /* not ours */ }
  }
  return out;
}

const reachable = new Set();

function staticPass() {
  const queue = PAGES.map((p) => ({ file: path.join(ROOT, p), label: p }));
  const seen = new Set(queue.map((q) => q.file));

  while (queue.length) {
    const { file, label } = queue.shift();
    const text = fs.readFileSync(file, 'utf8');

    for (const ref of localRefs(text, path.dirname(file))) {
      if (ref.rooted) {
        // Served from /portfolio/, a root-relative URL points outside the site.
        fail(label, `root-relative reference "${ref.url}" — must be relative, the site is served from ${MOUNT}`);
        continue;
      }
      if (!fs.existsSync(ref.abs)) {
        fail(label, `broken reference "${ref.url}" (resolves to ${path.relative(ROOT, ref.abs)}, which does not exist)`);
        continue;
      }
      reachable.add(path.relative(ROOT, ref.abs));
      // Follow stylesheets: their own url()s resolve against assets/, and that
      // difference is exactly what silently drops every webfont.
      if (ref.abs.endsWith('.css') && !seen.has(ref.abs)) {
        seen.add(ref.abs);
        queue.push({ file: ref.abs, label: path.relative(ROOT, ref.abs) });
      }
    }
  }

  const present = fs.readdirSync(path.join(ROOT, 'assets')).map((f) => `assets/${f}`);
  const orphans = present.filter((f) => !reachable.has(f));
  if (orphans.length) {
    fail('assets', `${orphans.length} file(s) nothing references: ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? ' …' : ''}`);
  }
  notes.push(`static: ${reachable.size} references resolved, ${present.length} assets all reachable`);

  if (!fs.existsSync(path.join(ROOT, '.nojekyll'))) {
    fail('.nojekyll', 'missing — Pages would run the tree through Jekyll and drop files');
  }
}

// ── runtime pass ──────────────────────────────────────────────────────────

function serve() {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    if (!rel.startsWith(MOUNT)) { res.writeHead(404).end('outside site root'); return; }
    let file = path.join(ROOT, rel.slice(MOUNT.length));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

async function runtimePass(browser, server) {
  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tab = await ctx.newPage();
    const errors = [], missing = [];
    let bytes = 0;

    tab.on('pageerror', (e) => errors.push(String(e)));
    // Failed loads arrive here too, but without a URL to match against the
    // allowlist. The response/requestfailed handlers below already cover them
    // with the URL in hand, so drop the duplicate rather than misreport it.
    tab.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
    });
    tab.on('requestfailed', (r) => missing.push(r.url()));
    tab.on('response', async (r) => {
      if (r.status() >= 400) missing.push(r.url());
      try { bytes += (await r.body()).length; } catch { /* redirect or aborted */ }
    });

    await tab.goto(`http://localhost:${PORT}${MOUNT}${page === 'index.html' ? '' : page}`,
      { waitUntil: 'networkidle', timeout: 60_000 });
    await tab.waitForTimeout(2500);

    const seen = await tab.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      images: [...document.images].map((i) => ({ src: i.currentSrc || i.src, ok: i.naturalWidth > 0 })),
      fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').length,
      bodyFont: getComputedStyle(document.body).fontFamily,
      bundlerLeftovers: document.querySelectorAll('script[type^="__bundler"]').length,
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
    }));

    fs.mkdirSync(SHOTS, { recursive: true });
    await tab.screenshot({ path: path.join(SHOTS, page.replace('.html', '.png')) });

    const unexpected = missing.filter((u) => !EXPECTED_MISSING.some((e) => u.endsWith(e)));
    if (unexpected.length) fail(page, `${unexpected.length} request(s) failed: ${unexpected.map((u) => u.replace(`http://localhost:${PORT}`, '')).join(', ')}`);
    if (errors.length) fail(page, `script error: ${errors[0]}`);
    if (!seen.title) fail(page, 'no <title>');
    if (!seen.description) fail(page, 'no meta description');
    if (!seen.ogUrl.startsWith('https://')) fail(page, `og:url must be absolute, got "${seen.ogUrl}"`);
    if (seen.bundlerLeftovers) fail(page, `${seen.bundlerLeftovers} leftover __bundler script tag(s)`);

    const broken = seen.images.filter((i) => !i.ok);
    if (broken.length) fail(page, `${broken.length} image(s) failed to decode: ${broken.map((i) => i.src).join(', ')}`);

    // Zero loaded faces means the webfonts silently dropped — usually a url()
    // resolved against the wrong directory — and the page falls back to system
    // type while still looking superficially fine.
    if (seen.fontsLoaded === 0) fail(page, 'no webfonts loaded — check url() paths in assets/*.css');
    if (!/Pretendard/.test(seen.bodyFont)) fail(page, `body is not using Pretendard (got ${seen.bodyFont})`);

    for (const href of new Set(seen.links)) {
      if (/^(https?:|mailto:|tel:|#)/.test(href) || !href) continue;
      if (!fs.existsSync(path.join(ROOT, href.split(/[?#]/)[0]))) fail(page, `link to missing page "${href}"`);
    }

    if (bytes > MAX_PAGE_BYTES) {
      fail(page, `${(bytes / 1024 / 1024).toFixed(1)}MB on first load, over the ${(MAX_PAGE_BYTES / 1024 / 1024).toFixed(1)}MB budget`);
    }

    notes.push(`${page}: ${(bytes / 1024).toFixed(0)}KB, ${seen.fontsLoaded} fonts, ${seen.images.length} images, "${seen.title}"`);
    await ctx.close();
  }

  // Phone width, where a fixed-width element would push the whole page sideways.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tab = await ctx.newPage();
  await tab.goto(`http://localhost:${PORT}${MOUNT}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await tab.waitForTimeout(2000);
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await tab.screenshot({ path: path.join(SHOTS, 'index-mobile.png') });
  if (overflow > 0) fail('index.html @390px', `${overflow}px of horizontal overflow`);
  else notes.push('index.html @390px: no horizontal overflow');
  await ctx.close();
}

// ── run ───────────────────────────────────────────────────────────────────

staticPass();

const server = serve();
await new Promise((r) => server.listen(PORT, r));
// Claude Code's web sandbox ships a Chromium that the npm playwright build may
// not match, and it cannot download its own. Point at the preinstalled binary
// when it is there; elsewhere let playwright resolve its own.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH
  || (fs.existsSync(preinstalled) ? preinstalled : undefined);

let browser;
try {
  browser = await chromium.launch({ executablePath });
  await runtimePass(browser, server);
} finally {
  await browser?.close();
  server.close();
}

for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n✓ site OK — screenshots in .check/`);
