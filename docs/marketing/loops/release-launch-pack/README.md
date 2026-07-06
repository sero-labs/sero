# Release launch pack

**Status: local draft.** Part of the Sero growth campaign (see
`docs/marketing/sero-growth-strategy.md`). Not in the official catalog and not
installed anywhere — this folder mirrors the official catalog's per-loop layout
(`definition.json` + `catalog.json` + this README) so it can be installed into a
growth catalog later.

## What it does

When a new release is published for this repo, the loop drafts everything
needed to announce it, in one pass:

| File | Content |
| --- | --- |
| `release-notes.md` | Human release notes: what changed, why it matters, upgrade notes. Paste-ready for the GitHub release. |
| `x-thread.md` | X thread in the strategy post format: hook, one-line context, `[VIDEO]` slot, three claims grounded in this release, repo link, low-pressure star ask. |
| `hn-draft.md` | HN draft that opens with an explicit **post / do not post** verdict — only launch-worthy releases get the "Show HN: Sero, …" treatment; routine releases get a plain title and a recommendation to skip HN. Includes honest beta caveats and prepared answers for sceptical comments. |
| `reddit-variants.md` | Three genuinely different posts: r/LocalLLaMA (local model support), r/selfhosted (local control, non-SaaS), r/electronjs (architecture story). |

All files land under `docs/marketing/launch-packs/<tag>/` in the workspace.

## Drafts only — Dan publishes

The loop's **only** side effect is writing those draft files. It never posts,
sends, or comments anywhere, and it **never edits the GitHub release** — the
release notes are a draft file to paste by hand. GitHub/git access is
read-only (`gh` list/view/search, `gh api` GET, `git log`), enforced by every
step's instructions and the plan's global instructions. Delivery destination is
`workspace-files` (internal), so no external send path exists at all.

## Trigger (and the gap)

The strategy calls for "on release tag", but **the orchestrator has no
`github:release` / tag event kind** — the supported GitHub kinds are
`pr-opened`, `ci-failed`, `ci-passed`, `issue-labelled`, `review-requested`,
`review-comment`, `pr-approved`, `main-updated`, `issue-opened`
(`plugins/sero-orchestrator-plugin/runtime/events/github-kinds.ts`). So the
loop uses the closest supported mechanism:

- **Cron poll every 6 hours** (`0 */6 * * *`): checks the newest published
  release and skips it if `docs/marketing/launch-packs/<tag>/` already exists
  (that directory is the idempotence marker — no separate state file).
- **Manual run** right after publishing for an instant pack.

Two release-surface facts the detect step accounts for: CI
(`.github/workflows/release.yml`) creates releases as **drafts** that a human
publishes later, so only published releases count; and GitHub's "Latest" can
point at a supporting artifact (currently a browser pack), so the step judges
product releases (the desktop app) apart from browser packs / runtime images
and only packs product releases.

If a `github:release-published` event kind is ever added, switch the trigger to
`{ "type": "event", "eventSource": "github:release-published" }` and drop the
poll.

## Audience rules baked into the steps

- "Your agents are trapped in chat boxes" is allowed only as an X hook with
  concrete proof on the next line — never in HN or Reddit titles, and never for
  Pi / Claude Code / Cursor / Codex audiences.
- Sceptical audiences (HN, r/LocalLLaMA) get the grounded variant and
  proof-first wording.
- Every claim must be checkable against the release's actual commits and PRs;
  the fact-gathering step forbids invented changes.

## Requirements

- `gh` CLI signed in (read-only release/PR lookups).
- The workspace is the sero repo checkout.
