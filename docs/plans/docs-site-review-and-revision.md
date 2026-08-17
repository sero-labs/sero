# Docs-site review and revision plan

Status: Planned  
Scope: `apps/docs-site/`  
Delivery: One draft pull request with one commit for each vertical slice  
Reference: `8c25462607750ea744348d8a59fdbc7fe2aca82b`

## Goal

Review and revise the docs site in complete vertical slices. Finish the
assessment, product check, revision, navigation, screenshots, and validation
for one subject before work starts on the next subject.

Do not create a detailed site-wide audit. Keep only the progress table and
durable decisions in this plan.

## Required skill

Use the `sero-humanize` skill for every slice.

At the start of each slice:

- Read `.agents/skills/sero-humanize/SKILL.md`.
- Use its audit mode to assess the pages before editing them.
- Record the preservation set for the slice.
- Use the protected Orchestrator pages as the local voice sample.

During revision, follow the skill's structure pass and sentence pass. After
revision, follow its preservation and validation checks. A slice is not
complete until its review notes state that the `sero-humanize` skill was
applied.

## Pull request structure

- [ ] Open one draft pull request.
- Complete the slices in order.
- Add one Conventional Commit for each completed slice.
- Ask for approval before a slice merges, removes, replaces, or converts a
  page to a tombstone.
- Do not commit a partly complete slice.
- Keep the pull request in draft through the final review.

## Protected Orchestrator content

Use the Orchestrator work in the reference commit as the voice and quality
example. Do not refactor these pages:

- `docs/guide/orchestrator.md`
- `docs/guide/workflows.md`
- `docs/guide/workflows-advanced.md`
- `docs/guide/rooms.md`
- `docs/guide/rooms-advanced.md`
- `docs/reference/orchestrator.md`
- `docs/reference/workflows.md`
- `docs/reference/rooms.md`

Do not remove or replace their images. Only change protected content for a
verified factual, security, or safety defect. Record the evidence and get
approval first.

The guide and reference indexes and `rspress.config.ts` remain in scope. The
Orchestrator section in `guide/scheduler-reminders.md` is also protected from
prose refactoring unless the behavior or visible labels changed.

## Process for each slice

### 1. Assess

Read every page in the slice in full. Identify:

- the intended reader and task;
- its type: tutorial, how-to, explanation, or reference;
- unique and repeated material;
- likely stale facts and screenshots; and
- the pages and navigation that depend on it.

Give each page one proposed action:

- **Keep**: Accurate, useful, unique, and easy to find.
- **Revise**: The task is useful, but the facts, structure, language, or
  screenshots need work.
- **Merge**: Another page serves the same reader and task.
- **Tombstone**: The feature is obsolete, but the old route still needs an
  explanation or replacement link.
- **Delete**: The feature and route have no remaining value.
- **Add**: A current feature has a clear documentation gap.

Pause for approval when the action is merge, tombstone, delete, or add.

### 2. Verify

Use sources in this order:

1. Shipped implementation and tests
2. Shared contracts and package manifests
3. Current UI components
4. Tool and CLI registrations
5. Build and configuration files
6. Implemented decisions and plans
7. Existing docs, READMEs, and screenshots

Do not rewrite an uncertain claim. Record the question and resolve it first.

For an external plugin, record its repository and checkout commit. Verify its
manifest, implementation, and tests before its README. Do not edit an external
plugin repository in this pull request.

### 3. Capture

Replace a screenshot when the page is useful but the image no longer matches
the UI.

- Capture a real state before writing about it.
- Use a disposable profile and sample workspace.
- Record the product commit and viewport.
- Remove private paths, accounts, tokens, email, banking, and health data.
- Keep an image only when it adds useful information.
- Check important image text at a narrow width.

### 4. Revise

Apply the `sero-humanize` process in two passes.

First fix the structure:

- put prerequisites before actions;
- keep one documentation type per page;
- remove repeated framing and summaries;
- use headings that name the reader's task; and
- end tutorials with checks the reader can perform.

Then fix the sentences:

- put the action or answer first;
- use active voice and one main instruction per sentence;
- use one term for one concept;
- remove filler, promotion, and meta narration;
- define unfamiliar terms before use; and
- keep exact UI labels unchanged.

Preserve technical meaning, commands, code, paths, numbers, limits,
frontmatter, links, anchors, image targets, and user input examples.

### 5. Integrate and validate

Update the sidebar, indexes, cross-links, and screenshots needed by the slice.
Use a fresh read-only subagent to review factual accuracy and the humanize
pass. Keep one writer in the main worktree.

Run the slice checks, update the progress table, and create its commit.

## Slices

Paths below are relative to `apps/docs-site/`.

A page checkbox is complete only when its action is approved, its work is
finished with the `sero-humanize` skill, and its checks pass. A slice checkbox
is complete only when all page checkboxes and the slice commit are complete.

### Slice 1: Install and first run

- [ ] `docs/index.md`
- [ ] `docs/guide/index.md`
- [ ] `docs/guide/overview.md`
- [ ] `docs/guide/installation-requirements.md`
- [ ] `docs/guide/getting-started.md`
- [ ] `docs/guide/profiles-and-onboarding.md`
- [ ] `docs/guide/choose-workspace-runtime.md`
- [ ] `docs/guide/models-and-providers.md`
- [ ] `docs/guide/local-llms-lm-studio.md`
- [ ] `docs/guide/development-setup.md`

Separate packaged installation from contributor setup.

- [ ] Commit: `docs(docs-site): revise install and first-run guidance`

### Slice 2: Workspace basics

- [ ] `docs/guide/workspace-and-chat.md`
- [ ] `docs/guide/explorer-workspace.md`
- [ ] `docs/guide/containers-dev-servers.md`
- [ ] `docs/guide/browser-and-capture.md`
- [ ] `docs/guide/checkpoints-and-undo.md`
- [ ] `docs/guide/themes.md`

Resolve overlap between Workspace, Explorer, browser previews, and dev
servers.

- [ ] Commit: `docs(docs-site): revise workspace guidance`

### Slice 3: Agent basics and automation

- [ ] `docs/guide/agent-sessions-and-context.md`
- [ ] `docs/guide/subagents.md`
- [ ] `docs/guide/memory.md`
- [ ] `docs/guide/scheduler-reminders.md`
- [ ] `docs/guide/running-evals.md`
- [ ] `docs/reference/agent-definitions.md`
- [ ] `docs/reference/testing-evals.md`

Check collaboration language against current subagent and Room behavior. Do
not refactor the protected Orchestrator material.

- [ ] Commit: `docs(docs-site): revise agent and automation guidance`

### Slice 4: Daily apps and integrations

- [ ] `docs/guide/git-integration.md`
- [ ] `docs/guide/web.md`
- [ ] `docs/guide/remote-control.md`
- [ ] `docs/guide/dashboard-widgets.md`
- [ ] `docs/guide/app-store-favorites.md`
- [ ] `docs/guide/settings-models-admin.md`
- [ ] `docs/guide/mcp.md`

Check current app names, controls, storage, and security boundaries.

- [ ] Commit: `docs(docs-site): revise app and integration guidance`

### Slice 5: Built-in plugins

- [ ] `docs/guide/plugins-and-apps.md`
- [ ] `docs/plugins/catalog.md`
- [ ] `docs/plugins/design-library.md`
- [ ] `docs/plugins/graphify.md`
- [ ] `docs/plugins/user-feedback.md`

Compare the catalog with all built-in manifests. Evaluate missing coverage for
Graphify, Orchestrator, Usage, Agent Board, and other discoverable features.
Add a full page only when a catalog entry cannot support the reader's task.

Do not use old ImageGen or Kanban material to imply that those plugins ship
with Sero.

- [ ] Commit: `docs(docs-site): revise built-in plugin documentation`

### Slice 6: External plugins

Review every repository under:

`/Users/danielcarter/Documents/Dev/projects/sero/plugins`

Review the remaining `docs/plugins/` pages and active external plugins that
have no page.

- [ ] Record every external plugin repository, commit, and status.
- [ ] Review all existing external plugin pages.
- [ ] Evaluate active external plugins that have no page.
- [ ] Get approval for the final page actions.
- [ ] Complete the approved pages and catalog changes.

- Use a full page only for substantial setup, security, recovery, or user
  workflows.
- Use a catalog entry for a simple or example plugin.
- Do not imply that an external plugin ships with Sero.
- Do not publish an install URL without an authoritative upstream.
- ImageGen remains active, but Design Library supersedes it.
- Kanban remains external, but Orchestrator supersedes it.
- Verify Spotify's status before deciding whether to keep a legacy tombstone.
- Evaluate Logbook and all other active external plugins.

Read-only subagents can inspect independent plugin repositories. Make one
combined commit after the page actions are approved.

- [ ] Commit: `docs(docs-site): revise external plugin documentation`

### Slice 7: Plugin authors

- [ ] `docs/reference/plugins.md`
- [ ] `docs/reference/plugin-extension-points.md`
- [ ] `docs/reference/app-runtime.md`
- [ ] `docs/reference/dashboard-components.md`
- [ ] `docs/reference/plugin-author-quick-path.md`
- [ ] `docs/reference/plugin-quickstart.md`
- [ ] `docs/reference/plugin-end-to-end-example.md`
- [ ] `docs/reference/agent-plugins.md`

Select one clear starting path. Propose merges when pages repeat package shape,
manifests, setup, or examples.

- [ ] Commit: `docs(docs-site): revise plugin author documentation`

### Slice 8: Runtime, security, and support

- [ ] `docs/reference/architecture.md`
- [ ] `docs/reference/containers-host-mode.md`
- [ ] `docs/reference/container-isolation.md`
- [ ] `docs/reference/sero-cli.md`
- [ ] `docs/reference/state-and-folders.md`
- [ ] `docs/reference/models-json.md`
- [ ] `docs/reference/support-scope.md`
- [ ] `docs/reference/security-privacy.md`
- [ ] `docs/reference/environment-doctor.md`
- [ ] `docs/reference/troubleshooting.md`
- [ ] `docs/reference/known-limitations.md`
- [ ] `docs/reference/index.md`

Require direct implementation or configuration evidence for support, security,
privacy, storage, and runtime claims.

- [ ] Commit: `docs(docs-site): revise runtime and support reference`

## Checks for each commit

Before every slice commit:

1. Inspect changed commands, paths, labels, links, numbers, anchors, and image
   targets.
2. Confirm that protected Orchestrator content has no unintended diff.
3. Check changed internal links and image references.
4. Run `pnpm --filter @sero/docs-site build`.
5. Run `git diff --check`.
6. Run `pnpm typecheck` from the repository root.
7. Preview changed pages at desktop and narrow widths when layout or images
   changed.
8. Record the result below.

## Final review

After slice 8:

- [ ] Check every route, link, heading anchor, and image.
- [ ] Check sidebar order and index coverage.
- [ ] Review terms across slice boundaries.
- [ ] Review new images for privacy and narrow-width use.
- [ ] Confirm that external plugin repositories are not in the diff.
- [ ] Run the docs build and root typecheck again.
- [ ] Run a fresh independent review.

Fix a final defect in its owning slice commit when practical. Use a small final
fix commit only when changing published commit history would make review
harder.

## Progress

- [ ] Slice 1: Install and first run — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 2: Workspace basics — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 3: Agent basics and automation — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 4: Daily apps and integrations — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 5: Built-in plugins — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 6: External plugins — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 7: Plugin authors — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Slice 8: Runtime, security, and support — commit: `pending`
  - [ ] `sero-humanize` applied
- [ ] Final review complete

Update this list at the end of each slice. Replace `pending` with the commit
hash. Keep detailed temporary evidence out of this section.

## Completion criteria

The draft pull request is complete when:

- every slice has an approved and completed disposition;
- every retained page has a clear reader task;
- changed factual claims have an authoritative source;
- active, superseded, external, and legacy plugins are labelled correctly;
- changed screenshots match the UI and contain no private data;
- navigation matches the final content;
- protected Orchestrator content has no unintended changes;
- the docs build and root typecheck pass; and
- a fresh review finds no blocking issue.
