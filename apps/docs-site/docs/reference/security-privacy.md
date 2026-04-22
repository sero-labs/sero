# Security / Privacy

## Current posture

Sero is local-first, but it still manages local auth state, logs, runtime
artifacts, and optional remote-control surfaces.

Public alpha users should assume:
- local profiles and local state matter
- logs can contain sensitive workflow information
- tokens and auth files must be treated as secrets
- gateway-style remote access should be enabled carefully and intentionally

## What is local vs remote

### Local by default

These surfaces are stored locally in the active profile:
- provider auth and settings under `<SERO_HOME>/agent/`
- workspaces and the global workspace under `<SERO_HOME>/workspaces/`
- global app state under `<SERO_HOME>/apps/`
- installed plugins under `<SERO_HOME>/agent/plugins/`
- memory files, daily logs, and local debug output

### Remote/networked when enabled

These can talk to external systems, but their stored state still lives locally:
- model/provider authentication and API calls
- GitHub authentication and repository access
- gateway remote-control clients
- Discord/Tailscale integrations when configured
- plugin installs from remote npm/git sources

## Key local files to treat as sensitive

| Surface | Current location |
| --- | --- |
| provider auth store | `<SERO_HOME>/agent/auth.json` |
| profile-local env vars | `<SERO_HOME>/agent/.env` |
| GitHub auth | `<SERO_HOME>/agent/github-auth.json` |
| gateway token | `<SERO_HOME>/agent/gateway-token` |
| gateway config | `<SERO_HOME>/agent/gateway-config.json` |
| layout and UI state | `<SERO_HOME>/agent/layout.json` |
| workspace registry | `<SERO_HOME>/agent/workspaces.json` |

## Important practices

- never paste raw tokens or auth files into issues or screenshots
- redact private local paths before sharing logs
- use private reporting for security issues
- treat gateway credentials like high-privilege secrets
- treat the active profile directory as sensitive local state

## Gateway note

The gateway and related remote-control surfaces are powerful. If enabled, an
authenticated client can act with the same effective power as the desktop UI.
That makes token handling and exposure prevention especially important.

## What this alpha does not claim

The public alpha docs should not imply stronger guarantees than the product
currently enforces. Profile isolation, local storage, and auth handling should
be understood in the context of a local developer tool, not a hardened
multi-tenant security boundary.

## See also

Current source material:
- [`SECURITY.md`](https://github.com/monobyte/sero/blob/main/SECURITY.md)
- [`docs/reference/state-and-folders.md`](https://github.com/monobyte/sero/blob/main/docs/reference/state-and-folders.md)
- [`docs/security/gateway.md`](https://github.com/monobyte/sero/blob/main/docs/security/gateway.md)
- [`docs/features/memory.md`](https://github.com/monobyte/sero/blob/main/docs/features/memory.md)
- [`docs/features/profiles.md`](https://github.com/monobyte/sero/blob/main/docs/features/profiles.md)
