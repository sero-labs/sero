# GitHub social preview — notes

Draft only. Nothing has been uploaded or published.

## Files

- `docs/marketing/assets/social-preview.svg` — editable source (1280×640 viewBox, fonts embedded)
- `docs/marketing/assets/social-preview.png` — rendered at 2× (2560×1280, ~320 KB)

## What the image shows

- Left: the real phoenix emblem with a warm ember glow, next to a large Sero wordmark.
- Below: the tagline "Where AI agents / come to work" — second line in the brand emerald accent.
- Right: an abstract dark app-shell suggestion (window chrome, app rail, explorer, editor lines, agent chat panel) bleeding off the right edge. It hints at the real Sero layout without being a fake screenshot.
- Footer: `sero-ai.dev` and `open-source · beta · local-first` (matches the verified release status: public beta, builds for macOS, Linux, and Windows — no platform-exclusive or "alpha" claim).
- Background: near-black `#050605` with faint emerald and ember glows plus a fine scanline texture, matching the homepage.

## Where the assets came from

All reused from the repo — nothing invented:

- Phoenix emblem: `apps/homepage/public/favicon.svg` (paths and gradients copied as-is)
- Sero wordmark: `apps/homepage/src/components/brand/SeroLogo.astro`
- Palette and layout language: `apps/homepage/src/styles/tokens.css` and `apps/homepage/scripts/og/og-card.html` (bg, ink `#e6e3d8`, mute `#7d7a6f`, emerald `#059669`)
- Font: JetBrains Mono Variable (latin subset) embedded base64 from `apps/homepage/node_modules/@fontsource-variable/jetbrains-mono`

The one real screenshot in the repo (`apps/docs-site/docs/assets/desktop-shell-overview.png`) is a mostly empty demo workspace, so the abstract panel was the better choice per the strategy direction.

## How to upload (Dan)

1. Open https://github.com/sero-labs/sero
2. Click **Settings** (top tab of the repo, not your account settings).
3. Stay on the **General** page and scroll down to **Social preview**.
4. Click **Edit** → **Upload an image**.
5. Choose `docs/marketing/assets/social-preview.png`.
6. Done — the preview updates immediately. Check it by pasting the repo link into a Slack/X/Discord message.

GitHub wants 1280×640 minimum and under 1 MB; this file is 2560×1280 at ~320 KB, which GitHub scales down cleanly.

## Re-rendering after edits

Edit the SVG, then from the repo root:

```bash
node -e "
const { chromium } = require('$PWD/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 2 });
  await page.goto('file://' + process.cwd() + '/docs/marketing/assets/social-preview.svg');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/marketing/assets/social-preview.png' });
  await browser.close();
})();
"
```
