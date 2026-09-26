## Purpose

Defines which pnpm versions build the Sero monorepo, how CI and the packaged
runtime tools share one exact version, and what a clean frozen install must
guarantee.

## ADDED Requirements

### Requirement: Contributors may use any pnpm 12 release

The root manifest SHALL declare the supported pnpm range `>=12.0.0 <13.0.0` as
guidance. It MUST NOT make pnpm download, switch to, or require one exact
version. The lockfile MUST NOT record a pnpm version, so it stays the same
whichever pnpm 12 release installs it.

#### Scenario: A different pnpm 12 release installs the committed lockfile

- **WHEN** a contributor runs `pnpm install --frozen-lockfile` from a clean
  checkout with any pnpm 12 release other than the CI version
- **THEN** the install succeeds with that release, without downloading another
  pnpm version
- **AND** `pnpm-lock.yaml` is unchanged

#### Scenario: The lockfile carries no package manager pin

- **WHEN** `pnpm-lock.yaml` is regenerated
- **THEN** it contains no `packageManagerDependencies` entry

### Requirement: CI and packaged runtime tools share one exact pnpm version

The packaged runtime tools SHALL pin one exact, stable pnpm 12 version that is
at least seven days old or has a recorded security override. The runtime-tools
`package.json`, its npm lockfile, and `pins.json` MUST name that same version.
Every CI step that sets up pnpm MUST install exactly that version. Pin
validation MUST fail when any of them differ.

#### Scenario: Pins agree

- **WHEN** the runtime-tool pin validator runs on the repository
- **THEN** it succeeds, and the CI pnpm version, the runtime-tools input, the
  npm lockfile, and `pins.json` all name the same exact version

#### Scenario: A CI workflow drifts

- **WHEN** one CI pnpm setup step names a version different from `pins.json`
- **THEN** pin validation fails and names the mismatch

### Requirement: Security overrides stay effective

Every security override the repository declares SHALL live in the workspace
configuration that pnpm 12 reads, with its value unchanged. The root
`package.json` MUST NOT carry a `pnpm` settings field. The resolved dependency
graph MUST satisfy every override.

#### Scenario: Overrides apply after a clean install

- **WHEN** a clean `pnpm install --frozen-lockfile` completes with pnpm 12
- **THEN** every overridden package in the resolved graph has a version that
  its override allows

### Requirement: Every dependency build script has an explicit decision

The workspace configuration SHALL state, for every dependency with a build
script, whether that script may run. The five approved build dependencies
(`bun`, `electron`, `esbuild`, `node-pty`, `sharp`) MUST be allowed. A clean
frozen install MUST NOT report an unreviewed build script, an ignored override,
or an unrecognized workspace setting.

#### Scenario: Clean frozen install

- **WHEN** a clean `pnpm install --frozen-lockfile` runs with the CI pnpm
  version
- **THEN** it exits successfully with no unreviewed-build, ignored-setting, or
  unrecognized-setting warning or error
- **AND** the approved build dependencies are built, and the desktop app's
  native modules load in Electron

### Requirement: The container runs the packaged pnpm

The `sero-node` image SHALL run the exact pnpm version pinned for the packaged
runtime tools, installed from the runtime-tools lockfile with checked
integrity. It MUST NOT download pnpm at first use.

#### Scenario: pnpm version inside a workspace container

- **WHEN** `pnpm --version` runs inside a container started from the rebuilt
  `sero-node` image with no network access
- **THEN** it prints the version in `pins.json`

### Requirement: Release packaging still produces a flat production bundle

The release build SHALL create the desktop deploy bundle with a hoisted,
production-only `node_modules` when it runs with the CI pnpm version.

#### Scenario: Deploy bundle keeps transitive dependencies at the top level

- **WHEN** the release build creates the deploy bundle
- **THEN** transitive runtime dependencies of externalized packages (for
  example `partial-json`) sit directly under the bundle's `node_modules`
- **AND** the packaged app starts
