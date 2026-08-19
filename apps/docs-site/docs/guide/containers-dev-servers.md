# Preview Dev Servers

Use this guide to start a project dev server, register it with Sero, and open the preview URL.

This page is task-focused. To choose Host, Apple Container, or Docker / Podman first, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime). For the exact support matrix, see [Support Scope](/reference/support-scope).

## Before you start

- Open the project as a Sero workspace.
- Confirm which runtime the workspace uses.
- Use the path style for that runtime:
  - Host: commands run in the real workspace folder on your computer.
  - Container runtimes: commands run inside the selected container, where the primary project is mounted at `/workspace`.

Host path caveat: `/workspace` is for container runtimes except Sero compatibility aliases. Do not use `/workspace` as a Host shell path.

## Start and register a Host dev server

Host is the default on supported platforms. Start the server normally from your project folder:

```bash
npm run dev
```

Register the port and command Sero should show:

```bash
sero devserver register --name "Web app" --port 3000 --command "npm run dev" --framework vite
```

Open the registered `127.0.0.1` URL from **Dev Servers** in Explorer, or ask the agent to preview it.

## Start and register a container dev server

For Apple Container or Docker / Podman, start the server inside the workspace runtime. Many frameworks need the server to bind to all interfaces inside the container:

```bash
npm run dev -- --host 0.0.0.0
```

Register the same port and command:

```bash
sero devserver register --name "Web app" --port 3000 --command "npm run dev -- --host 0.0.0.0" --framework vite
```

Open the forwarded loopback URL from **Dev Servers** in Explorer, or ask the agent to preview the registered URL. Do not use a container IP.

## List and stop registered servers

```bash
sero devserver list
sero devserver stop <id>
```

| Command | Use it for |
| --- | --- |
| `sero devserver list` | List registered servers for the current workspace. |
| `sero devserver register --name <name> --port <port> --command <cmd> [--framework <name>]` | Add a server entry with the command Sero can show or restart. |
| `sero devserver stop <id>` | Stop the entry through the active workspace runtime. For a Host server that you started outside Sero, this marks the entry stopped but does not kill your process. |

The registry is in memory. Re-register servers after restarting the app if the entry is gone or the URL changed.

## Preview the app

Use one of these paths:

- Open the server from **Dev Servers** in Explorer.
- Run `sero devserver list` and open the current URL.
- Ask the agent to preview the registered URL.
- Use the CLI preview command when you already have a URL:

```bash
sero app preview <registered-url>
```

## Troubleshooting quick checks

- **Server works in the terminal but preview fails in a container:** restart it with a `0.0.0.0` bind option if your framework requires one.
- **Host preview fails:** confirm the reported `127.0.0.1` URL opens in your normal browser.
- **URL stopped working after a restart:** run `sero devserver list`, then open the fresh URL or register the server again.
- **A Host process continues after stop:** stop it in the terminal where you started it. Sero does not kill a Host process that it only registered.
- **Selected container runtime is unavailable:** fix Apple Container, Docker, or Podman, or explicitly choose another supported runtime. Sero does not silently switch a selected container workspace to Host.

## Related docs

- [Choose a Workspace Runtime](/guide/choose-workspace-runtime)
- [Explorer](/guide/explorer-workspace)
- [Browser and Capture](/guide/browser-and-capture)
- [Container Isolation](/reference/container-isolation)
- [Sero CLI](/reference/sero-cli#devserver)
- [Troubleshooting](/reference/troubleshooting)
