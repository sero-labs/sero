# Known Limitations

Sero OSS alpha is intentionally narrow.

For the canonical supported / not-supported matrix, see
[Support Scope](/reference/support-scope).

## Platform scope

Current source-supported targets:
- macOS
- Linux
- Windows

Current maintainer-validated baseline:
- macOS on Apple Silicon

Not currently promised:
- official public binaries
- identical runtime capability on every OS
- Windows host-mode workspace execution

## Runtime limitations

Host mode is supported on macOS/Linux, but it is not feature-equivalent to the preferred
container-backed runtime. Windows workspace execution uses the Docker-compatible runtime (Docker or Podman).

Expect reduced or unavailable behavior in areas such as:
- browser automation
- containerized tooling and language servers
- managed preview/dev-server flows with container assumptions
- Linux/container parity

## Product maturity limitations

During alpha, expect some churn in:
- plugin/runtime contracts
- public docs completeness
- CI/test/eval tiering and coverage boundaries
- release engineering and packaging posture

## Distribution limitations

The current public recommendation is source-only alpha. Public binary
expectations remain out of scope until third-party redistribution constraints
and release posture are fully settled.
