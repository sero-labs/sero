# Lighthouse baselines

Run-of-the-mill perf/a11y/SEO baselines captured against the production
build (`pnpm --filter @sero/homepage build && pnpm --filter @sero/homepage preview`).

| Profile | Performance | A11y | Best Practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| Desktop (2026-04-29) | 100 | 100 | 100 | 100 | 0.3s | 0.001 |
| Mobile  (2026-04-29) | 100 | 100 | 100 | 100 | 1.5s | 0.001 |

## Re-run

```bash
pkill -f astro
pnpm --filter @sero/homepage build
pnpm --filter @sero/homepage preview --port 4322 &
sleep 4

# desktop
npx lighthouse http://localhost:4322/ --preset=desktop \
  --output=json --output-path=apps/homepage/scripts/lighthouse/desktop-$(date +%Y-%m-%d).json \
  --chrome-flags="--headless=new --no-sandbox" --quiet

# mobile
npx lighthouse http://localhost:4322/ --form-factor=mobile \
  --output=json --output-path=apps/homepage/scripts/lighthouse/mobile-$(date +%Y-%m-%d).json \
  --chrome-flags="--headless=new --no-sandbox" --quiet

pkill -f astro
```

Run again post-deploy against the live `https://sero-ai.dev/` URL to get
real-network numbers (CF Pages CDN, real DNS resolve, real HTTP/3, etc.).
