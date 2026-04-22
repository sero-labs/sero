# Security / Privacy

## Current posture

Sero is local-first, but it still manages local auth state, logs, runtime
artifacts, and optional remote-control surfaces.

Public alpha users should assume:
- local profiles and local state matter
- logs can contain sensitive workflow information
- tokens and auth files must be treated as secrets
- gateway-style remote access should be enabled carefully and intentionally

## Important practices

- never paste raw tokens or auth files into issues or screenshots
- redact private local paths before sharing logs
- use private reporting for security issues
- treat gateway credentials like high-privilege secrets

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
- `SECURITY.md`
- `docs/security/gateway.md`
- `docs/features/memory.md`
- `docs/features/profiles.md`
