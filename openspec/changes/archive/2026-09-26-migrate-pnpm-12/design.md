## Context

See proposal.md for the reason. Facts below were checked on 2026-09-26 against
the pnpm docs (`pnpm/pnpm.io`), the v11.0.0 and v12.0.0 release notes, the
`pnpm@12.5.1` npm package, `pnpm/action-setup` v6.1.0 source, and test projects
run with pnpm 12.5.1, 12.6.0 and 10.14.0.

Current state:

- Root `package.json`: `packageManager: pnpm@10.34.5` and `pnpm.overrides` (11
  entries). pnpm 11+ ignores the `pnpm` field.
- `pnpm-workspace.yaml`: `onlyBuiltDependencies` (5 entries). pnpm 11 removed it.
  `pnpm ignored-builds` lists 18 more dependencies whose build scripts pnpm 10
  skips silently: `protobufjs`, `better-sqlite3`, `onnxruntime-node`,
  `@playwright/browser-chromium`, `@swc/core`, `workerd`, `@parcel/watcher`,
  `electron-winstaller`, `msw`, `koffi`, `core-js`, `node-llama-cpp`,
  `tree-sitter-go`, `tree-sitter-python`, `tree-sitter-rust`,
  `tree-sitter-javascript`, `@google/genai`, `tree-sitter-typescript`.
- `update-runtime-tools.mjs` requires root `packageManager` to equal the
  packaged pnpm, and writes root `packageManager` when it bumps pnpm.
- `build-release.sh` passes `NPM_CONFIG_NODE_LINKER=hoisted` and
  `NPM_CONFIG_INJECT_WORKSPACE_PACKAGES=true` to `pnpm deploy`.
- `Dockerfile.sero-node` runs `npm ci --ignore-scripts` on the runtime-tools
  lockfile and links `/usr/local/bin/pnpm` to `node_modules/pnpm/bin/pnpm.cjs`.
- CI: 14 `pnpm/action-setup@v6.0.10` steps in 7 workflows, all without a
  `version` input (they read `packageManager`), on Node.js 22.19.0.

pnpm 12 changes that matter here:

| Change | Effect on Sero |
| --- | --- |
| `package.json#pnpm` not read | overrides must move |
| `onlyBuiltDependencies` removed; `allowBuilds` map | build approvals must move |
| `strictDepBuilds` default `true` | the 18 skipped builds fail the install unless denied |
| `npm_config_*` env vars not read | release deploy settings silently lost |
| unrecognized `pnpm-workspace.yaml` keys reported | config must be clean |
| npm package is a launcher; native binary in `@pnpm/exe.<os>-<arch>` | `bin/pnpm.cjs` is gone; container link breaks |
| `pnpm deploy` no longer needs `injectWorkspacePackages` (12.2.0+) | optional simplification, not taken |
| `pnpm/action-setup` supports pnpm 12 from v6.1.0 | all 14 steps must move |
| `minimumReleaseAge` default 1 day, `blockExoticSubdeps` default `true`, `verifyDepsBeforeRun` default `install` | no action; no exotic subdependencies exist |

Checked as unchanged: the project virtual store stays at `node_modules/.pnpm`
(so `scripts/rebuild-*.mjs`, `scripts/run-promptfoo.mjs` and
`eval/patch-drizzle.cjs` need no edit); lifecycle scripts still get
`npm_config_user_agent` (so the `@sero-ai/ui` publish guard works); no workspace
package defines a `setup`, `deploy` or `rebuild` script; the root `clean` script
now shadows the new built-in `pnpm clean`, which keeps today's behaviour; the
lockfile stays `lockfileVersion: '9.0'`.

## Goals / Non-Goals

**Goals:**

- Contributors choose their pnpm 12 release; CI and the container use one exact
  version from `pins.json`.
- The migration keeps today's install result: same overrides, same approved
  builds, same deploy bundle shape.

**Non-Goals:**

- Blocking out-of-range pnpm versions. pnpm 12 offers no way to do that without
  also pinning one version (see Decision 1).
- Switching CI to `pnpm/setup` or letting it install Node.js.
- Dropping `injectWorkspacePackages` from release packaging.
- Rebuilding the managed host toolchain artifacts.

## Decisions

### 1. Range as guidance: `devEngines.packageManager` with `onFail: "ignore"`

Root `package.json` gets:

```json
"devEngines": {
  "packageManager": { "name": "pnpm", "version": ">=12.0.0 <13.0.0", "onFail": "ignore" }
}
```

and loses `packageManager`. Test results with a lockfile written by 12.5.1 and
then used by 12.6.0:

| Option | Other 12.x, `--frozen-lockfile` | Other 12.x, normal install | Out-of-range pnpm |
| --- | --- | --- | --- |
| `onFail: error` | fails | rewrites lockfile pin | blocked |
| `onFail: warn` | fails | rewrites lockfile pin | warns |
| `onFail: download` (default) | runs 12.5.1 instead | runs 12.5.1 instead | switched |
| `onFail: ignore` (chosen) | succeeds | lockfile unchanged | not checked |
| `engines.pnpm` | n/a | n/a | not checked by pnpm 12 |
| exact `packageManager` (issue) | switched/blocked | switched/blocked | switched/blocked |

Only `ignore` meets the agreed goal: no forced version, stable lockfile. It
also keeps the lockfile to one document; the other `devEngines` modes add an
env document that some vulnerability scanners do not read. The cost is no
enforcement. The issue's security risk still goes away: overrides move to
`pnpm-workspace.yaml`, which pnpm 10.14.0 was also shown to honour.

### 2. CI installs the exact `pins.json` version

Each `pnpm/action-setup` step moves to v6.1.0 (commit
`ea17c68df8912ef543352723c149a84f56e3d413`; keep each file's existing tag or
SHA style) and gets `version: <pins.json version>`. The action source returns an
explicit `version` before it reads `devEngines`, so the two do not conflict.

The pin validator reads every workflow under `.github/workflows/`, finds each
`pnpm/action-setup` step, and fails unless its `version` equals
`pins.npm.pnpm.version`. It drops the root `packageManager` check. The updater
rewrites those `version` values instead of root `packageManager`, and
`runtime-tool-updates.yml` stages `.github/workflows` instead of only
`browser-pack-artifacts.yml` (that file is already rewritten by automation, so
the app token can already push workflow changes).

Alternative: read the version from `pins.json` in an extra step per job. Rejected:
14 extra steps, and a literal is easier to read and review.

### 3. Hand-edit the config; do not run the codemod

Two blocks move. The `pnpm-v10-to-v11` codemod also rewrites `packageManager`,
which we remove. `overrides` moves to `pnpm-workspace.yaml` byte-for-byte.
`allowBuilds` lists the five approved packages as `true` and the 18 skipped
packages as `false`, which keeps pnpm 10's result. Setting
`strictDepBuilds: false` was rejected: it would also hide build scripts that new
dependencies add later.

### 4. Release deploy: rename the variables, keep injection

`NPM_CONFIG_NODE_LINKER` → `pnpm_config_node_linker` and
`NPM_CONFIG_INJECT_WORKSPACE_PACKAGES` → `pnpm_config_inject_workspace_packages`.
pnpm 12.2.0+ no longer requires injection, but without it deploy binds peers
differently and can fail with `ERR_PNPM_DEPLOY_AMBIGUOUS_PEER`. Keeping it keeps
the proven bundle shape. Update the comment, which cites pnpm v10.

pnpm 12 `deploy` copies only the files `pnpm pack` would include. With no
`files` field that follows `.gitignore`, so `dist/` is dropped except the
`main` entry, and the packaged app fails at start (`ERR_MODULE_NOT_FOUND` for a
`dist/electron` chunk). pnpm 10 copied `dist/`. `build-release.sh` now copies
`dist/` into the deploy folder after `pnpm deploy`. Rejected:
`deployAllFiles`, which also copies untracked local files such as old
`release/` output; and a `files` field, which must track every file the
packaging config reads.

### 5. Container links the native binary

After `npm ci --ignore-scripts`, `node_modules/@pnpm/exe.linux-<arch>/pnpm` is
present with lockfile integrity. Link `/usr/local/bin/pnpm` to it, mapping
`dpkg --print-architecture` `amd64`→`x64` and `arm64`→`arm64`. The build fails if
that file is missing. Alternative: link the package's `pnpm` placeholder
script. Rejected: it starts Node.js on every call and falls back to a network
download if the binary is missing. The `runtime-tool-updates.yml` smoke test
calls the same native binary for the runner's architecture.

### 6. Docs state the range, not a Corepack pin

With no exact `packageManager` field there is no pinned Corepack workflow, so
the docs say "pnpm 12" and link pnpm's installation guide. The issue asked for
Corepack instructions for an exact pin, but Decision 1 replaces the exact pin.

## Risks / Trade-offs

- [No enforcement of the range] → Overrides still apply on older pnpm. pnpm
  10.26+ also reads `allowBuilds`. Older pnpm skips approved builds, and Electron
  then fails loudly. Docs state pnpm 12.
- [Lockfile churn from pnpm 12 re-resolution] → Frozen installs use the
  existing lockfile as is. Regenerate once with the CI version, and reject any
  package version change in review.
- [Container workspaces change behaviour] → User projects without a pnpm pin
  lose their own `package.json#pnpm` settings in the container. Projects that
  pin pnpm 10 still get pnpm 10, because pnpm 12's default `pmOnFail: download`
  fetches it (network needed). State this in the release notes.
- [Container store location] → pnpm 12 creates the store at
  `<project>/node_modules/.pnpm-store` when it cannot hard link from the home
  directory, for example with a bind-mounted project. Result (Apple
  container, 2026-09-26): a bind-mounted `/workspace` install used
  `/workspace/node_modules/.pnpm-store/v11`, so the store lives in the host
  project. This change does not alter the store setup.
- [Corepack cannot run pnpm 11 or 12] → Corepack (0.34 and 0.36) starts
  `bin/pnpm.cjs`, which pnpm 12 does not ship (nodejs/corepack#775). A machine
  with Corepack `pnpm` shims in Node's `bin` fails any `pnpm` call that a Node
  process starts, such as the postinstall rebuild. The docs tell contributors
  not to use Corepack; `corepack disable pnpm` removes the shims. pnpm 10's
  `self-update` cannot reach 12 either (old native package name); use pnpm's
  installer.
- [Dependabot uses its own pnpm] → Check the first Dependabot npm run after
  merge and confirm it respects `pnpm-workspace.yaml` overrides.
- [Updater bumps pnpm to a new 12.x] → Routine minor updates stay inside the
  range. A pnpm 13 update comes only through the `--breaking` path, as a
  deliberate PR that also updates the range.

## Migration Plan

1. One PR carries all changes. CI on that PR proves frozen installs, build,
   tests, and the release path.
2. After merge, contributors install any pnpm 12 release and run
   `pnpm install`.
3. Rebuild `sero-node:latest` locally and recreate affected workspace
   containers (AGENTS.md). `container-image.yml` publishes the image, because the
   PR changes `apps/desktop/runtime-tools/**`.

Rollback: revert the PR, rebuild `sero-node:latest`, and recreate containers.

## Open Questions

- Are Cloudflare Pages git builds disabled for `sero-homepage` and `sero-docs`?
  `deploy.yml` uploads with `wrangler pages deploy`, but
  `apps/homepage/README.md` still documents a Pages build command. If git builds
  are on, they choose their own pnpm. This needs a dashboard check; it does not
  change the plan.
