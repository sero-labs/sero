# Environment Doctor

Environment Doctor checks the Sero host and the active profile. Use it when Sero starts but a provider, plugin, profile, runtime, or workspace does not work. If the desktop app cannot finish startup, use the command-line entry point.

For symptom-based help, see [Troubleshooting](/reference/troubleshooting).

## Run Doctor in Sero

Open **Environment Doctor** from the Diagnostics area. Select **Re-run** for all
registered checks. Select **Quick** for a two-second budget that skips checks
marked as slow.

The panel shows results as checks finish. Select **Export** to save the report,
or select **Copy JSON** to copy it.

## Run Doctor from a terminal

The packaged macOS app contains a `sero-doctor` script in its Resources directory. The script starts the Sero executable with `--doctor`. You can also pass `--doctor` directly to the Electron executable used by a source build.

```bash
sero-doctor --quick
sero-doctor --json --report ./sero-doctor-report.json
```

The command accepts these flags:

| Flag | Result |
| --- | --- |
| `--quick` | Skip slow checks and use the quick-run budget. |
| `--json` | Write the report as JSON to standard output. |
| `--profile <id\|path>` | Check one profile by ID or path. |
| `--all-profiles` | Check all registered profiles and orphan profile directories. |
| `--category <name>` | Run one category. |
| `--report <path>` | Write JSON to a file. This flag also enables JSON output. |

Valid categories are `system`, `runtime`, `node`, `profile`, `workspace`, `providers`, `plugins`, and `environment`.

```bash
sero-doctor --category runtime
```

The command exits with `0` when no check fails. It exits with `1` when one or more checks fail. A command-line usage error or a Doctor engine error exits with `2`.

## Understand the results

Each result has one of these states:

| State | Meaning |
| --- | --- |
| `pass` | The check completed successfully. |
| `warn` | Sero can continue, but the result can explain a problem or risky configuration. |
| `fail` | The checked function is not usable. Follow the repair guidance before you try it again. |
| `skip` | The check does not apply or cannot run in the selected mode. |

The current registry checks these areas:

- **System:** operating system, version, architecture, free disk space, and memory.
- **Runtime:** Apple Container CLI, version, service, create, execute, and mount checks; and Docker or Podman availability.
- **Node:** Node.js version, native ABI, and `node-pty` loading.
- **Profile:** profile registry parsing, active-profile resolution, orphan directories, profile directory access, the agent directory, and selected profile files.
- **Workspace:** registry consistency, selected runtime, file access, and app-only execution, terminal, and preview checks.
- **Providers:** configured provider environment variables and whether at least one provider is usable.
- **Plugins:** manifests, compatibility, resources, and app-only load checks.
- **Environment:** an audit of required process environment values.

Safe mode omits checks that need the booted desktop app. Quick mode also omits slow checks. A skipped check does not prove that the related function works.

## Repairs

Doctor supplies repair guidance for some failures. The current engine does not run repairs automatically. Read each result before you change a profile file, runtime, or workspace.

## Share a report safely

Doctor redacts fields and text that match known secret patterns. It also replaces paths under your home directory with `~/...`. This redaction is a safeguard, not a guarantee.

Review every report before you share it. Remove private repository names, internal host names, tokens, prompts, and other project details. If a report exposes a secret, rotate the secret and report the problem through the private security channel.

When you request support, include the Sero version, operating system, CPU architecture, runtime choice, the failed action, and the relevant redacted logs.

## See also

- [Troubleshooting](/reference/troubleshooting)
- [Support Scope](/reference/support-scope)
- [Choose a Workspace Runtime](/guide/choose-workspace-runtime)
- [State and Folders](/reference/state-and-folders)
