## 1. Pin RTK in the host toolchain manifest

- [x] 1.1 Add an exact `version` field to the artifact schema and the generated manifest data. Add `rtk` to `ToolName` and to all four name lists (`types.ts`, `manifest.ts`, `host-tool-resolver.ts`, `bundled-manifest-data.ts`). Add the manifest artifact with per-platform artifacts, the exact pinned version, and checksums. Verify the toolchain manifest tests pass and a resolver call returns the pinned version for the current platform.
- [x] 1.2 Add the RTK probe to `TOOL_PROBES` (version parse and minimum) and verify a managed artifact whose version does not equal the pin is rejected. Confirm the generic artifact downloader already verifies the checksum; no separate checksum verifier is added.
- [x] 1.3 Add the managed-only resolution policy so `systemToolCandidates` is not consulted for RTK. Verify with a test that places a different `rtk` on `PATH` and asserts the managed copy is selected. Record the policy exception in `AGENTS.md` (runtime boundaries) and `ARCHITECTURE.md`.

## 2. Pin the same RTK version in the container image

- [x] 2.1 Add the RTK version as a build argument and an install step in `apps/desktop/images/Dockerfile.sero-node`, with the checksum verified during the build. Verify the build succeeds and `rtk --version` in the image reports the pinned version.
- [x] 2.2 Add a check that the image's declared RTK version equals the manifest's exact version, and verify it fails when either side is changed independently.
- [x] 2.3 Rebuild `sero-node:latest` and recreate affected workspace containers. Verify an existing containerised workspace can run `rtk --version` and reports the pinned version. This is the high-cost step required by AGENTS.md.

## 3. Expose the resolved executable to extensions

- [x] 3.1 Add the EventBus resolution contract with verified absolute host and runtime executable paths, version, and separate host/runtime state environments. Return available, installing and failed states without failing the session. Verify later requests resolve an install that completes during the session.
- [x] 3.2 Return per-session tracking and recovery paths: RTK_DB_PATH names history.db, RTK_RECALL_DB names recall.db, and RTK_TEE_DIR names the tee directory. Verify both execution environments are writable and concurrent sessions do not share paths or mutate process-wide environment.
- [x] 3.3 Probe the exact runtime executable path once per container identity and pin. Invalidate availability on repair, pin change and container replacement. Verify mismatch reports both versions and a PATH-shadowing binary is never selected.

## 4. Capture complete output and write the capture

- [x] 4.1 Resolve the capture root from the agent directory (`PI_CODING_AGENT_DIR`) so the host read tool can resolve it. Verify the resolved path is outside every workspace and that the host read tool reads a file in it.
- [x] 4.2 Add an optional stream-identified output sink to RuntimeExecInput. One owner writes combined output plus byte-exact files for non-empty stdout and stderr on host and container backends. Verify output above 10 MB is captured completely without retaining it all in memory, and JSON stdout remains parseable when stderr contains warnings.
- [x] 4.3 Maintain a bounded tail and total line/byte counters independently of persistence. Render the ordinary bash payload from this buffer with existing truncation markers. Verify success, timeout and cancellation preserve the received tail and correct status.
- [x] 4.4 Return a versioned typed capture record and separate payload/report content blocks, with capture completeness, host/runtime paths and individual byte counts for combined output and each non-empty stream. Verify only finalized captures get paths, no-output commands create no capture, model reports contain runtime paths only, and preview payloads obey both existing limits independently of notices.
- [x] 4.5 Preserve structured capture metadata on failed commands as well as success. Adapt the current throw-only path without changing exit status or isError semantics. Verify extension hooks and the UI receive the capture reference for a non-zero exit.
- [x] 4.6 Inject open, mid-stream disk-full, flush and close failures, including after the tail limit is exceeded. Verify pipes keep draining, final tail and child exit status survive, partial captures are not advertised, and an explicit unavailable notice is returned. Verify failed partial-file cleanup is retried safely.

## 5. Mount the capture into containers

- [x] 5.1 Add the capture root as a read-only identity mount in the workspace container config. Verify the built mount list contains it exactly once and read-only, and that the existing mount check fails the doctor on a misconfigured mount.
- [x] 5.2 Verify a containerised session can read a reported capture path and cannot create or modify a file under the capture root.
- [x] 5.3 Render the reported path through the identity mapping helper rather than printing the host string. Verify the Windows drive mapping in a unit test.

## 6. Retain the capture with its session

- [x] 6.1 Persist inherited capture references as part of fork publication, including forks of forks. Release references on session deletion and remove captures only after the last reference. Retain originating host RTK state while inherited capture hints can reference it. Verify deleting a parent preserves the fork's historical paths, and deleting the last fork cleans up without affecting unrelated sessions.
- [x] 6.2 Reconstruct capture references from persisted session metadata during startup. Verify parentless forks survive a sweep, true orphans are removed, unreadable inventories defer deletion, and overlapping fork/delete operations cannot remove a committed fork's captures.

## 7. Surface the complete output in the desktop UI

- [x] 7.1 Let the user open complete combined output or individual stream files. Distinguish them from the bounded preview without claiming every result was truncated. Verify oversized JSON opens and parses from the stdout file, while its preview is marked incomplete and its stderr diagnostics remain separately available.
- [x] 7.2 Handle a missing capture file. Verify the UI reports that the complete output is unavailable instead of showing an empty view.

## 8. Documentation and integration verification

- [x] 8.1 Record the streaming capture boundary and the managed-only RTK exception in `ARCHITECTURE.md`, and the exception in `AGENTS.md`.
- [x] 8.2 Document capture and RTK state retention in apps/docs-site/docs/, including inherited references, container-state lifetime, unbounded referenced storage and disk-failure behavior. State that a quota would require a change to the retention or complete-capture contract.
- [x] 8.3 Keep every touched source file at or below 500 LOC. Verify by checking the length of each changed source file before completion.
- [x] 8.4 Run `pnpm typecheck` from the monorepo root. Verify it passes with no errors.
- [x] 8.5 Verify the end-to-end path on host and container backends: output above both limits is captured, paths are readable, failed persistence preserves the bounded result, failed commands retain metadata, forks retain inherited output after parent deletion, and the last reference triggers cleanup. Test RTK tracking and both recovery modes with existing user configuration and inspect the managed state locations.

## 9. Correctness hardening after review

Six defects were reproduced against the first implementation. Each is fixed and
covered by a test that fails without the fix.

- [x] 9.1 Protect a running command's capture from retention. Register the capture directory while the command runs, release it once its result is built, and never select a registered directory. Verify an aged, unreferenced capture survives a sweep while its command runs, and is removed after release.
- [x] 9.2 Bound the bytes that wait to be written and apply backpressure instead of queueing all output. Verify a command larger than the bound is captured complete, the peak pending bytes stay within the bound plus one chunk in flight, and the pipe pauses at least once.
- [x] 9.3 Create the capture root before the container, so a fresh profile's container carries the read-only mount. Verify the built mount list contains the root read-only when the directory did not exist beforehand.
- [x] 9.4 Keep the newest bytes of a line longer than the whole retained tail instead of dropping the line. Verify the payload keeps the final bytes, with and without a persistence failure.
- [x] 9.5 Capture raw bytes and decode a separate copy for the preview only. Verify a real child process emitting `ff 80 41` produces a three-byte capture and a byte-identical file.
- [x] 9.6 Key the runtime version and state answers by a container instance identity, and do not cache when a backend reports only the stable container name. Verify a replaced container is re-probed and a fixed image enables rewriting, and that a runtime without an instance identity probes on every resolution.
- [x] 9.7 Verify completeness by reading the file length instead of trusting the write path. Verify a capture removed while the command runs is reported as unavailable rather than complete.
- [x] 9.8 Remove the cache invalidation API, because an instance-keyed cache plus a non-caching fallback replace it and it had no production caller.
- [x] 9.9 Re-run the full suite and typecheck, and verify the container mount and the instance identity against a real container.
