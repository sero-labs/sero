# Support Scope

Use this page to check the platforms and runtimes that the current Sero release
supports.

## Desktop platforms

| Platform | Architecture | Packaged artifacts |
| --- | --- | --- |
| macOS | Apple Silicon (`arm64`) | DMG for installation; ZIP for updates |
| Linux | `x64`, `arm64` | DEB and AppImage |
| Windows | `x64` | Setup EXE |

Sero does not support macOS on Intel CPUs or Windows arm64. GitHub Releases is
the source for current artifact names. The release workflow can build all four
supported targets, but a release can contain only the targets that its publisher
selected.

The build configuration supports Apple code signing when release credentials
are available. It also permits an ad hoc signed macOS build when they are not.
Check the release notes and your operating system before you rely on the signing
or notarization state of a downloaded artifact.

## Updates

macOS ZIP, Linux AppImage, and Windows Setup EXE builds check for updates at
startup and every six hours. When an update is available, Sero downloads it in
the background. Select **Restart to update** after the download finishes. You
can also select **Check for Updates…** from the application menu.

Linux DEB packages do not use automatic updates. Download and install a new DEB
package from GitHub Releases.

Source builds do not use this update process. Update a source checkout with its
normal development workflow.

## Workspace runtimes

| Runtime | macOS arm64 | Linux x64/arm64 | Windows x64 |
| --- | --- | --- | --- |
| Host (`host`) | Default | Default | Default |
| Apple Container (`apple-container`) | Available | Not available | Not available |
| Docker / Podman (`docker`) | Available | Available | Available |

Host runs commands in the workspace folder on your computer. Host browser
automation requires an available browser pack and a successful Environment
Doctor launch check.

Container runtimes are explicit workspace choices. Apple Container requires the
Apple `container` CLI on Apple Silicon. Docker / Podman requires a working Docker
or Podman engine. Container capabilities and networking are not identical to
Host capabilities.

## Support boundaries

Sero does not promise:

- the same runtime features on each operating system
- stable internal plugin and runtime APIs
- a hardened multi-tenant security boundary
- support for defects in third-party plugin code
- a response time for public support requests

Use [GitHub Issues](https://github.com/sero-labs/sero/issues) for a reproducible
bug or documentation problem. Use a pull request for a focused change that you
can implement. For a security problem, follow
[`SECURITY.md`](https://github.com/sero-labs/sero/blob/main/SECURITY.md) instead
of filing a public issue.

Include the operating system, CPU architecture, install method, workspace
runtime, and Environment Doctor result in a bug report. Remove tokens, private
paths, and project data from logs and screenshots.

## Related docs

- [Known Limitations](/reference/known-limitations)
- [Choose a Workspace Runtime](/guide/choose-workspace-runtime)
- [Environment Doctor](/reference/environment-doctor)
- [Troubleshooting](/reference/troubleshooting)
- [Security / Privacy](/reference/security-privacy)
