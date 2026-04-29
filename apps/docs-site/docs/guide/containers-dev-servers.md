# Containers and Dev Servers

Sero can run each workspace inside a macOS Apple container. That gives the agent, terminals, tools, and dev servers a shared Linux-like workspace at `/workspace` while the project remains stored on your Mac.

Use this guide when you want to start a project server and preview it in Sero without fighting host port conflicts.

## Quick path

1. Open a workspace in Sero.
2. Keep container mode enabled for the workspace when the runtime is available.
3. Start your server from the workspace terminal or agent, binding to all interfaces when your framework needs it:

```bash
npm run dev -- --host 0.0.0.0
```

4. Register the server so Sero can show and reopen it:

```bash
sero devserver register --name "Web app" --port 3000 --command "npm run dev -- --host 0.0.0.0" --framework vite
```

5. Open the URL from Explorer's dev-server panel, or ask the agent to preview it:

```bash
sero devserver list
sero app preview http://<container-ip>:3000
```

## What runs where

```text
Agent / Explorer terminal
        ↓
workspace container `sero-<workspaceId>`
        ↓
project files mounted at `/workspace`
        ↓
dev server listens on container port
        ↓
Sero dev-server registry exposes URL using detected port/container IP
        ↓
Explorer browser or in-app preview displays the app
```

Sero creates one container per workspace when container mode is enabled and a runtime action needs it.

## Why this helps with ports

A dev server running inside a workspace container listens on that container's network address. That means two workspaces can usually run servers on the same port inside separate containers without both binding the same host port.

This reduces host port conflicts, but it does not eliminate every networking issue. A preview can still fail if:

- the server only binds `localhost` inside the container instead of `0.0.0.0`
- the container IP changed after a restart
- the server process stopped but the registry entry remains
- container networking, proxy, or DNS is unhealthy
- the workspace is in host mode, where managed preview behavior is reduced

## Register, list, and stop servers

| Command | Use it for |
|---|---|
| `sero devserver list` | List registered servers for the current workspace. |
| `sero devserver register --name <name> --port <port> --command <cmd> [--framework <name>]` | Add a server entry with the command Sero can show/restart. |
| `sero devserver stop <id>` | Stop the registered server by killing the listening port inside the container. |

The registry is in memory. Do not treat registered dev servers as durable state across app restarts.

## Attached folders and references

A workspace has a primary project root. Sero can also show attached roots and references in Explorer. When container-backed execution is active, roots that need agent access are mounted into the workspace container according to workspace configuration.

Attaching a folder or mounting plugin source can require container recreation before the new mount is visible inside the container. If a terminal does not see a newly attached folder, restart or recreate the affected workspace container.

## Host mode

If Apple's `container` runtime is unavailable, Sero can continue in host mode. Host mode is useful for core chat, files, editing, and regular local development, but it is not feature-equivalent for container networking, browser automation, or managed dev-server preview.

Use [Containers and Host Mode](/reference/containers-host-mode) for the fallback matrix and [Container Isolation](/reference/container-isolation) for lifecycle and mount details.

## Troubleshooting quick checks

- Server works in terminal but preview fails: confirm it binds to `0.0.0.0`, then re-register with the current port/URL.
- Host port already used: prefer a container-backed workspace so the server listens inside the workspace container.
- URL stopped working after restart: run `sero devserver list`; if the container IP changed, open the fresh URL or register again.
- Stop does nothing: copy the exact server id from `sero devserver list` and run `sero devserver stop <id>`.

## Related docs

- [Explorer](/guide/explorer-workspace)
- [Browser and Capture](/guide/browser-and-capture)
- [Container Isolation](/reference/container-isolation)
- [Sero CLI](/reference/sero-cli#devserver)
- [Troubleshooting](/reference/troubleshooting)
