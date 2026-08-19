# Profiles and Onboarding

Profiles keep separate Sero working environments, such as `Work`, `Personal`,
or `Research`. Each profile has a `SERO_HOME` directory. Sero stores that
profile's agent files under `<SERO_HOME>/agent/`.

Profiles are practical local separation, not cryptographic isolation. Someone who can read your profile folder can read sensitive profile files such as provider auth, environment variables, prompts, memory, and workspace metadata.

## Fast path

1. Launch Sero.
2. Create a profile name such as `Work` or `Personal`.
3. Optionally choose a custom storage location.
4. If you already have another profile, choose whether to copy credentials and model preferences from it.
5. Connect at least one model provider.
6. Pick LOW, MED, and HIGH model defaults.
7. Optionally connect GitHub.
8. Open or create a workspace.

## What a profile owns

| State | Typical location |
| --- | --- |
| Profile registry and active profile ID | `~/.sero-ui/profiles.json` |
| Sero home for the active profile | `<SERO_HOME>` |
| Agent directory | `<SERO_HOME>/agent/` |
| Workspaces registry | `<SERO_HOME>/agent/workspaces.json` |
| Provider auth and OAuth state | `<SERO_HOME>/agent/auth.json` |
| Profile-local environment variables | `<SERO_HOME>/agent/.env` |
| Model/provider settings | `<SERO_HOME>/agent/settings.json`, `<SERO_HOME>/agent/models.json` |
| Layout and UI state | `<SERO_HOME>/agent/layout.json` |
| Chromium browser data | `<SERO_HOME>/chromium-user-data/` |
| Skills, prompts, and agents | `<SERO_HOME>/agent/skills/`, `<SERO_HOME>/agent/prompts/`, `<SERO_HOME>/agent/agents/` |
| Workspaces and global memory files | `<SERO_HOME>/workspaces/` |
| App state | `<SERO_HOME>/apps/` and workspace `.sero/apps/` folders |

The default profile usually uses `~/.sero-ui/` as `<SERO_HOME>`, so its agent directory is `~/.sero-ui/agent/`. Sero intentionally uses this profile-scoped agent directory for Pi-backed agent state.

## First run

On first launch, Sero asks for a profile name. If no profile exists, the first profile is created and activated. Existing installs are migrated by creating a `Default` profile that points at `~/.sero-ui/`; existing data is not moved as part of that migration.

After the profile exists, onboarding checks whether Sero can use a model provider. If not, it opens provider authentication so you can sign in through OAuth where supported or add an API key. Then Sero asks you to choose LOW, MED, and HIGH model tiers with compatible thinking levels.

GitHub setup is optional during onboarding. Connect it if you want repository workflows such as clone, fetch, push, and pull-request-related actions.

## Custom profile locations

When creating a profile, you can choose a custom storage folder. The profile name is independent from the folder name, and the selected folder becomes that profile's `<SERO_HOME>`.

Sero prevents obvious overlapping profile paths so one profile is not nested inside another existing profile by accident. Keep custom profile folders outside synced/shared locations unless you understand the privacy and conflict risks.

## Switching profiles

Use the profile switcher in the title bar to choose another profile. Switching profiles updates the active profile in `~/.sero-ui/profiles.json` and restarts Sero so process-level state, Chromium user data, provider auth, workspaces, sessions, and plugin state are reloaded from the new `<SERO_HOME>`.

If switching fails, the UI keeps the profile action visible and reports the restart-aware error. Relaunching Sero normally loads the active profile recorded in the registry.

## Copying credentials and model preferences

When you create a profile, Sero can copy credentials and model preferences from
the active profile. It does not copy workspaces, sessions, memory, or general
app state.

The copy flow can include these profile-agent files when they have meaningful content:

| Copied item | Destination |
| --- | --- |
| API keys/env values | `<SERO_HOME>/agent/.env` |
| Provider auth/OAuth | `<SERO_HOME>/agent/auth.json` |
| GitHub auth | `<SERO_HOME>/agent/github-auth.json` |
| Gateway config/tokens | `<SERO_HOME>/agent/gateway-config.json`, `gateway-token`, `gateway-web-tokens.json` |
| Local/custom models | `<SERO_HOME>/agent/models.json` |
| Provider/model defaults | `<SERO_HOME>/agent/provider-model-defaults.json` and tier settings in `settings.json` |
| Selected plugin config | `<SERO_HOME>/agent/plugin-config/sero-google-plugin.json` |

Only use this option when the new profile should trust the same providers, local endpoints, and credentials.

## Removing profiles

Use the profile menu to manage an inactive profile:

- **Retain files** unregisters the profile and deletes its Sero-owned containers. It keeps all profile and workspace files.
- **Delete files** also permanently deletes the profile folder. Sero shows this option only for a folder that it created under its managed profiles directory.

Sero will not remove the only profile or the active profile. Switch to another profile first. The permanent option is never available for the main `~/.sero-ui` folder, a custom folder, or a legacy profile with uncertain folder ownership.

## Redaction checklist

Before sharing screenshots, logs, or support bundles, redact:

- `~/.sero-ui/profiles.json`
- `<SERO_HOME>/agent/auth.json`
- `<SERO_HOME>/agent/.env`
- `<SERO_HOME>/agent/github-auth.json`
- gateway token/config files
- `<SERO_HOME>/agent/models.json` when it contains private endpoints, headers, or keys
- workspace paths, prompts, memory files, and app state

## Related docs

- [Models and Providers](/guide/models-and-providers)
- [Local LLMs with LM Studio](/guide/local-llms-lm-studio)
- [State and Folders](/reference/state-and-folders)
- [Security / Privacy](/reference/security-privacy)
