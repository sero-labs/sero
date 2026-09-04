# [Epic] Web-Remote Alignment & Phased Rollout

Tracking issue for modernising `apps/web-remote` to match the desktop renderer (look, layout, `@sero-ai/ui` tokens and primitives) and delivering the `web-remote` roadmap on that base.

Epic issue: #493. Full audit with per-issue decisions: `openspec/changes/web-remote-alignment/issue-audit.md`.

## Goal

- Web-remote uses the same shell dimensions, sidebar tree, chat header, message renderer, tool group, composer and status tokens as the desktop app.
- Every roadmap issue (#253–#262) ships on top of that base, using `@sero-ai/ui` primitives and AI elements rather than custom components.
- Scoped web tokens never receive data or events outside their workspaces.

## Non-goals

- Theme presets over the gateway.
- Extracting desktop components into `@sero-ai/ui`.
- Remote git push, amend, discard and stash (commit ships in #498).
- Desktop notification feed UI (only the IPC surface is exposed).

## Architecture decisions

| ID | Decision |
| --- | --- |
| D-G1 | Shared package is `@sero-ai/ui`. AI elements come from `@sero-ai/ui/ai-elements/*`. |
| D-G2 | Desktop renderer is the source of truth; prototypes `agent-node-aligned` and `tool-call-group-expanded` confirm the conventions. System font stack, no Inter. |
| D-G3 | No new shared abstractions. Copy desktop markup for hand-rolled surfaces (session rows, tool group shell, board card). |
| D-G4 | Every protocol change lands on both sides (`protocol*.ts`, `extended-handlers.ts`, `gateway-client.ts`, store, tests) in one PR. |
| D-G5 | New workspace-bound events use a `hasWorkspaceAccess` broadcast helper, not the session-only `broadcastGatewayEvent`. |
| D-G6 | Renderer state persists in IndexedDB via the `token-storage.ts` pattern. No `localStorage`. |
| D-A3 | Markdown renders through `MessageResponse` (Streamdown). `react-markdown` and `rehype-highlight` are removed. |
| D-C3 | Tool calls: desktop `ToolCallGroup` shell + `ai-elements/tool` items. |
| D-C5 | Composer: `PromptInput` family + `Attachments`. No model selector (no gateway request). |
| D-255-5 | Build switches from a single inlined chunk to hashed multi-chunk output (needed by module federation and the service worker). |
| D-256-1 | Diffs render with `ai-elements/code-block` (`language="diff"`) and `ai-elements/commit` file rows. No `@pierre/diffs` dependency. |
| D-258-1 | Usage is "since desktop start" (in-memory `CostTracker`). |
| D-259-1 | #259 splits into host service (#259) and web UI (#499). |
| D-256b-1 | Remote commit ships as #498: owner tokens only, selected paths, confirm dialog, no push. |
| D-260-1 | Board is the landing view when the token can see more than one workspace or session; otherwise chat. |
| D-262-1 | Upload is owner-token only in the first iteration. |
| D-255-1 | #255 splits into phase 1 (#255) and interactive phase 2 (#497). |

## Product decisions (resolved)

- [x] #260: board is the landing view when the token can see more than one workspace or session, otherwise chat.
- [x] #256: remote commit is wanted. It ships as #498 after the read-only panel.
- [x] #262: upload is owner-token only in the first iteration.
- [x] D-G3: desktop markup is copied into web-remote; extraction into `@sero-ai/ui` is revisited after the epic.

## Phased rollout

### Phase 1: Theming & Foundations

Sequential. Blocks everything else.

- #494 `web-remote: theme and token parity foundation` (theme store, Streamdown, status tokens, prototype for UX review).
- D-255-5 build change (hashed multi-chunk output, `static-files.ts` update). Ships inside #494.

Exit: light and dark render correctly, markdown styled, no palette colours, prototype reviewed.

### Phase 2: Core Components & Layout

#495 and #496 run in parallel with #253. Both UI issues depend on #494.

- #495 `web-remote: shell and sidebar parity` (TitleBar `h-10`, StatusBar `h-6`, resizable sidebar 20%/200px, workspace tree, session rows, APPS rows, activity rail, `list_sessions` metadata).
- #496 `web-remote: conversation and composer parity` (`Message`/`MessageResponse`, `Reasoning`, tool group, `PromptInput`, chat header `h-9`).
- #253 session state and turn-completion events (backend; UI checkbox lands in #495's `SessionRow`).

Exit: web-remote is visually aligned with the desktop for the existing feature set; `session_state` and `turn_complete` reach scoped clients correctly.

### Phase 3: Parallel Feature Delivery

All items below can start once their listed blockers are merged. Independent tracks are safe to assign to different people.

| Track | Issue | Blocked by | Parallel with |
| --- | --- | --- | --- |
| Attention | #254 choice prompts | #253, #496 | everything else |
| Attention | #259 notification feed (host) | #253 | everything else |
| Attention | #499 notification bell + feed (web) | #259, #495 | #254, #260 |
| Control | #260 session board | #253, #495 | #254, #259 |
| Control | #257 cross-session search | #495 | all |
| Control | #258 usage badge | #496 | all |
| Workspace | #256 git changes panel | #495, #253 (refetch) | all |
| Workspace | #498 commit from the phone | #256 | all |
| Workspace | #262 upload files (minus share target) | #495 | all |
| Plugins | #255 remote widgets phase 1 | #494 (build), #495 (APPS row) | all |
| Plugins | #497 interactive widgets | #255 | all |

Exit: each issue's acceptance criteria pass on a phone over Tailscale with an owner token and a scoped token.

### Phase 4: Integration & Visual Regression

- #261 PWA + Web Push (blocked by #259, D-255-5).
- #262 share-target route (blocked by #261).
- Visual regression: Playwright screenshots of web-remote at 1100×760 and 1440×900 (desktop) and 390×844 (mobile) in light and dark, compared with the desktop app screenshots in `apps/styleguide/public/prototypes/screenshots/`.
- Docs: update `apps/docs-site/docs/guide/remote-control.md` screenshots and feature list; scoping notes in `reference/security-privacy.md`.
- Bundle size and cold-load check on mobile after Streamdown, federation runtime and SW.

Exit: screenshots match, docs updated, installable PWA with push on iOS and Android.

## Execution graph

```mermaid
graph LR
  A[#494 theme + build] --> B[#495 shell + sidebar]
  A --> C[#496 conversation + composer]
  P253[#253 session state] --> P254[#254 choice prompts]
  C --> P254
  P253 --> P259[#259 feed host]
  P259 --> P259b[#499 feed web]
  B --> P259b
  P253 --> P260[#260 board]
  B --> P260
  B --> P257[#257 search]
  C --> P258[#258 usage]
  B --> P256[#256 git changes]
  P256 --> P256b[#498 commit]
  B --> P262[#262 upload]
  A --> P255[#255 widgets p1]
  B --> P255
  P255 --> P255b[#497 widgets p2]
  P259 --> P261[#261 PWA + push]
  A --> P261
  P261 --> P262s[#262 share target]
  P260 --> VR[Phase 4 visual regression + docs]
  P256 --> VR
  P262 --> VR
```

Hard dependencies are the arrows. Everything without an arrow between them runs in parallel. #253 has no UI dependency and can start on day one alongside #494.

## Master progress checklist

Phase 1
- [ ] #494 theme and token parity foundation
- [ ] D-255-5 hashed multi-chunk build + `static-files.ts`
- [ ] Prototype `web-remote-aligned` reviewed

Phase 2
- [ ] #495 shell and sidebar parity
- [ ] #496 conversation and composer parity
- [ ] #253 session state and turn-completion events
- [ ] Milestone: existing feature set visually aligned with desktop

Phase 3
- [ ] #254 answer choice prompts
- [ ] #259 notification feed (host service + protocol)
- [ ] #499 notification bell and feed (web)
- [ ] #260 session board
- [ ] #257 cross-session search
- [ ] #258 usage badge
- [ ] #256 git changes panel
- [ ] #498 commit from the phone
- [ ] #262 upload files (Files panel + drag-drop)
- [ ] #255 remote widgets phase 1
- [ ] #497 interactive widgets
- [ ] Milestone: all Phase 3 acceptance criteria pass with owner and scoped tokens

Phase 4
- [ ] #261 installable PWA with Web Push
- [ ] #262 share-target route
- [ ] Visual regression suite green (light + dark, desktop + mobile)
- [ ] Docs updated (`remote-control.md`, `security-privacy.md`)
- [ ] Milestone: epic complete

## Issue grooming actions

| Issue | Action |
| --- | --- |
| #253 | Keep. Edit: add event shapes, workspace-filtered broadcast helper, UI checkbox blocked by #495. |
| #254 | Keep. Edit: card placement copies desktop `PendingQuestionCard`; global questions owner-only. |
| #255 | Split: phase 2 → #497. Edit: add build prerequisite D-255-5 and grid/glass-tile decisions. |
| #256 | Keep. Edit: `code-block` + `commit` primitives replace the diff-library question; truncation cap 200 KB. |
| #257 | Keep. Edit: client-side tier 1, 300 ms debounce, scan bounds. |
| #258 | Keep. Edit: resolve to "since desktop start"; `SessionBadge` popover in the chat header. |
| #259 | Split: web UI → #499. Edit: JSONL cap, owner-only global notifications. |
| #260 | Keep. Edit: landing-view rule D-260-1; `BoardCard` styling. |
| #261 | Keep. Edit: hand-written `public/sw.js`, depends on hashed build; `share_target` in manifest. |
| #262 | Keep. Edit: owner-only, `uploads/` default, auto-suffix, 20 MB cap; share target blocked by #261. |
| #494/B/C, #497, #498, #499 | File as new issues with the `web-remote` label and link them above. |
