# Feature Inventory Documentation Program Todos

**Tag:** `feature-inventory-docs`  
**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Input Scout:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md`  
**Status:** Draft tracking checklist

> Note: each todo repeats the relevant architectural constraints so a worker can execute it without relying on unstated plan context. This task set is for planning/brief artifacts only; do not write polished docs or marketing copy.

## Todo Checklist

- [x] FI-001 — Create inventory and verification artifact skeletons
- [x] FI-002 — Normalize core desktop/workspace/agent features into the inventory
- [x] FI-003 — Normalize built-in plugin features into the inventory
- [x] FI-004 — Normalize external/local plugin features into the inventory
- [x] FI-005 — Verify high-impact core claims and log uncertainty
- [x] FI-006 — Verify plugin/integration claims and log uncertainty
- [x] FI-007 — Build the audience-grouped documentation backlog
- [x] FI-008 — Draft the documentation/site information architecture proposal
- [x] FI-009 — Create pilot documentation briefs for first high-value topics
- [x] FI-010 — Create website/onboarding/release-note copy briefs
- [x] FI-011 — Run final traceability and gate review
- [x] FI-012 — Update plan progress checkboxes and handoff summary

---

## FI-001 — Create inventory and verification artifact skeletons

**Tags:** `feature-inventory-docs`  
**Phase:** 1 — Normalize the Scout  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to create/modify

- Create `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`
- Create `.pi/plans/2026-04-26-feature-inventory/verification-log.md`

### Constraints

- Do not write polished docs or copy.
- Treat `.pi/plans/2026-04-26-feature-inventory/scout-context.md` as raw input evidence, not publishable truth.
- Include confidence/status fields from the plan exactly enough that later workers can update rows consistently.
- Keep built-in/core, built-in/plugin, external/local, experimental, placeholder, and unclear features distinguishable.

### Required reference / expected shape

Use this schema from the plan as the starting point for `verified-inventory.md`:

```md
| Category | Feature | User Benefit | Audience | Impact | Product Status | Source Paths | Verification Status | Confidence | Output Targets | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Memory & Context | Persistent memory system | Sero remembers durable facts and context across sessions. | General user | High | Built-in/core | `plugins/sero-memory-plugin/extension/index.ts`; `docs/features/memory.md` | Verified | High | User docs, onboarding, website | Avoid claiming exact retrieval quality without testing. |
```

Use this expected shape for `verification-log.md`:

```md
## Claim: Web remote client exact scope

- **Inventory row:** Remote Access / Web remote client
- **Scout source:** `.pi/plans/2026-04-26-feature-inventory/scout-context.md`
- **Checked:** `apps/web-remote/src/App.tsx`, package manifest, existing docs
- **Finding:** TBD
- **Status:** needs verification
- **Public-copy decision:** not safe until exact shipped scope is confirmed
- **Follow-up:** TBD
```

### Anti-patterns

- Do **not** omit columns because they feel verbose.
- Do **not** mark items verified in this setup task unless already proven by a cited source.
- Do **not** move these artifacts into `docs/` yet.

### Acceptance criteria

- Both files exist.
- `verified-inventory.md` has the full table schema and a short legend for allowed values.
- `verification-log.md` has a reusable claim-review template.
- The files clearly reference the plan and scout paths.

---

## FI-002 — Normalize core desktop/workspace/agent features into the inventory

**Tags:** `feature-inventory-docs`  
**Phase:** 1 — Normalize the Scout  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to modify

- `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`

### Scope

Normalize these scout sections into inventory rows:

- Core Workspace
- Agent & Chat
- Files & Projects
- Terminal & Containers
- UI / Layout / Theming
- Data Persistence & Sync
- Security / Permissions
- Remote Access

### Constraints

- Convert implementation details into user benefits where possible.
- Preserve source paths from the scout.
- Use `needs verification` where the scout itself says the surface was not deeply reviewed.
- Do not expand beyond the scout unless the added item has an obvious source path and is labeled as added during normalization.

### Required reference / expected shape

Follow the phrasing style in existing docs like `README.md` Highlights and `docs/architecture.md`: user-readable, concrete, not hype-heavy.

Example row shape:

```md
| Core Workspace | Persistent desktop shell | Users work from one macOS shell with sidebar navigation, active app surface, and a global chat panel. | General user | High | Built-in/core | `apps/desktop/src/App.tsx`; `apps/desktop/src/components/layout/shell/MainSidebar.tsx` | Partially verified | High | User docs, onboarding, website | Verify exact current sidebar/app behavior before public screenshots. |
```

### Anti-patterns

- Do **not** describe internal cleanup tasks as homepage features.
- Do **not** claim full cross-platform support; README says source-only OSS alpha, macOS Apple Silicon support.
- Do **not** use generic marketing phrases like “revolutionary AI workspace” without evidence.

### Acceptance criteria

- All scoped scout sections have inventory rows.
- Rows have product status, verification status, confidence, and output targets.
- Unclear items from Remote Access, Command Menu, Explorer, and security are not marked fully verified unless checked.

---

## FI-003 — Normalize built-in plugin features into the inventory

**Tags:** `feature-inventory-docs`  
**Phase:** 1 — Normalize the Scout  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to modify

- `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`

### Scope

Normalize built-in plugin rows for:

- `sero-admin-plugin`
- `sero-cron-plugin`
- `sero-git-plugin`
- `sero-mcp-plugin`
- `sero-memory-plugin`
- `sero-user-feedback-plugin`
- `sero-web-plugin`

### Constraints

- Mark product status as `built-in/plugin` unless the plan/scout establishes it is core desktop functionality.
- Separate user-facing benefits from developer/admin-only capabilities.
- Preserve caveats around admin safety, permissions, MCP nuance, provider routing, and background jobs.

### Required reference / expected shape

Use `docs/features/memory.md` as the style/reference for feature descriptions grounded in source paths. It starts with a clear overview and architecture references rather than vague copy.

Example row:

```md
| Git & Developer Workflows | Visual Git manager | Developers can inspect status/logs/branches/diffs and perform common Git actions from a Sero app and agent tool. | Developer | High | Built-in/plugin | `plugins/sero-git-plugin/package.json`; `plugins/sero-git-plugin/extension/index.ts` | Needs verification | High | User docs, developer docs, onboarding | Verify UI surface and exact supported operations before pilot brief. |
```

### Anti-patterns

- Do **not** combine all plugin features into one giant “plugin ecosystem” row.
- Do **not** describe admin/MCP tooling as general-user features unless there is a clear user-facing flow.
- Do **not** imply provider availability unless credentials/config requirements are understood.

### Acceptance criteria

- Each built-in plugin has at least one inventory row.
- High-impact built-in plugin features from the scout are represented.
- Any unclear/complex plugin claims are flagged for verification in notes.

---

## FI-004 — Normalize external/local plugin features into the inventory

**Tags:** `feature-inventory-docs`  
**Phase:** 1 — Normalize the Scout  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to modify

- `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`

### Scope

Normalize external/local plugin rows from the scout, including Google, Spotify, Starling, Kanban, Plan Mode, Research, Todo, Notes, Imagegen, Humanizer, and lower-priority examples.

### Constraints

- Mark product status as `external/local` unless there is explicit evidence the plugin ships as built-in.
- Avoid positioning external/local plugins as guaranteed official integrations.
- Low-impact or novelty plugins should usually target `later`, examples, or plugin ecosystem proof points rather than core docs.

### Required reference / expected shape

Use the built-in/external distinction from `docs/plugins/guide.md`, especially the “What Is a Plugin?” table:

```md
| | Core app | Plugin |
|---|----------|--------|
| **Location** | `plugins/sero-*-plugin/` in the monorepo | `~/.sero-ui/agent/plugins/<id>/` |
| **Ships with Sero** | Yes | No — installed separately |
```

Example row:

```md
| Integrations | Google Workspace integration | Users may connect Gmail and Calendar workflows through an external/local plugin. | General user | High | External/local | `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-google-plugin/README.md` | Needs verification | Medium | Website, integration docs, later | Do not imply built-in support until product status is confirmed. |
```

### Anti-patterns

- Do **not** say “Sero includes Google/Spotify/Starling” unless verified as bundled.
- Do **not** hide external/local status in notes only; it must be in `Product Status`.
- Do **not** prioritize novelty plugins over core workflow docs unless instructed.

### Acceptance criteria

- External/local plugins from the scout are represented or deliberately deferred with notes.
- Every external/local row clearly shows `Product Status = External/local`.
- Rows identify safe output targets such as `later`, `website`, `integration docs`, or `plugin examples`.

---

## FI-005 — Verify high-impact core claims and log uncertainty

**Tags:** `feature-inventory-docs`  
**Phase:** 2 — Verify and Classify Claims  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to modify

- `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`
- `.pi/plans/2026-04-26-feature-inventory/verification-log.md`

### Scope

Verify high-impact core claims first:

- Desktop shell layout and app switching
- Global chat panel/session lifecycle
- Workspace registry/session tree
- Explorer/file tree/container/dev-server claims where practical
- Web remote client exact scope
- Security/profile/layout persistence claims

### Constraints

- A row can become `verified` only when source paths substantiate the user-facing claim.
- If a feature exists in code but not clearly in shipped UX, use `partially verified`.
- Capture unknowns in `verification-log.md`; do not silently leave vague notes.

### Required reference / expected shape

Source references named by the scout include:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/stores/agent.ts`
- `apps/desktop/src/types/ipc.ts`
- `apps/desktop/src/lib/persist-layout.ts`
- `apps/web-remote/src/App.tsx`
- `README.md` alpha/support posture

Expected verification-log entry:

```md
## Claim: Command menu catalog

- **Inventory row:** Agent & Chat / Command menu
- **Checked:** `apps/desktop/src/App.tsx`; `apps/desktop/src/components/layout/CommandMenu*`
- **Finding:** Command menu exists, but exact command set requires deeper inspection.
- **Status:** partially verified
- **Public-copy decision:** safe to mention as a command palette only; do not list commands yet.
- **Follow-up:** inspect command registration sources before writing docs.
```

### Anti-patterns

- Do **not** change source code.
- Do **not** infer behavior from component names alone.
- Do **not** mark unclear scout items as verified just because they sound plausible.

### Acceptance criteria

- High-impact core rows have updated verification status.
- Unclear core claims have entries in `verification-log.md`.
- Public-copy safety is explicit for web remote, Explorer, Command Menu, and security claims.

---

## FI-006 — Verify plugin/integration claims and log uncertainty

**Tags:** `feature-inventory-docs`  
**Phase:** 2 — Verify and Classify Claims  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to modify

- `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`
- `.pi/plans/2026-04-26-feature-inventory/verification-log.md`

### Scope

Verify plugin claims with priority on:

1. Memory
2. Git manager
3. Web access
4. Cron/reminders
5. Plugin ecosystem/app runtime
6. Research / Plan Mode / Kanban
7. Google / Spotify / Starling and other integrations
8. MCP and user feedback/permission flows

### Constraints

- Built-in plugin claims need source or README support inside `plugins/sero-*-plugin/` or existing `docs/`.
- External/local plugin claims need explicit external path references and must remain labeled external/local.
- Provider/integration claims must not imply available credentials or working auth unless verified.

### Required reference / expected shape

Use source paths from the scout and existing docs references:

- `docs/features/memory.md` for Memory docs style and confirmed architecture.
- `docs/plugins/guide.md` and `packages/app-runtime/README.md` for plugin ecosystem claims.
- Plugin READMEs/manifests/extension entrypoints for feature support.

Example verification-log entry:

```md
## Claim: Spotify playback and agent-assisted music tooling

- **Inventory row:** Integrations / Spotify integration
- **Checked:** `/Users/danielcarter/Documents/Dev/projects/sero/plugins/sero-spotify-plugin/README.md`
- **Finding:** TBD after README/source review.
- **Status:** needs verification
- **Public-copy decision:** external/local integration example only until support status is confirmed.
- **Follow-up:** confirm whether OAuth/Web Playback requirements should be documented.
```

### Anti-patterns

- Do **not** treat external integrations as bundled product features.
- Do **not** claim agent tools exist unless extension source or README confirms them.
- Do **not** promote placeholder/novelty plugins as high-priority public docs.

### Acceptance criteria

- Top plugin claims have updated verification statuses.
- External/local integrations have explicit caveats.
- `verification-log.md` captures unresolved plugin questions and safe/unsafe public-copy decisions.

---

## FI-007 — Build the audience-grouped documentation backlog

**Tags:** `feature-inventory-docs`  
**Phase:** 3 — Build the Documentation Backlog  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to create/modify

- Create `.pi/plans/2026-04-26-feature-inventory/docs-backlog.md`

### Constraints

- Backlog items must reference rows from `verified-inventory.md`.
- Group by audience and output type, not by implementation folder only.
- Existing docs must be checked before proposing brand-new pages.
- Do not write the docs; write backlog items/brief task descriptions.

### Required reference / expected shape

Check existing docs index/structure:

- `docs/README.md`
- `docs/features/memory.md`
- `docs/plugins/guide.md`
- `docs/guides/version-control-user-flow.md`
- `docs/reference/state-and-folders.md`

Expected backlog item shape:

```md
## High Priority — General Users

### Memory: persistent context user guide

- **Inventory rows:** Memory & Context / Persistent memory system; Automatic context injection
- **Output type:** User docs + onboarding
- **Why now:** Core product differentiator with existing source/docs support.
- **Existing coverage:** `docs/features/memory.md` exists; likely needs user-facing distillation rather than duplicate architecture docs.
- **Confidence:** High
- **Blocked by:** None / or listed verification gap
- **Acceptance for future doc:** Explains what memory does, where it stores data, user controls, and limitations.
```

### Anti-patterns

- Do **not** create a flat undifferentiated list of feature pages.
- Do **not** duplicate existing docs without saying whether to update, split, or link them.
- Do **not** prioritize low-confidence marketing topics above verified core docs.

### Acceptance criteria

- Backlog is grouped by audience and output type.
- Each item has priority, rationale, existing-docs check, confidence, and blockers.
- High-priority backlog covers Memory, Git, Web access, Cron/reminders, plugin ecosystem, and core workspace if verified.

---

## FI-008 — Draft the documentation/site information architecture proposal

**Tags:** `feature-inventory-docs`  
**Phase:** 4 — Define Information Architecture  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to create/modify

- Create `.pi/plans/2026-04-26-feature-inventory/information-architecture.md`

### Constraints

- Distinguish `docs/` reference docs from website/onboarding/release-note surfaces.
- Support at least general users, power users/developers, admins/support, and plugin authors.
- Use existing docs locations rather than inventing a disconnected structure.
- Keep alpha/support constraints visible; do not imply finished commercial distribution.

### Required reference / expected shape

Use the existing docs structure from `find docs -maxdepth 2 -type f -name '*.md'` and the alpha positioning in `README.md`.

Expected IA shape:

```md
## Proposed Top-Level Docs Tracks

### Use Sero
- Getting started / first workspace
- Desktop shell and chat panel
- Memory and context
- Automations and reminders
- Web access

### Build with Sero
- Plugin quickstart
- App runtime hooks
- Tool/command bridge
- Local plugin development

### Administer / Troubleshoot Sero
- Profiles and state folders
- Containers and host-mode fallback
- Logs/config/session browser
- Security and support scope

### Public Website / Onboarding Inputs
- Product pillars
- Feature highlights
- Demo flows
- Alpha caveats
```

### Anti-patterns

- Do **not** make one giant docs tree that mixes end-user onboarding with internal architecture decisions.
- Do **not** relocate existing docs in this task; propose structure only.
- Do **not** hide alpha limitations.

### Acceptance criteria

- IA proposal maps backlog categories to concrete doc/site sections.
- Existing docs are referenced as keep/update/split/link candidates.
- Website/onboarding/release-note surfaces are separated from canonical docs.

---

## FI-009 — Create pilot documentation briefs for first high-value topics

**Tags:** `feature-inventory-docs`  
**Phase:** 5 — Prepare Pilot Briefs  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to create/modify

- Create `.pi/plans/2026-04-26-feature-inventory/pilot-doc-briefs.md`

### Scope

Create briefs for 3–5 pilot topics. Recommended:

- Memory system
- Git workspace manager
- Web access/search/fetch/bookmarks
- Cron/reminders/automations
- Plugin ecosystem/app store/favorites/app runtime

### Constraints

- Briefs are not finished docs.
- Each brief must cite verified inventory rows and source paths.
- Each brief must include caveats and screenshot/demo needs.
- If a recommended pilot is not verified enough, replace it with the next highest-confidence backlog item and explain why.

### Required reference / expected shape

Use `docs/features/memory.md` as a model for the level of source grounding, but make each brief user-doc-oriented.

Expected brief shape:

```md
## Pilot Brief: Memory System User Guide

- **Audience:** General users + power users
- **Goal:** Explain how Sero remembers context across sessions and how users can inspect/control it.
- **Inventory rows:** Memory & Context / Persistent memory system; Context injection; Scratchpad
- **Source citations:** `docs/features/memory.md`; `plugins/sero-memory-plugin/extension/index.ts`
- **Proposed outline:**
  1. What memory does
  2. What gets stored
  3. How it appears in chat
  4. User controls and limitations
  5. Troubleshooting / privacy notes
- **Screenshot/demo needs:** Memory command in chat, memory files/state if appropriate
- **Caveats:** Do not claim perfect recall or exact semantic quality without testing.
- **Acceptance criteria for future doc:** TBD checklist
```

### Anti-patterns

- Do **not** write the full guide.
- Do **not** include unverified feature claims in the outline.
- Do **not** omit caveats because the topic is high priority.

### Acceptance criteria

- 3–5 pilot briefs exist.
- Each has audience, goal, inventory references, source citations, outline, screenshot/demo needs, caveats, and future acceptance criteria.
- Any skipped recommended pilot has a documented reason.

---

## FI-010 — Create website/onboarding/release-note copy briefs

**Tags:** `feature-inventory-docs`  
**Phase:** 6 — Prepare Marketing/Onboarding/Release-Note Briefs  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to create/modify

- Create `.pi/plans/2026-04-26-feature-inventory/copy-briefs.md`

### Constraints

- Write structured briefs only, not final polished marketing copy.
- Every proof point must reference verified inventory rows.
- Separate public homepage/website ideas from in-app onboarding and release-note ideas.
- Include alpha/support caveats where relevant.

### Required reference / expected shape

Use `README.md` for current public positioning language: “local-first, agent-first desktop workspace for macOS,” “source-only OSS alpha,” and the listed non-promises.

Expected brief shape:

```md
## Website Brief: Agent-first desktop workspace

- **Surface:** Website feature section / homepage pillar
- **Audience:** Developers and power users evaluating Sero
- **Positioning angle:** One desktop shell for workspace, agent chat, plugins, terminals, and runtime integration.
- **Verified proof points:** Desktop shell layout; global chat panel; plugin app switching; local-first workspace state
- **Source citations:** `README.md`; `apps/desktop/src/App.tsx`; `docs/architecture.md`
- **Do not claim:** Windows/Linux support, public binaries, stable plugin API, or full parity without containers.
- **Demo/screenshot needs:** Desktop shell overview with sidebar, active app, and chat panel.
- **Review gate:** Product positioning approval before final copy.
```

### Anti-patterns

- Do **not** write final slogans, headlines, or release notes as if approved.
- Do **not** turn external/local integrations into bundled-feature claims.
- Do **not** omit source-only alpha constraints.

### Acceptance criteria

- Copy briefs cover website, onboarding, and release-note surfaces separately.
- Each brief has proof points, citations, caveats, demo needs, and review gate.
- No brief contains unsupported final marketing claims.

---

## FI-011 — Run final traceability and gate review

**Tags:** `feature-inventory-docs`  
**Phase:** 7 — Final Review and Handoff  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to create/modify

- Create `.pi/plans/2026-04-26-feature-inventory/final-review.md`
- Update other artifacts only to fix review findings.

### Constraints

- Review against the four gates in the plan: inventory verification, backlog prioritization, IA, and pilot brief readiness.
- Check traceability from copy/docs briefs back to verified inventory rows and source paths.
- Identify blocked claims instead of resolving them by guesswork.

### Required reference / expected shape

Use the review gates in `.pi/plans/2026-04-26-feature-inventory/plan.md` as the checklist.

Expected final-review shape:

```md
# Feature Inventory Final Review

## Gate 1: Inventory Verification
- [ ] All high-impact scout items represented
- [ ] Unclear features logged
- [ ] Built-in vs external/local explicit
- **Result:** pass / pass with caveats / fail
- **Notes:** ...

## Gate 2: Backlog Prioritization
...

## Blocked or Product-Decision Needed
| Topic | Why blocked | Recommended owner/decision |
|---|---|---|
| External Spotify support status | External/local plugin; official support unclear | Product decision before homepage copy |
```

### Anti-patterns

- Do **not** declare the program complete if high-impact rows lack source paths.
- Do **not** bury blocked decisions in prose only; list them clearly.
- Do **not** start drafting finished docs as part of review.

### Acceptance criteria

- `final-review.md` exists and evaluates every review gate.
- Blocked claims/product decisions are listed.
- Any artifact issues found during review are either fixed or recorded as follow-up.

---

## FI-012 — Update plan progress checkboxes and handoff summary

**Tags:** `feature-inventory-docs`  
**Phase:** 7 — Final Review and Handoff  
**Plan artifact:** `.pi/plans/2026-04-26-feature-inventory/plan.md`

### Files to modify

- `.pi/plans/2026-04-26-feature-inventory/plan.md`
- Optionally append to `.pi/plans/2026-04-26-feature-inventory/final-review.md`

### Constraints

- Update only the progress checklist in the plan; do not rewrite the approved approach unless explicitly asked.
- Check off a phase only when its artifact acceptance criteria are satisfied.
- Summarize what is ready for actual docs/copy drafting and what remains blocked.

### Required reference / expected shape

The plan now contains this checklist shape:

```md
## Progress Checklist

- [ ] **Phase 1 — Normalize the Scout:** Create `verified-inventory.md` from `scout-context.md` using the agreed schema.
- [ ] **Phase 2 — Verify and Classify Claims:** Review source paths and existing docs, then update verification statuses and `verification-log.md`.
```

Expected handoff snippet:

```md
## Handoff Summary

- **Ready for docs drafting:** Memory user guide, Git manager guide
- **Ready for website brief review:** Agent-first desktop workspace
- **Blocked pending product decision:** Official status of external integrations
- **Do not draft yet:** Web remote exact-scope page until verification gap is closed
```

### Anti-patterns

- Do **not** mark phases complete because files merely exist; acceptance criteria must be met.
- Do **not** erase open questions.
- Do **not** move artifacts into `docs/` during handoff.

### Acceptance criteria

- Plan progress checklist reflects actual artifact completion.
- Handoff summary identifies ready, blocked, and deferred work.
- Future workers can tell exactly what to draft next and what not to claim.
