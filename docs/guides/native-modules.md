# Native Module Builds for Sero

Sero runs in Electron, which bundles its own version of Node.js with a specific module ABI. Native Node.js addons (`.node` files) must be compiled against that ABI, not the system Node.js or Bun. Standard `npm rebuild` or `pnpm rebuild` will compile against the wrong runtime and produce an `ERR_DLOPEN_FAILED` error at startup.

## TL;DR

This is handled automatically. The `postinstall` script (`scripts/rebuild-better-sqlite3.mjs`) runs after every `pnpm install` and fixes the binary if needed. You shouldn't need to do anything manually.

If you ever need to run it by hand:

```bash
cd ~/Documents/Dev/projects/sero/sero
node scripts/rebuild-better-sqlite3.mjs
```

Or directly via `@electron/rebuild`:

```bash
npx @electron/rebuild \
  --version 33.4.11 \
  --module-dir node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3 \
  --which-module better-sqlite3
```

## When a Manual Run Might Be Needed

- The `postinstall` script is disabled or skipped (e.g. `pnpm install --ignore-scripts`)
- Upgrading Electron (update `--version` in the script and the command above)
- Upgrading `better-sqlite3` (update the module path)

## Why

| Runtime | Node module ABI |
|---------|----------------|
| System Node.js 22 | 127 |
| Bun | 137 |
| **Electron 33** | **different from both** |

`better-sqlite3` is a native C++ addon. The binary compiled by a plain `npm rebuild` targets whichever Node.js is on your `PATH` — not the Electron-bundled one. `@electron/rebuild` fetches the correct Electron headers and compiles against those instead.

## Checking the Electron Version

```bash
cat ~/Documents/Dev/projects/sero/sero/apps/desktop/package.json | grep '"electron"'
# or
cat ~/Documents/Dev/projects/sero/sero/node_modules/.pnpm/electron@*/node_modules/electron/package.json | grep '"version"'
```

## Affected Packages

Only packages with native addons need this treatment. Currently:

| Package | Path |
|---------|------|
| `better-sqlite3@12.6.2` | `node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3` |

`better-sqlite3` is used by `@tobilu/qmd` (the memory search backend). If QMD fails to initialise and the error in the Electron log mentions `ERR_DLOPEN_FAILED` or `NODE_MODULE_VERSION`, this rebuild is the fix.

## What the Error Looks Like

In `/tmp/sero-electron.log`:

```
Error: The module '.../better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION X. This version of Node.js requires
NODE_MODULE_VERSION Y.
```

Or:

```
Could not locate the bindings file. Tried:
 → .../better-sqlite3/build/Release/better_sqlite3.node
```

## QMD-Specific Fix (also applied)

The QMD SDK's `getDefaultDbPath()` function requires an internal `enableProductionMode()` call that the CLI makes at startup, but which is not exported from the public SDK. Without it, the function throws, and the memory search silently fails.

The Sero extension (`packages/pi-memory-extension/extension/qmd.ts`) works around this by computing the path directly instead of calling `getDefaultDbPath()`:

```ts
function resolveQmdDbPath(): string {
  const cacheDir = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
  return join(cacheDir, 'qmd', 'index.sqlite');
}
```

This is already in the codebase. No action needed unless QMD is upgraded and the workaround stops applying.
