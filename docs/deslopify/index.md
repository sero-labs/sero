# Deslopify Index

_Last updated: 2026-04-13_

A living map of senior-architect reviews across the Sero codebase. Each
entry links to a `facts.md` and `plan.md` pair.

## cross-cutting baselines/
- [`desktop-packages-plugins/`](./desktop-packages-plugins/plan.md)
  — *In progress — Wave B shared/desktop High items cleared 2026-04-13; plugin review waves pending*

## apps/
- [`apps/desktop/`](./apps/desktop/plan.md)
  — *Wave A–F closeout checklist cleared 2026-04-13; remaining work is tracked only in folder-level follow-up plans outside the Wave F periphery seam*
  - [`apps/desktop/src/components/apps/`](./apps/desktop/src/components/apps/plan.md)
    — *Healthy — shared app/widget mount runtime unified and dashboard/widget coverage added 2026-04-13*
    - [`apps/desktop/src/components/apps/explorer/`](./apps/desktop/src/components/apps/explorer/plan.md)
      — *Wave C review complete — no High items; Medium cleanup pending*
  - [`apps/desktop/src/components/layout/`](./apps/desktop/src/components/layout/plan.md)
    — *Wave C review complete — no High items; Medium cleanup pending*
  - [`apps/desktop/src/components/profiles/`](./apps/desktop/src/components/profiles/plan.md)
    — *Wave C review complete — no High items; Medium cleanup pending*
  - [`apps/desktop/src/hooks/`](./apps/desktop/src/hooks/plan.md)
    — *In progress — core Medium items cleared 2026-04-12; Low cleanup pending*
  - [`apps/desktop/src/lib/`](./apps/desktop/src/lib/plan.md)
    — *Wave A renderer orchestration review complete — plan created 2026-04-12*
  - [`apps/desktop/src/lsp/`](./apps/desktop/src/lsp/plan.md)
    — *In progress — High item cleared 2026-04-12; Medium cleanup pending*
  - [`apps/desktop/src/stores/`](./apps/desktop/src/stores/plan.md)
    — *In progress — selected Medium items cleared 2026-04-12; cap-relief follow-up pending*
  - [`apps/desktop/src/types/`](./apps/desktop/src/types/plan.md)
    — *In progress — selected Medium contract-cleanup items cleared 2026-04-12; remaining drift pending*
  - [`apps/desktop/electron/features/agent/`](./apps/desktop/electron/features/agent/plan.md)
    — *Wave A platform-owner review complete — plan created 2026-04-12*
  - [`apps/desktop/electron/features/apps/`](./apps/desktop/electron/features/apps/plan.md)
    — *Wave A platform-owner review complete — plan created 2026-04-12*
  - [`apps/desktop/electron/features/auth/`](./apps/desktop/electron/features/auth/plan.md)
    — *In progress — High item cleared 2026-04-12; Medium cleanup pending*
  - [`apps/desktop/electron/features/collaboration/`](./apps/desktop/electron/features/collaboration/plan.md)
    — *Wave C review complete — no High items; Medium cleanup pending*
  - [`apps/desktop/electron/features/container/`](./apps/desktop/electron/features/container/plan.md)
    — *Wave A platform-owner review complete — plan created 2026-04-12*
  - [`apps/desktop/electron/features/editor/`](./apps/desktop/electron/features/editor/plan.md)
    — *In progress — High items cleared 2026-04-12; Medium cleanup pending*
  - [`apps/desktop/electron/features/gateway/`](./apps/desktop/electron/features/gateway/plan.md)
    — *In progress — High items cleared 2026-04-12; Medium cleanup pending*
  - [`apps/desktop/electron/features/kanban/`](./apps/desktop/electron/features/kanban/plan.md)
    — *In progress — High settings/contract-ownership items cleared 2026-04-13; Medium workflow cleanup pending*
  - [`apps/desktop/electron/gateway/`](./apps/desktop/electron/gateway/plan.md)
    — *Healthy — generated-only closeout confirmed 2026-04-13*
  - [`apps/desktop/electron/features/onboarding/`](./apps/desktop/electron/features/onboarding/plan.md)
    — *Wave C review complete — no High items; Medium cleanup pending*
  - [`apps/desktop/electron/features/plugins/`](./apps/desktop/electron/features/plugins/plan.md)
    — *Wave A platform-owner review complete — plan created 2026-04-12*
  - [`apps/desktop/electron/features/profile/`](./apps/desktop/electron/features/profile/plan.md)
    — *In progress — High + Medium path/contract items cleared 2026-04-12; Low cleanup pending*
  - [`apps/desktop/electron/features/subagent/`](./apps/desktop/electron/features/subagent/plan.md)
    — *In progress — High items cleared 2026-04-12; Medium cleanup pending*
  - [`apps/desktop/electron/features/vcs/`](./apps/desktop/electron/features/vcs/plan.md)
    — *In progress — High item cleared 2026-04-12; Medium cleanup pending*
  - [`apps/desktop/electron/features/workspace/`](./apps/desktop/electron/features/workspace/plan.md)
    — *In progress — selected Medium reliability items cleared 2026-04-12; cap-pressure cleanup pending*
  - [`apps/desktop/electron/ipc/`](./apps/desktop/electron/ipc/plan.md)
    — *Wave A contracts review complete — plan created 2026-04-12*
  - [`apps/desktop/electron/platform/`](./apps/desktop/electron/platform/plan.md)
    — *Wave A platform-owner review complete — plan created 2026-04-12*
  - [`apps/desktop/electron/preload/`](./apps/desktop/electron/preload/plan.md)
    — *In progress — core Medium items cleared 2026-04-12; typing cleanup pending*
  - [`apps/desktop/electron/shared/`](./apps/desktop/electron/shared/plan.md)
    — *In progress — cached-model Medium item cleared 2026-04-12; modularization cleanup pending*
  - [`apps/desktop/electron/cli/`](./apps/desktop/electron/cli/plan.md)
    — *In progress — High AD-020 boundary typing item cleared 2026-04-13; Medium app-control/router cleanup pending*
  - [`apps/desktop/electron/types/`](./apps/desktop/electron/types/plan.md)
    — *Healthy — narrow Pi SDK augmentation seam reviewed 2026-04-13*

## packages/
- [`packages/app-runtime/src/`](./packages/app-runtime/src/plan.md)
  — *In progress — High boundary typing item cleared 2026-04-13; Medium runtime hardening pending*
- [`packages/common/src/`](./packages/common/src/plan.md)
  — *In progress — no direct High items; shared Kanban contract added 2026-04-13; Medium canonical-contract cleanup pending*

## plugins/
- [`plugins/sero-admin-plugin/`](./plugins/sero-admin-plugin/plan.md)
  — *Wave C exemplar review complete — High host-bridge contract duplication and ownership drift documented 2026-04-13*
- `plugins/sero-alibaba-plugin/`
  — *Phase 0 baseline mapped 2026-04-13; narrow provider-plugin review pending*
- [`plugins/sero-context-plugin/`](./plugins/sero-context-plugin/plan.md)
  — *Wave C host-integrated review complete — High snapshot-truthfulness and UI-action determinism findings documented 2026-04-13*
- [`plugins/sero-cron-plugin/`](./plugins/sero-cron-plugin/plan.md)
  — *Wave C exemplar review complete — High startup-recovery/state-truthfulness findings documented 2026-04-13*
- [`plugins/sero-git-plugin/`](./plugins/sero-git-plugin/plan.md)
  — *Wave C host-integrated review complete — High bridge-contract drift and state-truthfulness findings documented 2026-04-13*
- `plugins/sero-hello-world-plugin/`
  — *Phase 0 baseline mapped 2026-04-13; generated-only scope check pending*
- [`plugins/sero-kanban-plugin/`](./plugins/sero-kanban-plugin/plan.md)
  — *Wave C exemplar review complete — High workflow/runtime alignment findings documented 2026-04-13*
- [`plugins/sero-memory-plugin/`](./plugins/sero-memory-plugin/plan.md)
  — *Wave C exemplar review complete — High cross-plugin cron-state ownership and QMD profile-path drift documented 2026-04-13*
- `plugins/sero-user-feedback-plugin/`
  — *Phase 0 baseline mapped 2026-04-13; Wave C host-integrated review pending*
- [`plugins/sero-web-plugin/`](./plugins/sero-web-plugin/plan.md)
  — *Wave C host-integrated review complete — High state-truthfulness, profile-path drift, and UI-mutation ownership findings documented 2026-04-13*
