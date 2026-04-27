# Support Scope

This page is the canonical public support matrix for the Sero OSS alpha.

If another page is broader, more aspirational, or less specific, **this page
wins** for current alpha expectations.

## Supported alpha baseline

| Surface | Status | Notes |
| --- | --- | --- |
| Platform | Supported | macOS on Apple Silicon |
| Current maintainer-validated baseline | Validated | macOS `26.3`, `arm64`, Node `22.22.0`, pnpm `10.11.0` |
| Distribution | Supported | Build from source only |
| Preferred runtime | Supported / recommended | Apple `container` CLI enabled |
| Fallback runtime | Supported | Host mode with reduced capabilities |
| Support channel | Supported | GitHub Issues and Pull Requests |
| Official public binaries | Not supported | No public binary distribution promised in alpha |
| Linux | Not supported | Out of current alpha scope |
| Windows | Not supported | Out of current alpha scope |
| Stable internal plugin/runtime APIs | Not promised | Contracts may still evolve during alpha |

## Runtime support matrix

### Container-backed runtime

This is the preferred and intended runtime for Sero.

Container-backed workspaces are the supported path for:
- containerized workspace execution
- containerized tooling and language servers
- browser automation
- managed preview / dev-server flows with container assumptions
- Linux/container parity and container networking semantics

### Host mode

Host mode is a **supported fallback**, not a feature-equivalent replacement for
container-backed runtime.

Host mode is currently supported for:
- onboarding and provider setup
- core agent chat and coding tasks
- file browsing and editing
- general host-shell development workflows

Host mode is **not** currently the supported path for:
- browser automation
- containerized language servers
- feature-equivalent managed preview / dev-server automation
- Linux/container parity
- container networking semantics

## What alpha does not currently promise

The public alpha does **not** currently promise:
- Linux support
- Windows support
- official public binaries
- full feature parity without Apple containers
- frozen internal plugin/runtime contracts
- a hardened multi-tenant security boundary

## Issue-reporting guidance

When filing a bug, include which support surface you were using:
- macOS version
- Apple Silicon confirmation
- Node / pnpm versions
- runtime mode: container-backed or host mode
- whether the issue happened in source-built alpha or a local experimental build

## Early alpha support / triage plan

Use the public support surfaces like this:
- **Bug report** — regressions, broken supported workflows, or behavior that no
  longer matches the documented alpha support scope
- **Support question** — setup help, troubleshooting, confusing docs, or
  uncertainty about runtime/configuration
- **Pull request** — small fixes, docs improvements, or targeted corrections
  when you already know the change
- **Private security reporting** — anything security-sensitive; follow
  `SECURITY.md` instead of filing publicly

What maintainers will triage first during alpha:
- issues on the supported baseline (`macOS` on Apple Silicon, source build)
- install / launch / data-loss / security-sensitive regressions
- container-backed runtime problems and documented host-mode fallback problems
- docs gaps that block setup or truthful usage of the alpha

What reporters should expect:
- **best-effort handling during alpha** — there is no response SLA yet
- maintainers may ask for a minimal repro, commit SHA, runtime mode, and
  redacted logs before acting
- unsupported platforms, unsupported binary expectations, heavily modified local
  builds, and third-party plugin issues may be redirected or closed as out of
  scope
- issues without enough detail to reproduce may be closed until more
  information is available

A good first signal for early triage is:
- the exact command or workflow that failed
- whether you were using container-backed runtime or host mode
- the commit, branch, or tag you tested
- the smallest redacted log excerpt that shows the failure

## Related docs

- [Known Limitations](/reference/known-limitations)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Remote Control](/guide/remote-control)
- [Installation / Requirements](/guide/installation-requirements)
- [Troubleshooting](/reference/troubleshooting)
- [Security / Privacy](/reference/security-privacy)
