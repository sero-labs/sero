# Choose a Workspace Runtime

A workspace runtime is where Sero runs commands for one project. Choose the runtime per workspace, so different projects can use different execution environments.

- **Host** runs commands directly in your real project folder on your computer. It uses your installed tools and normal `localhost` URLs.
- **Apple Container** runs commands inside a Sero-managed container on supported Apple Silicon Macs.
- **Docker / Podman** runs commands inside a Sero-managed Linux container using Docker-compatible tooling.

If you are unsure, keep **Host**. Host is the default on supported platforms. Choose a container runtime only when you want container behavior for that workspace.

For the exact platform support matrix, see [Support Scope](/reference/support-scope). For dev-server preview steps, see [Preview Dev Servers](/guide/containers-dev-servers).

## Runtime IDs

Most users can use the names above. If you are editing config or reporting an issue, use these IDs:

| Runtime | ID |
| --- | --- |
| Host | `host` |
| Apple Container | `apple-container` |
| Docker / Podman | `docker` |

## Use the default Host runtime

Use Host when you want the simplest local workflow:

- run commands in the real workspace folder
- use tools already installed on your computer
- preview dev servers through normal URLs such as `http://localhost:3000`
- avoid container setup while you are getting started

Host does not provide container isolation, container-provided tools, or Linux/container networking behavior. Host browser automation also needs an available browser pack and a passing Environment Doctor launch check.

Host path rule: use relative paths or real paths from your computer. `/workspace` is for container runtimes, except for Sero compatibility aliases; do not rely on `/workspace` as a Host shell path.

## Choose a container runtime explicitly

Choose **Apple Container** or **Docker / Podman** when a workspace needs:

- tools from the Sero runtime image instead of your host system
- Linux/container parity for commands and scripts
- container networking behavior
- browser automation from the runtime image
- more separation between workspace processes and your host environment

Apple Container is the Apple-native option on supported Apple Silicon Macs. Docker / Podman is the Docker-compatible option on supported macOS arm64, Linux, and Windows setups.

Container path rule: the primary project is available at `/workspace` inside the container. Host paths may be mounted separately, but do not assume every host folder is visible inside the container.

## Switch a workspace runtime

1. Open the workspace in Sero.
2. Open the runtime picker from the workspace tree.
3. Select **Host**, **Apple Container**, or **Docker / Podman**.
4. Retry the terminal, agent command, or dev-server action that needs the runtime.

Runtime selection is per workspace. Changing one workspace does not change every workspace.

If you select a container runtime and it is unavailable, Sero reports diagnostics for that selected runtime. It does not silently run that selected container workspace on Host. Fix the container runtime or explicitly choose another supported runtime.

## Check your choice

Use this quick decision path:

- **Not sure?** Keep Host.
- **Need normal local development and localhost?** Use Host.
- **Need container-provided tools or browser automation from the image?** Choose Apple Container or Docker / Podman.
- **Need Docker-compatible behavior across platforms?** Choose Docker / Podman.
- **On Apple Silicon and want Apple-native containers?** Choose Apple Container.

## Related docs

- [Support Scope](/reference/support-scope)
- [Preview Dev Servers](/guide/containers-dev-servers)
- [Containers and Host Mode](/reference/containers-host-mode)
- [Container Isolation](/reference/container-isolation)
- [Troubleshooting](/reference/troubleshooting)
