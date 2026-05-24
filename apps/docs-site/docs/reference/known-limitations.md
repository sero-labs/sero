# Known Limitations

Sero public beta is intentionally conservative.

For the canonical supported / not-supported matrix, see [Support Scope](/reference/support-scope).

## Platform scope

Current packaged beta targets:

- macOS Apple Silicon
- Linux x64/arm64
- Windows x64

Current maintainer-validated baseline:

- macOS on Apple Silicon

Not currently promised:

- macOS on Intel CPUs is unsupported
- Windows arm64 is future/unsupported
- packaged beta artifacts outside the supported targets
- identical runtime capability on every OS

## Runtime limitations

Host is the default runtime on supported platforms, but it is not feature-equivalent to container runtimes.

Expect reduced or unavailable behavior in areas such as:

- browser automation unless an available Host browser pack is installable for your platform and Environment Doctor passes launch checks
- containerized tooling and language servers
- managed preview/dev-server flows with container assumptions
- Linux/container parity and container networking semantics

Apple Container and Docker / Podman remain supported explicit per-workspace choices when you want container-provided tools, isolation, or container networking behavior. Existing containers do not automatically receive Dockerfile or base-tooling changes; recreate affected workspace containers after image or installed-tool changes.

Sero-managed Host tools live under `~/.sero-ui/toolchains/<manifest-version>/`, but Sero does not install native compiler stacks such as Xcode Command Line Tools, Linux `build-essential`/gcc/make, or MSVC/Windows SDK. Install those manually with platform instructions, or use a container runtime for image-provided build tooling.

## Product maturity limitations

During beta, expect some churn in:

- plugin/runtime contracts
- public docs completeness
- CI/test/eval tiering and coverage boundaries
- release engineering and packaging posture

## Distribution limitations

Packaged beta artifacts are available for supported targets from [GitHub Releases](https://github.com/sero-labs/sero/releases). Exact filenames can change between beta releases, and new releases may require manual download unless release notes say otherwise. Developers and contributors can still build from source.
