# Troubleshooting

Most Sero OSS alpha setup problems fall into one of these buckets:
- interrupted install / native module ABI mismatch
- dev launcher startup failure
- Apple container runtime unavailable
- host mode being used for a workflow that still expects containers

## `pnpm install` finished, but terminals or memory features still fail

The repo already runs repair hooks during `pnpm install` for the two main native
module risk areas:
- `node-pty`
- `better-sqlite3`

If install was interrupted, scripts were skipped, or Electron ABI drift still
shows up at runtime, rerun the relevant repair from the repo root.

### Terminal / `node-pty` issues

```bash
node scripts/rebuild-node-pty.mjs
```

If terminal sessions still fail, use the manual rebuild flow from the dedicated
node-pty guide.

### Memory search / `better-sqlite3` issues

```bash
node scripts/rebuild-better-sqlite3.mjs
```

This is the right next step if Electron logs mention `ERR_DLOPEN_FAILED`,
`NODE_MODULE_VERSION`, or `better-sqlite3`.

## `pnpm dev` or `bash scripts/dev.sh` does not start cleanly

From the repo root, the canonical first-run command is:

```bash
pnpm dev
```

If you are working directly inside the desktop app package, the equivalent is:

```bash
cd apps/desktop
bash scripts/dev.sh
```

If startup looks stuck or stale, clean up old processes and retry:

```bash
pkill -f "vite"
pkill -f "electron"
```

Useful runtime logs:
- `/tmp/sero-vite.log`
- `/tmp/sero-electron.log`
- `/tmp/sero-web-remote-watch.log`
- `/tmp/sero-remote-<plugin>.log` for any plugin dev remotes you enabled

## Apple containers are unavailable or unhealthy

Sero works best with Apple's `container` CLI available at:

```text
/usr/local/bin/container
```

Quick checks:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

If the system is installed but not running:

```bash
/usr/local/bin/container system start
```

If containers still are not available, Sero can continue in host mode. That is
supported, but it is intentionally a reduced experience.

## A workflow works in containers but not in host mode

Host mode is a supported fallback for:
- onboarding and provider setup
- core chat and coding tasks
- file browsing and editing
- general host-shell development workflows

Host mode is **not** the supported path for:
- browser automation
- containerized language servers
- feature-equivalent managed preview / dev-server automation
- Linux/container parity

If you hit one of those gaps, check whether the workspace should be running in
container-backed mode instead.

See [Support Scope](/reference/support-scope) for the canonical matrix.

## Quick baseline before filing an issue

From the repo root, gather the smallest helpful signal first:

```bash
pnpm typecheck
pnpm build
pnpm test
```

Use `pnpm test:ci` when you need the current alpha PR-gate shape.

When reporting the problem, include:
- macOS version
- Apple Silicon confirmation
- Node and pnpm versions
- whether you were using container-backed runtime or host mode
- relevant log excerpts

Before sharing logs, redact tokens, auth files, and private local paths.

## See also

- [Support Scope](/reference/support-scope)
- [`docs/node-pty-setup.md`](https://github.com/monobyte/sero/blob/main/docs/node-pty-setup.md)
- [`docs/guides/native-modules.md`](https://github.com/monobyte/sero/blob/main/docs/guides/native-modules.md)
- [`docs/guides/macos-containers.md`](https://github.com/monobyte/sero/blob/main/docs/guides/macos-containers.md)
- [`CONTRIBUTING.md`](https://github.com/monobyte/sero/blob/main/CONTRIBUTING.md)
