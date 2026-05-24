# Host-first runtime manual test — macOS Apple Silicon

Use this guide to validate Sero on an Apple Silicon Mac (`arm64`). It is written for a first-time Sero tester and covers:

- Host runtime, the recommended local runtime.
- Apple Container runtime, the Apple-native container fallback/upgrade.
- Docker runtime, the cross-platform container fallback/upgrade.
- Managed host tools, browser automation pack, file operations, terminals, Git, dev servers, and native-build fallback behavior.

> Host mode is not a sandbox. Use Apple Container or Docker when you need stronger isolation, Linux parity, preinstalled browser automation, or native build toolchains.

## Pass/fail record

Copy this block into your test notes before you start.

```text
Tester:
Date:
Mac model:
Chip: Apple Silicon arm64
macOS version:
Sero commit:
Node version:
pnpm version:
Apple Container version:
Docker Desktop version:
Workspace path:
Host runtime: pass/fail/not run
Apple Container runtime: pass/fail/not run
Docker runtime: pass/fail/not run
Browser pack: pass/fail/not run
Notes:
```

## 1. Install prerequisites

### 1.1 Install source-development tools

These tools are for running Sero from source. They are separate from Sero-managed host runtime tools.

1. Install Xcode Command Line Tools if you do not already have them:

   ```bash
   xcode-select --install
   ```

2. Install Git, Node.js 22, and pnpm 10.33.4.

   If you already have Homebrew, install Git:

   ```bash
   brew install git
   ```

   Install Node with Volta so the expected major version is explicit:

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

### 1.2 Install container runtimes

Apple Container and Docker are optional for normal host-mode use, but install both for this full test.

1. Install Apple Container from Apple's official Container project/release channel.
2. Start it and verify it works:

   ```bash
   /usr/local/bin/container system start
   /usr/local/bin/container system status
   /usr/local/bin/container --version
   ```

3. Install Docker Desktop for Mac with Apple Silicon support.
4. Start Docker Desktop and verify:

   ```bash
   docker version
   ```

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

Start the desktop app normally; Host is the default on this supported platform:

```bash
pkill -f "vite" || true
pkill -f "electron" || true
pnpm dev
```

Expected: the Sero desktop window opens.

## 3. First-time Sero setup

1. Create a profile when prompted.
2. If you want to test agent-driven actions, add a model/provider API key in Sero settings. Runtime checks below can still be run with the built-in terminal and DevTools.
3. Create a disposable workspace at a normal macOS path, for example:

   ```text
   /Users/<you>/Projects/sero-host-first-mac-smoke
   ```

4. Open Developer Tools with `Option` + `Command` + `I`.
5. In the DevTools Console, capture the workspace:

   ```js
   const ws = (await window.sero.workspace.list()).find((workspace) => workspace.id !== "global");
   ws;
   ```

## 4. Host runtime tests

### 4.1 Select Host

In the Sero UI, open the workspace runtime picker and choose **Host (recommended)**. Or run this in DevTools:

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "host");
```

Expected:

- The runtime picker shows Host as current/recommended.
- Docker and Apple Container are described as optional upgrades/fallbacks, not required defaults.

### 4.2 Check runtime diagnostics

Open Runtime settings or run:

```js
await window.sero.workspace.getRuntimeDiagnostics();
```

Expected:

- The selected backend is `host`.
- Core tools are `ready`, `installing`, `missing`, or `failed` with install/retry detail.
- Browser automation is `installable` until the browser pack is installed and launchable.
- Native build tools are informational only. Sero must not claim it will install Xcode CLT or compiler stacks as managed tools.

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
printf 'host mac ok\n' > host-mac-smoke.txt
cat host-mac-smoke.txt
```

Expected:

- `pwd` is the real macOS workspace path, not a real `/workspace` directory.
- `uname -s` reports `Darwin`.
- Git, Node, and pnpm run from compatible system tools or Sero-managed tools.
- The file appears in Finder at the workspace path.

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

Expected: each operation is reflected immediately in Finder and stays inside the workspace.

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
<div id="root">Sero macOS host smoke</div><script type="module" src="/src/main.jsx"></script>
HTML
mkdir -p src
cat > src/main.jsx <<'JS'
document.getElementById('root').textContent = 'Sero macOS host preview works';
JS
pnpm install
pnpm dev
```

Expected:

- Sero detects or lets you open the dev server preview at `http://127.0.0.1:<port>`.
- Stopping the terminal stops the dev server.

### 4.8 Browser automation pack on Host

macOS Apple Silicon uses `browser-darwin-arm64` and is the only macOS release-supported host browser-pack target in this PR. macOS on Intel CPUs is explicitly unsupported. Published install is the supported path only after the GitHub Release artifact exists and `pnpm --filter @sero/desktop browser-pack:verify-published` passes. Local artifact smoke is only for validating an unpublished rebuild.

1. Open Runtime settings.
2. Confirm browser automation is shown as installable, not ready, if the pack is absent.
3. Click install for the browser automation pack.
4. Watch progress until complete.
5. Confirm files are under `~/.sero-ui/toolchains/<manifest-version>/browser/` and `.installed` exists.
6. Re-run diagnostics.
7. Trigger browser automation from the agent/tooling, for example by asking for a browser screenshot of a local preview.
8. Uninstall the browser pack from Runtime settings.

Expected:

- Duplicate install clicks attach to the same in-flight install.
- Browser automation becomes ready only after install and launch checks pass.
- Uninstall returns the state to installable.

## 5. Apple Container runtime tests

### 5.1 Select Apple Container

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "apple-container");
```

Expected: Apple Container becomes current.

### 5.2 Command, mount, terminal

In the Sero terminal:

```bash
pwd
uname -s
printf 'apple container ok\n' > /workspace/apple-container-smoke.txt
cat /workspace/apple-container-smoke.txt
```

Expected:

- `pwd` is `/workspace`.
- `uname -s` is `Linux`.
- The file appears in the macOS workspace and can be edited/deleted from Finder.

On macOS host:

```bash
printf 'host edit visible\n' > /Users/<you>/Projects/sero-host-first-mac-smoke/host-created.txt
```

In Sero terminal:

```bash
cat /workspace/host-created.txt
```

Expected: the container sees the host-created file without a manual sync.

### 5.3 Git, LSP, dev server, browser

Repeat Host sections 4.6 and 4.7 with Apple Container selected.

Expected differences:

- Commands run inside Linux at `/workspace`.
- Browser automation is preinstalled in the container image; it must not require the host browser pack.
- Preview URL exposed to macOS is `http://127.0.0.1:<hostPort>`.

## 6. Docker runtime tests

### 6.1 Select Docker

```js
await window.sero.workspace.setRuntimeBackend(ws.id, "docker");
```

Expected: Docker becomes current.

### 6.2 Repeat container checks

Repeat Apple Container sections 5.2 and 5.3 with filenames changed to `docker-smoke.txt`.

Also verify Docker sees a managed Sero container:

```bash
docker ps --filter 'label=ai.sero.managed=true'
```

Expected:

- Runtime files are editable by the macOS user.
- Browser automation uses the container's preinstalled browser support.
- No host browser pack install is required for Docker.

## 7. Native-build fallback check

On Host, trigger a Sero-owned install/build that fails with native build requirements, or use a project known to require `node-gyp`/compiler tools.

Expected:

- Sero reports `NATIVE_BUILD_TOOLS_REQUIRED` or equivalent native-build metadata.
- Sero does not auto-install Xcode CLT or compiler stacks.
- The UI offers platform install instructions or a switch to Apple Container/Docker fallback.

## 8. Cleanup

```bash
pkill -f "vite" || true
pkill -f "electron" || true
rm -rf /Users/<you>/Projects/sero-host-first-mac-smoke
```

Optional cleanup:

```bash
rm -rf ~/.sero-ui/toolchains
```

Only remove `~/.sero-ui/toolchains` if you intentionally want the next test to reinstall managed tools/browser assets.

## 9. Final pass criteria

Mark the macOS Apple Silicon run as pass only if:

- Host runtime works with real macOS paths and `/workspace` remains only a compatibility alias.
- Managed tool and browser pack states are visible and actionable.
- Apple Container and Docker work as optional container runtimes.
- Browser automation works in containers and works on Host after published browser pack install, or any future pending release-target artifact metadata is recorded as release-blocking.
- Native build failures point to OS tools or container fallback, not Sero-managed compiler installs.
