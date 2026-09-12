## Context

See `proposal.md` for motivation. The constraints that shape the approach:

- The bash tool concatenates `stdout` and `stderr`, then truncates to the last
  2000 lines or 50 KB via `truncateTail` before returning. The model-facing
  content needs only the tail, so the complete output does not need to stay in
  memory.
- The runtime `exec` paths buffer the whole output in memory and cap it at
  10 MB (`host-backend.ts`, `container/index.ts`). A capture fed from that buffer
  would be incomplete above the cap and would pay memory for a large command,
  so the bash path streams instead.
- The host read tool resolves absolute paths through the allowed host roots:
  workspace roots, additional roots, and `PI_CODING_AGENT_DIR`
  (`SERO_HOME/agent`). A capture outside those roots is not readable by the agent
  on the host backend.
- Plugin extensions run in the Electron main process. `ExtensionAPI` exposes
  `pi.exec`, which runs on the host, and no runtime or container handle. The
  host-to-extension capability surface is EventBus request/response, as used
  for MCP sources and CLI refresh.
- The default runtime backend is `host` on every supported platform. Container
  backends are opt-in per workspace.
- A container receives the workspace, writable reference roots, and four
  read-only mounts: `SERO_AGENT_DIR/{skills,prompts,agent-plugins}` and the
  shared Pi docs. Host-side logs reach a container through a portal at
  `/workspace/.sero/logs`. `SERO_HOME` itself is not mounted.
- A workspace container can serve several sessions. The container config is
  built once per workspace, so a mount cannot be narrowed per session.
- `toRuntimeIdentityMountPath` preserves a POSIX path unchanged and maps a
  Windows drive path to `/mnt/<drive>/...`.
- The toolchain manifest is a closed `ToolName` union with per-platform
  artifacts, checksums, and verifiers. An artifact declares `minVersion`, not
  an exact version, so the pin requires a schema field.
- `ToolchainManager.resolve` prefers a system candidate over the managed copy,
  and `systemToolCandidates` searches `PATH` locations. AGENTS.md states the
  system-first policy. A managed-only tool is a deliberate exception.
- `SERO_HOME` is exported to extensions as an environment variable, so a
  resolved capture root is available without a new capability.

## Goals / Non-Goals

**Goals:**

- One exact RTK version on the host and in the workspace image, so the binary
  that decides a rewrite is the binary that runs it.
- Complete bash output preserved outside the model context, reachable by both
  the agent and the user.
- No new JavaScript dependency, and no manual installation for the user.
- Every failure in this path leaves the command and the session working.

**Non-Goals:**

- No compaction and no command rewriting. That is the second change.
- No capture of non-bash tool output.
- No change to the model-facing truncation limits or markers. The capture path
  and size are added to the model-visible content, but the tail limit and its
  marker stay as they are.
- No redaction pass before a capture file is written. The capture lives inside the
  profile and is not automatically sent to a provider. Reading it through an
  agent tool can send the retrieved content. It can hold anything a command
  printed. Redaction is a follow-up, recorded here so it is not dropped.
- No retrieval tooling beyond the path and size reported in the bash result.
- No confidentiality boundary between sessions. The read-only mount makes the
  whole capture root reachable inside a container. See the risk below.

## Decisions

### Capture root under the agent directory

Alternative: place the capture under `SERO_HOME/capture`. Rejected because the host
read tool refuses paths outside the workspace, additional roots, and
`PI_CODING_AGENT_DIR`. A capture under `SERO_HOME/capture` would be unreachable for
a host-backend agent, and the spec requires the agent's normal read tool to
resolve the reported path. `SERO_AGENT_DIR/capture` is inside an allowed root, is
under `SERO_HOME`, and is outside every workspace, so no file watcher,
explorer refresh, language server, dev server, or workspace search sees it.

### Stream bash output into the capture file

Alternatives: raise the in-memory ceiling, rejected because it pays memory for
large output and still cuts the capture at the new value; document the 10 MB cap
and accept it, rejected because a large build log would still lose output
before the capture, which is the exact gap this change closes.

`RuntimeExecInput` gains an optional output sink with stream identity. One
capture owner drains both streams while the process runs. It keeps a bounded
in-memory tail and total byte and line counts independently of disk writes.
The same chunks go to the complete capture. The tail buffer, not the file, is
the source of the ordinary bash result and its existing truncation markers.
Other exec callers keep the buffered path unchanged.

Sink chunks are raw buffers, never decoded text. An earlier version set the pipes
to UTF-8, which re-encoded invalid bytes into replacement characters and made the
file seven bytes for a three-byte input. Decode a separate copy for the tail
only, so the persisted bytes are exact.

Unwritten chunks are bounded. A command can print far faster than the disk
accepts writes, and an unbounded queue made memory scale with total output. When
the pending bound is reached, the sink returns a promise and the runtime pauses
that pipe; the kernel pipe buffer then fills and the child blocks. Pausing never
drops, reorders or truncates output, so the capture stays complete. Resume when
the queue empties, which keeps the bound strict and cannot spin because the pump
drains without help from the paused pipe.

An open, write, flush or close failure disables persistence for that call but
must not stop pipe draining, kill the child or replace its exit status. A
partial file is never advertised as complete. Remove it when possible and
leave failed cleanup for the orphan sweep. Return the retained tail and an
explicit complete-output-unavailable notice. Test failure before the first
byte and failure after output exceeds the tail limit, including disk-full and
flush failure. Successful capture is advertised only after finalization.

Finalization confirms that every file the record will name is on disk at the
length that was written. A capture directory can be removed while the command
runs, for example by a manual delete, and reporting `complete: true` for a path
that no longer resolves is a lie the reader discovers later. Verification costs
one stat per named stream and turns that case into the ordinary unavailable
notice.

The capture owner writes `combined.log` in arrival order and byte-exact
`stdout.log` and `stderr.log` for non-empty streams. Stream files contain no
added notices. This uses up to twice the output size on disk; it avoids an
unbounded in-memory stream index and gives normal file tools direct access to
structured stdout without stderr contamination. All files share one capture
lifecycle. A failure in any required file makes the capture incomplete.
Combined arrival order differs from the old stdout-then-stderr concatenation. A timeout or
cancellation preserves bytes received before termination; it does not imply
that the command ran to completion.

### Identity mount rather than a portal path

Alternative: mirror the log portal at `/workspace/.sero/capture`. Rejected
because the reported path would then differ between backends, and a host
session would be handed a `/workspace/...` path that does not exist on the
host. A second alternative, no mount at all, was rejected because a
containerised agent could not recover omitted content.

Identity mapping is chosen because it is already the mechanism for the skills,
prompts, and agent-plugins mounts, and it gives one reported path per platform.
The Windows mapping differs from the host form, so the host renders the
reported path through the existing identity helper instead of printing the
host string.

The mount is a reachability mechanism, not a confidentiality boundary. A
container agent that enumerates the read-only root can read another session's
capture files, and the system cannot prevent that: one container serves several
sessions, so the mount cannot be narrowed per session. The system advertises
only paths created by or inherited into the session. If cross-session
confidentiality becomes a requirement, a filtered file-read capability is the follow-up.

Both backends skip a bind-mount source that does not exist, and the capture root
is created by the first capture rather than at install time. Building the
container config therefore creates the root first, so a fresh profile's container
is created with the mount and the first reported path is reachable without
recreating the container. Creation is best effort: a capture creates the
directory itself, and a failure must not block container creation.

### One capture owner and small result metadata

The bash tool owns capture creation, finalization and cleanup. Complete output
lives on disk rather than in `details`, avoiding a second full copy in session
JSONL. The structured result identifies the capture and its completeness,
reported runtime path, host path, byte count and stream metadata. Host paths
are for host consumers; only runtime-valid paths enter model-facing reports.
The extension and UI consume typed metadata, never parse human-readable paths.
Carry this metadata on failed commands too; the current throw-only error path
must be adapted without changing the reported exit status or error state.

The output payload and the capture/status report are separate content blocks.
`details` identifies their roles and indexes, and the public contract defines
the payload block independently of human notices. No consumer may concatenate
notices into a payload and then treat that string as machine-readable output.
The ordinary bash payload remains its existing bounded tail. The payload
budget remains 50 KB / 2,000 lines; compact reporting blocks are outside it,
as the current truncation and exit notices are. Reports identify combined and
per-stream paths and sizes. A stream file is exact even when its preview is
not parseable. The UI labels preview truncation and opens complete combined or
per-stream files. Paged file reads or local parsing recover oversized content;
the contract does not promise an unlimited single read-tool response.

The optimizer consumes finalized complete capture data before constructing its
own bounded preview. Its preservation rules cannot reconstruct bytes lost
before capture, including RTK filtering. Requested structured commands bypass
RTK rewriting in that change so their original stream bytes remain available.

### Sero-managed RTK only

Alternative: resolve a system `rtk` from `PATH` first, as the source issue
proposed. Rejected because the host binary decides the rewrite while the
container binary executes it, so a version skew produces a command the
executing binary does not support, with no diagnostic. Pinning one managed copy
on both sides removes the class of failure rather than detecting it.

The existing resolver prefers a system candidate for every tool. RTK is the
deliberate exception: a managed-only artifact flag makes the resolver ignore
system candidates for RTK. The exception contradicts the general system-first
policy in AGENTS.md, so this change records it in AGENTS.md and
ARCHITECTURE.md instead of leaving the divergence implicit.

### Resolved path and state directory over the EventBus

Alternatives: set an environment variable when session environment is loaded,
rejected because it is read once at load and a repair needs a restart; and let
the plugin compute the shared-tools layout from `SERO_HOME`, rejected because
it duplicates host-internal layout knowledge that the toolchain subsystem is
free to change.

The EventBus request is resolve-or-install. It names the session and returns
`hostExecutablePath`, `runtimeExecutablePath`, the verified version, and
separate host and runtime state environments. On a host backend the paths may
be equal. On a container backend the runtime path is the absolute image-owned
binary path, not an identity mapping of the host executable. Probe that exact
path, not bare `rtk`, once per container instance and pin. An unavailable
answer is not cached for the session lifetime; a later command or retry can
resolve the completed first-use install.

Cache by a container instance identity, not by the workspace container name. The
name is stable across a replacement, so an answer cached under it survived the
replacement that invalidated it: a container replaced with a fixed image kept
returning the previous version's mismatch and left rewriting disabled. Docker
reports its own container id, which changes with each container. A backend that
reports no per-instance identity is not cached at all, because correctness then
costs one probe per resolution rather than a stale answer. A pin change still
misses the cache because the pin is part of the key.

Apple Container is such a backend, verified against `container inspect` on CLI
0.8.0. Its payload has only `status`, `configuration` and `networks`;
`configuration.id` equals the container name, there is no creation timestamp or
uuid, and `labels` is empty. The network address is the only field that differs
between instances, and only while the container runs, so it cannot serve as an
identity. Apple-backed workspaces therefore probe on every resolution. An
image-digest key would be sound for the version probe alone, because the binary
is image-owned, but not for the state-directory check, whose answer depends on
the container's own filesystem. The simplification is to cache nothing there.

The plugin must bind every inserted RTK executable token to the verified
runtime path with shell-safe quoting. It must also apply the returned runtime
state environment to each inserted invocation, including pipeline and compound
segments. An unbindable rewrite runs as written. `PATH` changes and shell
startup files must not select a different RTK. Host rewrite probes use the
absolute host path and host state environment. Do not mutate process-wide
environment variables shared by other sessions or alter unrelated child tools'
home directories.

`RTK_DB_PATH` names a database file, `<state>/history.db`, not the state
directory. Also bind `RTK_RECALL_DB=<state>/recall.db` and
`RTK_TEE_DIR=<state>/tee` so both RTK recovery modes stay under managed session
state. Existing user configuration may select a recovery mode, but cannot
redirect its writes outside these paths. These variables cover tracking and
recovery output; they do not claim to isolate every RTK configuration read.
Verify against the selected exact version, including an existing tee-mode
configuration. Upstream references:
[tracking](https://github.com/rtk-ai/rtk/blob/v0.49.0/src/core/tracking.rs),
[recall](https://github.com/rtk-ai/rtk/blob/v0.49.0/src/core/retriever.rs), and
[tee](https://github.com/rtk-ai/rtk/blob/v0.49.0/src/core/tee_file.rs).

### Retain captures while a session references them

A capture has one producing session and can have several referencing sessions.
Forking currently copies branch messages, including tool-result paths. Keep
those paths stable. Persist inherited capture references with the fork before
it becomes visible; do not rewrite historical command output. A fork of a fork
inherits references from the copied branch in the same way. New commands in
the fork create captures under its own session key.

Deletion releases that session's references. Remove a capture only when no
surviving session references it. Retain originating host RTK state while a
surviving capture can include one of its recovery hints; otherwise remove that
state when its owning session is deleted. Container RTK state remains tied to
the container lifetime, as before; Sero's complete-output link always points
to the host-owned capture, not an RTK recovery hint.

The startup sweep reconstructs references from persisted session capture
metadata, including inherited references. It must not infer orphanhood solely
from the absence of the producing session. It retains data on unreadable or
incomplete session inventory and retries later. Serialize fork publication,
session deletion and capture cleanup so a concurrent delete cannot remove a
capture inherited by a committed fork. Failed forks may leak data until a
successful sweep, but must not cause data loss.

A capture owner registers its directory before the first write. When it builds
its result, the directory remains protected until a cleanup inventory observes
the persisted capture reference. Asynchronous result hooks can delay that
publication, so directory age cannot prove that a completed capture is orphaned.
Each sweep keeps a snapshot of the protection present before it reads session
files and adds captures registered during that read. A newer inventory can then
release protection without making an older inventory unsafe.

If a result never reaches a session file, its pending protection lasts until the
process exits. The next startup sweep can remove it as an orphan. Referenced
captures return to normal retention once an inventory has observed their
references. The grace window remains an additional startup safeguard.

A TTL or size-based eviction was rejected because it would invalidate live
references. Retention is a lifecycle rule, not a disk quota. Active or retained
sessions can grow indefinitely. Adding a quota would require a separate
approved change to the complete-capture or retention contract.

### One pin, declared twice

The image declares its RTK version as a build argument, which is how it already
declares `GH_VERSION` and the Node version. The host manifest declares the same
version in the new exact-version field plus artifact checksums. These are two
declarations of one fact.

The alternative, having the image build read the host manifest, was rejected
because the image build context is self-contained today and importing a
repository file into it would couple image builds to the toolchain subsystem's
file layout. The duplication is accepted and guarded by a check that compares
the image's build argument with the manifest's exact version.

## Risks / Trade-offs

- **The two RTK pins drift** → The build check compares the image build
  argument with the manifest's exact version and fails when they differ.
- **The image change is high cost** → Per AGENTS.md, rebuilding
  `sero-node:latest` and recreating affected containers is required and
  disruptive. Land the pin so that a version bump is a one-line change in two
  known places.
- **A new read-only mount touches every container** → Mount only the capture
  root, identity mapped, and extend the existing runtime mount checks so a
  misconfigured mount fails the doctor rather than a session.
- **A container agent can read another session's capture files** → Accepted for
  this change and recorded. The mount is needed for reachability, the system
  advertises only paths created by or inherited into the session, and a
  per-session mount is impossible for a shared container. A filtered file-read capability is the
  follow-up if confidentiality becomes a requirement.
- **The streaming exec changes the runtime API** → The output sink is optional
  and additive. Other exec callers keep the buffered path and its 10 MB cap.
  Verify the streaming path on both backends. Sink chunks are buffers and the
  sink may return a promise, so a caller that decodes to text or ignores the
  promise loses byte-exactness or memory bounding.
- **A slow disk stalls a command** → Accepted. When the pending bound is reached
  the runtime pauses the producing pipe, so the child blocks until the disk
  catches up. This trades throughput for bounded memory and a complete capture,
  which is the contract here.
- **A cached runtime answer outlives its container** → Cache by container
  instance identity and do not cache when the backend reports only the stable
  workspace name. A stale answer keeps rewriting disabled after the image was
  fixed, which is worse than the extra probe.
- **A running command's capture looks orphaned** → Register the directory while
  the command runs and release it once the result is built. Age alone cannot
  separate a long command's capture from an orphan.
- **The two streams interleave in the capture** → Accepted. Both streams are
  complete in arrival order, which is usually easier to read than the old
  `stdout`-then-`stderr` concatenation.
- **Capture writes land in a watched workspace** → Avoided by placing the capture
  under `SERO_AGENT_DIR` rather than in the workspace.
- **A capture file can hold secrets a command printed** → Accepted for this
  change with the exposure recorded: the file is profile data, and retrieval
  through an agent tool can send its content to a provider. It is deleted after
  its last session reference is released. Redaction before persistence is
  a named follow-up, not a silent omission.
- **Complete output on disk grows without a ceiling** → Accepted. The sweep
  removes only unreferenced data; retained sessions have no size bound. A quota
  requires a separate approved change to the capture or retention guarantees.
- **A missing capture path in an older session** → The bash result only advertises
  a capture when the write succeeded, so an older session reports nothing rather
  than a dead path.

## Migration Plan

1. Extend the toolchain manifest schema, the four name lists, the version
   probe, and the managed-only resolver policy with the exact pinned RTK
   artifact.
2. Rebuild `sero-node:latest` with the matching version and recreate affected
   workspace containers. This is the disruptive step and it must be verified on
   the container backend, not only on the host.
3. Add the capture root, the streaming output sink, the model-visible report,
   the mount, the runtime version probe, and retention.
4. Verify on both backends: a large command is captured completely, a command larger
   than the former 10 MB buffer limit captures completely, the agent reads the
   reported path, and the model-facing result keeps its truncation.

No session or profile migration. Existing sessions keep working and simply
report no capture path. Reverting the image tag and removing the manifest entry
disables the feature; capture directories and host RTK state are inert files that
the orphan sweep removes only after their last reference is released.

## Open Questions

None for retention. Persisted capture references, including forks, are the
source of truth for cleanup.
