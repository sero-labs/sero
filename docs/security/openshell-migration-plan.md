# Docker + OpenShell Migration Plan

**Date:** 2026-03-17
**Status:** Draft — High-Level Plan
**Prerequisite:** [opensandbox-discovery-proposal.md](./opensandbox-discovery-proposal.md) (Option D)

---

## Goal

Replace Apple Containers with Docker + OpenShell as Sero's sandbox runtime. This gives Sero:
- Four-domain security (filesystem, network, process, inference) instead of zero
- Cross-platform support (macOS, Linux, Windows) instead of macOS-only
- Industry-standard container runtime with community-maintained security

## What Changes

```
Before:                              After:
┌─────────────┐                      ┌─────────────┐
│ Electron     │                      │ Electron     │
│ main process │                      │ main process │
├─────────────┤                      ├─────────────┤
│ container/   │ ← Apple Container   │ container/   │ ← Docker CLI
│ (20 files,   │   CLI calls          │ (rewritten)  │   + OpenShell gateway
│  3,600 LOC)  │                      │              │
├─────────────┤                      ├─────────────┤
│ Apple        │                      │ Docker       │
│ Container    │ ← macOS only         │ Desktop /    │ ← macOS, Linux, Windows
│ runtime      │                      │ Engine       │
└─────────────┘                      ├─────────────┤
                                     │ OpenShell    │ ← K3s-in-Docker
                                     │ Gateway +    │   Policy enforcement
                                     │ Sandbox Pods │   Credential isolation
                                     └─────────────┘
```

## What Doesn't Change

- **Agent layer** — Pi SDK, AgentSession, tool bridging, extensions — all untouched. OpenShell is drop-in compatible with any agent.
- **Renderer** — React UI, Zustand stores, IPC bridge types. The renderer doesn't know or care what container runtime is underneath.
- **Preload/IPC contract** — The IPC API surface (`window.sero.*`) stays the same. Only the main-process implementation behind it changes.

---

## Phases

### Phase 0: Spike & Validate (Do First)

Before committing to the migration, prove the core assumptions work:

- **Can OpenShell run on macOS via Docker Desktop?** It's documented as "hardware agnostic" and K3s-in-Docker, but it's alpha. Spin it up, create a sandbox, run an agent, confirm it works.
- **Can we `docker exec` into an OpenShell sandbox pod?** Sero needs interactive PTY access for terminals. Verify node-pty works with `docker exec -it`.
- **Can we bind-mount a host directory into an OpenShell sandbox?** Sero mounts workspace files at `/workspace`. Confirm this works with OpenShell's Landlock filesystem policies.
- **What's the cold-start latency?** Apple Containers start fast. Measure Docker + OpenShell sandbox creation time. If it's >5s, investigate warm pool / pre-created pods.
- **Does OpenShell's proxy conflict with Sero's HTTP proxy?** Sero currently runs `ContainerHttpProxy` for container internet access. OpenShell has its own proxy. Determine if Sero's proxy is replaced, chained, or removed.

**Deliverable:** A standalone script that creates an OpenShell sandbox on macOS via Docker, mounts a directory, runs a shell command inside it, and tears it down. If this doesn't work, stop and reassess.

### Phase 1: Docker Runtime Swap

Replace Apple Container CLI calls with Docker equivalents. This is the bulk of the migration — touching most of the 20 files in `electron/container/`.

**Files that change (grouped by concern):**

| Concern | Files | What changes |
|---------|-------|-------------|
| **Lifecycle** | `lifecycle.ts`, `index.ts`, `singleton.ts` | `container run/stop/rm` → `docker run/stop/rm`. Container naming, health checks, startup sequencing. |
| **Image** | `image.ts` | `container image` → `docker image`. Build/pull logic for sandbox images. |
| **Tool execution** | `tools-coding.ts`, `tools-browser.ts`, `tools.ts`, `tool-schemas.ts` | `container exec` → `docker exec`. Command construction, path translation. |
| **Files** | `files.ts`, `edit-helpers.ts` | `container exec cat/write` → `docker exec` equivalents. Path translation (`/workspace` mount point may change). |
| **Terminal** | `terminal.ts`, `terminal-buffer.ts` | `container exec -it` → `docker exec -it` via node-pty. |
| **Networking** | `http-proxy.ts`, `port-forward.ts` | Likely replaced/simplified — OpenShell has its own proxy. Port forwarding changes for Docker networking model. |
| **Config** | `types.ts`, `workspace-container-config.ts` | Update types for Docker container IDs, networking, volume mounts. |
| **System prompt** | `system-prompt.ts` | Update container-specific instructions (paths, available tools, environment). |
| **Other** | `truncate.ts`, `artifact-registry.ts`, `dev-server-registry.ts` | Likely minimal changes — these are higher-level abstractions. |

**Key differences to handle:**
- **Networking model:** Apple Containers use `192.168.64.x` bridge network. Docker uses its own bridge (`172.17.0.x`) or custom networks. All hardcoded IPs need updating.
- **Volume mounts:** `-v` syntax is similar but Docker has more options (named volumes, tmpfs). Workspace bind mounts should be straightforward.
- **Container naming:** `sero-<workspaceId>` naming convention carries over, just via `docker` CLI instead of `container` CLI.

### Phase 2: OpenShell Gateway Integration

Once Docker runtime swap works, layer in OpenShell for security enforcement.

- **Start the OpenShell gateway** alongside Electron (or on first workspace open). Single Docker container running K3s.
- **Create sandboxes via `openshell sandbox create`** instead of raw `docker run`. This gives us Landlock, seccomp, network proxy, and credential isolation for free.
- **Define Sero's default policy** — a YAML policy that:
  - Filesystem: read/write `/workspace` only. Read-only access to package manager caches. No access to `~/.ssh`, `/etc/shadow`, etc.
  - Network: default-deny. Allow package registries (npm, pypi, crates.io), GitHub/GitLab, and user-configured domains.
  - Process: block raw sockets, ptrace, mount, and other dangerous syscalls.
  - Inference: route AI API calls through controlled backend (optional — Sero manages its own inference currently).
- **Credential management:** Migrate from injecting `GH_TOKEN` via container exec env vars to OpenShell's provider system. Register credentials once with the gateway, let the supervisor inject them.
- **Replace `ContainerHttpProxy`** — OpenShell's binary-attributed network proxy supersedes Sero's custom HTTP proxy. Remove `http-proxy.ts` or reduce it to a thin adapter.

### Phase 3: Per-Workspace Policies

- **Policy templates** per workspace type (Node.js project, Python project, Rust project, etc.) with appropriate domain allowlists.
- **User-configurable policies** — UI for adding/removing allowed domains per workspace.
- **Hot-reload** — network and inference policies can be updated at runtime without restarting the sandbox. Wire this into workspace settings.

### Phase 4: Cross-Platform Testing

- **Linux:** Docker Engine (native, no VM overhead). Should be the easiest platform.
- **Windows:** Docker Desktop with WSL2 backend. Verify node-pty + `docker exec -it` works. Verify file watcher performance through WSL2 mounts.
- **macOS:** Docker Desktop with Hypervisor.framework. Already validated in Phase 0.

---

## Risks & Open Questions

| Risk | Severity | Mitigation |
|------|----------|------------|
| OpenShell alpha breaks in unexpected ways | High | Phase 0 spike validates before committing. Keep Apple Container code on a branch as rollback. |
| Docker Desktop cold-start latency hurts UX | Medium | Investigate warm container pool, pre-pull images, or background gateway startup. |
| K3s-in-Docker memory overhead | Medium | Measure. If too heavy for dev machines, consider running OpenShell gateway as a shared service rather than per-Sero-instance. |
| Docker Desktop licensing (>$10M revenue or >250 employees) | Low (for now) | Not an issue pre-revenue. Revisit if Sero becomes a commercial product. Alternatives: Colima, Podman, Rancher Desktop (all free, all run Docker containers). |
| node-pty + `docker exec -it` compatibility | Medium | Test in Phase 0. node-pty already works with `container exec -it` — Docker exec is more mainstream and likely better supported. |
| OpenShell doesn't support macOS-native Landlock/seccomp | N/A | These are Linux kernel features. They work inside Docker containers on macOS because Docker runs a Linux VM. This is actually a benefit — Sero gets Linux-level security even on macOS. |

## Non-Goals (For This Migration)

- **Rewriting the agent layer.** Pi SDK, tool bridging, extensions — all stay as-is.
- **Changing the UI.** No renderer changes beyond potentially adding a "workspace security policy" settings panel (Phase 3).
- **Replacing node-pty.** Terminal handling stays the same, just pointed at `docker exec` instead of `container exec`.
- **Multi-tenant / remote sandboxes.** OpenShell supports this, but Sero is single-player. Revisit post-launch if needed.

---

## Decision Needed

This plan assumes **full commitment to Docker + OpenShell** and **deprecation of Apple Containers.** The Apple Container code would be kept on a branch for rollback but not maintained long-term.

The alternative — maintaining both runtimes behind an abstraction layer — adds significant complexity for questionable benefit. If Phase 0 validates, go all-in on Docker.
