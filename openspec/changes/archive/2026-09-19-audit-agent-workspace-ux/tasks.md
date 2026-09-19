## 1. Reconcile scope and prepare a safe capture

- [x] 1.1 Replace the rejected interactive-annotation scope in the proposal, design and delta spec with static evidence and static proposal documents. Verify no artifact still requires pins, rectangles, review persistence or save/load.
- [x] 1.2 Inventory the existing content in `seroarchitectdev`: nine Architect projects with their phases, overlays, caps and blocked reasons; the Workflow list per workspace with its statuses; every Room and its status. Verify the source files are unchanged afterwards.
- [x] 1.3 Build an isolated capture home from a copy of the profile, excluding the browser profile, logs and debug output, with `profiles.json` pointed at the copy. Verify the copy launches and that the source profile is untouched.
- [x] 1.4 Establish the no-spend capture mode: launch with `SERO_ARCHITECT=0`, `SERO_ROOMS=0`, `SERO_GOALS=0` and confirm the pages still render real recorded state. Verify no record in the copy is written during a run.

## 2. Evidence capture

- [x] 2.1 Add a gated capture spec and helpers beside the existing desktop E2E suite, reusing the Electron launch, shell and selector helpers. Verify the spec is skipped without `SERO_E2E_UX_AUDIT=1` and that the paid documentation specs are not run.
- [x] 2.2 Make navigation verifiable: deep-link where the app honours it, otherwise open the tab, click the row and read the heading back. Verify that a frame is labelled with the screen it actually shows, and that a control that is missing records a gap instead of retrying.
- [x] 2.3 Capture Architect: the projects list, the intake dialog, all nine project pages with their scrolled sections and expanded disclosures, the project controls menu, model settings and the run inspector. Verify each project page shows a different project.
- [x] 2.4 Capture Orchestrator: Home, Workflows, Rooms, Goals, Library and Catalog, the create-workflow describe screen, and workflow detail pages across four workspaces with their map, details, context, delivery, tuning, reflection, skill, attempt-history and selected-step views.
- [x] 2.5 Capture Rooms across every workspace that holds them: the list populated and empty, the brief screen, and each Room's timeline, watch and result views, all five activity filters, all five detail tabs, the roster and both member tabs.
- [x] 2.6 Capture Workspaces: the tree, the add menu, the workspace context menu, selecting a second workspace, and cross-app navigation into and back out of another workspace's Orchestrator.
- [x] 2.7 Capture a narrow desktop width for the pages whose layout changes, and a `prefers-reduced-motion` pass for the states that lean on animation.
- [x] 2.8 Deduplicate the register by image hash, mark duplicate rows, and check every remaining image for a blank frame, a wrong state or private content. Verify the published set contains no credential, token or unintended personal path.
  - Result: 374 captured, 66 duplicate, 36 gaps. The register ids, the files on disk and the frames in the document all agree at 374, with no orphan and no missing file. No frame is blank: the smallest is 23.8 KB, and it is the genuinely empty Goals page. No credential, API key or bearer token appears in either document or in any frame. One personal path does appear: the shell status bar prints the workspace path `/Users/danielcarter/Projects/<workspace>` in nearly every frame, and the profile name `SeroArchitectDev` sits in the title bar. Both are left in place, because the documents are repo-local styleguide pages and the repo already carries the same identity.
- [x] 2.9 Record the transition-evidence position honestly: with the runtimes disabled nothing changed during capture, so every activity transition is an explicit gap with that reason. Decide with the user whether any transition earns a bounded live run.
  - Result: every frame is a still of recorded state. `SERO_ARCHITECT=0`, `SERO_ROOMS=0` and `SERO_GOALS=0` meant no owner woke and no event was delivered, so no before/after pair was captured and no transition is evidenced. Each activity transition is a gap for that one reason. This set cannot show that the real event-delivery path works. The decision on a bounded live run is open and belongs to the user.
- [x] 2.10 If a named gap needs live execution, verify `openai-codex/gpt-5.6-luna:high` for every participant, set cost, time and attempt bounds and a stop condition, then record purpose, effective models, duration and cost. If no run is needed, record that outcome.
  - Result: no run was made. Every state in this audit came from records the profile already held, so no model was called at any tier. Actual cost of the capture is zero. The paid-only states that stayed out of reach are Workflow planning in progress, and the Room proposal, adjust and draft-review screens; each is recorded as a gap.

## 3. Evidence and proposal documents

- [x] 3.1 Write `evidence.html` under `apps/styleguide/public/prototypes/agent-workspace-ux-audit/`, in the style of `sero-design-library-plugin.html`: numbered states, a short note naming the observed problem, and the captured frame. Verify it lists the gaps and does not contain a proposed design.
  - Result: 374 numbered frames grouped by area, each with its page, state and register id, and an observed note where one was authored. The gap and duplicate table closes the document. It holds no proposed design.
- [x] 3.2 Write `proposals.html` in the same style: numbered static mockups drawn with the product's current tokens and density, covering excess text, agent instructions as headings, repeated descriptions, card and panel density, empty and not-yet-generated states, data-state distinctions, activity and progress, decision prominence, and progressive disclosure. Verify no control implies unsupported behaviour.
  - Result: ten numbered static states in the product's own tokens, with the rules they follow stated at the top. Nothing is interactive and no control implies behaviour the product does not have.
- [x] 3.3 Copy the published frames to `apps/styleguide/public/prototypes/screenshots/agent-workspace-ux-audit/` and add both documents to `interactivePrototypes` in `apps/styleguide/src/PrototypeArchive.tsx`. Verify both routes open through the styleguide server.
  - Result: 374 webp frames published, 24.1 MB. Both entries are in `interactivePrototypes` and both routes serve 200.

## 4. Delivery checks

- [x] 4.1 Check both documents at two desktop widths through the served URL. Verify text does not clip, frames are legible, and the archive links resolve.
  - Result: proposals 200 at 1600 (7648px) and at 1180 (7689px); evidence 200 at 1600 (77066px). No page error, no failed request, and no horizontal overflow at either width.
- [x] 4.2 Run `pnpm --filter @sero/styleguide build`, `git diff --check` and root `pnpm typecheck`. Verify no production UI or runtime edit entered the diff and no source file exceeds 500 lines.
  - Result: styleguide build exit 0, `git diff --check` clean, root `pnpm typecheck` passes. The largest new source file is 260 lines. The only tracked edit outside the OpenSpec change is the two archive entries in `PrototypeArchive.tsx`; no production UI, IPC, runtime or SDK file was touched.
- [x] 4.3 Deliver the two styleguide routes, the coverage summary with captured, duplicate and gap counts, the capture provenance and its known limits, any run costs, and the remaining gaps. Verify the temporary capture home is removed and the source profile and workspaces are unchanged.
  - Result: the source profile `seroarchitectdev` and every workspace `.sero` directory are unchanged; a check for files written during the capture window returned nothing. The temporary capture home is still on disk at `<session scratchpad>/audit-home`, because the delete was refused by the permission prompt. It is outside the repository, and `rm -rf` on that one path clears it.
