# Sero desktop

The desktop app contains the Electron host, React renderer, workspace runtimes,
and the typed preload bridge. Run its commands from the repository root unless a
command says otherwise.

## Native module recovery

`pnpm install` runs `scripts/rebuild-node-pty.mjs`. The script starts a real
`node-pty` process through Electron with `ELECTRON_RUN_AS_NODE`. When the binary
does not match Electron's ABI, it runs `electron-rebuild` and repeats the smoke
test.

If a terminal fails with `posix_spawnp failed`, run:

```bash
node scripts/rebuild-node-pty.mjs
```

If the rebuild fails, install the platform compiler tools, run `pnpm install`
again, and repeat the check. On macOS, the compiler tools come from
`xcode-select --install`. The script prints the exact manual command for the
installed Electron version and ABI. Its form is:

```bash
pnpm --dir apps/desktop exec electron-rebuild -f --version <version> --force-abi <abi> --module-dir <repo> --which-module node-pty
```

Do not commit a rebuilt binary from `node_modules`.

## Managed host tools

Managed tools are machine-shared under
`SERO_HOST_ARTIFACTS_ROOT/toolchains/<manifest-version>/`. They must not be
installed under `SERO_HOME` or a workspace.

Resolution order is:

1. a compatible verified system tool;
2. a complete verified managed install;
3. an approved first-use managed install;
4. a typed failure with recovery information.

An install uses a staging directory, verifies the pinned SHA-256 value, and
activates the final directory atomically. The `.installed` marker means the
whole requested artifact is complete. Do not resolve tools from a directory
without that marker.

Sero never installs compiler stacks. Use platform build tools or a container
when a project needs native compilation.

Release metadata is in:

- `electron/features/workspace/runtime/toolchains/generated-artifacts.json`
- `electron/features/workspace/runtime/browser-pack/generated-artifacts.json`
- `electron/features/workspace/runtime/host-support-matrix.json`

Exact upstream runtime pins are in `runtime-tools/pins.json`. The adjacent npm
lockfile supplies exact transitive packages for the host browser pack and the
`sero-node` image. Container base images use OCI digests, and Node downloads
use committed SHA-256 values. `sero-node` installs Ubuntu packages from Ubuntu's
signed current repositories.

The weekly `Runtime Tool Updates` workflow checks npm runtime tools, Node.js,
GitHub CLI, the Go and Ubuntu container images, and the `uv` host tool. It
maintains one GitHub issue with current, waiting, and
ready updates. Routine updates use one draft PR. Breaking updates use a separate
draft PR. An upstream release must be at least seven days old. A manual urgent
security run can bypass the wait for one named tool only when its reason is
stored in `securityOverrides`. Review and merge remain manual. Updating pins
does not publish browser packs, toolchains, container images, or Sero releases.

The Node.js, npm, pnpm, and `uv` pins are inputs for the next managed-toolchain
publication. The existing generated toolchain metadata remains immutable until
those artifacts are built, verified, and published.

The status issue also reports legacy managed Git, OpenSSH, and Bash bundles as
blocked. Their published metadata does not contain exact component versions or
reproducible source recipes. Do not claim that these tools are current until a
new baseline build records that information.

Before a release, run the relevant publication checks:

```bash
pnpm --filter @sero/desktop toolchain:verify-published
pnpm --filter @sero/desktop browser-pack:verify-published
pnpm --filter @sero/desktop runtime-tools:validate
```

`SERO_TOOLCHAIN_BASE_URL` is for a byte-identical local diagnostic mirror only.
It must not bypass committed hashes or make an unpublished target appear
supported.
