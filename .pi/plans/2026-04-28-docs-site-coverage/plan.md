# Docs Site Complete Coverage

**Date:** 2026-04-28
**Status:** Draft
**Spec:** `docs/plans/docs-site-complete-coverage-plan.md`
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

Complete `apps/docs-site/` as a beginner-friendly, source-of-truth-backed public docs surface for Sero. The work is documentation-only unless the audit discovers an existing feature is impossible to explain because product UI lacks labels/help text.

The docs must assume zero prior Sero knowledge, explain where users click or run commands, and separate task guides from exact reference material. New docs must also keep existing docs consistent: old pages should be updated when terminology, links, screenshots, paths, or alpha caveats change.

## Approach

Use a staged pipeline:

1. Create a public coverage audit under `apps/docs-site/docs/reference/coverage-audit.md`.
2. Fill high-impact missing core docs from code/source docs, not memory.
3. Add expanded agent, profile, dashboard, CLI, container, model, plugin, eval, and media coverage.
4. Update existing pages for consistency with the new architecture and terminology.
5. Rework Rspress IA/sidebar/index pages around the reader journey.
6. Validate with a docs-site build and public-nav/internal-link check.

### Key Decisions

- **Audit first** — because it creates a visible source-of-truth map for workers and reviewers.
- **Source-driven docs** — every page/table must be checked against implementation sources or plugin manifests.
- **Existing-doc consistency is in scope** — new pages must not leave old pages contradictory or stale.
- **Core docs before plugin long tail** — CLI, containers, models, agents, browser capture, profiles, dashboard, and evals unblock the most readers.
- **Plugin pages use a template** — because external plugin coverage would otherwise drift in shape and detail.
- **IA updates after files exist** — because `rspress.config.ts`, guide/reference indexes, and homepage links should reflect real pages, not placeholders.
- **Explicit alpha/partial caveats** — because several features are environment-sensitive or still evolving.

## Architecture

### Documentation pipeline

```text
source files / manifests / root docs
        ↓
coverage audit
        ↓
new + updated guide/reference pages
        ↓
sidebar/nav/index/homepage IA
        ↓
asset notes + screenshots/omissions
        ↓
Rspress build validation
```

### Source-of-truth areas

- Docs site app: `apps/docs-site/**`
- Desktop renderer UI: `apps/desktop/src/components/**`, `apps/desktop/src/stores/**`, `apps/desktop/src/types/**`
- Electron runtime: `apps/desktop/electron/**`
- CLI: `apps/desktop/electron/cli/**`
- Root source docs: `docs/**` except internal/transient trees must not be linked from public nav
- Built-in plugins: `plugins/sero-*-plugin/**`
- External plugins: `../plugins/**`
- Shared app runtime: `packages/app-runtime/**`

### Page groups

#### Setup / model / profile docs

- Expand `guide/models-and-providers.md`.
- Add `guide/local-llms-lm-studio.md`.
- Add `reference/models-json.md`.
- Add profile/onboarding coverage, likely `guide/profiles-and-onboarding.md`, and update state/security pages.

#### Workspace / runtime / operator docs

- Add `guide/containers-dev-servers.md`.
- Add `reference/container-isolation.md`.
- Add `reference/sero-cli.md`.
- Add browser/app capture guides (`guide/browser-and-capture.md` and/or `guide/agent-visual-control.md`).
- Add or update checkpoint/turn-undo coverage in Git/workspace docs.

#### Agent experience docs

- Add `guide/agent-sessions-and-context.md` for chat composer controls, context editor, slash commands, `@` files, attachments, workspace snapshot, voice transcription, steering, queued follow-ups, thinking/memory visibility.
- Add `guide/subagents.md`.
- Add `reference/agent-definitions.md`.
- Include collaboration/debate mode either in `guide/subagents.md` or a sibling `guide/agent-collaboration.md` if length demands.

#### Apps/plugins docs

- Add `guide/dashboard-widgets.md`.
- Add plugin catalog page, preferably `guide/plugin-catalog.md` or `plugins/catalog.md` depending on final IA.
- Add/expand built-in plugin pages: Admin, Alibaba provider, Cron/Scheduler, Git, MCP, Memory, User Feedback, Web.
- Add external plugin pages for every plugin under `../plugins`, grouped by priority.
- Expand local plugin development coverage in `guide/plugins-and-apps.md` / `reference/plugins.md`.

#### Plugin author/reference docs

- Add or expand compact `@sero-ai/app-runtime` API reference (e.g. `reference/app-runtime.md` or section in `reference/plugin-author-quick-path.md`).
- Keep plugin author docs aligned with current hooks: `useAppState`, `useAppInfo`, `useAgentPrompt`, `useAI`, `useAppTools`, `useAvailableModels`, `useTheme`, `useWidgetRegistration`, `registerWidget`.

#### Quality / eval / media docs

- Expand `reference/testing-evals.md` and/or add `guide/running-evals.md`.
- Create stable asset directories and `apps/docs-site/docs/assets/CAPTURE_NOTES.md`.
- Capture screenshots/media where practical; otherwise record explicit omission reasons.

## Information Architecture

The sidebar should follow this reader journey:

1. What is Sero and how do I get started?
2. How do I set up profiles, providers, local models, workspaces, and runtime?
3. How do I use the core workspace day to day?
4. How do agents, context, subagents, collaboration, memory, and automation work?
5. How do apps/plugins and dashboard widgets expand Sero?
6. How do integrations, remote access, browser capture, and advanced workflows work?
7. Where are exact reference details, troubleshooting, and developer material?

Avoid linking internal/transient trees from public nav:

- `.pi/plans/**`
- `docs/plans/**`
- `docs/superpowers/**`
- `docs/deslopify/**`
- maintainer-only historical docs

## Existing Docs Consistency Pass

Every domain batch must update relevant existing docs. Likely targets include:

- `apps/docs-site/docs/index.md`
- `apps/docs-site/docs/guide/index.md`
- `apps/docs-site/docs/reference/index.md`
- `apps/docs-site/docs/guide/overview.md`
- `apps/docs-site/docs/guide/workspace-and-chat.md`
- `apps/docs-site/docs/guide/explorer-workspace.md`
- `apps/docs-site/docs/guide/settings-models-admin.md`
- `apps/docs-site/docs/guide/models-and-providers.md`
- `apps/docs-site/docs/guide/plugins-and-apps.md`
- `apps/docs-site/docs/guide/app-store-favorites.md`
- `apps/docs-site/docs/guide/git-integration.md`
- `apps/docs-site/docs/guide/remote-control.md`
- `apps/docs-site/docs/reference/state-and-folders.md`
- `apps/docs-site/docs/reference/security-privacy.md`
- `apps/docs-site/docs/reference/troubleshooting.md`
- `apps/docs-site/docs/reference/known-limitations.md`
- `apps/docs-site/README.md`

## Dependencies

No new runtime dependencies are expected. The docs-site uses `rspress` directly.

Validation command:

```bash
pnpm --filter @sero/docs-site build
```

Useful inspection commands:

```bash
find apps/docs-site/docs -maxdepth 3 -type f | sort
find apps/desktop/electron/cli/commands -type f | sort
find plugins -maxdepth 2 -name package.json -print | sort
find ../plugins -maxdepth 2 -name package.json -print | sort
```

## Risks & Open Questions

- Source docs may lag implementation; workers must inspect code/manifests before writing tables.
- One whole-effort plan is broad; todos should be sequenced and grouped so work can land in reviewable batches.
- External plugin pages may lack screenshots/README detail; use source inspection and explicit limitations rather than invented claims.
- IA can become too long; use catalog/index pages and subgrouping rather than exposing every plugin page at the top level.
- Screenshot capture may lag; record capture notes and omissions explicitly.
- Existing docs can drift; every content todo must include consistency updates for relevant old pages.

## Acceptance Criteria

- A new user can understand what Sero is, where to click, and how to start without reading source code.
- Coverage audit maps every top-level desktop feature to docs coverage or an explicit non-user-facing note.
- New guide pages start with a plain-language overview, quick path, example, troubleshooting/recovery, and related docs.
- Reference pages include exact details with source-checked tables and examples.
- Existing docs remain consistent with new pages and do not contradict paths, terminology, provider support, runtime model, or alpha caveats.
- Every host `sero-cli` namespace has syntax, examples, output/side effects/errors, and source ownership.
- Provider docs list built-in API-key providers, OAuth/provider behavior, plugin-defined providers, local/custom providers, health states, env var behavior, model tiers, and failure recovery.
- LM Studio/local custom model setup can be completed from docs alone.
- Container docs explain isolation, per-workspace containers, dev-server exposure by container IP, port-conflict behavior, and common failures.
- Browser/app control docs explain screenshots, interactions, dev-server preview, and MP4 recording with examples.
- Agent docs cover composer controls, context editor/presets, voice transcription, subagents, collaboration/debate, and agent definition schema.
- Dashboard/widgets and app/plugin runtime docs are represented in user and author docs.
- Every built-in and external plugin has at least a catalog entry; major plugins have full pages.
- Evals docs explain snapshot vs real LLM evals, commands, costs/auth, scenarios, and failure interpretation.
- Screenshot/media assets exist or omissions are recorded in `assets/CAPTURE_NOTES.md` / coverage audit.
- `pnpm --filter @sero/docs-site build` succeeds.
