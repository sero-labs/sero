# Environment Doctor

Environment Doctor is Sero's diagnostic report. It checks the host system, active runtime, profile files, providers, plugins, and workspace state, then reports each check as `pass`, `warn`, or `fail` with fix guidance.

Use [Troubleshooting](/reference/troubleshooting) when you want a symptom-first fix guide. Use this page when you need exact Doctor entry points, flags, categories, result states, and redaction behavior.

For the implementation specification, see [`docs/features/environment-doctor.md`](https://github.com/sero-labs/sero/blob/main/docs/features/environment-doctor.md).

## When to run Doctor

Run Environment Doctor when:

- Sero will not start or crashes during startup
- a workspace runtime is unavailable
- Host tools, browser automation, terminals, or native modules fail
- a profile, workspace, provider, or plugin looks corrupted
- you are filing an issue and need a structured report

Doctor is designed to keep working even when the full app cannot boot. Reports are deterministic except for timestamp and per-check duration.

## Entry points

All entry points use the same check catalogue and produce a typed `DoctorReport`.

### In-app panel

Use this when Sero opens.

1. Press <kbd>⌘K</kbd> on macOS or <kbd>Ctrl+K</kbd> elsewhere.
2. Choose **Diagnostics → Environment Doctor**.
3. Click **Quick** for a fast scan or **Re-run** for the full pass.
4. Copy or export the report before filing an issue.

The panel streams progress as checks complete.

### Safe mode: `electron --doctor`

Use this when Sero cannot finish booting. Safe mode starts the Electron host, enters Doctor before normal feature initialization, and reads profile files defensively.

```bash
electron --doctor
```

Plain text is printed by default. Add `--json` for JSON output or `--report <path>` to write the JSON report to a file.

Example:

```bash
electron --doctor --json --report ./sero-doctor-report.json
```

### Bundled CLI shim: `sero-doctor`

Packaged builds may include a small shell script at:

```text
Sero.app/Contents/Resources/sero-doctor
```

The shim re-invokes the bundled Electron binary with `--doctor`, so it uses the same signing and app resources. Sero may offer to symlink it to `/usr/local/bin/sero-doctor` on first run; the symlink is declined by default.

Example:

```bash
sero-doctor --quick
sero-doctor --json --report ./sero-doctor-report.json
```

## CLI flags

```bash
electron --doctor [flags]
```

| Flag | Effect |
| --- | --- |
| `--doctor` | Required for Electron safe mode. |
| `--json` | Emit a `DoctorReport` JSON document on stdout. Logs go to stderr. |
| `--quick` | Use quick mode with a short budget and skip slow checks. |
| `--profile <id\|path>` | Target a specific profile. |
| `--all-profiles` | Scan every registered profile and orphaned profile directory. |
| `--category <name>` | Run one check category. See [Check categories](#check-categories). |
| `--report <path>` | Write JSON to `<path>` instead of stdout. Implies `--json`. |

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | All checks are `pass` or `warn`. |
| `1` | One or more checks are `fail`. |
| `2` | The Doctor engine itself crashed. Treat this as a Sero bug; stderr contains the stack. |

## Output states

| State | Meaning | User action |
| --- | --- | --- |
| `pass` | The check succeeded. | No action needed. |
| `warn` | Sero can continue, but something may block a feature or indicate a risky setup. | Read the guidance and fix it if it matches your symptom. |
| `fail` | The checked surface is not usable. | Fix this before retrying the failed workflow. |

A report with warnings can still exit `0`. A report with any failure exits `1`.

## Check categories

| Category | What it checks |
| --- | --- |
| `system` | OS, architecture, free disk, and platform-specific health signals. |
| `runtime` | Host tools, Apple Container, Docker / Podman, browser-pack readiness, native build tool signals, versions, and daemon/system health. |
| `node` | Node version, native ABI, and `node-pty`. |
| `profile` | `profiles.json`, active profile id, and per-profile config files. |
| `workspace` | Workspace registry, runtime selection, and filesystem reachability. |
| `providers` | Provider environment variable presence and `any-usable` summary. |
| `plugins` | Manifest reachability, compatibility, and sandboxed load. |
| `environment` | Required `PATH`, `HOME`, `SHELL`, and configured provider env-var names. |

Run one category when you already know the failing area:

```bash
electron --doctor --category runtime
```

## Runtime checks

Runtime checks tell you whether the selected workspace runtime is usable and what to fix next.

### Host

Host checks cover Node, pnpm, Git/SSH, shell readiness, and Sero-managed host tools. Sero-managed host tools live under:

```text
~/.sero-ui/toolchains/<manifest-version>/
```

The tools are considered usable only after their readiness marker is present. If compatible system tools are missing, Sero installs managed core tools from GitHub Release assets during onboarding, Runtime settings, or first use.

Host is the default on supported macOS arm64, Linux x64/arm64, and Windows x64 systems. For the canonical matrix, see [Support Scope](/reference/support-scope).

### Host browser pack

Host browser automation reports states such as:

| State | Meaning |
| --- | --- |
| `missing` | Required browser-pack files are not installed. |
| `installable` | A pack exists for this platform and Sero can offer installation. |
| `installing` | Installation is in progress. |
| `ready` | Files exist and the Doctor launch check passed. |
| `failed` | Installation or launch verification failed. |

`ready` requires installed files plus a passing launch check. Artifact availability alone is not enough.

Current public Host browser packs are available for macOS arm64, Linux x64, Linux arm64, and Windows x64. Windows arm64 has no public pack today, and macOS Intel is not a supported Sero target.

### Container runtimes

Doctor checks Apple Container and Docker / Podman availability, CLI presence, version discovery, daemon/system health, and whether the selected container runtime can be used.

A selected container runtime should be fixed or changed explicitly. Sero does not silently run a selected Apple Container or Docker / Podman workspace on Host.

Useful manual checks:

```bash
/usr/local/bin/container system status
docker info
podman info
```

For runtime selection guidance, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime).

### Native build tools

Native build tool checks are informational signals for compiler stacks such as:

- Xcode Command Line Tools on macOS
- `build-essential`, gcc, and make on Linux
- MSVC and Windows SDK on Windows

Sero does not install compiler stacks. Install them with platform instructions, or switch the workspace to Apple Container or Docker / Podman when you need image-provided tooling.

## Privacy and redaction

Doctor reports are designed to be shareable, but they still describe a developer machine. Review reports before posting them publicly.

Built-in protections include:

- Credential file readers such as `auth.json` and `.env` expose only stored key names. Values are deleted before parsed data is returned.
- Profile paths are hashed with a 12-character SHA-256 prefix before serialization. Raw profile paths do not leave the process.
- A final redactor scrubs sensitive field names such as `value`, `secret`, `token`, `apiKey`, `password`, `cookie`, and `authorization`.
- The redactor also scrubs common credential patterns such as `sk-...`, `Bearer ...`, `ghp_...`, `github_pat_...`, and long hex digests.
- Paths under your home directory are rewritten to `~/...`.

Before sharing an issue, also redact private repository names, internal hostnames, screenshots with secrets, and any log excerpt that includes provider tokens or auth headers.

If a generated report leaks a secret, file a private security report. The redactor is a backstop; leaks that reach it are bugs.

## Repairs

Doctor v1 shows repair guidance but does not run automatic repairs. Failing rows may show an **Auto-repair coming soon** affordance. Today, use the manual instructions or copyable commands shown in the result.

Examples include:

```bash
/usr/local/bin/container system start
node scripts/rebuild-node-pty.mjs
node scripts/rebuild-better-sqlite3.mjs
```

## Issue-report fields

When attaching a Doctor report, also include:

- operating system and version
- CPU architecture
- Node and pnpm versions
- runtime mode: Host (`host`), Apple Container (`apple-container`), or Docker / Podman (`docker`)
- install path: packaged beta artifact or source build
- packaged artifact type or release tag when relevant
- source build branch and commit SHA when relevant
- exact workflow or command that failed
- relevant redacted logs

Support boundaries and unsupported targets are listed in [Support Scope](/reference/support-scope).

## See also

- [Troubleshooting](/reference/troubleshooting)
- [Support Scope](/reference/support-scope)
- [Choose a Workspace Runtime](/guide/choose-workspace-runtime)
- [Containers and Host Mode](/reference/containers-host-mode)
- [State and Folders](/reference/state-and-folders)
- [Sero CLI](/reference/sero-cli)
