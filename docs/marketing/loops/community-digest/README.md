# Community digest (local draft)

A weekly Orchestrator loop that drafts the Sero community update — the "weekly
builder log" from the growth strategy. **This is a local draft under
`docs/marketing/loops/`, not an official catalog entry.** It mirrors the
per-loop layout of `sero-labs/orchestrator-catalog` (`definition.json` +
`catalog.json`) so it can be promoted to the growth catalog repo later.

## Trigger

Cron, `0 9 * * 1` — every Monday at 9am.

## Sources (all read-only)

- **GitHub** — `sero-labs/sero` activity over the past 7 days via read-only
  `gh` commands: merged/opened PRs, opened/closed issues, discussions
  (GraphQL query), and releases. Requires `gh` to be logged in.
- **Discord (manual)** — Sero has no integration that can *read* Discord
  channels (the desktop gateway's Discord adapter is a chat bot bridge for
  DMs/mentions, not a channel-history reader, and no plugin exposes Discord
  tools). So Discord input is a manual slot: paste highlights into
  `docs/marketing/community-inbox.md` during the week and the loop folds them
  in. If the inbox is empty, the digest is GitHub-only and says so.

## Output

One draft per week: `docs/marketing/community-digests/<yyyy-ww>.md`
(ISO week, e.g. `2026-28.md`). Written to be publishable nearly as-is as a
Discord post and a GitHub Discussion: what shipped, notable issues and
discussions, thanks to external contributors, optional Discord highlights,
and exactly one concrete **feedback ask** (per the strategy's Discord rule:
feedback ask, not marketing ask).

Quiet weeks produce a short, honest "quiet week" draft — never inflated.

## Drafts only

No step posts, comments, or sends anything anywhere — not to Discord, not to
GitHub. All `gh` usage is read-only; the plan's global instructions forbid
writes and the only side effect is the draft file. Publishing is always a
manual step by the maintainer.

## Delivery

`workspace-files` (internal destination, no approval gate needed) — the
finalize step's receipt ref is the draft file path.
