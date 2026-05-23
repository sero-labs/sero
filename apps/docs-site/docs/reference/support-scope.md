# Support Scope

This page is the canonical public support matrix for the Sero OSS alpha.
If another page is broader, more aspirational, or less specific, **this page wins** for current alpha expectations.

## Supported alpha baseline

| Surface | Status | Notes |
| --- | --- | --- |
| Platform | Supported alpha | Source builds on macOS Apple Silicon, Linux x64/arm64, and Windows x64 |
| Current maintainer-validated baseline | Validated | macOS `26.3`, `arm64`, Node `22.22.0`, pnpm `10.11.0` |
| Distribution | Supported | Build from source only |
| Default workspace runtime | Supported / recommended | Host is the default on supported Host platforms |
| Container runtimes | Supported explicit choices | Apple Container on macOS arm64; Docker / Podman on macOS arm64, Linux, and Windows |
| Browser automation | Supported where ready | Host requires an available browser pack and a passing Environment Doctor launch check; container runtimes use the runtime image |
| Support channel | Supported | GitHub Issues and Pull Requests |
| Official public binaries | Not supported | No public binary distribution promised in alpha |
| Stable internal plugin/runtime APIs | Not promised | Contracts may still evolve during alpha |

## Runtime support matrix

This table is the public support contract for the current source-only alpha.

| Runtime | macOS arm64 | Linux x64/arm64 | Windows x64 | Not supported |
| --- | --- | --- | --- | --- |
| Host (`host`) | Default; browser automation needs a Doctor-ready browser pack | Default; browser automation needs a Doctor-ready browser pack | Default; browser automation needs a Doctor-ready browser pack | macOS Intel; Windows arm64 |
| Apple Container (`apple-container`) | Supported explicit container choice | Not available | Not available | All non-macOS-arm64 targets |
| Docker / Podman (`docker`) | Supported explicit container choice | Supported explicit container choice | Supported explicit container choice | Requires a working Docker or Podman engine |

If you are unsure which runtime to choose, use the default Host runtime. Select Apple Container or Docker / Podman explicitly when you want container-provided tools, isolation, Linux/container parity, or container networking behavior.

## Host runtime

Host runs commands directly in the real workspace folder on your computer. It uses normal localhost URLs and compatible system tools. It does not provide container isolation, container-provided toolchains, or Linux/container networking semantics.

Host is the default runtime on:

| Platform | Architecture | Host status | Browser pack status |
| --- | --- | --- | --- |
| macOS | arm64 | Supported and default | Available when Environment Doctor passes launch checks |
| Linux | x64 | Supported and default | Available when Environment Doctor passes launch checks |
| Linux | arm64 | Supported and default | Available when Environment Doctor passes launch checks |
| Windows | x64 | Supported and default | Available when Environment Doctor passes launch checks |

Host browser automation has two requirements:

1. A browser pack artifact must be available for the platform.
2. Environment Doctor must verify that Sero can install and launch it.

Current available Host browser-pack artifacts are `browser-darwin-arm64`, `browser-linux-x64`, `browser-linux-arm64`, and `browser-win32-x64`. Windows arm64 has no available public pack today.

## Container runtimes

Container runtimes are explicit per-workspace choices, not the normal default path on supported Host platforms.

Apple Container is available on Apple Silicon Macs through Apple's `container` CLI. Docker / Podman is the cross-platform container option on macOS arm64, Linux, and Windows. Both container runtimes use Sero-managed Linux image contents for container-provided tools and browser automation.

Existing containers do not automatically receive Dockerfile or base-tooling changes. Recreate affected workspace containers after Sero changes container images or installed tools.

## Unsupported targets and alpha limits

The public alpha does **not** currently promise:

- macOS on Intel CPUs
- Windows arm64 support
- official public binaries
- identical runtime capabilities on every OS
- full feature parity between Host and container runtimes
- frozen internal plugin/runtime contracts
- a hardened multi-tenant security boundary

## Issue-reporting guidance

When filing a bug, include which support surface you were using:

- operating system and version
- CPU architecture
- Node / pnpm versions
- runtime mode: Host (`host`), Apple Container (`apple-container`), or Docker / Podman (`docker`)
- whether Environment Doctor passed, warned, or failed
- whether browser automation was using Host browser packs or a container runtime
- whether the issue happened in source-built alpha or a local experimental build

## Early alpha support / triage plan

Use the public support surfaces like this:

- **Bug report** — regressions, broken supported workflows, or behavior that no longer matches the documented alpha support scope
- **Support question** — setup help, troubleshooting, confusing docs, or uncertainty about runtime/configuration
- **Pull request** — small fixes, docs improvements, or targeted corrections when you already know the change
- **Private security reporting** — anything security-sensitive; follow `SECURITY.md` instead of filing publicly

What maintainers will triage first during alpha:

- issues on the maintainer-validated baseline (`macOS` on Apple Silicon, source build)
- install / launch / data-loss / security-sensitive regressions
- documented Host and container runtime problems on supported targets
- docs gaps that block setup or truthful usage of the alpha

What reporters should expect:

- **best-effort handling during alpha** — there is no response SLA yet
- maintainers may ask for a minimal repro, commit SHA, runtime mode, Doctor result, and redacted logs before acting
- unsupported platform/runtime combinations, unsupported binary expectations, heavily modified local builds, and third-party plugin issues may be redirected or closed as out of scope
- issues without enough detail to reproduce may be closed until more information is available

A good first signal for early triage is:

- the exact command or workflow that failed
- whether you were using Host, Apple Container, or Docker / Podman
- the commit, branch, or tag you tested
- the smallest redacted log excerpt that shows the failure

## Related docs

- [Known Limitations](/reference/known-limitations)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Environment Doctor](/reference/environment-doctor)
- [Installation / Requirements](/guide/installation-requirements)
- [Troubleshooting](/reference/troubleshooting)
- [Security / Privacy](/reference/security-privacy)
