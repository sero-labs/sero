# Sero Orchestrator: Selected Features

Three features that move Sero Orchestrator from "a place where I create automations" into the operating layer where real work arrives, gets routed, runs, and delivers to the correct destination: **Living Loops**, **Pluggable Delivery Destinations**, and the **Loop Catalog**.

The coherent product story across them:

```text
Install useful loops (Catalog)
→ connect real events (Living Loops)
→ deliver to the right place (Pluggable Delivery)
```

---

## 1. Living Loops: real event-driven orchestration

This should be the number one feature.

Cron loops are useful, but event-driven loops are what make Sero feel like an ambient teammate. The system already has the shape for this: event and hybrid trigger types, `eventSource`, `eventFilter`, `debounceMs`, `maxFires`, and a coordinator `fireEvent` entrypoint. The missing piece is concrete event sources that feed that machinery.

### Ship concrete event sources

Developer sources:

- GitHub issue labelled
- GitHub PR opened
- GitHub review requested
- GitHub review comment added
- GitHub CI failed
- GitHub CI passed
- Git branch pushed
- Main branch updated
- Merge conflict detected
- Filesystem changed
- Build artifact created

Knowledge-worker sources:

- Email received
- Email labelled
- Calendar meeting ended
- Slack mention
- Slack thread updated
- Discord message
- Webhook received
- Google Doc comment added
- Notion page updated
- Jira/Linear ticket changed

Internal Sero sources:

- Loop completed
- Loop blocked
- Loop asked question
- Loop created PR
- Loop verification failed
- Loop delivery completed

### Example loops

```text
When CI fails on a PR I opened, diagnose the failure, apply a fix, rerun validation, and update the PR.
```

```text
When an issue is labelled agent-ready, classify it, check existing Sero PRs, and either start a fix loop or mark it blocked.
```

```text
When a meeting ends, extract actions, create follow-up tasks, and draft the recap.
```

### Why this is killer

Scheduled loops feel like automation. Event-driven loops feel like a teammate that notices things and acts immediately.

This is the difference between "run every hour and check" and "fix my CI the moment it goes red."

---

## 2. Pluggable Delivery Destinations: knowledge-worker parity

Today, delivery is effectively repo-centric:

- Worktree delivery means commit, push, and open a PR.
- Workspace-root delivery means leave changes in the working tree unless asked to commit.

That is excellent for developer workflows, but it makes knowledge-work delivery feel bolted on.

Delivery should become a first-class pluggable surface.

### Delivery destinations

```text
delivery: pr
delivery: draft_email
delivery: send_email
delivery: slack_post
delivery: discord_post
delivery: google_doc
delivery: notion_page
delivery: jira_ticket
delivery: linear_issue
delivery: calendar_update
delivery: spreadsheet_append
delivery: saved_artifact
delivery: dashboard_update
delivery: webhook_post
```

### Example loops

```text
Every weekday at 8am, research competitor moves and post a concise digest to #market-intel.
```

```text
When a customer email asks for a status update, gather project state and draft a reply for approval.
```

```text
After every client meeting, create a Google Doc summary, file Jira follow-ups, and send the recap draft.
```

### Why this is killer

The brief is "for software developers and knowledge workers."

That is impossible if delivery assumes a repo. Pluggable delivery makes Sero useful for documents, inboxes, channels, trackers, sheets, and reports.

This turns Orchestrator from a coding automation feature into a general work automation layer.

---

## 3. Loop Catalog: curated one-click loops

The current Loop Library is useful but personal. Every new user still faces a blank page.

A curated Loop Catalog solves cold start.

### Catalog examples

Developer loops:

- GitHub triage loop
- CI fixer loop
- PR review-response loop
- Dependency upgrade loop
- Stale branch maintenance loop
- Release notes loop
- Docs freshness loop
- On-call summary loop
- Flaky test investigator
- Security advisory responder

Knowledge-worker loops:

- Inbox triage loop
- Meeting follow-up loop
- Weekly research digest
- Competitor monitoring loop
- Customer status-update drafter
- Project health reporter
- Decision-log maintainer
- Calendar prep assistant
- CRM follow-up loop
- Team stand-up summariser

### Catalog metadata

Each catalog loop should include:

- What it does
- Required connectors
- Required permissions
- Expected cost
- Recommended autonomy level
- Safety policy
- Delivery destination
- Example output
- Recommended schedule or event trigger
- Required model tier
- Known limitations
- Version history
- Install count or rating
- Verified badge for trusted loop packs

### Why this is killer

The biggest barrier is not capability. It is:

```text
What do I even point this at?
```

A catalog turns first-run from a blank prompt into:

```text
Install three loops. Keep one. Tweak it.
```

This is probably the cheapest adoption lever.
