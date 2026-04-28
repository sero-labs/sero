# @sero/mockups

Four dark-theme landing-page directions for Sero, all driven by the plan in
[`docs/plans/sero-landing-page-marketing-site.md`](../../docs/plans/sero-landing-page-marketing-site.md).

## Run

```bash
pnpm --filter @sero/mockups dev
# → http://localhost:5180
```

The index page lists all variants. Open one and use keys `1`–`4` to jump
between variants, or `Esc` to return to the index. The hash in the URL also
works (e.g. `#workshop`, `#theatre`, `#bento`, `#terminal`).

## Variants

| # | Name | Direction |
|---|------|-----------|
| 01 | **Workshop Manual** (`#workshop`) | Warm-dark editorial. Bricolage display + Instrument Serif italic + JetBrains Mono receipts. Field-manual character. |
| 02 | **Capability Theatre** (`#theatre`) | Cool-dark cinematic with moss/copper rim light. Large product frames, soft motion, interactive "become" tabs, orbital plugin diagram. |
| 03 | **Bento Forge** (`#bento`) | Asymmetric bento grid built around real product screenshots. Implements the plan's "Feature bento rewrite" directly. |
| 04 | **Terminal Field Notes** (`#terminal`) | Brutalist monospace, ASCII rules, code receipts, manifest snippets, phosphor-green accent. The most distinct from typical SaaS. |

## Structure

```
apps/mockups/
├─ index.html
├─ vite.config.ts          # alias: @docs-images/* → apps/docs-site assets
├─ tsconfig.{json,app,node}.json
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx              # variant picker + keyboard jumper + per-variant top bar
│  ├─ App.css
│  ├─ shared/
│  │  └─ content.ts        # single source of truth for copy + image map
│  └─ variants/
│     ├─ v1-workshop/      # WorkshopVariant.tsx + workshop.css
│     ├─ v2-theatre/       # TheatreVariant.tsx + theatre.css
│     ├─ v3-bento/         # BentoVariant.tsx + bento.css
│     └─ v4-terminal/      # TerminalVariant.tsx + terminal.css
└─ README.md
```

All four variants render the same plan sections: nav, hero, problem, thesis,
self-extension loop, what-can-it-become, plugin anatomy, built-in starting
points, honest-alpha, final CTA. Copy is shared via `src/shared/content.ts` so
edits propagate to every variant.

## Notes

- **Dark theme only**, by request. Light direction comes later.
- Screenshots come from `apps/docs-site/docs/assets/images/` so the marketing
  surface stays grounded in the real product (per plan).
- Fonts load from Google Fonts: Bricolage Grotesque, Mona Sans, JetBrains
  Mono, Instrument Serif. Swap to licensed alternatives later.
- These are mockup directions, not the production landing page. The chosen
  variant should land in `apps/docs-site` (Option A in the plan) or a new
  `apps/landing` (Option B) with proper SEO + asset optimization.
