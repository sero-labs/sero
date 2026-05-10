# Todos: Sero-managed Docker Runtime Backend

**Tag:** `docker-runtime`
**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`
**Spec:** `/Users/danielcarter/.pi/agent/sessions/--Users-danielcarter-Documents-Dev-projects-sero-sero--/artifacts/019e1185-0efd-76a9-8998-fd44afdbe19b/context/planner-2026-05-10T11-29-01.md`

---

## TODO DOCKER-RUNTIME-01 — Add runtime backend contract, capabilities, and manager skeleton

**Status:** Done
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Create the provider-neutral runtime contract and a `RuntimeManager` skeleton for resolving one backend per workspace. This establishes the seam before Docker code exists.

### Constraints
- Use backend IDs exactly: `'apple-container' | 'docker' | 'mac-host'`.
- The interface must include lifecycle, doctor/health, exec, spawn, first-class file primitives, terminal creation, dev-server lifecycle, port forwarding, preview URL resolution, logs, and capabilities.
- Do **not** use `openshell-*` provider IDs.
- Do **not** expose raw provider APIs to plugins.
- Do not append large type blocks to `apps/desktop/src/types/ipc.ts` (currently near 500 LOC); split renderer-safe runtime types if needed.
- No `any`, no `@ts-ignore`, no inline `import('...')` type expressions.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/electron/features/workspace/runtime/types.ts` — new main-process runtime contracts.
- `apps/desktop/electron/features/workspace/runtime/capabilities.ts` — default capabilities per backend.
- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts` — new manager skeleton that resolves backend instances.
- `apps/desktop/electron/features/workspace/runtime/runtime-paths.ts` — `/workspace` ↔ host path translation helpers.
- `apps/desktop/electron/__tests__/features/workspace/runtime/runtime-types.test.ts` or equivalent — capability/resolution shape tests.

### Expected Outcome
TypeScript has a complete runtime abstraction that can represent Apple Container, Docker, and Mac Host without behavior changes. `RuntimeManager` can resolve a backend placeholder by workspace ID and expose capabilities/health.

### Example
Use this shape, matching the plan contract:

```ts
// apps/desktop/electron/features/workspace/runtime/types.ts
export type RuntimeBackendId = 'apple-container' | 'docker' | 'mac-host';
export type RuntimeWorkspaceAccess = 'host' | 'live-mount';

export interface RuntimeBackend {
  readonly backend: RuntimeBackendId;
  readonly workspaceId: string;
  readonly hostWorkspacePath: string;
  readonly runtimeWorkspacePath: string;
  readonly workspaceAccess: RuntimeWorkspaceAccess;
  readonly capabilities: RuntimeCapabilities;

  health(): Promise<RuntimeHealth>;
  ensure(): Promise<RuntimeSession>;
  exec(input: RuntimeExecInput): Promise<RuntimeExecResult>;
  readFile(input: RuntimeReadFileInput): Promise<RuntimeFileReadResult>;
  writeFile(input: RuntimeWriteFileInput): Promise<void>;
  listFiles(input: RuntimeListFilesInput): Promise<RuntimeDirectoryEntry[]>;
  createTerminal(input: RuntimeTerminalInput): Promise<RuntimeTerminalSession>;
  startDevServer(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer>;
  forwardPort(input: RuntimeForwardPortInput): Promise<RuntimeForwardedPort>;
  resolvePreviewUrl(input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl>;
  destroy(): Promise<void>;
}
```

Reference: `docs/features/runtime-provider-architecture.md` section 3 for the broader contract; update names to `mac-host` and remove OpenShell.

### Acceptance Criteria
- [ ] Runtime contract includes every method listed in the plan's “Final RuntimeBackend Contract”.
- [ ] Capabilities include files, processes, VCS, terminal, dev servers, ports, logs, browser automation, and language servers.
- [ ] `RuntimeManager` can be constructed with workspace/container managers but does not yet change app behavior.
- [ ] Tests verify backend IDs and default capability objects.
- [ ] `pnpm --filter @sero/desktop typecheck` passes.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-02 — Migrate workspace config from `container?: boolean` to `runtime.backend`

**Status:** Done
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Add provider-aware workspace runtime config with backward-compatible reads of legacy `container?: boolean`. This enables platform defaults and future runtime picker UI.

### Constraints
- Persist new config as `runtime: { backend: 'apple-container' | 'docker' | 'mac-host' }`.
- Keep reading legacy `container?: boolean` during migration.
- `container: true` maps to platform default; `container: false` maps to `mac-host` on macOS.
- Default runtime: Apple Silicon macOS → `apple-container`; macOS Intel/Windows/Linux → `docker`; global workspace → `mac-host`.
- Keep deprecated wrappers (`isContainerEnabled`, `setContainerEnabled`) only as compatibility shims while callers migrate.
- Do **not** use localStorage/sessionStorage.
- Split types instead of growing `apps/desktop/src/types/ipc.ts` beyond 500 LOC.

### Files
- `apps/desktop/src/types/workspace-runtime.ts` — new renderer-safe runtime config/provider types.
- `apps/desktop/src/types/ipc.ts` — import/re-export or reference new runtime types; add `WorkspaceInfo.runtime` without exceeding 500 LOC.
- `apps/desktop/electron/features/workspace/manager.ts` — migration/read/write helpers.
- `apps/desktop/electron/features/workspace/runtime/platform-default.ts` — platform default backend helper.
- `apps/desktop/electron/__tests__/features/workspace/workspace-runtime-config.test.ts` — migration tests.

### Expected Outcome
Existing workspaces keep loading, new writes use `runtime.backend`, and code can ask `workspaceManager.getRuntimeConfig(id)` / `setRuntimeBackend(id, backend)`.

### Example
Expected config helper shape:

```ts
// apps/desktop/src/types/workspace-runtime.ts
export type WorkspaceRuntimeBackend = 'apple-container' | 'docker' | 'mac-host';

export interface WorkspaceRuntimeConfig {
  backend: WorkspaceRuntimeBackend;
  image?: string;
  previewPortPoolSize?: number;
}

// apps/desktop/electron/features/workspace/manager.ts
async getRuntimeConfig(id: string): Promise<WorkspaceRuntimeConfig> {
  const config = await this.getConfig(id);
  if (config?.runtime?.backend) return config.runtime;
  return migrateLegacyRuntimeConfig(config, getDefaultRuntimeBackend());
}
```

Reference: `apps/desktop/electron/features/workspace/manager.ts` currently implements `isContainerEnabled()` and `setContainerEnabled()` around `config.container`.

### Acceptance Criteria
- [x] Legacy `.sero-workspace.json` with `container: true`, `container: false`, missing `container`, and new `runtime.backend` all resolve correctly.
- [x] New workspace config writes include `runtime.backend`.
- [x] `WorkspaceInfo` includes `runtime` while derived `container` remains temporarily compatible.
- [x] Tests cover macOS Apple Silicon, macOS Intel, Windows, Linux, and global workspace default behavior with mocked platform helpers.
- [x] `pnpm --filter @sero/desktop typecheck` passes.
- [x] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-03 — Implement MacHostBackend and AppleContainerBackend adapters

**Status:** Done
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Wrap existing host and Apple Container behavior behind `RuntimeBackend` without adding Docker yet. This preserves current functionality while making the seam real.

### Constraints
- Apple backend wraps existing `ContainerManager`; do not duplicate container lifecycle logic.
- Mac Host backend translates runtime `/workspace/...` paths to host workspace paths for fs/process calls.
- Apple Container primary workspace remains `/workspace`; extra roots stay identity-mounted via existing config builder.
- Apple Container's `forwardPort`/`resolvePreviewUrl` are reimplemented in TODO-07 (loopback host-port pool); this todo only needs to expose those methods on the adapter — the underlying implementation is part of TODO-07.
- No silent host fallback for selected Apple Container in new runtime manager paths.
- Browser automation and language server capabilities: Apple true where existing behavior supports it; Mac Host false unless already implemented.
- Keep old IPC channel names if necessary, but handlers should call runtime backend.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/electron/features/workspace/runtime/backends/mac-host-backend.ts` — host fs/exec/terminal/dev-server adapter.
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts` — adapter around `ContainerManager`.
- `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts` — instantiate real Mac/Apple backends.
- `apps/desktop/electron/features/workspace/runtime/runtime-paths.ts` — shared path validation/translation.
- `apps/desktop/electron/__tests__/features/workspace/runtime/mac-host-backend.test.ts` — host path/file tests.
- `apps/desktop/electron/__tests__/features/workspace/runtime/apple-container-backend.test.ts` — delegation tests.

### Expected Outcome
Current host/Apple workflows can be expressed through `RuntimeBackend`: `exec`, `readFile`, `writeFile`, `listFiles`, tree mutations, terminal creation, dev-server lifecycle, port preview, and destroy.

### Example
Adapter style:

```ts
// apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts
import type { ContainerManager } from '@electron/features/container';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import type { RuntimeBackend, RuntimeExecInput } from '../types';

export class AppleContainerBackend implements RuntimeBackend {
  readonly backend = 'apple-container' as const;
  readonly runtimeWorkspacePath = '/workspace';
  readonly workspaceAccess = 'live-mount' as const;

  async ensure() {
    const config = await buildWorkspaceContainerConfig(this.workspaceManager, this.workspaceId, this.hostWorkspacePath);
    const state = await this.containerManager.ensure(config);
    return { backend: this.backend, workspaceId: this.workspaceId, hostWorkspacePath: this.hostWorkspacePath, runtimeWorkspacePath: '/workspace', state: state.state, containerId: state.id };
  }

  exec(input: RuntimeExecInput) {
    return this.containerManager.exec(this.workspaceId, input.command, input.cwd ?? '/workspace', input.timeoutMs, {
      injectGitAuth: input.injectGitAuth,
    });
  }
}
```

Reference: `apps/desktop/electron/features/container/index.ts` has the existing `ContainerManager` methods to delegate.

### Acceptance Criteria
- [x] Apple adapter delegates lifecycle, exec, file primitives, terminal, dev-server, port preview, and destroy to existing code.
- [x] Mac Host adapter reads/writes/lists/mutates files through Node fs with `/workspace` translation.
- [x] Runtime manager returns Mac Host or Apple backend based on `workspaceManager.getRuntimeConfig()`.
- [x] Tests prove Apple adapter does not silently call host when container is missing.
- [x] Existing Apple/host tests still pass.
- [x] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-04 — Migrate agent/subagent tools, editor, terminal, and CLI paths to RuntimeBackend

**Status:** Done
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Replace normal workspace direct `containerManager.*` calls in agent tools, subagents, editor IPC, terminal IPC, and CLI editor/terminal commands with `RuntimeBackend` calls.

### Constraints
- Migrate these scout touchpoints in this todo: `ipc/agent/core/agent-session-open.ts`, `features/subagent/runtime/runner.ts`, `features/container/tools/*`, `ipc/editor/editor.ts`, `ipc/container/terminal.ts`, `cli/commands/editor/editor.ts`, `cli/commands/container/terminal.ts`.
- Keep old IPC channel names for compatibility, but implementation must be runtime-backed.
- Agent `read`/`write`/`edit`/`bash` must operate inside selected runtime; no host fallback for selected Apple/Docker.
- Browser tools must check `runtime.capabilities.browserAutomation`.
- Editor root contract remains `/workspace` for primary root.
- Do **not** call `containerManager.readFile/writeFile/listFiles/exec/terminals` from migrated files except inside `AppleContainerBackend`.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/electron/ipc/agent/core/agent-session-open.ts` — runtime-backed session/tool creation.
- `apps/desktop/electron/features/subagent/runtime/runner.ts` — runtime-backed subagent tools.
- `apps/desktop/electron/features/container/tools/*` or renamed `features/workspace/runtime/tools/*` — backend-neutral tool factory.
- `apps/desktop/electron/ipc/editor/editor.ts` — runtime fs/exec operations.
- `apps/desktop/electron/ipc/container/terminal.ts` — runtime terminal operations.
- `apps/desktop/electron/cli/commands/editor/editor.ts` — runtime file operations.
- `apps/desktop/electron/cli/commands/container/terminal.ts` — runtime terminal buffer operations.
- Tests under `apps/desktop/electron/__tests__/ipc/` and `__tests__/features/subagent/`.

### Expected Outcome
The main user loop no longer branches on `container` vs `host` outside runtime providers for tools/editor/terminal. Selected backend owns execution and file semantics.

### Example
Editor IPC should look like this, not direct `containerManager` calls:

```ts
// apps/desktop/electron/ipc/editor/editor.ts
const runtime = await runtimeManager.getRuntime(workspaceId);
const result = await runtime.readFile({ path: containerPath });
return result.content;

await runtime.writeFile({ path: containerPath, content });
const entries = await runtime.listFiles({ path: containerPath });
```

Anti-pattern to remove:

```ts
// Do NOT leave this outside AppleContainerBackend
return await containerManager.readFile(workspaceId, containerPath);
```

Reference: current direct calls are in `apps/desktop/electron/ipc/editor/editor.ts` around read/write/list/mv/rm/touch/mkdir.

### Acceptance Criteria
- [x] `rg "containerManager" apps/desktop/electron/ipc/agent apps/desktop/electron/features/subagent apps/desktop/electron/ipc/editor apps/desktop/electron/ipc/container/terminal.ts apps/desktop/electron/cli/commands/editor apps/desktop/electron/cli/commands/container/terminal.ts` shows no normal workspace direct usage.
- [x] Agent and subagent tools are built from `RuntimeBackend`.
- [x] Editor read/write/list/rename/delete/create file/create directory use runtime primitives.
- [x] Terminal create/read/dispose works through runtime terminal registry/facade.
- [x] Tests cover selected Apple runtime unavailable → actionable error, not host fallback.
- [x] `pnpm --filter @sero/desktop test -- --run` or relevant targeted tests pass.
- [x] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-05 — Migrate Git, LSP, dev-server, gateway, app-runtime, workspace lifecycle, and app shutdown seams

**Status:** Done
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Finish remaining normal workspace seam touchpoints so Docker can be added without divergent code paths.

### Constraints
- Migrate these scout touchpoints in this todo: `features/vcs/core/git-runner.ts`, `features/editor/lsp/lsp-manager.ts`, `features/workspace/runtime/start-managed-dev-server.ts`, `features/workspace/runtime/refresh-after-sync.ts`, `ipc/gateway/gateway-ops.ts`, `features/gateway/server/devserver-proxy.ts`, `features/apps/runtime/capabilities/create-host.ts`, `features/workspace/container-sync.ts`, `ipc/workspace/workspace.ts`, `app-main.ts`, shared infra singletons.
- Git must use `runtime.exec({ injectGitAuth: true })` for git/gh commands inside container runtimes.
- LSP/browser/dev-server must check backend capabilities and fail clearly when unavailable.
- Gateway proxy must consume `RuntimeDevServer.url` / `RuntimePreviewUrl`; it must not inspect container IPs.
- App boot must not globally start Apple Container on platforms/workspaces that use Docker.
- App shutdown must call `RuntimeManager.destroyAll()` and backend cleanup.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/electron/features/vcs/core/git-runner.ts` — runtime exec and auth injection.
- `apps/desktop/electron/features/editor/lsp/lsp-manager.ts` — runtime process/capability dependency.
- `apps/desktop/electron/features/workspace/runtime/start-managed-dev-server.ts` — backend dev-server start.
- `apps/desktop/electron/features/workspace/runtime/refresh-after-sync.ts` — backend dev-server restart/list.
- `apps/desktop/electron/ipc/gateway/gateway-ops.ts` — runtime dev-server/preview URL queries.
- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts` — runtime-neutral app dev-server capabilities.
- `apps/desktop/electron/features/workspace/container-sync.ts` — rename or wrap as runtime lifecycle refresh.
- `apps/desktop/electron/app-main.ts` — runtime manager boot/shutdown.
- `apps/desktop/electron/shared/infra/singletons.ts` and `shared-infra.ts` — export runtime manager.

### Expected Outcome
`containerManager` is an Apple provider implementation detail. All workspace features that Docker must support use `RuntimeBackend` or `RuntimeManager`.

### Example
Git runner pattern:

```ts
const runtime = await this.runtimeManager.getRuntime(workspaceId);
const command = buildShellCommand(program, args, extraEnv);
const result = await runtime.exec({
  command,
  cwd: runtime.runtimeWorkspacePath,
  timeoutMs,
  injectGitAuth: program === 'git' || program === 'gh',
});
```

Gateway anti-pattern:

```ts
// Do NOT keep backend-specific preview URL logic here
const containerIp = containerManager.portScanner.getIp(workspaceId);
```

Reference: `apps/desktop/electron/features/vcs/core/git-runner.ts` currently resolves binary container/host and calls `containerManager.exec`.

### Acceptance Criteria
- [x] `rg "containerManager"` in listed files only shows allowed infra wiring or Apple backend internals.
- [x] Git, LSP, dev-server, gateway, app-runtime, workspace recreate, app boot/shutdown operate through runtime manager/backends.
- [x] Gateway preview proxy stores/uses provider-neutral runtime URLs.
- [x] No new host fallback is introduced for selected Apple/Docker runtimes.
- [x] Targeted tests for git-runner, gateway ops, dev-server runtime start, and app-runtime host pass.
- [x] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-06 — Implement DockerBackend lifecycle, image, mounts, exec, terminal, and Doctor checks

**Status:** Done
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Add the Docker backend core: CLI wrapper, image ensure, container create/reuse/recreate, live mounts, UID/GID/env/git identity handling, exec, terminal, destroy, and Docker Doctor checks.

### Constraints
- Use Docker CLI through `execFile`/argument arrays. Do **not** build shell command strings for Docker arguments.
- Container name: `sero-${workspaceId}`. Add labels `ai.sero.managed=true`, `ai.sero.runtime=docker`, `ai.sero.workspaceId=${workspaceId}`.
- Primary workspace mount: `${hostWorkspacePath}:/workspace`.
- Extra roots/references/mounts identity mount; skills/prompts from `SERO_AGENT_DIR` read-only. Never use `~/.pi/agent`.
- Unix: run as host UID/GID with `HOME=/tmp/sero-home`; Windows: omit `--user` unless tested.
- Inject `TERM`, `HOST`, `VITE_HOST`, `HOSTNAME`, and `SERO_RUNTIME_BACKEND=docker`.
- Image flow: inspect → pull → local build fallback from `apps/desktop/images/Dockerfile.sero-node`.
- Preserve Git identity passthrough and trusted GitHub auth injection only when requested.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-cli.ts` — typed Docker CLI helper.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-image.ts` — inspect/pull/build image flow.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-mounts.ts` — mount args + Windows path normalization.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-lifecycle.ts` — create/reuse/inspect/stop/remove.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-terminal.ts` — PTY creation with `docker exec -it`.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-doctor.ts` — Docker health/smoke checks.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts` — compose backend.
- `apps/desktop/images/Dockerfile.sero-node` — make `/tmp/sero-home` writable and image labels/version if needed.
- Tests under `apps/desktop/electron/__tests__/features/workspace/runtime/docker-*.test.ts`.

### Expected Outcome
A Docker-selected workspace can ensure a live-mounted Linux runtime, run `bash` under `/workspace`, create host-editable files, and open a terminal. Doctor can diagnose missing/stopped Docker, image failures, mount failures, port smoke failures, networking, and permissions.

### Example
Docker run args should be built like this:

```ts
const args = [
  'run', '-d', '--name', containerName,
  '--label', 'ai.sero.managed=true',
  '--label', 'ai.sero.runtime=docker',
  '--label', `ai.sero.workspaceId=${workspaceId}`,
  '--workdir', '/workspace',
  '--env', 'TERM=xterm-256color',
  '--env', 'HOST=0.0.0.0',
  '--env', 'VITE_HOST=0.0.0.0',
  '--env', 'HOSTNAME=0.0.0.0',
  '--env', 'SERO_RUNTIME_BACKEND=docker',
  '--mount', `type=bind,source=${hostWorkspacePath},target=/workspace`,
  imageRef,
  'sleep', 'infinity',
];

await runDocker(args, { timeoutMs: 60_000 });
```

Reference: `apps/desktop/electron/features/container/core/lifecycle.ts` for existing Apple lifecycle behavior, but use Docker CLI flags and labels.

### Acceptance Criteria
- [x] Docker CLI helper returns structured stdout/stderr/exitCode and never concatenates untrusted shell args.
- [x] `docker run` args include correct name, labels, workspace mount, read-only SERO_AGENT_DIR skills/prompts mounts, env, user strategy, and image.
- [x] `docker exec` supports cwd, timeout, env, and git auth injection.
- [x] Terminal opens via `docker exec -it -w /workspace ... /bin/bash --login`.
- [x] Image helper tests cover inspect hit, pull success, pull fail + build success, pull/build failure.
- [x] Doctor tests cover missing CLI, stopped daemon, image missing, bind mount smoke, permission smoke, network smoke, and port smoke result shapes.
- [x] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-07 — Implement unified loopback host-port pool preview for Docker AND Apple Container, dev-server parity, and gateway URL routing

**Status:** Pending
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Implement a unified cross-platform preview strategy on **both Docker and Apple Container** using pre-published loopback host ports plus in-container bridges. Wire managed dev servers and gateway to provider-neutral preview URLs. Tear out the legacy Apple Container container-IP + `port+20000` bridge path.

### Constraints
- Do **not** rely on container bridge IP reachability for either backend.
- Pool size: pick a sensible default during implementation (e.g. 8–32 slots), expose as `WorkspaceRuntimeConfig.previewPortPoolSize`, document the tradeoff in code/docs.
- Docker: at container creation pre-publish internal gateway ports with `-p 127.0.0.1::${internalPort}`; let Docker pick host ports; parse `docker inspect` to build the map.
- Apple Container: pre-allocate free host ports on the loopback interface (use `net.createServer().listen(0, '127.0.0.1')` then close to discover free ports), then pass `-p 127.0.0.1:${hostPort}:${internalPort}` per slot to `container run`. Race window between port discovery and `container run` is tiny but real — catch `EADDRINUSE` failures clearly.
- When a target port is detected, allocate an internal gateway slot and start an in-container bridge from `0.0.0.0:${internalPort}` to `127.0.0.1:${targetPort}`. Same bridge implementation works on both backends.
- Always return preview URLs as `http://127.0.0.1:${hostPort}`. Both backends.
- **Pre-flight Apple Container before deleting legacy code:** verify in a smoke test that (a) multiple `-p` flags work in one `container run`, (b) pre-allocated host ports are still free when `container run` consumes them, (c) the published port is reachable on `127.0.0.1` immediately after `container run` returns. If any fail, **stop, do not ship a silent fallback**, and reach back to the main session.
- Delete the legacy Apple `port + 20000` bridge and container-IP URL paths after the new model is verified end-to-end.
- Multiple workspaces must not collide on host ports.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/electron/features/workspace/runtime/backends/preview-port-pool.ts` — shared host-port allocation/inspection helper used by both backends.
- `apps/desktop/electron/features/workspace/runtime/backends/preview-bridge.ts` — shared in-container bridge command builder.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-ports.ts` — Docker-specific inspect parsing and bridge orchestration.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts` — wire port manager.
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-ports.ts` — Apple-specific pre-allocation + bridge orchestration; replaces `features/container/network/port-forward.ts` legacy path.
- `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts` — wire port manager.
- `apps/desktop/electron/features/workspace/runtime/start-managed-dev-server.ts` — provider-neutral dev-server start.
- `apps/desktop/electron/ipc/gateway/gateway-ops.ts` — runtime dev-server URL list.
- `apps/desktop/electron/features/gateway/server/devserver-proxy.ts` — proxy stored runtime URL only.
- `apps/desktop/electron/features/container/network/port-forward.ts` — delete or stub after migration verified.
- Tests: `preview-port-pool.test.ts`, `docker-ports.test.ts`, `apple-container-ports.test.ts`, `start-managed-dev-server.test.ts`, `gateway-ops.test.ts` updates, multi-workspace collision test.

### Expected Outcome
Docker and Apple Container previews both work via `http://127.0.0.1:<hostPort>` URLs on macOS Docker Desktop, Windows Docker Desktop, Linux Docker Engine, and macOS Apple Container. Public-bound and localhost-bound dev servers both work because the internal bridge is always used. The legacy `port + 20000` Apple bridge and container-IP URL paths are removed.

### Example
Bridge command shape:

```ts
function bridgeCommand(targetPort: number, internalPort: number, marker: string): string {
  return `node -e ${shQuote(`
    process.title = ${JSON.stringify(marker)};
    require('net').createServer((client) => {
      const upstream = require('net').connect(${targetPort}, '127.0.0.1');
      client.pipe(upstream); upstream.pipe(client);
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
    }).listen(${internalPort}, '0.0.0.0');
  `)} &`;
}
```

Reference: `apps/desktop/electron/features/container/network/port-forward.ts` has existing Apple Container scanning/bridge logic; Docker should share parsing ideas but return localhost mapped URLs.

### Acceptance Criteria
- [ ] Docker `run` publishes the configured preview pool to `127.0.0.1` ephemeral host ports.
- [ ] Apple `container run` pre-allocates free loopback host ports and publishes them with explicit `-p 127.0.0.1:<hostPort>:<internalPort>` flags.
- [ ] Inspect/state parser maps internal pool ports to host ports for both backends.
- [ ] Detected target port `5173` resolves to `http://127.0.0.1:<allocatedHostPort>` for both backends.
- [ ] Localhost-bound and public-bound simulated ports both use the bridge path successfully on both backends.
- [ ] Port pool exhaustion returns an actionable runtime diagnostic (with the pool size in the message).
- [ ] `previewPortPoolSize` is configurable per workspace; default is documented in code and `docs/`.
- [ ] Gateway tests no longer assert container IP behavior for either backend.
- [ ] Multi-workspace test proves host ports differ and URLs do not collide.
- [ ] Legacy `port + 20000` Apple bridge code and container-IP URL helpers are removed.
- [ ] Apple Container regression smoke (manual or test): existing dev servers continue to be reachable through the new loopback URL.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-08 — Add renderer/preload IPC and runtime picker UX

**Status:** Pending
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Expose runtime selection/status through preload IPC and update renderer stores/UI from binary “container mode” to backend selection, including first-run defaults and runtime picker copy.

### Constraints
- Add `runtime` fields/actions without breaking legacy `container` reads during migration.
- Do **not** use localStorage/sessionStorage; workspace runtime persists only through `.sero-workspace.json` via IPC.
- Runtime picker copy:
  - Apple Container: recommended on Apple Silicon.
  - Docker: portable Linux workspace for macOS Intel/Windows/Linux.
  - Mac Host: macOS-only, advanced/less isolated.
- On Windows/Linux, Docker is the normal v1 backend; missing Docker should show setup/Doctor action, not host fallback.
- Keep Mac Host available on macOS, preferably under advanced copy.
- Update event names/types gradually; old container events may remain only if mapped to runtime events.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/src/types/workspace-runtime.ts` and IPC/preload type files — renderer runtime types.
- `apps/desktop/src/types/ipc-channels.ts` — runtime get/set/status channels or compatibility channel updates.
- `apps/desktop/electron/preload/*` — expose runtime APIs on `window.sero`.
- `apps/desktop/electron/ipc/workspace/workspace.ts` — runtime get/set handlers.
- `apps/desktop/src/types/electron-workspace.d.ts` — runtime API declarations.
- `apps/desktop/src/stores/workspace.ts` — runtime actions/state.
- `apps/desktop/src/stores/container.ts` or new `stores/runtime.ts` — backend status store.
- Runtime picker/onboarding components under `apps/desktop/src/components/`.
- Renderer tests for stores/picker/onboarding copy.

### Expected Outcome
Users can see and select Apple Container/Docker/Mac Host where appropriate. Renderer state reflects selected backend and Doctor/setup failures clearly.

### Example
Store action shape:

```ts
type WorkspaceRuntimeBackend = 'apple-container' | 'docker' | 'mac-host';

interface WorkspaceStore {
  setRuntimeBackend: (workspaceId: string, backend: WorkspaceRuntimeBackend) => Promise<void>;
}

setRuntimeBackend: async (id, backend) => {
  await window.sero.workspace.setRuntimeBackend(id, backend);
  set((state) => ({
    workspaces: state.workspaces.map((w) => w.id === id ? { ...w, runtime: { ...w.runtime, backend } } : w),
  }));
}
```

Reference: `apps/desktop/src/stores/workspace.ts` currently toggles `workspace.container` through `window.sero.workspace.setContainer`.

### Acceptance Criteria
- [ ] Renderer can read `workspace.runtime.backend` for each workspace.
- [ ] Runtime picker writes `runtime.backend` through IPC and refreshes workspace state.
- [ ] Legacy container toggle is removed or clearly mapped to runtime backend without user-facing “OpenShell” or generic “container mode” confusion.
- [ ] Platform availability/default copy matches the plan.
- [ ] Tests cover macOS picker with Mac Host advanced option and Windows/Linux Docker-only normal path.
- [ ] No localStorage/sessionStorage usage is added.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-09 — Add runtime image versioning and multi-arch GHCR publish workflow/docs

**Status:** Pending
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Make `ghcr.io/sero-labs/sero-node` usable as a shared Apple/Docker runtime image with multi-arch publishing, version labels, and clear bump behavior.

### Constraints
- Support `linux/amd64` and `linux/arm64` images.
- Release builds should use a pinned tag (`ghcr.io/sero-labs/sero-node:<version>`); `:latest` remains dev fallback until release pipeline pins version.
- Keep local build fallback from `apps/desktop/images/Dockerfile.sero-node`.
- Do not break existing workspaces on image bump; recreate container when backend detects image label/tag mismatch or user repairs runtime.
- Ensure Dockerfile supports Unix UID/GID runtime by making `/tmp/sero-home` writable.
- Do not add container-installed tools without noting that `sero-node:latest` must be rebuilt and containers recreated.
- No touched source file may exceed 500 LOC.

### Files
- `apps/desktop/images/Dockerfile.sero-node` — labels/version/writable home adjustments.
- `apps/desktop/electron/features/container/core/types.ts` or new shared image constants file — image ref/version constants.
- `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-image.ts` — consume image constants.
- `apps/desktop/electron/features/container/core/image.ts` — align Apple image helper with constants if needed.
- `.github/workflows/*` or `scripts/*` — buildx multi-arch publish workflow/script if existing release workflow permits.
- `docs/reference/runtime-images.md` or relevant docs — publish/bump/recreate instructions.

### Expected Outcome
Sero has a repeatable image publish/bump process and DockerBackend/Apple Container use consistent image constants.

### Example
Buildx command documented or scripted:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/desktop/images/Dockerfile.sero-node \
  -t ghcr.io/sero-labs/sero-node:0.1.0 \
  -t ghcr.io/sero-labs/sero-node:latest \
  --push apps/desktop/images
```

Dockerfile adjustment example:

```dockerfile
ARG SERO_NODE_VERSION=dev
LABEL org.opencontainers.image.title="Sero Node Runtime" \
      org.opencontainers.image.version="$SERO_NODE_VERSION"
RUN mkdir -p /workspace /tmp/sero-home && chmod 1777 /workspace /tmp/sero-home
```

Reference: `apps/desktop/electron/features/container/core/image.ts` currently pulls `ghcr.io/sero-labs/sero-node:latest` then builds local fallback.

### Acceptance Criteria
- [ ] Image constants are shared or intentionally duplicated with comments explaining Apple/Docker compatibility.
- [ ] Dockerfile creates writable `/tmp/sero-home` for arbitrary UID/GID runs.
- [ ] Publish workflow/script can build `linux/amd64,linux/arm64` tags.
- [ ] Docs explain pinned release tags, `:latest` dev fallback, and workspace container recreation on image bump.
- [ ] Image helper tests cover pinned tag and fallback behavior.
- [ ] No touched source file exceeds 500 LOC.

---

## TODO DOCKER-RUNTIME-10 — Delete OpenShell surfaces and update runtime docs/smoke matrix

**Status:** Pending
**Tags:** `docker-runtime`

**Plan:** `/Users/danielcarter/Documents/Dev/projects/sero/sero/.pi/plans/2026-05-10-docker-runtime-backend/plan.md`

### What
Remove OpenShell runtime/product/eval surfaces from the codebase and replace old runtime docs with the Docker-backed local runtime plan and smoke test matrix. Commit a Windows manual smoke checklist (no automated Windows CI in v1).

### Constraints
- **No archival tag.** The existing `feat/openshell-runtime-backend` branch in git history is sufficient. Just delete the active code/docs/evals.
- Delete OpenShell docs/evals/code identifiers; do not leave `openshell-local`, `openshell-remote`, or `openshell-cloud` provider IDs in active code.
- Do not delete unrelated historical `.pi/plans/*openshell*` artifacts unless explicitly asked; focus product code/docs/evals.
- Update docs to say v1 is local bind-mount Docker/Apple/Mac Host only; remote/cloud out of scope.
- Windows manual smoke checklist must be committed under `docs/reference/runtime-smoke.md` and called out in the runtime docs.
- No touched source file may exceed 500 LOC.

### Files
- Delete `docs/features/openshell/` or replace with one approved archival note.
- Update `docs/features/runtime-provider-architecture.md` to remove OpenShell candidate phases and point to Docker runtime plan.
- Delete OpenShell eval files if present:
  - `eval/output/openshell/`
  - `eval/promptfoo-openshell.yaml`
  - `eval/openshell-*`
  - `eval/openshell-replay.sh`
  - `eval/openshell-summary.mjs`
- Update `package.json`, `eval/run.sh`, or scripts referencing OpenShell evals if present.
- Add/update runtime docs and manual smoke checklist, e.g. `docs/features/docker-runtime.md` and/or `docs/reference/runtime-smoke.md`.

### Expected Outcome
`rg -i "openshell|openShell|openshell-local|openshell-remote|openshell-cloud" apps packages plugins eval docs` has no active product/code/eval hits except an explicitly approved archival note if kept.

### Example
Smoke matrix doc shape:

```md
# Runtime smoke matrix

| Platform | Backend | Required for v1 |
| --- | --- | --- |
| macOS Apple Silicon | Apple Container | automated/manual |
| macOS Intel | Docker Desktop | manual |
| Linux | Docker Engine | automated/manual |
| Windows | Docker Desktop | manual for v1 |

## Docker smoke
1. `pwd` is `/workspace` and `uname -s` is `Linux`.
2. Runtime-created file is immediately editable/deletable on host.
3. Host-created file is immediately visible from runtime.
4. Managed dev-server preview resolves to `http://127.0.0.1:<hostPort>` and gateway opens it.
```

Reference: scout context “OpenShell Deletion Surface” lists concrete files/identifiers to remove.

### Acceptance Criteria
- [ ] Active OpenShell provider IDs and UI strings are gone.
- [ ] OpenShell eval commands/config/output are removed from active scripts/docs.
- [ ] Runtime docs describe Docker/Apple/Mac Host v1 and explicitly exclude remote/cloud/policy.
- [ ] Manual smoke checklist covers macOS Apple, macOS Docker, Linux Docker, and Windows Docker manual path.
- [ ] `rg -i "openshell|openShell|openshell-local|openshell-remote|openshell-cloud" apps packages plugins eval docs` only returns approved archival note hits, or no hits.
- [ ] `pnpm typecheck` and relevant docs/script checks pass.
- [ ] No touched source file exceeds 500 LOC.
