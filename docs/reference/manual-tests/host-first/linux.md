# Host-first runtime manual test — Linux

Use this guide to validate Sero on a Linux desktop or VM (x64 or arm64 release targets). It is written for a first-time Sero tester and covers:

- Host runtime, the recommended local runtime.
- Docker/Podman container runtime as an optional fallback/upgrade.
- Managed host tools, browser automation pack, file operations, terminals, Git, dev servers, and native-build fallback behavior.

> Host mode is not a sandbox. Use Docker or Podman when you need isolation, Linux image parity, preinstalled browser automation, or native build toolchains.

## Pass/fail record

Copy this block into your test notes before you start.

```text
Tester:
Date:
Distribution/version:
Kernel:
CPU/arch:
Sero commit:
Node version:
pnpm version:
Container engine/version:
Workspace path:
Host runtime: pass/fail/not run
Docker/Podman runtime: pass/fail/not run
Browser pack: pass/fail/not run
Notes:
```

## 1. Install prerequisites

The commands below are for Ubuntu/Debian-style systems. Use your distribution's equivalent package manager if needed.

### 1.1 Install source-development tools

These tools are for running Sero from source. They are separate from Sero-managed host runtime tools.

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates python3 make g++ pkg-config
```

Install Node.js 22 and pnpm 10.33.4. One simple option is Volta:

```bash
curl https://get.volta.sh | bash
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"
volta install node@22
npm install -g pnpm@10.33.4
```

Verify:

```bash
git --version
node --version
pnpm --version
```

Expected: Node reports `v22...` and pnpm reports `10.33.4`.

### 1.2 Install a container engine

Install Docker or Podman for the full container fallback test.

Docker example:

```bash
sudo apt-get install -y docker.io
sudo usermod -aG docker "$USER"
newgrp docker
docker version
```

Podman example:

```bash
sudo apt-get install -y podman
podman version
```

Expected: the selected engine works without `sudo` in the terminal used to launch Sero.

## 2. Get and start Sero

From a terminal:

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone <SERO_REPOSITORY_URL> sero
cd sero
pnpm install
pnpm typecheck
```

Start Sero normally; Host is the default on this supported platform:

```bash
pkill -f "vite" || true
pkill -f "electron" || true
pnpm dev
```

If you want to force Podman for the container test, start Sero like this instead:

```bash
SERO_CONTAINER_ENGINE=podman pnpm dev
```

Expected: the Sero desktop window opens.

## 3. First-time Sero setup

1. Create a profile when prompted.
2. If you want to test agent-driven actions, add a model/provider API key in Sero settings. Runtime checks below can still be run with the built-in terminal and DevTools.
3. Create a disposable workspace at a normal Linux path, for example:

   ```text
   /home/<you>/Projects/sero-host-first-linux-smoke
   ```

4. Open Developer Tools with `Ctrl` + `Shift` + `I`.
5. In the DevTools Console, capture the workspace:

   ```js
   const ws = (await window.sero.workspace.list()).find((workspace) => workspace.id !== "global");
   ws;
   ```

## 4. Host runtime tests

### 4.1 Select Host

In the Sero UI, open the workspace runtime picker and choose **Host (recommended)**. Or run:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

Expected:

- Host is current/recommended.
- Docker/Podman is described as an optional fallback/upgrade, not a required default.
- Apple Container is not offered on Linux.

### 4.2 Check runtime diagnostics

Open Runtime settings or run:

```js
await window.sero.workspace.getRuntimeDiagnostics();
```

Expected:

- The selected backend is `host`.
- Core tools are `ready`, `installing`, `missing`, or `failed` with install/retry detail.
- Browser automation is `installable` when the published Linux browser-pack artifact exists and is absent locally, then `ready` only after install and launch checks. If future release-target metadata is still pending in `generated-artifacts.json`, this is release-blocking and should show unavailable/non-installable with container fallback.
- Native build tools are informational only. Sero must not claim it will install `build-essential`, GCC, Clang, or system headers as managed tools.

### 4.3 Verify managed tool storage

If Sero installs managed tools, they must be under:

```text
~/.sero-ui/toolchains/<manifest-version>/
```

Expected:

- Sero does not use `~/.pi/agent` for Sero runtime tools.
- Sero does not edit your shell profile, globally enable Corepack, or change your global npm prefix.

### 4.4 Terminal, shell, Git, and paths

Open a Sero terminal for the workspace and run:

```bash
pwd
uname -s
git status --short
node --version
pnpm --version
printf 'host linux ok\n' > host-linux-smoke.txt
cat host-linux-smoke.txt
```

Expected:

- `pwd` is the real Linux workspace path, not a real `/workspace` directory.
- `uname -s` reports `Linux`.
- Git, Node, and pnpm run from compatible system tools or Sero-managed tools.
- The file appears in the host workspace directory.

Test the `/workspace` compatibility alias through Sero file APIs, not direct host shell redirection:

```js
await window.sero.editor.createFile(ws.id, "/workspace/host-alias-smoke.txt");
await window.sero.editor.writeFile(ws.id, "/workspace/host-alias-smoke.txt", "alias ok\n");
await window.sero.editor.readFile(ws.id, "/workspace/host-alias-smoke.txt");
```

Expected: the file is created in the real workspace. Sero must not require a real host `/workspace` symlink or mount.

### 4.5 Editor and file operations

In the Sero file tree:

1. Create `manual-host-file.txt`.
2. Add text and save it.
3. Rename it to `manual-host-file-renamed.txt`.
4. Delete it.

Expected: each operation is reflected immediately on the Linux filesystem and stays inside the workspace.

### 4.6 Git and language features

1. Open or create a JavaScript/TypeScript file.
2. Wait for diagnostics/completion to initialize.
3. Run in the Sero terminal:

   ```bash
   git status --short
   git diff --stat
   ```

Expected: Git and language features run against the host workspace.

### 4.7 Managed dev server and preview

Create a tiny app in the workspace:

```bash
cat > package.json <<'JSON'
{"scripts":{"dev":"vite --host 127.0.0.1"},"dependencies":{"@vitejs/plugin-react":"latest","vite":"latest","typescript":"latest","react":"latest","react-dom":"latest"},"devDependencies":{}}
JSON
cat > index.html <<'HTML'
<div id="root">Sero Linux host smoke</div><script type="module" src="/src/main.jsx"></script>
HTML
mkdir -p src
cat > src/main.jsx <<'JS'
document.getElementById('root').textContent = 'Sero Linux host preview works';
JS
pnpm install
pnpm dev
```

Expected:

- Sero detects or lets you open the dev server preview at `http://127.0.0.1:<port>`.
- Stopping the terminal stops the dev server.

### 4.8 Browser automation pack on Host

Linux host browser automation is a release-supported beta target when the Linux GitHub Release artifact is published and verified. Do not use a local artifact override as the supported path.

1. Run the release publication gate from the repo root:

   ```bash
   pnpm --filter @sero/desktop browser-pack:verify-published
   ```

2. Open Runtime settings.
3. Confirm browser automation is shown as `installable`, not ready, when the published Linux pack is absent locally. If future release-target metadata is pending, record this as a release blocker and use Docker/Podman for browser automation.
4. Click install for the browser automation pack when the published artifact is available.
5. Watch progress until complete.
6. Confirm files are under `~/.sero-ui/toolchains/<manifest-version>/browser/` and `.installed` exists.
7. Re-run diagnostics.
8. Trigger browser automation from the agent/tooling, for example by asking for a browser screenshot of a local preview.
9. Uninstall the browser pack from Runtime settings.

Expected:

- Linux host browser automation is not claimed unless `browser-pack:verify-published` and the `release` workflow pass.
- Duplicate install clicks attach to the same in-flight install.
- Browser automation becomes ready only after install and launch checks pass.
- If Chromium cannot launch because shared libraries are missing, Sero shows actionable Linux package/install detail or container fallback. It must not fail silently.
- Uninstall returns the state to installable when a published artifact remains available.

For rebuilding/debugging the current-platform pack, use the local artifact smoke in [`../../runtime-smoke.md`](../../runtime-smoke.md#local-host-browser-pack-artifact-smoke). That flow is a developer diagnostic only.

## 5. Docker/Podman runtime tests

### 5.1 Select container runtime

The Sero backend ID is `docker` for both Docker Engine and compatible Podman flows.

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Expected:

- Docker/Podman becomes current.
- Apple Container is not offered on Linux.

### 5.2 Command, mount, terminal

In the Sero terminal:

```bash
pwd
uname -s
id -u
id -g
printf 'linux container ok\n' > /workspace/linux-container-smoke.txt
cat /workspace/linux-container-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- The file appears in the Linux workspace and can be edited/deleted by the host user without `sudo`.

On Linux host:

```bash
printf 'host edit visible\n' > /home/<you>/Projects/sero-host-first-linux-smoke/host-created.txt
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: the container sees the host-created file without a manual sync.

### 5.3 Git, LSP, dev server, browser

Repeat Host sections 4.6 and 4.7 with Docker/Podman selected.

Expected differences:

- Commands run inside the container at `/workspace`.
- Browser automation is preinstalled in the container image; it must not require the host browser pack.
- Preview URL exposed to Linux host is `http://127.0.0.1:<hostPort>`.

Optional Docker check:

```bash
docker ps --filter 'label=ai.sero.managed=true'
```

Optional Podman check:

```bash
podman ps --filter 'label=ai.sero.managed=true'
```

## 6. Native-build fallback check

On Host, trigger a Sero-owned install/build that fails with native build requirements, or use a project known to require `node-gyp`/compiler tools.

Expected:

- Sero reports `NATIVE_BUILD_TOOLS_REQUIRED` or equivalent native-build metadata.
- Sero does not auto-install `build-essential`, GCC, Clang, Python, or system headers as managed tools.
- The UI offers platform install instructions or a switch/setup path for Docker/Podman fallback.

## 7. Cleanup

```bash
pkill -f "vite" || true
pkill -f "electron" || true
rm -rf /home/<you>/Projects/sero-host-first-linux-smoke
```

Optional cleanup:

```bash
rm -rf ~/.sero-ui/toolchains
```

Only remove `~/.sero-ui/toolchains` if you intentionally want the next test to reinstall managed tools/browser assets.

## 8. Final pass criteria

Mark the Linux run as pass only if:

- Host runtime works with real Linux paths and `/workspace` remains only a compatibility alias.
- Managed tool and browser pack states are visible and actionable.
- Docker/Podman works as an optional container runtime.
- Browser automation works in containers and works on Host after published browser pack install, or reports pending-artifact / Linux shared-library remediation without claiming release support.
- Native build failures point to OS tools or container fallback, not Sero-managed compiler installs.
