# Lighthouse baselines

Perf/a11y/SEO baselines captured against the production build.

| Profile | Date | URL | Performance | A11y | Best Practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|---|---|
| Desktop | 2026-04-29 | localhost (preview) | 100 | 100 | 100 | 100 | 0.3s | 0.001 |
| Mobile  | 2026-04-29 | localhost (preview) | 100 | 100 | 100 | 100 | 1.5s | 0.001 |
| Desktop | 2026-04-29 | sero-ai.dev (CF CDN) | 100 | 100 | 100 | 100 | 0.3s | 0.001 |
| Mobile  | 2026-04-29 | sero-ai.dev (CF CDN) | 100 | 100 | 100 | 100 | 1.0s | 0.001 |

Mobile LCP improved 1.5s → 1.0s on real CF CDN vs local preview, thanks
to HTTP/3 + Cloudflare's edge network serving pre-compressed AVIF/WebP images.

## Re-run

```bash
npx lighthouse https://sero-ai.dev/ --preset=desktop \
  --output=json --output-path=apps/homepage/scripts/lighthouse/desktop-$(date +%Y-%m-%d).json \
  --chrome-flags="--headless=new --no-sandbox" --quiet

npx lighthouse https://sero-ai.dev/ --form-factor=mobile \
  --output=json --output-path=apps/homepage/scripts/lighthouse/mobile-$(date +%Y-%m-%d).json \
  --chrome-flags="--headless=new --no-sandbox" --quiet
```
