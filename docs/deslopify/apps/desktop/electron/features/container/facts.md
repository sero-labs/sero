# Facts — apps/desktop/electron/features/container

_Last reviewed: 2026-04-16_

## What this code does
This module is Sero’s container runtime layer (AD-018): it manages container lifecycle,
container-executed coding tools (`bash/read/write/edit/browser`), terminal/PTy integration,
port scanning/bridging, HTTP proxying for outbound network access, and registries for dev
servers and artifacts.

## Shape & metrics
- Total files: 26
- Total LOC: 4,899
- Largest file: `apps/desktop/electron/features/container/tools/tools-browser-agent.ts` (483 LOC)
- Files over 500 LOC: none
- Near-cap files (≥440 LOC):
  - `apps/desktop/electron/features/container/tools/tools-browser-agent.ts` (483)
  - `apps/desktop/electron/features/container/tools/tools-host.ts` (460)
  - `apps/desktop/electron/features/container/core/lifecycle.ts` (454)
  - `apps/desktop/electron/features/container/tools/tools-coding.ts` (444)
- External dependencies of note:
  - Apple container CLI (`/usr/local/bin/container`)
  - `node-pty` terminal bridge
  - Pi SDK tool/session interfaces
  - shared media helpers and CLI bridge (`sero-cli`)
- Upstream callers:
  - container feature imported from ~24 desktop files
  - `createContainerTools` consumed by agent/subagent runtime
  - singleton used through `shared/infra/shared-infra.ts`
- Downstream dependencies:
  - `electron/ipc/container/**`, `electron/ipc/editor/**`, `electron/ipc/agent/**`
  - renderer dev-server/terminal/container state UIs via IPC

## Architectural notes
- This module is the execution boundary for AD-018 and is tightly coupled to agent/tool reliability.
- Memory file protection is intentionally implemented at tool layer (`memory-file-guard.ts`) to
  enforce memory-tool usage over direct filesystem writes.
- Host fallback tools (`tools-host.ts`) intentionally mirror container tool behavior, but currently
  duplicate most of `tools-coding.ts` logic.

## Surprising discoveries
- The 2026-04-12 High proxy finding had already partially drifted by execution time: the proxy now prefers binding the container gateway IP and already blocked some local/private clients + targets, so the real remaining risk was fallback `0.0.0.0` exposure plus host-loopback reuse.
- The 2026-04-12 lifecycle finding had also partially drifted: `ContainerManager.stop/remove()` already called `stopScanning()`, but teardown still did not await in-flight scans or aggressively clear stale bridge/detected-port state on failures.
- `readOnlyMounts` were still documented as read-only but mounted with plain `--volume` (read-write) until this fix pass.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 26 (was 26)
- Total LOC: 4,899 (was 4,751)
- Largest file: `apps/desktop/electron/features/container/tools/tools-browser-agent.ts` (483 LOC)
- Files over 500 LOC: none (was none)
- Type escape hatches remaining: none detected in `apps/desktop/electron/features/container/**/*.ts`

### What changed
- Tightened `ContainerHttpProxy` so only container-subnet clients are allowed, local/private targets remain blocked for CONNECT + HTTP forwarding, and fallback `0.0.0.0` binds now log the stricter allowlist mode; added focused proxy regression coverage.
- Reworked `PortScanner` teardown around an awaited in-flight scan promise so interval/trigger scans coalesce per workspace, stop/dispose waits for bridge cleanup, and failed `ss` scans clear stale detected ports while killing tracked bridges. `ContainerManager` + graceful shutdown now await that cleanup.
- `createFreshContainer()` now mounts `readOnlyMounts` with `:ro`, restoring the `ContainerConfig` contract and locking the generated `container run` arguments with a focused lifecycle test.
- Added focused container tests for proxy subnet/target guards, bridge teardown on failed/aborted scans, and lifecycle mount wiring.

### Still outstanding
- Host/container coding tools still duplicate large read/write/edit/bash flows between `tools/tools-coding.ts` and `tools/tools-host.ts`.
- Near-cap files remain: `tools/tools-browser-agent.ts` (483), `tools/tools-host.ts` (460), `core/lifecycle.ts` (454), `tools/tools-coding.ts` (444).
- `metricsByWorkspace` in `tools/tools-browser-agent.ts` is still write-only dead state.
