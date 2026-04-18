# Deslopify Index

_Last updated: 2026-04-18_

A living map of senior-architect reviews across the Sero codebase. Each
entry links to a `facts.md` and `plan.md` pair.

Final closeout mode (2026-04-16): the active deslopify wave is now complete.
[`docs/deslopify/outstanding.md`](./outstanding.md) records **zero active
closeout items**; any remaining non-Healthy folder notes below should be read
as backlog-only follow-ups, not active refactor-wave work.

## cross-cutting baselines/
- [`desktop-packages-plugins/`](./desktop-packages-plugins/plan.md)
  — *Healthy — Wave B shared/desktop High items, Wave D plugin High batches, all code-bearing Wave F follow-up, the documented no-op closeouts for `apps/desktop/electron/{types,gateway}`, and the deferred Low-polish tracker closeout were all completed by 2026-04-16*

## apps/
- [`apps/desktop/`](./apps/desktop/plan.md)
  — *Wave A–F closeout checklist cleared 2026-04-13; remaining work is tracked only in folder-level follow-up plans outside the Wave F periphery seam*
  - [`apps/desktop/src/components/apps/`](./apps/desktop/src/components/apps/plan.md)
    — *Healthy — shared app/widget mount runtime unified and dashboard/widget coverage added 2026-04-13*
    - [`apps/desktop/src/components/apps/explorer/`](./apps/desktop/src/components/apps/explorer/plan.md)
      — *Healthy — explorer folder plan fully executed 2026-04-14*
  - [`apps/desktop/src/components/layout/`](./apps/desktop/src/components/layout/plan.md)
    — *Healthy — layout folder plan fully executed 2026-04-15*
  - [`apps/desktop/src/components/profiles/`](./apps/desktop/src/components/profiles/plan.md)
    — *Healthy — profile folder plan fully executed 2026-04-15*
  - [`apps/desktop/src/hooks/`](./apps/desktop/src/hooks/plan.md)
    — *Healthy — hooks folder plan fully executed 2026-04-15*
  - [`apps/desktop/src/lib/`](./apps/desktop/src/lib/plan.md)
    — *Healthy — folder plan fully executed 2026-04-15 (High/Medium/Low tracked items cleared)*
  - [`apps/desktop/src/lsp/`](./apps/desktop/src/lsp/plan.md)
    — *Healthy — folder plan fully executed 2026-04-15 (Low protocol-shape follow-up cleared)*
  - [`apps/desktop/src/stores/`](./apps/desktop/src/stores/plan.md)
    — *Healthy — folder plan fully executed 2026-04-15 (Low selector-churn follow-up cleared)*
  - [`apps/desktop/src/types/`](./apps/desktop/src/types/plan.md)
    — *Healthy — Medium IpcChannels and all tracked Low follow-ups (declaration-hygiene, comment/default drift, user-feedback revalidation) cleared 2026-04-15*
  - [`apps/desktop/electron/features/agent/`](./apps/desktop/electron/features/agent/plan.md)
    — *Healthy — Medium image-agent type hygiene plus Low legacy bridge/comment cleanup cleared 2026-04-16*
  - [`apps/desktop/electron/features/apps/`](./apps/desktop/electron/features/apps/plan.md)
    — *Healthy — final plugin-metadata discovery closeout cleared 2026-04-16; remaining host/plugin boundary, extension-factory split, and listener-unsubscribe follow-ups are backlog-only*
  - [`apps/desktop/electron/features/auth/`](./apps/desktop/electron/features/auth/plan.md)
    — *Healthy — High, both Medium, and all tracked Low follow-ups (helper dedupe + profile-scoped guidance) cleared 2026-04-15*
  - [`apps/desktop/electron/features/collaboration/`](./apps/desktop/electron/features/collaboration/plan.md)
    — *Healthy — both Medium items plus all tracked Low follow-ups (shared runner + required-agent preflight) cleared 2026-04-16*
  - [`apps/desktop/electron/features/container/`](./apps/desktop/electron/features/container/plan.md)
    — *In progress — both High items plus the `readOnlyMounts` Medium contract fix cleared 2026-04-16; tool dedupe / near-cap / dead-metrics follow-ups remain*
  - [`apps/desktop/electron/features/editor/`](./apps/desktop/electron/features/editor/plan.md)
    — *Healthy — High, both Medium, and the Low install-policy follow-up all cleared 2026-04-16*
  - [`apps/desktop/electron/features/gateway/`](./apps/desktop/electron/features/gateway/plan.md)
    — *Healthy — High plus all tracked Medium/Low follow-ups (request-validation guards, non-destructive cost-config loading, Discord subscription seam, static-file cache, and SPA ownership decision) cleared 2026-04-16*
  - [`apps/desktop/electron/features/kanban/`](./apps/desktop/electron/features/kanban/plan.md)
    — *Healthy — High and Medium workflow/runtime-owner cleanup cleared 2026-04-14; Low dead-scaffolding follow-up pending*
  - [`apps/desktop/electron/gateway/`](./apps/desktop/electron/gateway/plan.md)
    — *Healthy — generated-only no-op closeout confirmed 2026-04-14*
  - [`apps/desktop/electron/features/onboarding/`](./apps/desktop/electron/features/onboarding/plan.md)
    — *Healthy — Medium/Low onboarding cleanup fully executed 2026-04-16*
  - [`apps/desktop/electron/features/plugins/`](./apps/desktop/electron/features/plugins/plan.md)
    — *Healthy — both original High items plus deterministic source-build prep and uninstall-path symmetry were cleared by 2026-04-16; split/diagnostic follow-ups are backlog-only*
  - [`apps/desktop/electron/features/profile/`](./apps/desktop/electron/features/profile/plan.md)
    — *In progress — High + Medium path/contract items cleared 2026-04-12; Low cleanup pending*
  - [`apps/desktop/electron/features/subagent/`](./apps/desktop/electron/features/subagent/plan.md)
    — *In progress — High + both Medium items cleared 2026-04-16; Low loader-comment cleanup pending*
  - [`apps/desktop/electron/features/vcs/`](./apps/desktop/electron/features/vcs/plan.md)
    — *In progress — High item plus all Medium follow-ups (filesystem checkpoint-source/shared-contract/host-transport/modularization) cleared 2026-04-16; Low checkpoint-description follow-up remains*
  - [`apps/desktop/electron/features/workspace/`](./apps/desktop/electron/features/workspace/plan.md)
    — *In progress — selected Medium reliability items cleared 2026-04-12; cap-pressure cleanup pending*
  - [`apps/desktop/electron/ipc/`](./apps/desktop/electron/ipc/plan.md)
    — *Healthy — Group 1 IPC contract hardening fully executed 2026-04-16*
  - [`apps/desktop/electron/platform/`](./apps/desktop/electron/platform/plan.md)
    — *Healthy — Group 1 platform boundary hardening fully executed 2026-04-16*
  - [`apps/desktop/electron/preload/`](./apps/desktop/electron/preload/plan.md)
    — *Healthy — preload contract and typing cleanup fully executed 2026-04-16*
  - [`apps/desktop/electron/shared/`](./apps/desktop/electron/shared/plan.md)
    — *Healthy — settings hardening and shared-boundary cleanup fully executed 2026-04-16*
  - [`apps/desktop/electron/cli/`](./apps/desktop/electron/cli/plan.md)
    — *Healthy — 2026-04-18 platform hardening landed for app/plugin command hot-update truthfulness plus enforced host/plugin compatibility; the remaining Google integration/re-review work is tracked separately in `plugins/sero-google-plugin/`*
  - [`apps/desktop/electron/types/`](./apps/desktop/electron/types/plan.md)
    — *Healthy — narrow Pi SDK augmentation seam reviewed 2026-04-13 and no-op closeout confirmed 2026-04-14*

## packages/
- [`packages/app-runtime/src/`](./packages/app-runtime/src/plan.md)
  — *Healthy — High boundary typing plus Medium runtime hardening/coverage work cleared 2026-04-14*
- [`packages/common/src/`](./packages/common/src/plan.md)
  — *Healthy — shared model/provider contract cleanup and focused coverage landed 2026-04-14*

## plugins/
- [`plugins/sero-admin-plugin/`](./plugins/sero-admin-plugin/plan.md)
  — *Healthy — High bridge duplication plus E3/E5 session, refresh, dead-code, and coverage cleanup all cleared 2026-04-14*
- `plugins/sero-alibaba-plugin/`
  — *Phase 0 baseline mapped 2026-04-13; narrow provider-plugin review pending*
- [`plugins/sero-cron-plugin/`](./plugins/sero-cron-plugin/plan.md)
  — *Healthy — High persisted-state/startup-recovery items plus E4 reminder ownership and E5 logging/modularization/UI coverage cleanup all cleared 2026-04-14; Low widget-fidelity polish remains deferred*
- [`plugins/sero-git-plugin/`](./plugins/sero-git-plugin/plan.md)
  — *Healthy — High contract + state items plus E4/E5 live-query, file-splitting, and UI-coverage cleanup cleared 2026-04-14; Low helper dedupe follow-up pending*
- [`plugins/sero-google-plugin/`](./plugins/sero-google-plugin/plan.md)
  — *In progress — Phases 0–9 code/integration work completed 2026-04-18 after integrating the landed core-platform hardening from PR #146; broader migration-level final verification still remains pending*
- [`plugins/sero-kanban-plugin/`](./plugins/sero-kanban-plugin/plan.md)
  — *Healthy — High persisted-state/truthfulness items plus E4 cleanup-warning visibility and E5 settings/UI cleanup cleared 2026-04-14*
- [`plugins/sero-memory-plugin/`](./plugins/sero-memory-plugin/plan.md)
  — *Healthy — High cron-contract + QMD path work, E4 migration/logging cleanup, and Medium test-surface coverage all cleared 2026-04-14; Low `memory-tool.ts` split remains deferred*
- [`plugins/sero-user-feedback-plugin/`](./plugins/sero-user-feedback-plugin/plan.md)
  — *Healthy — High questionnaire-parity/onboarding items plus E3 transport ownership and E5 state-machine coverage/file-splitting cleanup cleared 2026-04-14; Low bridge-failure visibility follow-up pending*
- [`plugins/sero-web-plugin/`](./plugins/sero-web-plugin/plan.md)
  — *Healthy — High state/path/ownership work plus E3 focused extension coverage and E5 provider/module splitting cleared 2026-04-14; Low config-loader dedupe follow-up pending*
