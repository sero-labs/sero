# OpenShell runtime support for Sero — v2 phased plan

Status: draft v2, replacing the phase definitions in `docs/features/openshell-runtime-proposal.md` as the planning source of truth.

## Why this v2 exists

The original proposal correctly framed OpenShell as a pluggable runtime backend, but it blurred the boundary between:

- the long-term architecture,
- what Phase 1 and Phase 2 were responsible for,
- what was intentionally deferred,
- and what must be true before we can say OpenShell Local is actually working.

This v2 makes every phase explicit, records what has actually been implemented so far, and adds a **Phase 2.5 hardening pass** for runtime parity and smoke-test reliability.

## Runtime contract baseline

A selected workspace runtime should eventually own all agent-visible execution semantics:

- command execution,
- file reads,
- file writes,
- edits,
- dev-server execution,
- preview forwarding,
- logs,
- runtime health.

If a tool intentionally remains host-backed for a runtime, the UI and system prompt must say so clearly. Silent fallback to the macOS host is not acceptable for OpenShell proof-of-execution.

## Phase 0 — Research spike

### Goal

Validate that OpenShell can support Sero’s local experimental runtime path before changing core architecture.

### Responsibilities

- Install OpenShell locally.
- Verify Docker Desktop is required and running.
- Start/select a local gateway.
- Create a sandbox.
- Execute a simple Linux command.
- Upload and download workspace files.
- Forward a preview port.
- Stream sandbox logs.
- Inspect OpenShell CLI and proto/gRPC surfaces.
- Record known CLI version constraints and failure modes.

### Acceptance criteria

- Maintainers know the minimum viable CLI/API surface.
- Local OpenShell viability is confirmed on target dev machines.
- Failure states are documented.
- Recommendation exists for CLI-first vs gRPC-first.

### Current status

**Mostly done informally.** We have enough research to justify CLI-first Phase 2, but version-specific CLI compatibility still needs hardening. Current local CLI observed during smoke testing: `openshell 0.0.36`.

## Phase 1 — Runtime adapter seam

### Goal

Introduce a narrow runtime facade around existing host and Apple container behavior without changing the user-facing IPC surface broadly.

### Responsibilities

- Add capability-aware runtime types.
- Add host runtime adapter.
- Add Apple container runtime adapter.
- Add workspace runtime facade and provider resolution.
- Preserve legacy `container?: boolean` compatibility.
- Route `runWorkspaceCommand` through the runtime facade.
- Route terminal creation through the runtime facade for host and Apple container.
- Expose runtime health diagnostics.
- Keep existing Apple container behavior unchanged.

### Explicit non-goals

- No OpenShell dependency.
- No remote/cloud runtimes.
- No policy UX.
- No broad `container.*` IPC rename.

### Acceptance criteria

- Existing Apple container workspaces behave as before.
- Host fallback behavior remains intact for Apple container failure.
- Runtime boundary is clear enough to add OpenShell next.
- Typecheck and tests pass.

### Current status

**Complete.** Implemented and reviewed successfully.

## Phase 2 — Experimental OpenShell Local provider

### Goal

Add an experimental local Docker-backed OpenShell provider using the OpenShell CLI.

### Responsibilities

- Add `openshell-local` provider ID and workspace runtime selection.
- Detect OpenShell CLI presence.
- Detect Docker daemon availability.
- Start/select deterministic local gateway `sero-local`.
- Create a deterministic sandbox per workspace.
- Execute non-interactive commands through `openshell sandbox exec`.
- Push workspace into sandbox before command execution.
- Pull workspace back after command execution.
- Stream sandbox logs.
- Forward preview ports.
- Destroy sandbox when changing away from OpenShell.
- Surface OpenShell health/diagnostics in Sero.
- Mark OpenShell Local as experimental in UI/config.

### Explicit non-goals

- No remote gateway support.
- No cloud gateway support.
- No gRPC/proto implementation.
- No OpenShell interactive PTY terminal.
- No browser automation/computer-use in OpenShell.
- No policy/profile UX.
- No transparent bidirectional file sync.
- No complete runtime parity for `read`, `write`, and `edit` yet.

### Tool behavior expected at the end of Phase 2

Phase 2 is only allowed to claim **command execution** in OpenShell, not full tool parity.

Expected Phase 2 tool behavior:

| Tool | Expected behavior in Phase 2 |
| --- | --- |
| `bash` | Runtime-backed, executes via OpenShell sandbox. |
| `read` | Host-backed unless Phase 2.5 is complete. |
| `write` | Host-backed unless Phase 2.5 is complete. |
| `edit` | Host-backed unless Phase 2.5 is complete. |
| Terminal | Host PTY fallback with explicit notice; no OpenShell PTY. |
| Browser | Unavailable for OpenShell Local. |

### Acceptance criteria

- User can create an OpenShell Local workspace.
- Docker/OpenShell prerequisites are diagnosed clearly.
- First OpenShell command starts/uses a gateway and sandbox.
- Docker Desktop shows OpenShell-related containers once execution begins.
- `bash` proof command shows Linux/OpenShell sandbox signals, not Darwin/macOS.
- A command-created file is pulled back into the Sero workspace.
- Preview forwarding works for a known port.
- Failures are surfaced without exposing secrets.

### Current status

**Implemented but not fully accepted by manual smoke test yet.**

Implemented:

- runtime selection UI,
- provider-aware runtime resolution,
- OpenShell CLI helpers,
- gateway/sandbox lifecycle,
- push/pull helpers,
- exec adapter,
- logs,
- port forwarding,
- diagnostics,
- lifecycle cleanup,
- integration tests,
- runtime-backed `bash` tool for OpenShell,
- session/subagent wiring fix so OpenShell is not forced to host tools.

Recently fixed smoke-test issues:

- OpenShell CLI `0.0.36` does not support `openshell sandbox list --names --selector ...`. Sero uses name-based sandbox lookup such as `openshell sandbox get <name>` and creates with `openshell sandbox create --name <name>`.
- OpenShell default policy allows writes under `/sandbox`, not `/workspace`; Sero maps runtime workspace paths to `/sandbox/workspace/<basename>` and migrates legacy persisted `/workspace/...` configs.
- `openshell sandbox exec` uses the gateway `ExecSandbox` path and reads piped stdin until EOF before issuing the RPC. Sero invokes non-interactive CLI commands with stdin set to EOF (`stdio: ['ignore', 'pipe', 'pipe']`) so the CLI does not wait forever and get killed by the host process timeout.
- OpenShell rejects command arguments containing newline or carriage-return characters, so Sero base64-encodes runtime `bash` payloads and decodes/evaluates them inside a single-line `sh -lc` wrapper.

## Phase 2.5 — OpenShell runtime parity and hardening

### Goal

Close the gap between “OpenShell command backend exists” and “OpenShell workspaces behave like real runtime-backed workspaces.”

This is the mop-up phase required before calling OpenShell Local usable beyond experimental smoke tests.

### Responsibilities

#### 1. Fix CLI compatibility and smoke-test setup

- Audit OpenShell `0.0.36` CLI help and architecture docs for supported gateway/sandbox commands.
- Replace unsupported `sandbox list --selector` usage.
- Keep runtime workspace paths under writable `/sandbox` policy paths, not `/workspace`.
- Treat non-interactive CLI exec as an EOF-stdin integration; do not leave stdin open when launching `openshell sandbox exec` from Node.
- Add version-aware command formatting if needed, including newline-safe command payload encoding for multiline smoke commands.
- Ensure gateway creation, sandbox lookup, sandbox creation, and sandbox exec work from a clean machine.
- Add tests for the exact CLI command shapes and process stdio semantics Sero emits.

#### 2. Fail closed for OpenShell runtime selection

- If a workspace is configured for `openshell-local`, do not silently route agent tools to macOS host.
- If OpenShell is unavailable, show a runtime failure/diagnostic and stop the tool call.
- Preserve host fallback only for legacy Apple container fallback paths where that behavior already existed.

#### 3. Runtime-backed file tools

Implement OpenShell-aware versions of:

- `read`,
- `write`,
- `edit`.

Acceptable v1 strategies:

- direct OpenShell file operations if available and stable, or
- explicit sync before/after file tool execution with clear source-of-truth rules.

The plan must define whether the host workspace or sandbox workspace is authoritative at each point.

##### Phase 2.5 source-of-truth model

Selected v1 strategy: explicitly block OpenShell Local `read`, `write`, and `edit` rather than falling back to host tools. Host-backed file tools would bypass the sandbox and weaken proof-of-execution.

Authority rules:

- Between tool calls, the host workspace is the persisted source of truth.
- Before OpenShell `bash`, Sero uploads host files to `/sandbox/workspace/<basename>`.
- During OpenShell `bash`, `/sandbox/workspace/<basename>` is authoritative for execution and generated files.
- After OpenShell `bash`, Sero downloads the sandbox workspace back to the host so the host is current again.
- Until runtime-backed file semantics exist, use OpenShell `bash` for sandbox-visible file inspection or mutation.

#### 4. Runtime-visible diagnostics in tool output

- Tool results should include enough details to prove the selected runtime path.
- OpenShell `bash` failures should show sanitized OpenShell command context.
- Diagnostics must not include secrets or full sensitive command payloads.

#### 5. Session coverage

Ensure runtime tool selection is correct for:

- main agent sessions,
- subagents,
- single-run agents,
- plugin/app-triggered agent sessions where applicable,
- CLI bridge paths if they execute workspace tools.

#### 6. Manual smoke-test checklist

A Phase 2.5 acceptance run should prove:

```bash
echo "PWD=$PWD"
uname -a
cat /etc/os-release | head
test -f /.dockerenv && echo "DOCKER_ENV=yes" || echo "DOCKER_ENV=no"
hostname
whoami
echo "created inside $(uname -s) at $(pwd)" > proof-from-openshell.txt
```

Expected signals:

- `uname` reports Linux, not Darwin.
- `/etc/os-release` exists.
- `PWD` is the sandbox workspace path.
- Docker Desktop shows OpenShell-related containers during execution.
- `proof-from-openshell.txt` appears in the host Sero workspace after pull.
- `read`, `write`, and `edit` behavior is documented and tested against OpenShell semantics.

### Explicit non-goals

- Still no remote/cloud gateways.
- Still no policy UX.
- Still no browser automation.
- Still no full interactive PTY unless explicitly pulled forward.

### Acceptance criteria

- Clean OpenShell Local workspace can run the proof commands successfully.
- No Darwin/macOS output appears from `bash` in an OpenShell workspace.
- `read`, `write`, and `edit` are either runtime-backed or clearly blocked with an explicit message.
- OpenShell setup failures are actionable.
- Tests cover the main runtime routing paths.

### Current status

**Complete.** Phase 2.5 documents the source-of-truth model, blocks OpenShell Local `read`, `write`, and `edit` instead of falling back to host tools, and has automated coverage for runtime tool routing, OpenShell sync, adapter, CLI command-shape behavior, newline-safe command payload encoding, and OpenShell `bash` diagnostics. The manual proof-command checklist above passed: `bash` reports Linux/OpenShell sandbox signals, the workspace path is under `/sandbox/workspace/<basename>`, and `proof-from-openshell.txt` is pulled back into the host Sero workspace.

## Phase 3 — Runtime profiles and policy UX

### Goal

Expose OpenShell’s security model through Sero-friendly policy profiles while staying explicit about what Sero currently enforces.

### Responsibilities

- Define initial policy profiles: Strict, Dev, Browser Agent, GPU Agent, Plugin Test.
- Show what filesystem, network, and process access each profile intends to grant.
- Reflect static vs hot-reloadable policy boundaries.
- Surface blocked network/filesystem events from logs where OpenShell emits recognizable entries.
- Provide user prompts for allow/deny decisions where supported.

### Implemented behavior

- Sero defines a shared profile catalog in `@sero-ai/common` for Strict, Dev, Browser Agent, GPU Agent, and Plugin Test.
- New OpenShell Local workspaces default to the Dev profile and persist the selected profile in `.sero-workspace.json` runtime config.
- Existing OpenShell Local workspaces show a policy popover with the selected profile, profile switching, filesystem/network/process intent, static and hot-reloadable boundary copy, sandbox recreation guidance, and profile-change history.
- Runtime diagnostics include OpenShell policy details for OpenShell Local workspaces only: selected profile, enforcement status, active policy CLI output where available, policy history output where available, best-effort denied/blocked log matches, and allow/deny prompt support status.
- Policy profile changes are auditable through a capped runtime `policyProfileHistory` trail.

### Current enforcement limitations

Current status: **Complete for Phase 3 scope as policy profile intent + diagnostics UX, not as enforced Sero profile policy.**

Sero stores the selected profile as policy intent and shows the intended filesystem, network, and process boundaries. Sero does **not** yet compile profiles to OpenShell policy YAML and does **not** call `policy set`, `policy update`, or `sandbox create --policy` for these profiles. Any active OpenShell policy shown in diagnostics is read from OpenShell; it is not proof that Sero applied the selected profile.

Allow/deny prompts are also unsupported in current Sero/OpenShell Local. The UI and diagnostics report this explicitly instead of presenting a fake prompt-driven approval flow.

Denied or blocked events are best-effort matches from recent OpenShell logs. Sero looks for obvious denied/blocked/policy/permission strings in warning logs, but OpenShell CLI `0.0.36` does not guarantee a stable denied-event schema. An empty event list means “no recent matching log entries found,” not “nothing was denied.”

### Static vs hot-reloadable boundaries

Profile copy distinguishes between boundaries that are static at sandbox creation time and boundaries OpenShell can update while a sandbox is running:

- Filesystem/Landlock and process boundaries are static policy boundaries. Once Sero supports applying profile policies, changes to these areas will require sandbox recreation before they can take effect.
- GPU or other resource-shape changes also require sandbox recreation.
- Network endpoint policy is treated as hot-reloadable by OpenShell policy update when Sero supports validated templates, but Sero does not currently apply those updates from profile selection.

Changing the selected profile in Sero today updates persisted intent and audit history. It does not mutate a running sandbox, and it does not recreate the sandbox automatically.

### Explicit non-goals for the shipped Phase 3 preview

- No profile-to-policy YAML compiler.
- No `policy set` or `policy update` mutation path.
- No `sandbox create --policy` profile application.
- No interactive allow/deny prompts.
- No browser automation or GPU runtime enablement; Browser Agent and GPU Agent are intent profiles only.
- No guarantee that recent logs contain every denied action.

### Acceptance criteria

- User can understand the selected Sero policy profile intent and the current non-enforcement limitation.
- Denied actions are visible when OpenShell emits recognizable recent log entries; otherwise Sero shows a clear best-effort/no-events state.
- Policy profile changes are auditable.
- Static policy changes explain when sandbox recreation will be required once enforcement exists.

### Current status

**Phase 3 complete with accepted limitations.** The comprehension, diagnostics, auditability, and sandbox-recreation UX are present and manually smoke-tested. Phase 3 must not be treated as complete policy enforcement until Sero has validated profile-to-policy templates and applies them through OpenShell policy mutation commands.

## Phase 4 — OpenShell remote gateway support

### Goal

Run Sero workspace agents on a remote machine through OpenShell remote gateways.

### Responsibilities

- Add remote gateway registry entries.
- Configure SSH host connection.
- Check remote Docker availability.
- Deploy/select remote gateway.
- Create remote sandbox.
- Upload/download workspace files.
- Execute commands remotely.
- Stream logs.
- Forward preview ports.
- Show latency/status indicators.

### Acceptance criteria

- User can run a workspace agent on a remote Linux machine.
- Sero UI remains local.
- Command, file, log, and preview loops work remotely.

### Current status

**Complete for the SSH-backed remote gateway scope.** Sero has a distinct `openshell-remote` provider with persisted SSH gateway metadata, remote Docker checks, gateway deployment/selection, remote sandbox lifecycle, fail-closed command execution, workspace push/pull sync, logs, preview forwarding, latency/status diagnostics, and sandbox cleanup when switching runtimes.

Phase 4 remains SSH-only. Hosted/cloud endpoints are handled by the separate `openshell-cloud` provider in Phase 5 and must not be treated as remote SSH gateways.

## Phase 5 — OpenShell cloud gateway support

### Goal

Support hosted/cloud-backed OpenShell agent runtime sessions.

### Responsibilities

- Register cloud gateway endpoint.
- Add auth flow.
- Create cloud sandbox sessions.
- Display resource/cost information.
- Handle idle timeout and cleanup.
- Show stale cloud sessions.
- Forward logs and previews.

### Acceptance criteria

- User can connect Sero to a cloud gateway.
- Workspace agent can run in a cloud sandbox.
- User can stop/destroy sessions safely.
- Stale cloud sessions are visible.

### Current Phase 5 implementation status

**Complete as an experimental CLI-first MVP.** Manual smoke testing passed on 2026-05-06.

Implemented:

- `openshell-cloud` is a distinct runtime provider across Electron, IPC, app-runtime, workspace config, diagnostics, store, and UI contracts.
- Cloud gateway metadata is persisted under `SERO_AGENT_DIR` with HTTPS-by-default endpoint validation, auth mode, advisory resource/cost labels, idle timeout, and timestamps.
- CLI-managed gateway registration uses `openshell gateway add <endpoint> --name <name>`.
- CLI-managed auth action uses `openshell gateway login <name>` and Sero does not parse, return, or persist token values.
- Cloud gateway health uses OpenShell CLI status/info checks, sanitized diagnostics, latency on success, and explicit auth-required/unavailable states.
- Cloud sandbox execution uses `openshell --gateway <name> sandbox ...`, workspace push before `bash`, execution under `/sandbox/workspace/<basename>`, and pullback after `bash`.
- Logs and preview forwarding reuse OpenShell log/forward flows with the selected cloud gateway name.
- The cloud status menu shows endpoint/auth state, sandbox name, idle timeout, stale warnings, resource/cost labels, login, metadata editing, refresh, and explicit sandbox destroy.
- Runtime switching and the destroy action delete only the workspace sandbox; gateway registry metadata is not removed by sandbox cleanup.

Limitations:

- Sero does not store cloud auth secrets, tokens, cookies, bearer headers, API keys, or passwords. Authentication remains owned by OpenShell CLI/auth-provider storage.
- Resource and cost values are user-entered/advisory unless a future OpenShell interface provides structured data. Sero does not have authoritative cloud billing data.
- Stale detection is best-effort from Sero `lastActivityAt`/`idleTimeoutMinutes` metadata plus sandbox existence checks. It is not provider-enforced cleanup and is not billing truth.
- Phase 5 does not implement direct OpenShell endpoint API/gRPC integration; all cloud operations remain CLI-first.
- Phase 5 does not add browser automation, interactive PTY terminals, or runtime-backed `read`, `write`, and `edit` for OpenShell runtimes.
- Plugins and background runtimes see Sero runtime capabilities only; raw cloud/OpenShell APIs are not exposed to plugins.

## Phase 6 — Evals and multi-agent scaling

### Goal

Use OpenShell as an isolated, reproducible runtime for Sero evals and parallel agent experiments.

### Responsibilities

- Fresh sandbox per eval case.
- Parallel remote/cloud execution.
- Per-run logs.
- Result collection.
- Failure snapshots.
- Optional GPU profile.

### Acceptance criteria

- Sero can run repeatable evals in isolated sandboxes.
- Multiple agent configurations can be compared.
- Results are exportable and replayable.

### Current status

**Started; not complete.** Initial eval harness support exists for an experimental OpenShell runtime promptfoo suite:

- `pnpm eval:openshell` / `./eval/run.sh openshell` run `eval/promptfoo-openshell.yaml`.
- Each eval case creates a unique temp workspace and unique OpenShell sandbox name.
- OpenShell eval mode exposes runtime-backed `bash` only; `read`, `write`, and `edit` are intentionally unavailable so evals do not silently fall back to the host filesystem.
- Host workspace files are uploaded before each `bash` command and downloaded afterward, matching the current OpenShell runtime source-of-truth model.
- Command records, sandbox metadata, and captured log lines are attached to promptfoo metadata under `openShell`.
- Per-run artifacts are written under `eval/output/openshell/<sandbox>/result.json`; failed runs also persist a `workspace-snapshot/` and retain the failed sandbox by default.
- The config includes commented remote/cloud providers so multiple OpenShell gateway/model configurations can be compared with fresh sandboxes per case.
- `gpuProfile: true` is metadata/profile intent only until Phase 3 policy enforcement exists.
- The OpenShell Local eval suite passed manually after the harness exposed the OpenShell-backed `bash` tool correctly and the proof assertion was aligned with the command output.
- The OpenShell Remote eval suite passed manually against the GCP SSH gateway `sero-remote-gcp` at static IP `34.10.53.187`. The proof commands reported Linux/GCP sandbox signals under `/sandbox/workspace/<basename>`, and the isolation case used a separate fresh sandbox.

Remaining before Phase 6 can be marked complete:

- Prove the cloud promptfoo provider against a hosted OpenShell gateway, if/when one is available.
- Add any GPU-profile smoke once OpenShell policy/resource enforcement is available and a GPU-capable OpenShell backend is confirmed.

Completed follow-ups:

- Simple result export is available via `node eval/openshell-summary.mjs` or `node eval/openshell-summary.mjs --format csv --out eval/output/openshell-summary.csv`.

## Phase 5 manual smoke checklist

With a reachable cloud gateway endpoint:

1. Create an OpenShell Cloud workspace with endpoint `https://...` and auth mode set appropriately.
2. If auth is required, click Login and confirm diagnostics change from auth-required/unavailable to ready. Confirm no token or secret value appears in Sero UI or logs.
3. Run these commands through the workspace agent `bash` tool:

```bash
echo "PWD=$PWD"
uname -a
cat /etc/os-release | head
test -f /.dockerenv && echo "DOCKER_ENV=yes" || echo "DOCKER_ENV=no"
hostname
whoami
echo "created inside $(uname -s) at $(pwd) via OpenShell Cloud" > proof-from-openshell-cloud.txt
```

4. Confirm output reports Linux/OpenShell signals, not Darwin/macOS, and `PWD` is under `/sandbox/workspace/<basename>`.
5. Confirm `proof-from-openshell-cloud.txt` appears in the host workspace after pullback.
6. Start a known dev server, confirm the preview URL is local (for example `http://127.0.0.1:<port>`), and confirm logs/diagnostics show the OpenShell `forward` flow for the selected cloud gateway.
7. Set a short idle timeout, wait for it to expire, refresh diagnostics, and confirm the cloud status menu shows a stale-session warning with advisory resource/cost copy.
8. Destroy the cloud sandbox from the cloud status menu. Confirm the action deletes only the sandbox, gateway metadata remains in the registry, and diagnostics no longer show the stale sandbox as active.

## Immediate next implementation issue

**Follow-up for Phase 3 enforcement.**

Recommended next tasks:

1. Validate OpenShell policy YAML templates for each Sero profile against the installed CLI/API.
2. Add a deliberately tested apply path for `policy set/update` or `sandbox create --policy`.
3. Decide the sandbox recreation workflow for static filesystem/process/resource changes.
4. Add enforcement-specific smoke tests before changing Phase 3 from preview/intent-only to complete enforcement.

## Completion rule

Do not mark a phase complete unless all of its acceptance criteria pass. If a phase intentionally ships with limitations, those limitations must appear in that phase’s explicit non-goals and tool behavior table.
