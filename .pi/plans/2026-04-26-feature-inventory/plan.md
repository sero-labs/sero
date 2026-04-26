# Sero Feature Inventory Documentation Program

**Date:** 2026-04-26
**Status:** Draft
**Spec / Task Context:** `context/feature-docs-planner-2026-04-26T06-11-33.md`
**Primary Input:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md`
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

Build a structured planning program that turns the completed stage-1 feature scout into a verified, prioritized end-user documentation and marketing inventory for Sero.

The scout already identified 16 feature categories and 23 plugins across the desktop shell, web remote client, shared packages, built-in plugins, and external/local plugins. This plan treats that scout as raw evidence, not publishable truth. The next work should verify feature claims, normalize them into a stable inventory, derive a documentation backlog, propose information architecture, and prepare pilot documentation/copy briefs.

This is a planning and preparation effort only. It must not produce polished docs, website copy, onboarding copy, or release notes yet.

## Goals

- Convert the raw scout into a verified feature inventory with source traceability.
- Establish confidence levels and review gates before any claim is used in public docs or marketing.
- Prioritize documentation opportunities by audience, product value, confidence, maturity, and need.
- Define an information architecture for Sero documentation and marketing/onboarding surfaces.
- Create pilot briefs for the first high-value docs/copy efforts.
- Produce trackable todos grouped by phase so implementation can proceed incrementally.

## Non-Goals

- Do not write polished end-user documentation.
- Do not write final website marketing copy.
- Do not rewrite existing docs.
- Do not implement product features.
- Do not assume external/local plugins are official product features without verification.
- Do not promote placeholder, experimental, or manifest-only features as production-ready.

## Approach

Use a verification-led inventory pipeline:

1. Normalize the stage-1 scout into a consistent feature schema.
2. Verify high-impact and unclear claims against source files, manifests, READMEs, and existing docs.
3. Mark every claim with confidence, maturity, review status, and suitable output surfaces.
4. Derive a prioritized docs backlog grouped by audience and product journey.
5. Propose documentation/site information architecture.
6. Create pilot briefs for a small set of high-value docs/copy surfaces.
7. Review before drafting polished docs or marketing copy.

### Key Decisions

- **Scout is input evidence, not source of truth** — because the scout includes possible/unclear features and external plugins.
- **Every public claim needs traceability** — because docs and marketing should not overstate unverified implementation details.
- **Separate built-in/core from external/local/example plugins** — because users may interpret mentions as official support.
- **Briefs before polished copy** — because the user wants to agree goals and approach before implementation.
- **Audience-based backlog** — because end users, developers, plugin authors, admins, and support need different docs surfaces.
- **Small pilot set** — because Memory, Git, Web access, Cron/reminders, and plugin ecosystem likely provide the best early signal without boiling the ocean.

## Artifact Map

All planning artifacts should initially live in `.pi/plans/2026-04-26-feature-inventory/`.

### Existing Input

- `scout-context.md` — completed stage-1 scout and raw feature inventory.

### New Working Artifacts

- `todos.md`
  - Trackable phase-by-phase task checklist tagged `feature-inventory-docs`.
  - Each todo includes constraints, references/examples, anti-patterns, and acceptance criteria.

- `verified-inventory.md`
  - Normalized feature table derived from the scout.
  - Fields should include category, feature, description, audience, impact, source paths, confidence, maturity/status, verification status, suggested output surfaces, and notes.

- `verification-log.md`
  - Claim-by-claim review notes for unclear, low-confidence, external, placeholder, experimental, or potentially overclaimed features.
  - Should include what was checked, what remains unknown, and whether a claim is safe for public docs.

- `docs-backlog.md`
  - Prioritized documentation opportunities grouped by audience and journey.
  - Should distinguish user guide, admin/support, developer/plugin, onboarding, website, and release-note candidates.

- `information-architecture.md`
  - Proposed structure for docs and related product surfaces.
  - Should identify what belongs in existing `docs/`, README/onboarding, public website, and future release notes.

- `pilot-doc-briefs.md`
  - Briefs for 3–5 high-value pilot docs/copy surfaces.
  - Recommended initial pilots: Memory, Git workspace manager, Web access, Cron/reminders, and plugin ecosystem/marketplace.

- `copy-briefs.md`
  - Structured inputs for website, onboarding, and release-note copy.
  - Should include positioning angle, proof points, caveats, source citations, screenshot/demo needs, and review status.

## Suggested Inventory Schema

Use a stable schema in `verified-inventory.md` so workers can update rows consistently:

```md
| Category | Feature | User Benefit | Audience | Impact | Product Status | Source Paths | Verification Status | Confidence | Output Targets | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Memory & Context | Persistent memory system | Sero remembers durable facts and context across sessions. | General user | High | Built-in/core | `plugins/sero-memory-plugin/extension/index.ts`; `docs/features/memory.md` | Verified | High | User guide, onboarding, website | Avoid claiming exact retrieval quality without testing. |
```

Recommended values:

- **Product Status:** `built-in/core`, `built-in/plugin`, `external/local`, `experimental`, `placeholder`, `unclear`.
- **Verification Status:** `verified`, `partially verified`, `needs verification`, `blocked`, `exclude from public copy`.
- **Confidence:** `high`, `medium`, `low`.
- **Output Targets:** `user docs`, `admin docs`, `developer docs`, `plugin docs`, `support`, `website`, `onboarding`, `release notes`, `later`.

## Verification Criteria

A feature can be marked `verified` when:

- At least one concrete source path confirms the feature exists.
- The source appears active, shipped, or intentionally documented.
- The feature description is stated as a user benefit, not merely an implementation detail.
- Any caveats are captured in notes.
- External/local plugin status is explicit.

A feature should remain `partially verified` or `needs verification` when:

- It exists only in a manifest/package description.
- The implementation was not inspected deeply enough.
- It may be disabled by configuration or environment.
- It is present in an external/local plugin whose support status is unclear.
- The scout itself marked it as possible/unclear.

A feature should be marked `exclude from public copy` when:

- It is experimental, placeholder, internal-only, security-sensitive, or likely to confuse users.
- The repo evidence does not support the claim.
- The feature is not intended as a public product promise.

## Review Gates

### Gate 1: Inventory Verification

Proceed only when:

- All high-impact scout items are represented in `verified-inventory.md`.
- Unclear features from the scout have entries in `verification-log.md`.
- Built-in vs external/local status is explicit.
- No high-impact feature remains uncategorized.

### Gate 2: Backlog Prioritization

Proceed only when:

- `docs-backlog.md` groups work by audience and output type.
- Each backlog item references verified inventory rows.
- High-priority docs have a clear reason and source confidence.
- Duplicate or already-covered docs are identified.

### Gate 3: Information Architecture

Proceed only when:

- `information-architecture.md` distinguishes docs, README/onboarding, website, and release-note surfaces.
- The IA supports at least general users, power users/developers, admins/support, and plugin authors.
- Existing docs are not ignored or duplicated.

### Gate 4: Pilot Brief Readiness

Proceed only when:

- `pilot-doc-briefs.md` covers 3–5 pilot topics.
- Each pilot brief has audience, outline, source citations, screenshots/demo needs, caveats, and acceptance criteria.
- `copy-briefs.md` is clearly marked as brief-level input, not final copy.

## Progress Checklist

Use these checkboxes to track the program across sessions:

- [x] **Phase 1 — Normalize the Scout:** Create `verified-inventory.md` from `scout-context.md` using the agreed schema.
- [x] **Phase 2 — Verify and Classify Claims:** Review source paths and existing docs, then update verification statuses and `verification-log.md`.
- [x] **Phase 3 — Build the Documentation Backlog:** Create `docs-backlog.md` grouped by audience and output type.
- [x] **Phase 4 — Define Information Architecture:** Create `information-architecture.md` with docs/site structure and placement decisions.
- [x] **Phase 5 — Prepare Pilot Briefs:** Create `pilot-doc-briefs.md` for the first 3–5 high-value topics.
- [x] **Phase 6 — Prepare Marketing/Onboarding/Release-Note Briefs:** Create `copy-briefs.md` as structured inputs, not polished copy.
- [x] **Phase 7 — Final Review and Handoff:** Check traceability, confidence labels, output boundaries, and review gates.

## Handoff Summary

- **Ready for docs drafting:** Memory user guide and Core workspace/global chat guide are the safest first drafts, provided the drafter collects fresh screenshots and performs a light runtime confirmation before publishing. The Plugin ecosystem/app-runtime brief is ready for developer-doc drafting after owner approval of alpha API wording.
- **Ready for website/copy review:** Agent-first desktop workspace, local-first/source-only alpha positioning, Memory/context, Git, Web access, Cron/reminders, and plugin ecosystem briefs are ready for product/copy review as brief-level inputs only. They are not approved final copy.
- **Blocked pending product decision:** Official status and support labels for external/local integrations; public provider matrix for Web access; optional web remote security/deployment guidance; App Store install/update/uninstall semantics; release-note version/milestone scope; website/README positioning approval for partially verified built-ins.
- **Do not draft yet:** External/local integration pages, low-confidence example plugin catalog pages, Web remote exact-scope docs, Explorer/dev-server how-to docs, Admin operations docs, Security/permission prompt docs, release notes, and polished homepage copy until the blockers in `final-review.md` are resolved or explicitly scoped out.
- **Key artifact list:** `verified-inventory.md`, `verification-log.md`, `docs-backlog.md`, `information-architecture.md`, `pilot-doc-briefs.md`, `copy-briefs.md`, and `final-review.md` in `.pi/plans/2026-04-26-feature-inventory/`.
- **Next recommended action:** Assign a docs drafter to the Memory user guide or Core workspace/global chat guide using the matching backlog item and pilot brief; separately assign product/security/runtime owners to close the blocked decisions listed in `final-review.md`.

## Phase Plan

### Phase 1 — Normalize the Scout

Create `verified-inventory.md` from `scout-context.md` using the agreed schema. Preserve all major scout categories, but normalize phrasing around user benefits and product surfaces. Do not add unverified claims.

### Phase 2 — Verify and Classify Claims

Review source paths and existing docs for high-impact and unclear claims. Update inventory statuses and record uncertainty in `verification-log.md`. Pay special attention to Explorer internals, Command Menu, MCP, web remote, external/local plugins, and manifest-only/provider plugins.

### Phase 3 — Build the Documentation Backlog

Create `docs-backlog.md` from verified inventory rows. Group by audience and output type, rank by value/confidence/maturity, and identify existing-doc overlap.

### Phase 4 — Define Information Architecture

Create `information-architecture.md` with a proposed docs/site structure. Distinguish canonical docs pages from website/onboarding/release-note candidates.

### Phase 5 — Prepare Pilot Briefs

Create `pilot-doc-briefs.md` for 3–5 high-value pilots. Recommended pilots: Memory, Git workspace manager, Web access, Cron/reminders, and plugin ecosystem. Include source citations and caveats.

### Phase 6 — Prepare Marketing/Onboarding/Release-Note Briefs

Create `copy-briefs.md` as structured brief inputs only. Do not write polished copy. Keep claims tied to verified inventory rows and mark any caveats.

### Phase 7 — Final Review and Handoff

Check all artifacts for traceability, confidence labels, output boundaries, and readiness gates. Summarize what is ready for actual docs/copy drafting and what remains blocked or needs product confirmation.

## Dependencies

No new code dependencies are required.

Workers should use:

- Existing scout: `.pi/plans/2026-04-26-feature-inventory/scout-context.md`
- Existing docs: `docs/`, `README.md`, plugin READMEs
- Source paths referenced by the scout
- External/local plugin READMEs under `/Users/danielcarter/Documents/Dev/projects/sero/plugins/*` when relevant

## Risks & Open Questions

- The scout may have missed hidden workflows inside Explorer, Command Menu, MCP, or web remote.
- Code presence does not always mean a feature is shipped, stable, enabled, or intended for public positioning.
- External/local plugins may not be official product features.
- One IA may not adequately serve end users, developers, admins, and plugin authors; separate tracks may be needed.
- Stakeholders may want polished copy before verification is complete.
- Existing docs may already cover some topics, so backlog work must avoid duplication.

## Accepted Mitigations

- Add confidence/status fields to every claim.
- Separate built-in/core features from external/local/example plugins.
- Require existing-docs checks before adding backlog items.
- Keep pilot briefs limited to 3–5 high-value areas.
- Add review gates after verification, IA, and pilot briefs.

## Acceptance Criteria

- A verified inventory exists with traceable source paths and confidence/status fields.
- Unclear and risky claims are captured in a verification log.
- A prioritized docs backlog exists and is grouped by audience/output surface.
- An information architecture proposal exists and references existing docs locations.
- Pilot briefs exist for the first high-value docs/copy efforts.
- Website/onboarding/release-note work is represented as structured briefs, not polished copy.
- External/local/experimental/placeholder features are not overclaimed.
- The plan produces trackable todos tagged `feature-inventory-docs`.
