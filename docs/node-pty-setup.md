# node-pty Native Module Setup

## The Problem

`node-pty` ships with **prebuilt binaries** for common platform/arch/ABI
combinations. However, the prebuilds frequently don't match the exact Node
ABI version used in the project. When this happens, `pty.spawn()` fails with:

```
Error: posix_spawnp failed.
```

This error is misleading — it looks like a PATH or binary issue, but it's
actually a **native module ABI mismatch**. The prebuilt `.node` file was
compiled against a different Node ABI than the one running.

### Root cause (why the bundled install script doesn't help)

node-pty's own install script runs `node scripts/prebuild.js || node-gyp
rebuild`. The `prebuild.js` checks whether `prebuilds/darwin-arm64/`
**exists as a directory** — it does (it ships with the package), so the
script exits 0 and `node-gyp rebuild` never runs. **The ABI of the binary
inside that directory is never verified.** This is the upstream bug.

## Automatic Fix (postinstall)

The monorepo root `package.json` has a `postinstall` script that runs
`scripts/rebuild-node-pty.mjs`. This script:

1. Spawns a **subprocess** that `require()`s node-pty and tries a real
   `pty.spawn()` (catches ABI mismatches that only surface at fork time).
2. If the smoke test passes → exits immediately (~60ms no-op).
3. If it fails → runs `node-gyp rebuild` and re-verifies in a fresh
   subprocess.

**This runs automatically after every `pnpm install`.** You should never
need to rebuild manually unless the postinstall itself fails (see
Troubleshooting).

## Manual Fix

If the automatic rebuild fails or you need to rebuild for another reason:

```bash
cd /path/to/sero/sero   # monorepo root (where node_modules/.pnpm lives)
npx node-gyp rebuild --directory=node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty
```

This compiles `pty.node` and `spawn-helper` for the exact Node ABI in use.
The rebuilt binary lands in `node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/build/Release/pty.node`.

### Verify it works

```bash
node scripts/rebuild-node-pty.mjs
```

Or manually:

```bash
cd apps/desktop
node -e "
const pty = require('node-pty');
const p = pty.spawn('/bin/bash', ['-c', 'echo PTY_WORKS'], {
  name: 'xterm-256color', cols: 80, rows: 24, cwd: '/tmp', env: process.env
});
p.onData(d => process.stdout.write(d));
p.onExit(() => process.exit());
"
```

Should print `PTY_WORKS`. If you see `posix_spawnp failed`, the rebuild
didn't work — check that `node-gyp`, Python 3, and Xcode command-line tools
are installed.

## When Rebuild Happens

The postinstall script handles all of these automatically:

- **Running `pnpm install`** — pnpm may restore the prebuild, overwriting
  the locally compiled binary → postinstall detects and rebuilds
- **Changing Node version** (e.g. Volta/nvm switch, Node upgrade) → next
  `pnpm install` triggers postinstall
- **Switching machines** — prebuilds are arch-specific → postinstall detects

## Why This Happens

| Component | Detail |
|-----------|--------|
| `node-pty` version | 1.1.0 |
| Prebuild location | `node_modules/.pnpm/node-pty@1.1.0/.../prebuilds/darwin-arm64/pty.node` |
| Rebuilt location | `node_modules/.pnpm/node-pty@1.1.0/.../build/Release/pty.node` |
| Node resolves | `build/Release/` first (if it exists), then `prebuilds/` |

The prebuilt `darwin-arm64/pty.node` is compiled for a specific Node ABI
(e.g. ABI 115 for Node 20). If the project uses Node 22 (ABI 127), the
binary silently fails at `posix_spawnp` — no helpful error message.

## Architecture: How node-pty is Used in Sero

node-pty provides interactive terminal sessions inside workspace containers:

```
xterm.js (renderer)
  → IPC (sero:terminal:write / sero:terminal:data)
    → node-pty (main process)
      → /usr/local/bin/container exec -it -w /workspace sero-<wsId> /bin/bash
        → interactive shell inside Linux VM
```

- **`electron/container/terminal.ts`** — `TerminalManager` spawns PTY sessions
- **`electron/ipc/terminal.ts`** — IPC handlers bridge renderer ↔ PTY
- **`src/components/apps/coding/TerminalPanel.tsx`** — xterm.js UI
- node-pty is marked as `external` in esbuild (`scripts/build-electron.mjs`)
  so it's resolved from `node_modules` at runtime, not bundled

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `posix_spawnp failed` | ABI mismatch | Rebuild with `npx node-gyp rebuild` |
| `Cannot find module 'node-pty'` | Not installed or pnpm didn't hoist | `pnpm install` from monorepo root |
| `node-gyp` fails | Missing build tools | `xcode-select --install` |
| Works in Node but not Electron | Electron uses different ABI | Rebuild against Electron's Node: `npx electron-rebuild -m node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty` |
