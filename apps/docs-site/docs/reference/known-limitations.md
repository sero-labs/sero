# Known Limitations

Sero OSS alpha is intentionally narrow.

## Platform scope

Current supported target:
- macOS on Apple Silicon

Not currently promised:
- Linux
- Windows
- official public binaries

## Runtime limitations

Host mode is supported, but it is not feature-equivalent to the preferred
container-backed runtime.

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
