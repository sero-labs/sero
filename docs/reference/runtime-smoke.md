# Runtime smoke matrix

Use this checklist before shipping runtime changes. Sero covers local bind-mounted or direct-host runtimes only: Docker, Apple Container, and Host. Remote execution, cloud runtimes, and policy sandbox flows are out of scope.

| Platform | Backend | Coverage |
| --- | --- | --- |
| macOS Apple Silicon | Apple Container | Required smoke |
| macOS Apple Silicon/Intel | Docker Desktop | Required smoke |
| Linux | Docker Engine | Required smoke |
| Windows | Docker Desktop | Manual smoke |
| macOS/Linux | Host | Manual smoke |

Windows runs Docker only — there is no host runtime on Windows. Browser automation is container-only. Host runtime smoke covers file ops, exec/spawn, terminal, Git/VCS, language servers, managed dev servers, and preview URLs.

The Docker backend works with either `docker` or `podman`. Smoke checklists below apply to both; substitute `podman` for `docker` in any manual command. To force one engine when both are installed, set `SERO_CONTAINER_ENGINE=docker` or `SERO_CONTAINER_ENGINE=podman`.

## Core checklist for Apple Container and Docker

1. Create or open a workspace and confirm the selected runtime matches the platform/default expectation.
2. Run an agent `bash` command and confirm `pwd` is `/workspace` and `uname -s` is `Linux`.
3. Create a file from the runtime; confirm the host editor can read, edit, and delete it without sync.
4. Create or edit a file on the host; confirm runtime `cat` sees the change immediately.
5. Open an interactive terminal and confirm it starts in `/workspace`.
6. Run Git status/diff/commit flow and confirm auth injection still works for Git/GitHub operations.
7. Start LSP/browser automation where the selected backend reports the capability.
8. Start a managed dev server, open the gateway preview, then stop and restart it.
9. Confirm preview URLs resolve through `http://127.0.0.1:<hostPort>` and not container bridge IPs.
10. Run two workspaces at the same time and confirm their preview host ports do not collide.
11. Run Environment Doctor and confirm missing runtime, stopped daemon, image, mount, permission, and port failures are actionable.

## macOS Apple Container

- Confirm Apple Container is the recommended/default runtime on Apple Silicon when available.
- Confirm multiple preview pool ports are published at runtime creation.
- Confirm localhost-bound and public-bound dev servers both load through the loopback preview URL.

## macOS Docker Desktop

- Confirm Docker Desktop is running before workspace ensure.
- Confirm the workspace container is named `sero-<workspaceId>` and has Sero runtime labels.
- Confirm runtime-created files are owned so the macOS user can edit and delete them.

## Linux Docker Engine

- Confirm Docker CLI and daemon are available for the current user.
- Confirm Docker runs the workspace container as the host UID/GID.
- Confirm runtime-created files can be edited and deleted by the host user without `sudo`.

## Windows Docker Desktop manual checklist

1. Start Docker Desktop and confirm Linux containers are enabled.
2. Open or create a Sero workspace on a normal Windows path, for example `C:\Users\<you>\Projects\sero-smoke`.
3. Select Docker if it is not already the default runtime.
4. Run `pwd && uname -s` from agent `bash`; expect `/workspace` and `Linux`.
5. Run `echo from-runtime > runtime-file.txt`; confirm the file appears in Windows Explorer and can be edited/deleted from the host.
6. Create `host-file.txt` from the Windows editor; run `cat host-file.txt` inside the runtime and confirm the contents are current.
7. Open a terminal and confirm it starts at `/workspace`.
8. Start a Vite or equivalent dev server; confirm the Sero preview opens through `http://127.0.0.1:<hostPort>`.
9. Stop and restart the dev server; confirm the gateway preview still works.
10. Open a second workspace and repeat the dev-server preview check; confirm host ports differ.
11. Run Environment Doctor; verify Docker stopped/missing and bind-mount permission failures produce clear action text.
12. Record Docker Desktop version, Windows version, workspace path, runtime image tag, and any ACL or file-watcher anomalies in the release notes.

## Host runtime spot checks

Use backend ID `host`. The deprecated `mac-host` value is accepted only for config migration and should not be selected in manual smoke. Host runtime is supported on macOS and Linux only; on Windows the runtime picker offers Docker only.

Run the detailed host smoke flow in `docs/reference/runtime-manual-test.md` on macOS host and Linux host. Confirm it covers file ops, exec, terminal, Git, LSP, managed dev server, and preview URL behavior.
