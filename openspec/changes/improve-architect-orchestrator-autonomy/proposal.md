# Proposal

## Why

[Issue #620](https://github.com/sero-labs/sero/issues/620) identifies execution restrictions that prevent Architect and Orchestrator from adapting as agents learn about a task. Their effect on quality, completion rate, time and cost is unmeasured; a controlled comparison must precede claims of improvement.

## What Changes

- Establish a reproducible comparison of current Architect and persistent single-agent execution with equal requests, acceptance criteria, model settings, authorized capabilities, starting workspaces and budgets.
- Make the existing persistent Architect owner a first-class milestone executor, with durable execution identity, runtime evidence, accounting and delivery receipts. Keep Workflows and Rooms available without a compulsory planner or team.
- Separate authorized capabilities from loaded tools and skill instructions. Let owners and workers discover and activate already-authorized capabilities, including Code Mode where supported, while preserving disabled capabilities and execution checks.
- Amend host-stored Room grants at safe boundaries so members can join, be replaced or change approved configuration without losing existing sessions, work or history. Require approval for genuine authority expansion.
- Add durable observable waits and progress-aware continuation. Preserve explicit user limits, pause/stop intent and bounded recovery; reconcile uncertain effects before retrying.
- Evaluate structured result reporting and remove redundant prompt procedures one at a time. Keep the overview useful across execution approaches and retain the distinction between reported, verified, accepted and delivered work.
- Deliver and measure the work in independently reviewable phases, following issue phases 0–5.

### Non-goals

Replacing Orchestrator, removing Workflows or Rooms, granting authority through prompts or skills, forcing an execution classifier, weakening acceptance or required independent review, converting legacy charter projects, and claiming savings from incomplete or synthetic measurements. A separate persistent worker is deferred: the initial continuous path uses the existing owner. Workflow workers keep their in-memory sessions; this change does not persist them, so the issue's concern about Workflow boundaries discarding context is answered only by doing exploratory work in the owner.

## Capabilities

### New Capabilities

- `architect-continuous-execution`: Durable owner execution through the same milestone, accounting, evidence and delivery lifecycle as delegated work.
- `durable-agent-waits`: Registered observable conditions, restart-safe wake delivery and continuation within current authority and limits.

### Modified Capabilities

- `architect-owner-session`: Explicit continuation outcomes and wakes for direct execution and registered waits, without adding a second driver.
- `architect-project-record`: Milestone execution links for owner work as well as Workflows and Rooms.
- `architect-verification-gate`: Execution-neutral completion claims and unchanged runtime evidence standards.
- `persistent-session-allowlist`: Host-validated amendments to existing grants within stored approval, preserving subject/session bindings and reservations.
- `session-tool-surface`: Discovery and activation within authorized capability sets, distinct from currently loaded context.
- `architect-run-observability`: Controlled live comparisons with acceptance, model provenance, intervention and coverage records.
- `architect-resilience`: Explicitly distinguish optional independent review from required review and preserve truthful verification labels.
- `architect-ui`: Milestone detail navigation for continuous owner execution without a synthetic Workflow or Room.

## Impact

Architect record/actions/session control, evidence, delivery and accounting; Orchestrator Room revisions, Goal waits and continuation; Electron persistent-session grants, resources and subagent tool provisioning; existing baseline records and E2E runner; related UI projections and docs-site guides/reference pages. Extend existing host APIs and update renderer/store, preload, main-process and Pi contracts together where affected. Bump `@sero-ai/common` for changes to its published persistent-session types, and any other published package whose API changes. No dependency or container-tool change is proposed.
