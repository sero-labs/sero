# Sero Orchestrator Killer Features

## Context

Sero Orchestrator is already more than a cron wrapper. It is a durable loop runner where a plain-language goal becomes an LLM-authored step plan, then Orchestrator runs the plan, records history, asks for recovery decisions, and finishes only when a planned step emits completion.

The current system already has strong foundations:

- Durable loop state: prompt, plan, dependencies, attempts, outcomes, recovery, workspace settings, triggers, limits, run history, revisions, insights, suggestions, human input, and library links.
- A single coordinator that owns lifecycle transitions, cron tick/catch-up, per-loop single-flight execution, enable/disable, retries, revisions, reflection, library actions, input answers, and deletion.
- A real run engine that handles locks, ready-step calculation, parallel execution up to limits, observations, outcomes, recovery, and completion.
- Multiple execution targets: background agents, pure model steps, and active-session steps.
- A useful UI shape: Home as a cross-loop “Needs you” inbox, loop detail as a calm single-column view, plan spine with grouped parallel and branch steps, and a create flow that walks through describe, clarify, and review.
- Worktree plus PR awareness: loops can reconcile their own open PRs by branch name and inject that inventory into future background-agent step context.

The adoption ceiling is not the loop engine itself. The gap is turning Orchestrator from “a place where I create automations” into the operating layer where real work arrives, gets routed, runs safely, verifies itself, and delivers to the correct destination.

---

## Final merged top six

1. **Living Loops**: event-driven loops that react instantly.
2. **Loop Composition**: loops spawn, wait on, and coordinate other loops.
3. **Graduated Autonomy**: trust policies that let loops run without babysitting.
4. **Verified Delivery**: independent adversarial verification before shipping or sending.
5. **Pluggable Delivery Destinations**: PRs, email, Slack, docs, tickets, sheets, digests.
6. **Loop Catalog**: one-click proven loops that solve cold start.

The coherent product story is:

```text
Install useful loops
→ connect real events
→ let them compose into bigger workflows
→ give them bounded autonomy
→ verify outputs independently
→ deliver to the right place
```

That is what moves Sero Orchestrator from a cool automation feature to a work operating system.

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

This is the difference between “run every hour and check” and “fix my CI the moment it goes red.”

---

## 2. Loop Composition: orchestrator of orchestrators

A single flat plan is useful for one task, but real work grows into many tasks with dependencies, fan-out, retries, and aggregation.

Loop Composition lets Orchestrator coordinate other loops.

### Capabilities

Loops should be able to:

- Emit events
- Spawn child loops
- Wait for child loops
- Declare loop-level dependencies
- Fan out safely
- Aggregate child-loop results
- Load child loops from the Library or Catalog
- Reuse saved loop definitions as building blocks

The existing Loop Library already stores portable loop definitions. Composition turns those definitions into reusable workflow modules.

### Example

```text
Triage loop
→ finds 5 agent-ready issues
→ spawns one fix loop per safe independent issue
→ spawns one clarification loop for vague issues
→ waits for all child loops
→ posts a summary
```

### Why this is killer

This is what makes the name “Orchestrator” fully earned.

It also solves context-window pressure. A parent loop does not need to hold every detail. It can delegate each meaningful unit of work to a child loop, then aggregate outcomes.

---

## 3. Graduated Autonomy: trust policies, not all-or-nothing blocking

Today, when a loop asks a question, the loop parks and waits until the user answers. That is safe, but it creates friction. Friction kills daily use.

Graduated Autonomy turns safety from a wall into a dial.

### Autonomy levels

```text
Observe only
Suggest actions
Auto-run reversible actions
Auto-run within declared bounds
Fully autonomous until blocked
```

### Policy dimensions

Each loop should be able to declare:

- Allowed paths
- Allowed tools
- Allowed delivery destinations
- Maximum cost
- Maximum wall-clock time
- Allowed command classes
- Destructive-action approval rules
- External-send approval rules
- PR-publish approval rules
- Secret access rules
- Network access rules
- Reversible vs irreversible action rules

### Pre-activation preview

Before activation, show a dry-run style summary:

```text
This loop may:
- edit files under apps/docs-site/**
- run pnpm test and pnpm typecheck
- open PRs but not merge them
- spend up to $2 per run
- ask before deleting files or sending messages externally
```

### Approval-pattern learning

Reflection should learn approval patterns:

- “Dan always approves docs-only PR publication”
- “Dan rejects auto-sending emails externally”
- “Dan allows test fixes under packages/*”
- “Dan wants approval before touching migrations”

The policy remains explicit and user-controlled, but the system can suggest safer defaults over time.

### Why this is killer

This is the line between:

```text
Cool, but I have to watch it.
```

and:

```text
I let it run.
```

People will only trust unattended loops when the boundaries are clear.

---

## 4. Verified Delivery: independent adversarial checking before anything ships

Current Orchestrator relies on a final planned step to emit an explicit completion signal. That is a good mechanical ending, but it is not the same as independent verification.

Verified Delivery adds a first-class verification gate before finalisation or external delivery.

### Shape

```text
Implement
→ Verify independently
→ Fix if bounced
→ Deliver
→ Finalise
```

### Verifier behaviour

The verifier should be:

- A different agent role
- Preferably a different model or model tier
- Adversarial rather than helpful
- Focused on objective, acceptance criteria, risk, and output quality

It should check:

- Objective satisfied
- Acceptance criteria met
- Tests or equivalent validation passed
- No obvious regressions
- Output quality good enough
- Source claims supported for research
- Email or Slack draft is safe to send
- PR description accurately describes the diff
- No hidden destructive side effects
- No obvious security or privacy issue

### Outcome handling

A new outcome status is not required for v1. The verifier can emit existing outcomes:

- `succeeded`: verification passed
- `needs-revision`: specific fixes required
- `blocked`: human decision needed
- `failed`: verification could not run

The existing recovery path can then route the non-success outcome.

### Why this is killer

Developers have tests, but knowledge workers often do not.

A research digest, drafted email, client recap, market summary, or Slack update has no test suite. Without verification, “the loop did something” never becomes “the loop did the right thing.”

This is central to trust.

---

## 5. Pluggable Delivery Destinations: knowledge-worker parity

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

The brief is “for software developers and knowledge workers.”

That is impossible if delivery assumes a repo. Pluggable delivery makes Sero useful for documents, inboxes, channels, trackers, sheets, and reports.

This turns Orchestrator from a coding automation feature into a general work automation layer.

---

## 6. Loop Catalog: curated one-click loops

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

---

## 7. Autonomous PR Lifecycle Manager

This remains a killer feature, but it is best framed as a specialised bundle built on:

- Living Loops
- Graduated Autonomy
- Verified Delivery
- Pluggable Delivery

### Events it should handle

- CI failed
- CI passed
- Review requested
- Reviewer comment added
- Main branch updated
- PR stale
- Merge conflict detected
- PR approved
- PR ready to merge

### Example flows

```text
CI failed
→ diagnose logs
→ patch
→ verify
→ push
→ update PR comment
```

```text
Review comments arrived
→ classify comments
→ apply requested fixes
→ verify
→ reply to reviewer
```

```text
Main moved
→ rebase or merge latest main
→ resolve conflicts
→ run validation
→ push updated branch
```

### Why this is killer

An agent that opens a PR is interesting.

An agent that keeps the PR alive until merge is useful every day.

Developers hate stale branches, failed checks, forgotten review comments, and PRs that rot after the first push. This feature directly removes that pain.

---

## 8. Change Graph Builder for issue queues

This is the safety feature for real repositories with many issues.

Instead of:

```text
10 issues
→ 10 branches from main
→ 10 PRs
→ conflicts and review mess
```

Orchestrator should build a change graph:

```text
10 issues
→ classify
→ batch related work
→ stack dependent work
→ block unclear work
→ publish fewer, cleaner PRs
```

### Capabilities

- Classify issues as independent, related, duplicate, blocked, dependent, or too broad
- Batch related issues into one coherent PR
- Stack dependent changes in order
- Keep low-risk independent changes separate
- Avoid touching the same area twice
- Publish fewer, cleaner PRs
- Show the intended review structure before publishing

### Where Jujutsu fits

Jujutsu is deferred for now, but this is the feature area where it becomes valuable.

Jujutsu helps when the agent needs to reshape many local changes before publishing:

- split
- squash
- reorder
- stack
- abandon
- rebase
- publish only clean changes

The right time to revisit Jujutsu is when Orchestrator supports intra-iteration multi-item stacking and richer change-graph management.

### Why this is killer

It solves the nightmare case:

```text
The agent created ten conflicting PRs and now I have to clean up the mess.
```

This turns Sero from an implementation agent into a review-shape optimiser.

---

## 9. Workspace Knowledge Graph

Loops should not rediscover the same workspace facts every run.

A workspace knowledge graph would allow all loops to share durable context.

### Developer knowledge

- Code ownership
- Architecture decisions
- Package boundaries
- Common commands
- Flaky tests
- Release process
- API contracts
- Product terminology
- Recurring blockers
- Previous PR outcomes
- Areas requiring approval
- Test strategy
- Deployment rules

### Knowledge-worker context

- People
- Projects
- Meetings
- Docs
- Decisions
- Deadlines
- Open commitments
- Customer context
- Reporting cadence
- Stakeholder preferences

### Why this matters

Agents waste too much time rediscovering context.

A workspace-aware Sero should know the project, remember important lessons, and make every future loop better.

This is less immediately marketable than Living Loops or the Catalog, but it compounds the value of everything else.

---

## 10. Loop Evals, ROI, and auto-tuning

Reflection already exists, but it is loop-local and user-invoked.

The next step is measurable loop performance.

### Metrics

- Success rate per loop
- Failure reasons
- Average cost
- Average wall-clock time
- Tokens per successful outcome
- PR merge rate
- Reviewer change-request rate
- Number of human interventions
- Blocked vs completed ratio
- False-positive work avoided
- Model/tier comparison per step
- Delivery success rate
- Verification bounce rate

### Auto-tuning suggestions

Orchestrator should recommend:

- Use a cheaper model for this step
- Use a stronger model for this step
- Split this step
- Merge these steps
- Add a verification step
- Change the event trigger
- Increase debounce
- Lower autonomy
- Raise autonomy
- Stop running this loop because it produces no value

### Why this matters

Sero should be able to prove its value:

```text
This loop saved 4 hours this week.
This loop opened 3 PRs, 2 merged, 1 blocked.
This loop cost $1.42 and avoided 6 manual checks.
```

That turns agent automation into something users can trust, tune, and justify.

---

## Recommended implementation order

### Phase 1: Make loops alive

1. Event bus source adapters
2. GitHub event source
3. Filesystem source
4. Webhook source
5. Internal loop-completed and loop-blocked events

Goal: make loops react to real work.

### Phase 2: Make loops useful immediately

1. Remote Loop Catalog
2. One-click install
3. Verified starter loop packs
4. First-run onboarding with suggested loops

Goal: solve cold start.

### Phase 3: Make loops safe enough to trust

1. Trust policies
2. Autonomy levels
3. Dry-run activation preview
4. Independent verifier step
5. Delivery approval rules

Goal: let users stop babysitting.

### Phase 4: Make loops useful outside code

1. Delivery destination abstraction
2. Email draft delivery
3. Slack/Discord delivery
4. Google Doc / Notion delivery
5. Jira/Linear delivery

Goal: knowledge-worker parity.

### Phase 5: Make loops compose

1. Loop emits event
2. Loop spawns child loop
3. Parent waits for child loops
4. Child result aggregation
5. Loop dependency view

Goal: make Orchestrator truly orchestral.

### Phase 6: Deep developer workflows

1. Autonomous PR lifecycle manager
2. Review comment responder
3. CI fixer
4. Stale PR maintainer
5. Change graph builder
6. Stacked PR support
7. Revisit Jujutsu

Goal: make Sero indispensable for serious software teams.

---

## Final product positioning

Sero Orchestrator should not be positioned as:

```text
A scheduler for AI tasks.
```

It should be positioned as:

```text
An event-driven work operating system where trusted loops notice work, coordinate agents, verify results, and deliver outcomes.
```

The shortest version:

```text
Sero notices. Sero acts. Sero verifies. Sero delivers.
```
