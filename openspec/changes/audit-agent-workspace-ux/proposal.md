## Why

Architect, Orchestrator, Rooms and Workspaces need an evidence-based UX audit. Agent instructions appear as user-facing headings, the same description repeats at project, research, workflow and step level, empty containers and warnings appear for output that does not exist yet, and a user cannot tell from an overview row whether work is happening, who is doing it, or whether they must act.

An earlier revision of this change proposed a local interactive annotation tool. The user rejected that scope. The deliverable is a static, reviewable document in the style of `apps/styleguide/public/prototypes/sero-design-library-plugin.html`: numbered states, a short note per state, and full app-sized frames. Current-state evidence and proposed designs stay in separate documents so an attractive mockup is never mistaken for an observation.

## What Changes

- Capture the shipped UI against a read-only copy of the `seroarchitectdev` profile, with the Architect, Rooms and Goals runtimes killed (`SERO_ARCHITECT=0`, `SERO_ROOMS=0`, `SERO_GOALS=0`). Nothing is woken, no model is called and no record is written; every page still renders its real recorded state from files.
- Drive the capture from a new gated spec beside the existing desktop E2E suite, reusing the existing Electron launch, navigation and selector helpers. Do not run the paid documentation-capture specs, which spend money and overwrite docs-site assets.
- Record every capture in a coverage register with a stable id, area, page, state, user task, a text fingerprint of the frame and a content hash. Identical frames are recorded once; a state that could not be reached keeps its reason and stays a visible gap.
- Publish two separate static HTML documents under `apps/styleguide/public/prototypes/agent-workspace-ux-audit/`: `evidence.html` (captured frames, grouped by area, each with the observed problem) and `proposals.html` (numbered static mockups of the proposed changes, drawn in the product's own style).
- Use `openai-codex/gpt-5.6-luna:high` for every new run and delegated member if a named evidence gap needs live execution. Check the effective owner, planner, workflow-step and Room-member selections before dispatch. Record purpose, bounds, effective model, elapsed time and reported cost; unknown cost stays unknown.
- Keep the current theme. Propose structure, disclosure and ordering changes, not a new visual system.

## Capabilities

### New Capabilities

- `ux-audit-review`: Traceable page/state evidence for Sero's agent and workspace surfaces, and static proposed designs kept separate from it.

### Modified Capabilities

None. This change audits production behaviour; it does not change it or amend the existing `architect-ui` requirements.

## Impact

- New deliverables: `apps/styleguide/public/prototypes/agent-workspace-ux-audit/evidence.html` and `proposals.html`, screenshots under `apps/styleguide/public/prototypes/screenshots/agent-workspace-ux-audit/`, and an archive entry in `apps/styleguide/src/PrototypeArchive.tsx`.
- New capture code: `apps/desktop/e2e/ux-audit.workflow.spec.ts`, `apps/desktop/e2e/helpers/ux-audit.ts` and `apps/desktop/e2e/ux-audit/`. The spec is skipped unless `SERO_E2E_UX_AUDIT=1`.
- No production IPC, Pi SDK, runtime, dependency or design-token changes.

## Non-goals

- An interactive review application, annotation editor, pin or rectangle markup, review persistence, save/load, or any collaboration backend. The user rejected this scope.
- Redesigning production pages, changing the theme, or reducing supported workflows.
- Character limits or truncation as the remedy for long text.
- Broad or repeated demo runs, approving existing work, sending directives to existing projects, or modifying the supplied source profile and workspaces.
- Implementing the proposed designs. The proposals document is for a decision, not a build.
