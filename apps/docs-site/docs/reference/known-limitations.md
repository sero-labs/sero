# Known Limitations

Sero OSS alpha is intentionally narrow.

For the canonical supported / not-supported matrix, see
[Support Scope](/reference/support-scope).

## Platform scope

Current source-supported targets:
- macOS Apple Silicon
- Linux
- Windows

Current maintainer-validated baseline:
- macOS on Apple Silicon

Not currently promised:
- macOS Intel support
- official public binaries
- identical runtime capability on every OS
- Windows host-mode workspace execution

## Runtime limitations

Host mode is supported on macOS Apple Silicon/Linux, but it is not feature-equivalent to the preferred
container-backed runtime. Windows workspace execution uses the Docker-compatible runtime (Docker or Podman).

Expect reduced or unavailable behavior in areas such as:
- browser automation unless a published browser pack is installable for your platform and Doctor reports it `ready`
- containerized tooling and language servers
- managed preview/dev-server flows with container assumptions
- Linux/container parity

Current host browser-pack availability is artifact-driven. macOS Intel is not a supported target. Use Apple Container or Docker/Podman for browser automation while a supported platform's host browser pack is pending/non-installable.

Sero-managed host tools live under `~/.sero-ui/toolchains/<manifest-version>/`, but Sero does not install native compiler stacks such as Xcode Command Line Tools, Linux `build-essential`/gcc/make, or MSVC/Windows SDK. Install those manually with platform instructions, or use a container-backed runtime for image-provided build tooling.

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
