# Sero Homepage App — Plan

Promote the Terminal variant from `apps/mockups/src/variants/v4-terminal/`
into a standalone, deployable marketing site at **`apps/homepage/`**.

## Decisions

| Decision | Choice |
|---|---|
| Stack | **Astro** (static, SSG, React components as islands) |
| Deploy target | **Cloudflare Pages** — two projects, subdomain split |
| Canonical domain | **`sero-ai.dev`** (owned) |
| Docs URL | **`docs.sero-ai.dev`** (subdomain split, Option B) |
| Analytics | **None** — aligns with the local-first ethos and alpha posture |
| Source of design | `apps/mockups/src/variants/v4-terminal/` |

**Why subdomain split, not path-based:** docs are expected to change frequently
while the marketing homepage is stable for long stretches. Independent deploy
pipelines mean a docs typo fix never touches the homepage. Splitting can be
reversed to path-based later (~30 minutes) if the calculus changes.

Other three mockup variants (`v1-workshop`, `v2-theatre`, `v3-bento`) stay in
`apps/mockups/` as a comparison archive — not promoted, not deleted.

## Why Astro

The Terminal variant is almost entirely static. The only client-side concerns
are: ember-float SVG drop-shadow keyframes, pulsing emerald dots, hover/focus
states. None of that needs React state, none of that justifies shipping React
on initial load.

Astro gives us:

- Zero JS by default; ship JS only where a component opts in via
  `client:visible` or `client:idle`.
- React component compatibility — `SeroBrand.tsx` and the section components
  port over with minimal changes.
- Built-in `<Image>` + `astro:assets` → AVIF/WebP + responsive `srcset` for
  product screenshots without manual pipeline.
- First-class meta/OG/sitemap/RSS plumbing.
- Cloudflare Pages adapter is one config line.

Cost: a different framework from the rest of the monorepo. Surface is small
(one app, a few components) so the inconsistency is acceptable.

## Migration map

### Carry over verbatim

- `SeroBrand.tsx` → `apps/homepage/src/components/brand/SeroBrand.tsx`.
- Section markup from `TerminalVariant.tsx` → split into per-section components
  (see file structure below). Each section becomes its own `.astro` or `.tsx`.
- `terminal.css` → split into `tokens.css` (palette, type scale, motion
  tokens), `global.css` (resets + body baseline), and per-section CSS modules
  next to each section component.
- Marketing copy from `apps/mockups/src/shared/content.ts` → `src/content/copy.ts`.
  Single source of truth for every string on the page.

### Drop

- `TmChat.tsx` (already hidden in mockup; never re-enabled).
- The variant-bar / index router / 1–4 keyboard jumper from `App.tsx`.
- The `@docs-images` Vite alias — replaced by `astro:assets` imports from
  `src/assets/`.

### Modify

- All `href="#"` placeholders point to real targets (final URLs locked in):
  - `Get the macOS alpha` / `Get Sero` / `Join the alpha` → `https://docs.sero-ai.dev/guide/installation-requirements`
  - `See how Sero grows` → in-page anchor (`#loop`)
  - `Read plugin docs` → `https://docs.sero-ai.dev/guide/plugins-and-apps`
  - `View source` / footer GitHub link → `https://github.com/sero-labs/sero/`
  - Footer links: GitHub, docs, license (link to repo `LICENSE`).
  - All link constants live in `apps/homepage/src/content/copy.ts` so swaps
    happen in one place.
- Brand banner stays prominent and free-standing (per current mockup state).
- The hero "live session" image uses `<Image>` for responsive AVIF/WebP.

## Content audit (before launch)

Same kind of pass we just did when killing "Sero turns repeated prompts into
tools…" Each section gets one round of honesty review against actual product
behavior:

1. **Hero subhead/support** — already rewritten; sanity check once in context.
2. **Problem section** — `"Generic agents make you carry the workflow"` —
   keep, audit body copy.
3. **Loop section** — currently five steps with fictional `tool.ts` /
   `command.ts` / `runtime.ts` receipts. Replace with real Sero affordances:
   actual `package.json` `sero` manifest fields, real `pi.registerTool`
   surface, real local-plugin-development entry points.
4. **Become section** — `mineExample` quotes are speculative ("Build me a
   release-checklist plugin", "Build a paper-tracker plugin that watches
   arXiv categories") — keep as illustrative, but mark them clearly as
   _examples of what's possible_, not _things that exist_.
5. **Plugin anatomy** — file tree + capability list. Audit field names against
   the actual `sero.app` manifest in `packages/templates/skills/sero-plugin/`.
6. **Built-ins** — six current entries (Memory, Scheduler, Web, Git, MCP,
   Admin). Verify descriptions match the actual plugin behavior in
   `plugins/sero-*-plugin/`.
7. **Honest alpha** — already accurate; keep.
8. **Final CTA** — keep "Make Sero yours."

## Production essentials

### SEO / meta

- `<title>`: "Sero — Build the agent only you need."
- `<meta name="description">`: pulled from `hero.sub`.
- Canonical: `https://sero-ai.dev/`.
- Open Graph: `og:type=website`, `og:title`, `og:description`, `og:image`
  (1200×630, the brand banner composition), `og:url`.
- Twitter card: `summary_large_image`, same image.
- Schema.org JSON-LD: `SoftwareApplication`
  (applicationCategory: DeveloperApplication, operatingSystem: macOS).
- `sitemap.xml` (Astro plugin handles this).
- `robots.txt` (allow all).

### Brand assets

- `favicon.svg` — phoenix emblem, 32×32 viewport.
- `favicon.ico` — fallback for old browsers.
- `apple-touch-icon.png` — 180×180.
- `og-image.png` — 1200×630, designed (brand banner + headline + dark bg).

### Fonts

Self-host instead of Google Fonts CDN (currently render-blocking):
- Bricolage Grotesque (display)
- JetBrains Mono (mono)
- Instrument Serif (italic accent)
- Mona Sans (body — fallback if not used in Terminal direction)

Subset to Latin only via `glyphhanger`. Serve as `woff2` from `/public/fonts/`.
`font-display: swap`, `<link rel="preload" as="font" crossorigin>` on critical
weights.

### Images

Astro `<Image>` for every screenshot:
- Outputs AVIF + WebP + JPEG with proper `<picture>` markup.
- Width/height attributes set → no CLS.
- `loading="eager"` on hero, `loading="lazy"` everywhere else.
- Responsive `srcset` based on layout breakpoints.

Source images stay in `apps/homepage/src/assets/` (or symlink to docs-site if
we want a single library — open question).

### Accessibility

- Skip-to-content link.
- Color contrast on emerald-on-dark, copper-on-dark verified WCAG AA.
- `:focus-visible` rings on all interactive elements.
- Reduced-motion already gated for ember-float; extend to any new motion.
- Semantic headings audit (no skipped levels).

### Performance budget (target)

- LCP < 1.5s on 3G, < 0.8s on cable.
- CLS < 0.05.
- Total JS < 30KB on initial load (Astro defaults achieve this).
- Total CSS < 20KB after gzip.
- No blocking third-party requests (no analytics → none on launch).

## File structure

```
apps/homepage/
├─ astro.config.mjs
├─ package.json
├─ tsconfig.json
├─ public/
│  ├─ favicon.svg
│  ├─ favicon.ico
│  ├─ apple-touch-icon.png
│  ├─ og-image.png
│  ├─ robots.txt
│  └─ fonts/
│     ├─ bricolage-grotesque-{400,500}.woff2
│     ├─ jetbrains-mono-{400,500,600}.woff2
│     └─ instrument-serif-italic.woff2
├─ src/
│  ├─ pages/index.astro
│  ├─ layouts/Base.astro            (head meta, fonts, JSON-LD)
│  ├─ components/
│  │  ├─ brand/SeroBrand.tsx        (logo + emblem)
│  │  ├─ TopBar.astro
│  │  ├─ Hero.astro                 (banner + h1 + sub + CTA + chat shot)
│  │  ├─ ProblemSection.astro
│  │  ├─ Loop.astro                 (5-step self-extension)
│  │  ├─ Become.astro               (4 use-case panels)
│  │  ├─ PluginAnatomy.astro
│  │  ├─ Builtins.astro
│  │  ├─ Alpha.astro
│  │  ├─ FinalCta.astro
│  │  └─ Footer.astro
│  ├─ content/copy.ts               (every marketing string)
│  ├─ styles/
│  │  ├─ tokens.css                 (palette, type scale, motion)
│  │  └─ global.css                 (resets + base)
│  └─ assets/
│     ├─ sero-chat.jpg              (hero shot, copied from docs-site)
│     └─ ...screens used in builtins/become
└─ README.md
```

Sections are `.astro` rather than `.tsx` where they don't need React state,
which is everywhere except `SeroBrand.tsx`. Astro components compile to static
HTML at build; the React `<SeroBrand />` renders to HTML at build via the
React integration with no client JS.

If a section ever needs interactivity (e.g. the v2 Theatre's tab switcher
were ported as an alternative direction), it'd ship as
`<TabSwitcher client:visible />`.

## Deploy

**Two Cloudflare Pages projects**, both connected to the monorepo on GitHub.
Each is scoped to one app via `pnpm --filter`. No merge scripts, no turbo
`deploy` task, no orchestration.

| Project | Build command | Output | Custom domain |
|---|---|---|---|
| `sero-homepage` | `pnpm install --frozen-lockfile && pnpm --filter @sero/homepage build` | `apps/homepage/dist` | `sero-ai.dev` (apex + `www.` redirect) |
| `sero-docs` | `pnpm install --frozen-lockfile && pnpm --filter @sero/docs-site build` | `apps/docs-site/dist` | `docs.sero-ai.dev` |

**CI:** Cloudflare Pages built-in Git auto-deploy on push to `main`. Both
projects re-trigger on any push to the repo, but each finishes in ~20–40s and
only the affected project changes content on disk. CF Pages free tier covers
500 builds/month — ample for both apps rebuilding on every push.

**No changes to `apps/docs-site/rspress.config.ts`.** `base: '/'` stays.

### Build-path watching (later, optional)

If the noise of redeploying both projects on every push ever becomes annoying,
add CF Pages "Build watch paths" per project:

- `sero-homepage`: watch `apps/homepage/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- `sero-docs`: watch `apps/docs-site/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.

Not worth setting up at launch — keep it simple.

## Cross-app integration

With two subdomains, the only coordination is link constants and meta:

- **Homepage → docs:** footer + nav both link to `https://docs.sero-ai.dev/`.
  Constant lives in `apps/homepage/src/content/copy.ts` (single source of
  truth for every link).
- **Docs → homepage:** the brand mark in the docs top nav links to
  `https://sero-ai.dev/`. Configured in `apps/docs-site/rspress.config.ts`
  via the `themeConfig.nav` and `themeConfig.logo.link` fields.
- **OG / canonical / sitemap:** each app owns its own. Homepage canonical is
  `https://sero-ai.dev/<path>`; docs canonical is `https://docs.sero-ai.dev/<path>`
  (rspress handles per-page automatically once production URL is set).
- **Schema.org JSON-LD `SoftwareApplication`:** only on the homepage.
- **Both `robots.txt`** cross-reference each other's sitemap as a courtesy.

## Out of scope for v1

- Newsletter / waitlist signup.
- Blog or changelog (lives in `apps/docs-site`).
- A/B testing, analytics dashboards, heatmaps.
- Multi-language.
- Authenticated download flow.

## Implementation order (when we start)

1. Scaffold Astro app + Cloudflare adapter + workspace wiring.
2. Port `tokens.css`, `global.css`, `SeroBrand.tsx`.
3. Port `Hero.astro` + `TopBar.astro` + `Footer.astro` (top + bottom bookends).
4. Port the middle sections one-by-one, content-audit each as it lands.
5. Self-host fonts + `<Image>` pipeline + favicons + OG image.
6. Meta / OG / JSON-LD / sitemap / robots.
7. Accessibility + perf pass with Lighthouse.
8. Cloudflare Pages connect + DNS for `sero-ai.dev`.
9. Smoke test on the live URL.

Plan stays here; updates land as PR notes against this file rather than
hidden in commit messages.
