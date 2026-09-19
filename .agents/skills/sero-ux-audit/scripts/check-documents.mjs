// Serve apps/styleguide/public over plain HTTP and load each audit document at
// two desktop widths, reporting status, height, horizontal overflow, page
// errors and failed requests.
//
//   node check-documents.mjs <repo> <slug>
//
// A failed request here means a frame the document references is not on disk,
// which is the failure the eye misses in a 70,000px page.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [REPO, SLUG] = process.argv.slice(2);
if (!REPO || !SLUG) {
  console.error('usage: node check-documents.mjs <repo> <slug>');
  process.exit(1);
}
// Resolve Playwright out of the desktop app rather than the caller's cwd.
const require = createRequire(path.join(REPO, 'apps/desktop/package.json'));
const { chromium } = require('@playwright/test');

const ROOT = path.join(REPO, 'apps/styleguide/public');
const TYPES = { '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('no');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(5399, resolve));

const browser = await chromium.launch();
const errors = [];
for (const [name, doc, width] of [
  ['proposals-1600', 'proposals.html', 1600],
  ['proposals-1180', 'proposals.html', 1180],
  ['evidence-1600', 'evidence.html', 1600],
]) {
  const page = await browser.newPage({ viewport: { width, height: 1100 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`${name}: failed ${r.url()}`));
  const url = `http://127.0.0.1:5399/prototypes/${SLUG}/${doc}`;
  const response = await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => {
    errors.push(`${name}: ${e.message}`);
    return null;
  });
  if (response) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    console.log(`${name}: status ${response.status()} · page height ${height}px · horizontal overflow ${overflow}px`);
  }
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? errors.join('\n') : 'no page errors, no failed requests');
process.exit(errors.length ? 1 : 0);
