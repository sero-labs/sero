# Managed RTK Toolchain Specification

## Purpose

Sero pins one exact RTK version for the host and for workspace containers, and
tells agent extensions where that binary is and which state directory to use,
so a command rewritten by one binary is always supported by the binary that
runs it.

## Requirements

### Requirement: RTK is a managed toolchain artifact

RTK SHALL be declared in the Sero toolchain manifest with an exact version,
per-platform artifacts, and verified checksums. The artifact schema SHALL carry
the exact version so the pin is a field the image check can read. The host MUST
resolve RTK from the Sero-managed copy and MUST NOT resolve it from the user's
`PATH`.

#### Scenario: RTK is absent on the host

- **WHEN** no managed RTK is installed and a session requests it
- **THEN** the host installs the pinned artifact from the manifest, verifies its checksum and exact version, and reports the resolved path only after verification succeeds

#### Scenario: A managed artifact fails verification

- **WHEN** a downloaded artifact's checksum does not match the manifest, or its version does not equal the pinned version
- **THEN** the host discards it, reports the failure, and continues to report RTK as unavailable

#### Scenario: The user has a different RTK on PATH

- **WHEN** an `rtk` executable exists on the host `PATH` at a version other than the pinned one
- **THEN** the host does not use it and continues to resolve only the managed copy

### Requirement: Host and container pin the same RTK version

The `sero-node` container image MUST install the same RTK version the host
toolchain manifest pins. The host SHALL compare the container's reported
version with the resolved host version before a session uses RTK, and MUST NOT
apply a rewrite produced by a different RTK version than the binary that will
execute it.

#### Scenario: Pinned versions agree

- **WHEN** a containerised workspace session requests a rewrite decision
- **THEN** the host uses the pinned binary, confirms the container reports the same version, and the command it produces is supported by the RTK version inside the container

#### Scenario: Pinned versions disagree

- **WHEN** the resolved host version does not equal the version the container reports
- **THEN** rewriting is disabled for that session and the mismatch is reported with both versions

### Requirement: Extensions can resolve the RTK executable

The host SHALL answer an extension request for the resolved RTK executable
paths for host probes and runtime execution, version, and separate session-scoped
state environments for both execution locations. The request SHALL
name the session so the answer can give a state directory that is writable
where that session runs commands. The request SHALL start the first-use managed
install when no verified copy exists. The answer MUST distinguish an available
binary from an unavailable one, MUST include a reason when unavailable, and
MUST NOT fail the requesting session in either case.

#### Scenario: RTK is available

- **WHEN** an extension requests the RTK executable and a verified managed copy exists
- **THEN** the host answers with verified absolute paths for both execution locations, the version, and writable state environments for each

#### Scenario: RTK is unavailable

- **WHEN** an extension requests the RTK executable and no verified copy exists
- **THEN** the host starts the managed install, answers that RTK is unavailable with a reason while the install runs or if it fails, and the session continues

#### Scenario: Host state is cleaned with the session

- **WHEN** a session that used a host-side RTK state directory is deleted
- **THEN** that directory is removed unless surviving inherited captures can still reference its recovery output, in which case it remains until those references are released

### Requirement: RTK absence never blocks a session

When RTK cannot be resolved, verified, or executed, sessions MUST start
normally and shell commands MUST run unmodified.

#### Scenario: Session starts without RTK

- **WHEN** a session starts on a host where RTK cannot be resolved
- **THEN** the session opens with its full tool set and every command runs as written

#### Scenario: Resolution fails mid-session

- **WHEN** RTK becomes unresolvable after a session has started
- **THEN** subsequent commands run unmodified and the session does not report an error state

### Requirement: Rewrites execute the verified binary

Every inserted RTK invocation MUST execute the verified runtime binary,
independently of shell startup files and command-local PATH values. Host probes
MUST use the verified host binary. If execution cannot be bound to the verified
binary, the command MUST run as written. Availability MUST be refreshed after
installation, repair, pin changes and container replacement.

#### Scenario: Another RTK shadows PATH

- **WHEN** PATH or shell startup configuration selects a different RTK
- **THEN** a rewritten invocation still executes the verified absolute runtime binary

#### Scenario: Installation completes after an unavailable answer

- **WHEN** installation succeeds during an open session
- **THEN** a later resolution request can return the available executable without restarting the session

#### Scenario: Container is replaced

- **WHEN** the workspace container is replaced while the session runs
- **THEN** the next resolution probes the new container instead of reusing the previous container's answer, and a version that now matches the pin enables rewriting

#### Scenario: Runtime reports no container instance

- **WHEN** a backend reports only the stable workspace container name
- **THEN** the system probes on every resolution rather than caching an answer that a replacement would invalidate

### Requirement: RTK tracking and recovery stay in managed state

RTK tracking and both file and database recovery output SHALL use the supplied
session state locations on the host and in the command runtime. An existing
user configuration MUST NOT redirect these writes to the user's data directory.
Per-call environments MUST NOT alter another session's state location.

#### Scenario: Existing file recovery configuration

- **WHEN** a user has configured RTK to use file recovery and two sessions execute rewritten commands
- **THEN** each session's tracking and recovery files are written only under its supplied state location

#### Scenario: Database recovery configuration

- **WHEN** RTK uses database recovery
- **THEN** tracking and recovery databases are distinct files under the supplied session state location
