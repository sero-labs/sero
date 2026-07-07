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
3. ~~**Live github:main-updated fire for proof-moment-miner**~~ **DONE
   2026-07-06.** Dan merged docs-only PR #230 (`community-inbox.md`) into main;
   Sero's poller detected the push within ~60s, the miner fired on the real
   `github:main-updated` event, ran, and completed, with PR #230 recorded in
   the verdict ledger (not-demoable, correct for a docs-only change). Harness:
   `apps/desktop/e2e/miner-live-fire.agent.spec.ts` (focused, reuses the
   already-installed loop; the human does the merge, the test never merges).
   Note: main has branch protection, so the merge is a human/UI action, not an
   automated `gh pr merge` — that is the right shape and stays that way.
4. ~~**Demo 4 / trust copy: PR delivery has no pre-send approval gate**~~
   **RESOLVED 2026-07-06 (Dan):** approval is the typical/intended path and
   most demos should show it, but no-approval is a valid choice where the
   workflow intends it. Applied to `sero-growth-strategy.md` (trust
   requirements) and `demo-scripts/pr-lifecycle.md` (caveats): PR-lifecycle
   demos tell the honest control story (activation consent + isolated worktree
   + never-merges + review-on-PR) rather than staging a gate the product does
   not show.

## Plugin guide verification findings from task 4.3 (for Dan)

Full report: [plugin-guide-verification.md](../plugin-guide-verification.md). The
guide is now buildable from published docs alone — a fresh-eyes builder shipped a
working plugin and six doc gaps became fixes in `apps/docs-site`. Two items need
Dan because they touch the **external** starter repo
(`sero-labs/sero-daily-quote-plugin`), which the campaign never changes without
sign-off:

1. **Starter `typecheck` only checks the UI.** `tsc --noEmit -p ui/tsconfig.json`
   passes even if the extension is broken. Suggest changing the starter script to
   typecheck both `ui/tsconfig.json` and `extension/tsconfig.json`.
2. **Starter ships `package-lock.json` but docs say `pnpm install`.** Align one
   way: ship a `pnpm-lock.yaml`, or switch the documented commands to npm. (Docs
   now say "either works, match the lockfile" as a stopgap.)

Deeper doc follow-ups (larger than a gap fix; do **not** block opening the
builder challenge in 4.5, but worth doing before a heavy builder push):

- Document the `useAppTools().run` return/error contract (resolved value, error
  behaviour, whether tool `details` reaches the UI).
- Add a fuller Pi extension authoring reference — `execute` arguments,
  `renderCall`/`renderResult`, session lifecycle events, parameter schema — or a
  clear link to Pi's own docs. Much of this is upstream Pi surface, so linking is
  probably better than duplicating.

## Flagship dry-run findings from task 3.2 (for Dan — decide before recording 3.3)

The dry-run (`apps/desktop/e2e/flagship-dryrun.agent.spec.ts`) proves the core:
one prompt → a valid `sero.app` release-checklist plugin in ~3 min, repeatably.
Two things must be decided before recording the flagship demo:

1. ~~**`workspace:*` deps block local install.**~~ **RESOLVED 2026-07-06
   (Dan's suggestion).** Prompting the agent to build a standalone external
   plugin like the community examples (`sero-calc-plugin` pattern — published
   dep versions only, plain-React UI, no `@sero-ai/*`/`workspace:*` links)
   fixed it: the re-run built → installed from local → mounted → generated the
   real report, fully green. The demo ask now includes that phrasing. Write-up:
   docs/marketing/demo-scripts/flagship-reproduction.md.
2. **No approval beat in a default session.** The build turn raised zero
   user-feedback prompts — the workspace was already attached and commands
   weren't gated. The strategy wants a visible "human approves" moment, so the
   recording must deliberately hit a gate (permission mode that gates
   writes/commands, or an action needing folder-attach). Confirm the approval
   card is on screen before recording; don't imply a gate the default flow
   skips.

## Orchestrator findings from task 2.6 (for Dan — product, not campaign)

Found while running the five loops through the real runtime; none block the
campaign, all reproduce in `marketing-loops.agent.spec.ts`:

- **Dirty-workspace preflight strands workspace-files deliveries.** The
  stash/run-here/worktree choice is a 30s notification that defaults to a
  managed worktree on timeout (`resolvedBy: "dirty-workspace-timeout"`). For a
  workspace-files-delivery loop the run then writes its deliverables into a
  transient worktree (and can't see uncommitted state from earlier runs — the
  demo-script loop's second run couldn't find the inbox entries). Suggestion:
  workspace-files loops should default to run-in-place, or park a real
  pendingInput question instead of a timeout notification.
- **`<workspace>/.sero/` is not gitignored.** In a git workspace the
  orchestrator's own state churn shows up in `git status`; the miner's
  drafts-only audit honestly blocked a run over it. Suggestion: the host
  should append `.sero/` to the workspace's `.git/info/exclude` when it
  creates the state dir.
- **Step context only flows along `dependsOn` edges (plus loop variables).**
  The digest's collect step found 4 merged PRs, but the draft step (which
  depended only on the inbox step) wrote "quiet week", and finalize then
  "verified" it — a hollow-verification variant of the no-hollow-success
  class. Loop authors must declare data edges explicitly; consider a planner
  validation (warn when a step's instructions reference another step's
  results without a dependsOn edge) or injecting all completed steps'
  summaries into later prompts.
- **Known gaps reconfirmed:** no release-tag or pr-merged event kinds
  (launch-pack polls on cron; miner resolves merged PRs from push ranges +
  a backlog scan), and read-only behaviour is prompt-enforced only.

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
