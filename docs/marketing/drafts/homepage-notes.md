# Homepage update notes (task 1.5)

Status: implemented in the working tree on `feat/sero-marketing-strategy`. NOT deployed — deploy is Dan's call.
Files touched: `apps/homepage/src/content/copy.ts`, `Hero.astro`, `Beta.astro`, `TopBar.astro`, `FinalCta.astro`, `index.astro`, `global.css`, new `LocalFirst.astro`, `BetaUpdates.astro`, new `apps/homepage/functions/api/subscribe.ts`.

Build verified: `pnpm --filter @sero/homepage build` and `typecheck` both pass (0 errors).

## What changed

### Hero (before → after)

| | Before | After |
|---|---|---|
| Headline | Build the agent only you need. | Stop chatting with agents. Put them to work. |
| Subheading | A local-first desktop workspace for macOS, Linux, and Windows — bringing coding agents, tools, memory, apps together as your work changes. | Sero is a local-first desktop workspace where AI agents can see, act, remember, automate, and extend themselves across your software life. |
| Primary CTA | Read setup requirements → docs | Download the beta → github.com/sero-labs/sero/releases/latest |
| Secondary CTA | See how Sero grows → #loop | Star on GitHub → repo |
| Brand tag | your personal agent OS | where AI agents come to work |

"Watch the demo" is wired in `copy.ts` (`hero.demo`) but **hidden** (`ready: false`) because no demo is recorded. Flip `ready: true` and set the href when the demo exists.

The wedge line "trapped in chat boxes" is not used anywhere on the page (audience rule).

### Release status (§06 honest_beta)

Before: "Source-only OSS beta; runtime and plugin contracts will evolve." (contradicted the packaged releases)

After: "Sero is an open-source public beta. Packaged desktop builds are available for macOS, Windows, and Linux, and developers can also run from source."

Platforms verified against `gh release view v0.4.0-beta.0`: macOS arm64 (.dmg/.zip), Windows x64 (setup .exe), Linux x64 + arm64 (.deb). Footer tagline and receipt block updated to match ("source beta" removed everywhere).

### Local-first trust section (new, §07)

Five plain rows: runs locally / what leaves the machine (only configured model calls; local model servers Ollama, LM Studio, vLLM supported) / keys stay in local config, no Sero cloud / visible approval points (plugin installs, loop activation, destructive actions) / **macOS builds are code-signed and notarized**.

Code-signing claim basis: `.github/workflows/release.yml` passes `CSC_LINK` + Apple notarization secrets on macOS runners, and Dan previously confirmed macOS builds are signed. Windows/Linux signing is NOT claimed — only macOS.

### Email capture (new, §08 "get beta updates")

Form (email input + Subscribe) posts JSON to `/api/subscribe`. Client-side validation, success/error messages, graceful fallback: until a backend is bound, the endpoint returns 503 and the form shows "Sign-up isn't live yet — star the repo to follow releases." So shipping the page before the backend decision is safe.

`functions/api/subscribe.ts` is a Cloudflare Pages Function stub: validates the email, writes to a `BETA_SUBSCRIBERS` KV binding if present, otherwise 503 `not_configured`.

## Email backend options (Dan's decision)

1. **Cloudflare Pages Function + KV** (recommended). Already implemented — go live by creating a KV namespace and adding `"kv_namespaces": [{ "binding": "BETA_SUBSCRIBERS", "id": "…" }]` to `wrangler.jsonc`. Zero external services, free tier, data stays in the CF account. Downside: no send capability — export the list when there's something to send (or wire a send path later).
2. **Buttondown**. Real newsletter tool with API + double opt-in + sending. Change the function to POST to Buttondown's API with an API key secret. Free to 100 subscribers, then paid.
3. **Formspree**. Fastest external option (form action swap, no function needed) but it's generic form-inbox, not a mailing list, and adds third-party branding on the free tier.

Recommendation: option 1 now (nothing to send yet, no signup friction, no new vendor), revisit Buttondown when the first update is actually ready to send.

## Needs Dan

- **GitHub "Latest" release flag**: `releases/latest` currently resolves to "Sero Browser Pack 2026-05-16", not the desktop app. The Download CTA links to `releases/latest`, so run `gh release edit v0.4.0-beta.0 -R sero-labs/sero --latest` (and keep the flag on desktop releases going forward). Until then the CTA lands on the browser pack.
- **Email backend choice** (above) + create the KV namespace if option 1.
- **Deploy** when happy — nothing was published.
- Record the demo, then enable `hero.demo` in `copy.ts`.
- Beta receipt block hardcodes `sero/0.4.x-beta`; nudge on major version bumps.
