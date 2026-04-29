# Sero homepage + docs — Cloudflare Pages deploy guide

How to take the two static apps in this monorepo live on Cloudflare Pages
under the `sero-ai.dev` brand, with DNS hosted at Vercel.

## Topology

| URL | Project | Source | Build output |
|---|---|---|---|
| `https://sero-ai.dev/`        | `sero-homepage` | `apps/homepage/`   | `apps/homepage/dist/` |
| `https://www.sero-ai.dev/`    | `sero-homepage` | (redirect to apex) | — |
| `https://docs.sero-ai.dev/`   | `sero-docs`     | `apps/docs-site/`  | `apps/docs-site/dist/` |

Two independent CF Pages projects on one Cloudflare account. No build
orchestration in this monorepo — each project is deployed by `wrangler pages deploy`
with `--project-name`. `wrangler.jsonc` lives next to each app so the project
name and build output dir are committed.

## Step 1 — authenticate wrangler

One of:

```bash
# A) Browser login (preferred for a workstation)
npx wrangler login
```

```bash
# B) API token (scriptable / CI). Create at:
#    https://dash.cloudflare.com/profile/api-tokens
#    Template: "Edit Cloudflare Pages"
#    Plus, if you want me to attach custom domains:
#       Zone → DNS → Edit  (only needed if your DNS is on Cloudflare; Vercel-managed DNS doesn't need this)
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=…   # from the right sidebar of the CF dashboard
```

Verify:

```bash
npx wrangler whoami
```

## Step 2 — first deploy

From the monorepo root:

```bash
bash scripts/deploy.sh         # deploys both projects
bash scripts/deploy.sh homepage  # or only one
bash scripts/deploy.sh docs
```

On first run, wrangler creates each project automatically and uploads the
built `dist/`. Each deploy returns a unique `*-<hash>.pages.dev` URL plus a
production alias `<project>.pages.dev`.

After the first deploy, the URLs you'll have are:

- `https://sero-homepage.pages.dev/`
- `https://sero-docs.pages.dev/`

These work immediately. Custom domains come next.

## Step 3 — attach custom domains in Cloudflare

For each domain, register it on the corresponding Pages project. Either via
dashboard:

> Workers & Pages → `sero-homepage` → Custom domains → Set up a custom domain
> → enter `sero-ai.dev` → continue

…or via CLI:

```bash
# (Wrangler 4 supports custom-domain commands under `wrangler pages`)
npx wrangler pages domain add sero-ai.dev      --project-name=sero-homepage
npx wrangler pages domain add www.sero-ai.dev  --project-name=sero-homepage
npx wrangler pages domain add docs.sero-ai.dev --project-name=sero-docs
```

Cloudflare will show each domain as **Pending** until DNS is configured.

## Step 4 — DNS records at Vercel

Sero's DNS lives at Vercel. Add three records in the Vercel dashboard:

> Vercel → Domains → `sero-ai.dev` → DNS records

| Type | Name | Value | Notes |
|---|---|---|---|
| `CNAME` | `@` (apex) | `sero-homepage.pages.dev` | Vercel DNS supports CNAME-flattening on the apex (a.k.a. ALIAS). |
| `CNAME` | `www`      | `sero-homepage.pages.dev` | |
| `CNAME` | `docs`     | `sero-docs.pages.dev`     | |

If Vercel DNS refuses a CNAME on the apex (some providers do), use the A/AAAA
records that Cloudflare Pages prints in the **Custom domains** screen instead.

DNS propagation usually takes minutes. Cloudflare auto-detects and flips each
domain from **Pending** → **Active**, then provisions a TLS certificate.

## Step 5 — sanity checks

Once each custom domain shows **Active** in CF Pages:

```bash
# Resolves and serves with the right content
curl -sI https://sero-ai.dev/        | head -5
curl -sI https://docs.sero-ai.dev/   | head -5

# Check the headers we set in _headers landed
curl -sI https://sero-ai.dev/ | grep -iE "strict-transport|content-type-options|frame-options|referrer-policy"
```

Re-run the Lighthouse baselines against the live URL and overwrite the
`apps/homepage/scripts/lighthouse/*-YYYY-MM-DD.json` snapshots so future
regressions are easy to compare.

## Subsequent deploys

Each push to a deploy branch can either:

- **Manual:** re-run `bash scripts/deploy.sh` locally.
- **Auto:** connect each Pages project to the GitHub repo via the dashboard
  (Workers & Pages → project → Settings → Builds → "Connect to Git"). CF will
  re-deploy on every push to the configured production branch. Build command
  per project:
  - `sero-homepage`:  `pnpm install --frozen-lockfile && pnpm --filter @sero/homepage build`
  - `sero-docs`:      `pnpm install --frozen-lockfile && pnpm --filter @sero/docs-site build`

  Build output dir: `apps/<name>/dist`. Root directory in CF: `/` (monorepo root).

## Rollback

CF Pages keeps every deployment immutable. To roll back:

> Workers & Pages → `<project>` → Deployments → … → Rollback to this deployment

…or with wrangler:

```bash
npx wrangler pages deployment list --project-name=sero-homepage
npx wrangler pages deployment rollback <deployment-id> --project-name=sero-homepage
```

## Trouble?

- **403 / "no access"** from wrangler → token missing `Account → Cloudflare Pages → Edit` scope, or `CLOUDFLARE_ACCOUNT_ID` not set.
- **Custom domain stuck Pending** → DNS not propagated yet, or CNAME points at the wrong project. `dig +short docs.sero-ai.dev` should resolve to `sero-docs.pages.dev`.
- **Old `_headers` not applied** → `_headers` only takes effect after a fresh deploy. Re-run the deploy script.
- **AVIF images 404** → ensure `_astro/*` directory was uploaded; rerun the deploy.
