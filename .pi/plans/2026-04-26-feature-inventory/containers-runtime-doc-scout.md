# Context for: Containers and host-mode runtime docs

## Relevant Files
- `docs/guides/macos-containers.md` — canonical setup guide for Apple Silicon macOS; states containers are strongly recommended, with host mode as a reduced fallback.
- `docs/analysis/host-mode-container-support.md` — product/implementation analysis; clarifies current host-mode behavior, limitations, and recommended wording.
- `docs/analysis/host-mode-container-implementation-checklist.md` — implementation checklist; useful for knowing what has already been wired into onboarding/runtime UX.
- `apps/docs-site/docs/reference/support-scope.md` — public support matrix; authoritative for alpha support statements.
- `apps/docs-site/docs/reference/troubleshooting.md` — public troubleshooting guidance; includes log paths and container/host-mode fixes.
- `apps/docs-site/docs/reference/architecture.md` — high-level runtime positioning; preferred container-backed runtime vs reduced host mode.
- `apps/desktop/electron/main.ts` — boot flow logs container availability, starts container system non-blockingly, starts proxy, cleans up orphaned containers.
- `apps/desktop/electron/features/container/core/availability.ts` — runtime check for container binary/system status; maps missing binary/system unavailable/startup failed.
- `apps/desktop/electron/features/container/core/lifecycle.ts` — container system startup and recovery behavior; errors are non-fatal at boot but matter for docs/troubleshooting.
- `apps/desktop/electron/ipc/container/terminal.ts` — terminal creation chooses container vs host terminal by resolved runtime.
- `apps/desktop/electron/features/workspace/runtime-resolution.ts` — shared runtime decision logic and capability audit for container-only features.
- `apps/desktop/electron/ipc/editor/editor.ts` — editor file/list/exec fallback behavior between container and host.
- `apps/desktop/electron/features/container/tools/tools.ts` — container tool bundle includes browser automation; host fallback tools are coding-only.
- `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx` — UI surface for workspace container toggle and status indicator.
- `apps/desktop/src/components/layout/DevServerPanel.tsx` — dev-server UI surface; relevant only as a discovered host/container-adjacent status surface.
- `apps/desktop/electron/features/onboarding/preflight.ts` — onboarding includes container availability diagnostics and docs URL for setup.

## Project Structure
- Desktop runtime behavior lives in `apps/desktop/electron/**` with IPC handlers split by feature area.
- Shared runtime selection is centralized in `electron/features/workspace/runtime-resolution.ts`; renderer reads runtime state through stores/UI.
- Workspace container enable/disable is per-workspace and surfaced in the workspace tree UI.
- Docs-site public guidance lives under `apps/docs-site/docs/reference/`; repo docs and analysis docs live under top-level `docs/`.

## Conventions
- The codebase frames Apple containers as the preferred path and host mode as fallback, not parity.
- Runtime checks are diagnostic and non-blocking; boot should continue in degraded host mode.
- Capability limitations are described explicitly rather than implied.
- UI toggle text uses plain action verbs: `Disable container (use host)` / `Enable container`.
- Logs are the primary troubleshooting mechanism; docs should point to `/tmp/sero-vite.log`, `/tmp/sero-electron.log`, `/tmp/sero-web-remote-watch.log`, and `/tmp/sero-remote-<plugin>.log`.

## Dependencies
- Apple `container` CLI at `/usr/local/bin/container` is the runtime prerequisite.
- Container image name is `sero-node:latest`.
- Container system state is checked with `container system status` and started with `container system start`.
- Support scope is macOS on Apple Silicon only; Linux and Windows are explicitly out of scope.

## Key Findings
- Preferred story: Apple containers are strongly recommended for full functionality; host mode is a supported reduced fallback.
- Safe public setup steps to mention: install Apple container CLI, verify `/usr/local/bin/container --help`, run `/usr/local/bin/container system status`, start it if needed, and ensure `sero-node:latest` is rebuilt after Dockerfile/tool changes.
- Host mode supports core chat, onboarding/provider setup, host file access, host-shell development, and some editor/agent fallback flows.
- Host mode does **not** provide browser automation, containerized language servers, managed preview/dev-server automation parity, Linux/container networking semantics, or full container isolation.
- Source-confirmed UI surfaces: workspace tree has a per-workspace container toggle and a status dot; terminal creation resolves to host terminal when runtime is host; dev-server UI exists but is not a host-mode parity promise.
- Boot behavior is intentionally non-blocking if containers are unavailable; app continues and logs degraded availability.
- Onboarding preflight already computes container runtime state and links to the macOS containers guide when unavailable.

## Gotchas
- Do not claim full host/container parity; editor writes/exec and some features may still be container-biased in certain paths.
- Do not claim Linux or Windows support.
- Do not describe containers as a hardened security boundary or multi-tenant sandbox guarantee beyond current alpha wording.
- Do not promise managed dev-server automation or browser tooling in host mode.
- Avoid saying dev-server or proxy/cleanup is fully automatic/reliable in all setups; docs should frame it as supported behavior with troubleshooting.
- Distinguish “container unavailable” from “workspace explicitly opted into host mode” in wording.
