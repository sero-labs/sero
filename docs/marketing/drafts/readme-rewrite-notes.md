# README rewrite notes (task 1.3)

Status: draft — README.md edited in working tree only, nothing pushed.
Strategy source: docs/marketing/sero-growth-strategy.md.

## What changed

- **New intro.** Replaced "Escape the Terminal" / "personal agent OS" with the
  approved positioning: tagline "Sero is where AI agents come to work." plus
  the supporting line, then one concrete paragraph (browser, terminals, memory,
  plugins, loops, local). Added the first-user promise ("If you already use
  coding agents and wish they had a real workspace…"). First screenful now
  answers: what is Sero, who is it for, how to try it.
- **CI badge** added (Test workflow, `.github/workflows/test.yml` — the PR/main
  gate).
- **Flagship demo placeholder** near the top: `<!-- FLAGSHIP DEMO GIF:
  docs/marketing plan task 3.5 -->` plus a visible "Demo coming this week"
  line, and a short `## Demo` section (the "Watch the demo" CTA anchors to it).
- **Top CTA block**: Watch the demo (anchor placeholder) · Download the beta ·
  Star the repo · Read the quick start.
- **Release status** uses the strategy statement verbatim with real platform
  names: "Sero is an open-source public beta. Packaged desktop builds are
  available for macOS (Apple Silicon), Linux (x64 and arm64), and Windows
  (x64), and developers can also run from source." The homepage must use the
  same sentence (task dependency).
- **Quick start** is now a header + one-line summary (model requirements
  mentioned: hosted key or Ollama/LM Studio/vLLM) + a clearly marked
  integration placeholder for task 1.4 (docs/marketing/drafts/quick-start.md).
  I did not write my own walkthrough.
- **Trust and privacy** rewritten as short Q&A answering the seven strategy
  questions (local, what leaves, keys, agent read/write, plugin code, loop
  approval, inspect/pause/stop). Tone: "real working surfaces, local-first
  control, visible approval points", not defensive. All claims grounded (see
  below).
- **Audience rule respected**: no "trapped in chat boxes" anywhere. Used the
  grounded variant ("Agents need more than a prompt box…") and the complement
  framing ("not a replacement for Claude Code, Cursor, Codex, or Pi — the
  workspace those workflows grow into").
- **Reorganized, not deleted**: features folded into "What is Sero?";
  "Why Sero?" and "Highlights" merged into it (they repeated the feature list);
  quick-start dev content moved to "Run from source for development";
  release-tagging instructions kept under that section; "Beta status" renamed
  "Beta details" and moved below the fold (the verbatim status sentence now
  carries the top-of-page message).

## What was preserved

- Logo/link header, all screenshots, "What Sero is not", full beta posture
  bullets (unsupported targets, Widevine note, support caveats), run-from-source
  and dev-isolated instructions, common commands, release changelog/tag
  process, repository layout, full documentation link list (added the
  Orchestrator guide), plugins & ecosystem section with the external-plugin
  disclaimer, contributing, special thanks, license.

## Grounding for trust claims

- Keys/local state: `apps/docs-site/docs/reference/security-privacy.md`
  (`<SERO_HOME>/agent/auth.json` etc.); gateway off by default
  (`SERO_GATEWAY=1`).
- Permission gate scope (dangerous bash patterns only, not every action):
  same doc, "Permission prompts" section — README mirrors its honesty.
- Loop approval model: `apps/docs-site/docs/guide/orchestrator.md` — loops are
  plans you review then "Activate loop"; outward sends show exact content and
  wait for approval; loops block and ask at decision points.
- Plugins run real code: `docs/plugins/guide.md` / plugin architecture (Pi
  extension code + UI).

## Claims needing verification

1. **Code signing (flagged with `<!-- VERIFY: code signing -->` in README).**
   `.github/workflows/release.yml` passes `CSC_LINK` / `APPLE_*` secrets on
   macOS but its own comment says that until the secrets are configured the
   build "falls back to the unsigned ad-hoc flow". Whether the secrets are
   actually set in the repo is not verifiable locally. **Windows has no signing
   configured at all** (`apps/desktop/electron-builder.yml`). The strategy's
   "packaged desktop builds are code-signed" claim is currently NOT safe to
   publish; README uses a hedged sentence pending confirmation.
2. **"No telemetry backend collecting your sessions."** Consistent with the
   local-first docs and I found no telemetry service in docs, but a code-level
   sweep was not done. Cheap to verify before HN.
3. **Release "Latest" mislabel (conversion leak, matches strategy §3).**
   `gh release list` shows the GitHub **Latest** marker on
   `browser-pack-2026-05-16`, not on the newest desktop release
   `v0.4.0-beta.0` (2026-06-03). So `github.com/sero-labs/sero/releases/latest`
   sends visitors to a browser pack. README links to `/releases` (list page)
   to dodge this, but the release marker itself should be fixed (mark
   v0.4.0-beta.0 as latest, or mark artifact releases as pre-release).

## Open questions for Dan

- Confirm whether Apple signing secrets are set in the repo; if yes, the
  hedge and VERIFY comment can become a plain "macOS builds are signed and
  notarized" claim (Windows still can't claim signing).
- Fix the GitHub "Latest" release marker (point it at v0.4.0-beta.0)?
- "Watch the demo" currently anchors to the in-page `## Demo` section; swap to
  the real video URL when task 3.5 delivers.
- The old "Escape the Terminal" tagline is gone from the README — check no
  other surface (homepage, social preview, docs) still uses it, per the
  "surfaces must agree" rule.
- Linux packaging is .deb only; README says "Linux (x64 and arm64)" without
  naming the format at top level. Fine, or should the status line say ".deb"?
