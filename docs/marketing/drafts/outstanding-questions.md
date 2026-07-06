# Campaign — outstanding questions & verification facts

Single collector for open decisions and behind-the-scenes verification notes.
Artifacts (README, quick start, homepage copy, loop files) stay clean — meta
content lives here.

## Open items (Dan)

1. **Homepage + docs-site deploys** — copy approved and builds pass. Deploys
   run from `main` via GitHub Actions, so they go live with the final PR
   merge after the remaining features are complete.
2. **Strategy doc vs. cost decision** — Dan removed the cost section from the
   quick start (irrelevant). The strategy doc still lists "quick start states
   approximate flagship cost" as a launch-readiness gate; update the strategy
   to match, or keep a one-line cost mention somewhere else?

## Resolved 2026-07-06 (Dan's decisions, executed)

- Repo About (description/website/topics) applied and verified.
- Release surface fixed on GitHub: Latest → `Sero Desktop v0.4.0-beta.0`;
  browser-pack/toolchains marked pre-release with `Internal:` titles;
  `release.yml` now auto-titles (`Sero Desktop <tag>`), auto-sets `--latest`,
  and prepends a platforms/download-table header to release notes
  (header step tested locally); browser-pack workflow title prefixed.
- Quick start placed: condensed block in README + full page at
  docs-site `/guide/quick-start` (rspress, sidebar wired, build passes);
  step 1 links `/releases/latest`. Cost section removed.
- Blank issues stay enabled (Dan: keep it loose).
- Docs label drift fixed: "Add Local Provider" → "Add Provider" in
  `guide/local-llms-lm-studio.md` ("Quick Setup" verified as a real label
  and kept).
- Social preview uploaded by Dan (Phase 1 task 1.2 complete).
- Email capture live-ready: Dan created the `BETA_SUBSCRIBERS` KV namespace
  and bound it in `apps/homepage/wrangler.jsonc`; goes live with the next
  homepage deploy from `main`.

## Follow-ups

- Re-check the (removed) flagship cost estimate against a real recorded
  flagship run if a cost figure is ever needed again: estimate was $2–$8
  (typically ~$5) on Sonnet-class pricing; assumptions: 40–80 turns, context
  ~100–150k tokens with caching, ~0.3–1M input, 40–80k output.
- Consider retiring the support-question issue template in favor of GitHub
  Discussions (recommendation from the hygiene report, not yet decided).

## Verification facts (for future copy — verified 2026-07-06)

- Local-model presets exist in code:
  `apps/desktop/src/components/layout/models/model-manager/local-models/presets.ts`
  — `ollama` → `http://localhost:11434/v1`, `lm-studio` →
  `http://localhost:1234/v1`, `vllm` → `http://localhost:8000/v1`, plus
  `custom`. All `openai-completions`.
- Key storage: `~/.sero-ui/agent/auth.json`, chmod `0o600`
  (`apps/desktop/electron/ipc/platform/auth/auth.ts`); local providers in
  `~/.sero-ui/agent/models.json`.
- Release assets (`v0.4.0-beta.0`): macOS arm64 dmg/zip, Windows x64
  setup.exe, Linux x64/arm64 deb. macOS Developer ID signed + notarized
  (confirmed in CI logs); Windows and Linux unsigned during beta.
- Orchestrator gaps found while building the loops: no release/tag or
  PR-merged GitHub event kinds; loop read-only guarantees are prompt-enforced
  only (no mechanical read-only seam); no cron missed-fire catch-up; cron is
  UTC-only and undocumented; `requiredTools` can't declare external CLIs like
  `gh`; Sero cannot read Discord (bot bridge only).
