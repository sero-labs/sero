## Why

Two gaps block any tool-output optimiser in Sero.

First, the bash tool truncates output to the last 2000 lines or 50 KB before a
plugin can see the result, then discards the rest. The truncation happens
inside the tool, so no Pi extension can ever offer the complete original
output. A hook sees only what survived. The runtime also caps captured output
at 10 MB, so the tool never receives more than that.

Second, RTK is absent from the `sero-node` image, and a Pi extension runs on the
host while commands run inside the workspace container. A rewrite decided by a
host binary would therefore be executed by a container that may not have that
binary at all, or may have a different version with a different command
catalogue.

Both gaps are host concerns. Neither can be solved in a plugin, so both land
before the plugin that needs them.

## What Changes

- Add RTK to the managed toolchain manifest as an exact pinned version with
  per-platform artifacts and verified checksums. Extend the artifact schema
  with the exact version field the pin needs. Resolve it from the Sero-managed
  copy only; do not read `PATH` for RTK.
- Pin the same RTK version in the `sero-node` container image so the binary
  that decides a rewrite and the binary that runs it are the same version. The
  host probes the container version once per container and disables rewriting
  when the versions differ.
- Expose verified host and runtime RTK paths, version, and separate
  session-scoped host and runtime RTK state environments to agent extensions over the Pi EventBus, mirroring the existing
  MCP-sources request/response pattern. A request starts the first-use managed
  install.
- Capture complete bash `stdout` and `stderr` in a session-scoped capture file.
  Stream both streams into the capture from the runtime as the command runs, so
  the capture has no in-memory ceiling. Keep an independent bounded tail and
  counters so failed persistence cannot lose the command result. Save exact
  stdout and stderr files alongside combined output, so structured stdout stays
  parseable even with stderr diagnostics. All files share the capture lifecycle.
- Place the capture root under the agent directory, which the host read tool
  already allows, and mount it into workspace containers read-only at the
  identity-mapped path.
- Report the capture path and byte size in the model-visible bash result content,
  in a separate reporting block, and carry typed capture metadata in `details`
  for the desktop UI and extensions, including failures. Advertise no path when
  no complete capture exists; report persistence failures explicitly.
- Preserve inherited capture references when sessions fork. Delete captured
  output only after its last referencing session is deleted, and sweep
  unreferenced data at startup. Retain host RTK state needed by inherited
  recovery hints until those references are released. This is not a disk quota.
- Bind rewritten invocations to verified absolute runtime executables. Contain
  RTK tracking and both recovery modes in the returned state locations.
- Divergence from the source issue: the requirement that the complete raw
  result stays available is met by the capture file, not by the session file. The
  bash tool result content keeps its existing truncation for the model. Larger
  diagnostics and structured output remain complete in readable capture files;
  previews are explicitly marked and are not promised to be parseable.

## Capabilities

### New Capabilities

- `managed-rtk-toolchain`: an exact pinned, Sero-managed RTK on the host and in
  the container image, with a resolution contract that agent extensions can
  call, including a session-scoped state directory.
- `tool-result-capture`: complete bash output capture before truncation,
  session-keyed storage, model-visible reporting, container reachability, and
  retention.

### Modified Capabilities

None. `file-editing-tools` and `programmatic-tool-calling` both describe tool
results, but neither covers bash output capture or truncation, so no existing
requirement changes.

## Impact

- `apps/desktop/images/Dockerfile.sero-node` — a high-cost change. The image
  must be rebuilt and affected workspace containers recreated.
- `apps/desktop/electron/features/workspace/runtime/toolchains/` — the RTK name
  in all four name lists, the exact-version artifact field, the manifest data,
  the version probe, and a managed-only resolution policy.
- `apps/desktop/electron/features/workspace/runtime/types.ts` — an optional
  streaming output sink on `RuntimeExecInput`.
- `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts`
  and `apps/desktop/electron/features/container/index.ts` — stream bash output
  into the sink in the host and container exec paths.
- `apps/desktop/electron/features/container/tools/tools-coding.ts` — capture path
  ownership, independent model-facing tail capture, and model-visible capture
  reporting.
- `apps/desktop/electron/features/container/core/workspace-container-config.ts`
  — the read-only capture mount and the existing mount checks.
- `apps/desktop/electron/platform/env/index.ts` — capture root and RTK state
  resolution.
- `packages/common/src/` — the new EventBus channel and request/response types.
- Session fork and deletion handlers, plus startup cleanup: persist and release
  inherited capture references without changing historical result paths.
- `apps/desktop/src/` — the ChatPanel tool-result UI that opens the complete
  output.
- `ARCHITECTURE.md` — the streaming capture boundary and the managed-only RTK
  exception to the system-first toolchain policy.
- `AGENTS.md` — record the managed-only exception in the runtime-boundaries
  rule.
- `apps/docs-site/docs/` — user-facing retention and cleanup behaviour.
- No new JavaScript dependency. RTK is an external binary, downloaded and
  verified by the existing toolchain machinery.
- Existing sessions are unaffected and need no migration. They report no capture
  path.
