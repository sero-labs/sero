# Facts — apps/desktop/electron/features/container

_Last reviewed: 2026-04-12_

## What this code does
This module is Sero’s container runtime layer (AD-018): it manages container lifecycle,
container-executed coding tools (`bash/read/write/edit/browser`), terminal/PTy integration,
port scanning/bridging, HTTP proxying for outbound network access, and registries for dev
servers and artifacts.

## Shape & metrics
- Total files: 26
- Total LOC: 4,751
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
- `ContainerHttpProxy` binds to `0.0.0.0` and acts as a generic CONNECT/HTTP proxy without auth
  (`network/http-proxy.ts:4`, `network/http-proxy.ts:52`, `network/http-proxy.ts:118`).
- Port scanner lifecycle is incomplete: scanner/bridge cleanup is not tied to container
  `stop/remove`, and stale detected ports can persist (`index.ts:161`, `index.ts:268-273`,
  `network/port-forward.ts:98`, `network/port-forward.ts:155`).
- `readOnlyMounts` are documented as read-only but mounted with plain `--volume` (read-write)
  (`core/types.ts:60`, `core/lifecycle.ts:240-242`).
