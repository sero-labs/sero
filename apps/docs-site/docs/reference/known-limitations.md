# Known Limitations

For the current support matrix, see [Support Scope](/reference/support-scope).

## Platform scope

Packaged releases target:

- macOS Apple Silicon
- Linux x64/arm64
- Windows x64

Sero does not support macOS on Intel CPUs or Windows arm64. Runtime features can
differ by operating system and runtime.

## Runtime limitations

Host is the default runtime on supported platforms. It is not equivalent to a
container runtime.

Host does not provide container isolation, container networking, or tools from
the Sero container image. Host browser automation also requires a browser pack
for the platform and a successful Environment Doctor launch check.

Apple Container and Docker / Podman are explicit per-workspace choices. Use a
container runtime when you need container isolation, networking, or provided
tools. Existing containers do not receive image changes automatically. Recreate
an affected workspace container after its image changes.

Sero-managed Host tools live under `~/.sero-ui/toolchains/<manifest-version>/`.
Sero does not install native compiler stacks such as Xcode Command Line Tools,
Linux `build-essential`, or the Windows SDK. Install required system tools or
use a container runtime that provides the tools.

## Distribution limitations

Packaged artifacts are available from [GitHub Releases](https://github.com/sero-labs/sero/releases).
Exact filenames can change between releases. Packaged builds check for updates
when they start and every six hours. They download an available update in the
background and ask you to restart when it is ready.
