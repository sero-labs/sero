# Refactoring Plan — apps/desktop/electron/features/container

_Plan drafted: 2026-04-12_

## Executive Summary
Container runtime coverage is comprehensive, but this layer now carries meaningful reliability and
security debt for a critical AD-018 boundary. The most urgent issues are an unauthenticated host
proxy surface, incomplete port-scanner/bridge lifecycle cleanup, and mount-permission semantics
that do not match declared intent. The plan prioritizes securing network exposure and stabilizing
runtime cleanup before broader maintainability refactors.

## Issues Found (prioritized)
- **High** — ~~Container HTTP proxy is an unauthenticated open proxy bound on all host interfaces —
  `apps/desktop/electron/features/container/network/http-proxy.ts:4`,
  `apps/desktop/electron/features/container/network/http-proxy.ts:52`, and
  `apps/desktop/electron/features/container/network/http-proxy.ts:118` expose CONNECT + HTTP forwarding on
  `0.0.0.0` with no auth/allowlist. This is a real security surface beyond container-only traffic.~~ ✅ 2026-04-16 (`d58ddc0e`) — execution-time drift: the proxy had already been partially tightened since the 2026-04-12 review (gateway bind preference + basic client/target filtering), so this pass closed the remaining host-loopback/fallback exposure and added focused regression coverage. Effort: **M**.

- **High** — ~~Port scanning/bridge lifecycle leaks can leave stale port state and orphan bridge processes —
  scanning starts in `apps/desktop/electron/features/container/index.ts:161`, but container
  `stop/remove` (`index.ts:268-273`) do not stop scanning. `PortScanner.stopScanning` only clears timers
  (`network/port-forward.ts:98`) and bridge "cleanup" only drops in-memory flags (`network/port-forward.ts:155`)
  without killing bridge processes created at `network/port-forward.ts:172`. This risks stale UI state,
  background churn, and lingering bridge listeners.~~ ✅ 2026-04-16 (`d58ddc0e`) — execution-time drift: `ContainerManager.stop/remove()` already called `stopScanning()`, so the real remaining gap was awaited in-flight scan/bridge teardown plus stale-state reset on scan failures. Effort: **M**.

- **Medium** — ~~`readOnlyMounts` contract is not enforced in lifecycle implementation —
  type contract says read-only (`core/types.ts:60`), but lifecycle mounts with plain
  `--volume ${hostDir}:${hostDir}` (`core/lifecycle.ts:240-242`) same as writable mounts.
  This violates module intent and weakens mount-boundary guarantees.~~ ✅ 2026-04-16 (`43318f6b`) — `createFreshContainer()` now mounts additional read-only paths with `:ro`, and a focused lifecycle regression test locks the generated `container run` arguments. Effort: **S**.

- **Medium** — Host and container coding tools duplicate large logic blocks, increasing drift risk —
  parallel implementations in `tools/tools-coding.ts:97-442` and `tools/tools-host.ts:174-460`
  duplicate truncation, fuzzy edit, memory-guard checks, and read/write/edit formatting.
  Fixes in one path can silently diverge from the other. Effort: **L**.

- **Medium** — Multiple core files are near the 500 LOC cap —
  `tools/tools-browser-agent.ts:1-483`, `tools/tools-host.ts:1-460`,
  `core/lifecycle.ts:1-454`, `tools/tools-coding.ts:1-444`. This area is one feature wave away
  from hard cap violations. Effort: **M**.

- **Low** — Browser metrics map is write-only dead state —
  `tools/tools-browser-agent.ts:15` is updated (`:302`, `:306`) but never read/exported,
  adding noise without operational value. Effort: **S**.

## Proposed Refactoring
1. **Harden proxy exposure first.**
   - Restrict proxy bind scope (container-reachable interface only), add destination safeguards,
     and optionally require an internal token/header for use.
   - Add startup logging that clearly reports effective bind address and risk mode.

2. **Fix scanner/bridge lifecycle coupling.**
   - On container `stop/remove`, call scanner stop + bridge teardown for that workspace.
   - Extend `PortScanner` to track bridge PIDs and kill them when ports disappear or scans stop.
   - Clear detected-port cache on repeated scan failure so UI reflects actual state.

3. **Align mount semantics with declared contract.**
   - Either enforce read-only mounts in lifecycle command construction, or rename the type/field
     to reflect actual behavior and update all callsites/docs.
   - Keep AD-018 trust boundaries explicit in type-level naming and implementation.

4. **Extract shared coding-tool core for host/container parity.**
   - Create a transport-agnostic tool core (read/write/edit/bash behavior) and inject execution/path
     adapters for host vs container.
   - Preserve current response shape so upstream agent behavior does not regress.

5. **Pre-emptively split near-cap files.**
   - `tools-browser-agent.ts`: split install/bootstrap, action handlers, and response formatting.
   - `core/lifecycle.ts`: split system management, ghost recovery, create/inspect operations.
   - Keep module APIs narrow and test-friendly.

6. **Prune dead metrics or wire them to observability.**
   - Remove `metricsByWorkspace` if unused, or publish it through debug/status endpoints.

## Benefits & Trade-offs
- Benefits: materially safer network posture, fewer stale-container runtime bugs, better tool parity,
  and lower risk of cap violations in the highest-change subsystem.
- Trade-offs: lifecycle and scanner changes are sensitive and need careful regression testing for
  container startup, dev-server detection, and terminal workflows.

## Dependencies & Risks
- Proxy hardening may affect environments relying on current broad bind behavior.
- Scanner/bridge teardown changes can break dev-server detection if bridge tracking is wrong.
- Tool-core extraction touches both host fallback and container paths; requires broad test coverage.

## Next Steps
1. Plan and execute tool-core de-duplication between `tools-coding` and `tools-host`.
2. Split near-cap container files before next feature additions.
3. Remove or wire the write-only `metricsByWorkspace` state in `tools/tools-browser-agent.ts`.
4. Re-review whether the proxy needs credential-based auth only if future runtime requirements expand beyond the container subnet.

## Execution log
- 2026-04-16 — `d58ddc0e` — `refactor(container): harden proxy and port scanner cleanup`
- 2026-04-16 — `43318f6b` — `refactor(container): enforce read-only mounts`
