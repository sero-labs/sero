# Draft: Sero 100 Early Builders launch (task 4.5)

Status: DRAFT — do not create until Dan approves. Everything below mutates the
public repo (a Discussion, four labels, and a roadmap issue).

Gate check: this is gated on task 4.3 (plugin guide verified from docs alone) —
**passed** ([plugin-guide-verification.md](../plugin-guide-verification.md)). A
first plugin should no longer strand a builder on a wrong page.

Owner: Agent→Dan. Agent drafts the copy and commands; Dan creates them on
GitHub.

Order to create them: **labels first**, then the **roadmap issue** (it uses the
`good first loop` label), then the **discussion** (it links the issue).

---

## 1. Discussion — "Sero 100 Early Builders"

**Where:** post it in the **Announcements** category and pin it. Announcements
is maintainer-led, which is right for a kickoff. Builders reply here, and share
finished plugins/loops in **Show and tell**.

**How:** easiest path is the GitHub UI — repo → Discussions → New discussion →
Announcements → paste the title and body below → pin. (An API path exists via
the GraphQL `createDiscussion` mutation, but the UI is simpler for a one-off.)

**Dependency:** the body links the comprehensive example
`sero-labs/sero-logbook-plugin`. That repo must exist first (Dan handoff item in
[outstanding-questions.md](../drafts/outstanding-questions.md)). If it isn't up
yet when you post, drop that one bullet — the Daily Quote starter and the
quickstart are enough to start.

### Title

```text
Sero 100 Early Builders — build a plugin or loop, we'll feature the best
```

### Body

```markdown
Sero is a local-first desktop workspace for AI agents. If you already use coding
agents and wished they had a real place to work — browser state, terminal, files,
project memory, and long-running workflows in one window — that's what we're
building. Your agents have outgrown the chat box.

This thread opens the door for the first 100 people who want to build on it.

## The ask

Build **one** useful Sero plugin or loop. We'll feature the best ones — in the
weekly builder log, the docs, and on X.

- A **plugin** is a small app with its own UI and one agent tool. It mounts as a
  panel and can add a dashboard widget.
- A **loop** is a durable workflow Sero runs and recovers — reacting to an event
  (a merged PR, a file change) or on a schedule. Not a one-shot prompt.

Both are first-class things you author, not internal-only features.

## Start here

- **Plugin quickstart:** https://docs.sero-ai.dev/reference/plugin-quickstart
  We just verified this guide by building a working plugin from the published
  docs alone, and fixed every gap we hit.
- **Minimal example:** https://github.com/sero-labs/sero-daily-quote-plugin —
  a UI + one tool, nothing else.
- **Comprehensive example:** https://github.com/sero-labs/sero-logbook-plugin —
  a dev worklog that exercises every plugin surface (extension, prompts, skills,
  background runtime, dashboard widget).
- **Loops:** the loop catalog at https://github.com/sero-labs/orchestrator-catalog,
  and our roadmap of 25 loops to build below.

## Find a first task

We tag starting points:

- `good first plugin` — a scoped plugin idea
- `good first loop` — a scoped loop idea
- `demo wanted` — something that would make a good short demo
- `docs wanted` — a doc gap worth filling

And the roadmap: **Help us build the first 25 Sero loops** → [#ISSUE].

## How to take part

- Reply here to say what you're building (or that you're just watching — that's
  fine too).
- Share the finished thing in **Show and tell**.
- Hit a wrong or missing doc? Say so in this thread — that's the most useful
  feedback we can get right now.

## Honest status

Sero is an open-source public beta. Packaged desktop builds are signed on macOS;
Windows and Linux builds are unsigned during beta, and you can run from source
anywhere. Agents get real surfaces here — terminal, files, browser — with
local-first control and visible approval points. It's early. That's the point of
opening this now.
```

Before posting: replace `[#ISSUE]` with the roadmap issue number from section 3.

---

## 2. Labels

Four new labels. Verified 2026-07-08 that none exist yet; `good first issue`,
`documentation`, `plugin`, and `idea` already do. `docs wanted` is deliberately
distinct from `documentation`: `documentation` marks a PR that changes docs,
`docs wanted` invites a contributor to write one.

| Label | Color | Description |
| --- | --- | --- |
| `good first plugin` | `7057ff` | A scoped plugin idea — good first build for a new Sero builder |
| `good first loop` | `8a63d2` | A scoped loop idea — good first durable workflow to build |
| `demo wanted` | `fbca04` | Would make a good short demo — clip or GIF welcome |
| `docs wanted` | `1d76db` | A doc gap a contributor could fill |

Purple pairs the "good first" family with the existing `good first issue`
(`7057ff`); gold flags demos; blue keeps `docs wanted` in the docs family while
staying distinct from the blue `documentation` label.

### Apply commands (run only after approval)

```bash
gh label create "good first plugin" --repo sero-labs/sero --color 7057ff \
  --description "A scoped plugin idea — good first build for a new Sero builder"
gh label create "good first loop" --repo sero-labs/sero --color 8a63d2 \
  --description "A scoped loop idea — good first durable workflow to build"
gh label create "demo wanted" --repo sero-labs/sero --color fbca04 \
  --description "Would make a good short demo — clip or GIF welcome"
gh label create "docs wanted" --repo sero-labs/sero --color 1d76db \
  --description "A doc gap a contributor could fill"
```

### Verify

```bash
gh label list --repo sero-labs/sero --search "wanted"
gh label list --repo sero-labs/sero --search "good first"
```

---

## 3. Roadmap issue — "Help us build the first 25 Sero loops"

**How:** `gh issue create` (command at the end), or paste into the GitHub UI.
Apply the `good first loop` label. Pin it. Link it from the discussion.

### Title

```text
Help us build the first 25 Sero loops
```

### Body

```markdown
A **loop** is a durable workflow Sero runs and recovers — reacting to an event
or running on a schedule, producing a draft or report you review. Loops are
drafts-only by default: they don't post, send, or merge anything without a
visible approval step.

We want the first 25 community loops. Here's a starting list — grouped, and
scoped so each is a real first project. **Comment to claim one**, or propose your
own and we'll add it. Claimed ones get checked off with a link to the author.

Start from the loop catalog: https://github.com/sero-labs/orchestrator-catalog

### Dev workflow
- [ ] **Changelog drafter** — on a merged PR, append a human-readable changelog entry (draft).
- [ ] **Dependency update triage** — on a dependency-bump PR, summarise risk and suggest merge or hold.
- [ ] **Flaky test finder** — from CI failure logs, cluster likely-flaky tests and propose quarantine.
- [ ] **Stale branch sweeper** — weekly, list branches with no recent activity and draft a cleanup plan.
- [ ] **TODO harvester** — on file changes, collect new `TODO`/`FIXME` into one tracked list.

### Release
- [ ] **Release-readiness checker** — on demand, repo state (tags, open PRs, blocking issues) → readiness report.
- [ ] **Release-notes drafter** — on a tag, group PRs since the last tag into notes.
- [ ] **Version bump proposer** — weekly, suggest the next version from conventional commits.

### Docs
- [ ] **Stale-docs auditor** — weekly, find docs that reference renamed code, labels, or paths.
- [ ] **Screenshot refresher** — on a UI file change, flag docs screenshots that likely need re-taking.
- [ ] **Broken-link checker** — weekly, scan docs for dead links and draft fixes.
- [ ] **API-reference drift** — on a public API change, flag reference-doc sections that fell behind.

### Testing & quality
- [ ] **Coverage-gap reporter** — weekly, list modules with little or no test coverage, prioritised.
- [ ] **Type-safety watch** — on a PR, flag new `any`/`@ts-ignore` with the surrounding context.

### PR lifecycle
- [ ] **PR triage labeler** — on a new PR, suggest labels and reviewers.
- [ ] **Issue implementer** — on a `good first issue`, draft a scoped implementation plan on a branch.
- [ ] **PR review nudge** — daily, summarise PRs waiting on review beyond N days.

### Project memory
- [ ] **Decision-log capturer** — on a merged PR that touches architecture, draft an ADR stub.
- [ ] **What-changed notes** — weekly, synthesise recent changes into a short onboarding note.

### Community
- [ ] **Contributor welcomer** — on a first-time contributor's PR, draft a warm maintainer reply.
- [ ] **Good-first-task suggester** — weekly, scan open issues and propose `good first issue` candidates.

### Personal automation (across your software life)
- [ ] **Inbox to tasks** — read a notes/inbox file and extract action items into a task list.
- [ ] **Standup drafter** — from git log and assigned issues, draft a daily standup update.
- [ ] **Research digest** — given a topic, fetch and summarise sources into a digest (drafts).
- [ ] **Repo health snapshot** — weekly, stars / open issues / PR age / CI status → one dashboard.

### How to claim one
1. Comment with the loop name and roughly how you'd trigger it.
2. We'll assign it to you and check the box with a link when it lands.
3. Ship it drafts-only — a loop should never post or merge without an approval step.

New to loops? Start with a `good first loop`-labelled entry above (the weekly,
report-only ones are the gentlest).
```

### Create command (run only after approval)

```bash
gh issue create --repo sero-labs/sero \
  --title "Help us build the first 25 Sero loops" \
  --label "good first loop" \
  --body-file <paste-the-body-above>
```

After it's created, note the issue number and drop it into the discussion body
(`[#ISSUE]`), then pin the issue.

---

## Verify (after all three exist)

```bash
gh label list --repo sero-labs/sero --search "wanted"
gh label list --repo sero-labs/sero --search "good first"
gh issue list --repo sero-labs/sero --label "good first loop"
gh api graphql -f query='{repository(owner:"sero-labs",name:"sero"){pinnedDiscussions(first:5){nodes{discussion{title}}}}}'
```
