# @sero/homepage

The Sero marketing site at **[sero-ai.dev](https://sero-ai.dev)**.

Built with **Astro** (static SSG). Design carried over from the
`Terminal Field Notes` variant in `apps/mockups/`.

Docs live separately at **[docs.sero-ai.dev](https://docs.sero-ai.dev)**
(`apps/docs-site`, Rspress).

## Run

```bash
pnpm --filter @sero/homepage dev      # http://localhost:4321
pnpm --filter @sero/homepage build    # → apps/homepage/dist
pnpm --filter @sero/homepage preview  # serves dist/
pnpm --filter @sero/homepage typecheck
```

## Structure

```
apps/homepage/
├─ astro.config.mjs
├─ public/
│  ├─ favicon.svg          (phoenix emblem)
│  ├─ robots.txt
│  └─ assets/              (static, served as-is)
├─ src/
│  ├─ pages/index.astro    (single-page composition)
│  ├─ layouts/Base.astro   (head meta, fonts, JSON-LD, OG)
│  ├─ components/
│  │  ├─ brand/SeroBrand.tsx
│  │  ├─ TopBar.astro
│  │  ├─ Hero.astro
│  │  ├─ ProblemSection.astro
│  │  ├─ Loop.astro
│  │  ├─ Become.astro
│  │  ├─ PluginAnatomy.astro
│  │  ├─ Builtins.astro
│  │  ├─ Alpha.astro
│  │  ├─ FinalCta.astro
│  │  └─ Footer.astro
│  ├─ content/copy.ts      (every marketing string + every URL)
│  └─ styles/
│     ├─ tokens.css        (palette, type scale, motion)
│     └─ global.css        (resets, base)
└─ README.md
```

## Editing copy

Every marketing string and every URL lives in
[`src/content/copy.ts`](src/content/copy.ts). Section components reference it
as the single source of truth — change a CTA target or a tagline in one place
and all sections update.

## Deploy

Cloudflare Pages, project `sero-homepage`:

- **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @sero/homepage build`
- **Build output:** `apps/homepage/dist`
- **Custom domain:** `sero-ai.dev` (apex) + `www.sero-ai.dev` redirect
