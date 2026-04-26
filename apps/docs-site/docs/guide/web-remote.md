# Web Remote

Web Remote is Sero's optional gateway for pairing a browser or remote client to
your local desktop session. It is intended for controlled, local-first remote
access during the OSS alpha, not as a production remote-admin service.

The gateway is **off by default**. It only starts when the desktop process is
launched with:

```bash
SERO_GATEWAY=1
```

Read [Security / Privacy](/reference/security-privacy) before enabling it.

## What Web Remote can access

An authenticated gateway client can interact with the same local Sero profile
that your desktop app is using. Current gateway capabilities include:

- listing workspaces and sessions
- creating sessions
- sending prompts
- steering or aborting running agent turns
- checking status
- reading session history
- listing and reading files through supported gateway file APIs
- listing and fetching artifacts
- creating, listing, and revoking web tokens when authenticated with the master
  token

Because prompts can cause the agent to use tools, a paired client can have
high-impact effects on your workspaces. Treat Web Remote access like access to
the desktop UI.

## Authentication model

Sero uses profile-scoped gateway credentials:

| Credential | Location |
| --- | --- |
| master gateway token | `<SERO_HOME>/agent/gateway-token` |
| gateway config | `<SERO_HOME>/agent/gateway-config.json` |
| web tokens | `<SERO_HOME>/agent/gateway-web-tokens.json` |

The master token is a high-privilege secret for the active profile. Web tokens
are used for browser/device pairing and can expire or be revoked.

Current web-token behavior includes:

- tokens can be scoped to explicit workspace IDs or act as owner/profile tokens
- paired-device flows may grant access to all current workspaces and future
  workspaces in the profile
- default expiry is time-limited
- only a limited number of active web tokens are retained

Do not paste gateway tokens, web-token files, login URLs, or QR codes into bug
reports, screenshots, chat transcripts, or public issues. See
[State and Folders](/reference/state-and-folders) for the canonical storage map.

## Local and network exposure

By default, the gateway binds locally. The current local service uses:

```text
127.0.0.1:18800
```

A basic/legacy local web UI may also be available on:

```text
127.0.0.1:18801
```

Remote access should be treated carefully:

- **Localhost** is the lowest-risk mode because only local processes can reach
  the gateway port.
- **Tailscale** exposure should use tailnet-only `tailscale serve`, not public
  funneling. Any trusted tailnet device may be able to reach the served gateway.
- **Discord** access depends on allowlist configuration. If
  `SERO_DISCORD_USERS` is empty, anyone who can DM or mention the bot may be
  able to interact with it.

Do not expose the gateway directly to the public internet during the alpha.

## Pairing a remote device

Sero includes a pairing flow for connecting a remote device. The flow creates a
time-limited web token and can produce a login URL or QR code for the browser.

Practical guidance:

1. Enable the gateway only when you need it.
2. Pair only devices you control.
3. Prefer login prompts or QR pairing over manually putting tokens in URLs.
4. Revoke web tokens when a device no longer needs access.
5. Disable the gateway when you are done.

Token URLs are discouraged because they can leak through browser history,
autocomplete, screenshots, referrers, logs, or shared terminal output.

## Known alpha limitations

During the current source-only alpha, Web Remote does **not** promise:

- hardened remote administration
- production deployment support
- a stable public gateway API
- rate limiting for authenticated clients
- per-tool restrictions for gateway clients
- a complete security boundary around agent actions
- safe public-internet exposure

The gateway has authentication and scope checks, but an authenticated client is
still powerful. Master-auth clients can access the profile broadly. Scoped web
tokens may limit gateway file/session/artifact access to specific workspace IDs,
but that is not the same as a comprehensive per-tool permission system.

## What to include in support reports

If Web Remote behaves unexpectedly, include:

- whether the gateway was enabled with `SERO_GATEWAY=1`
- whether the client used localhost, Tailscale, Discord, or another path
- whether the issue involved a master token or a web token
- whether the web token was intended to be workspace-scoped
- the active platform and source build details from
  [Support Scope](/reference/support-scope)
- a minimal redacted log excerpt

Useful logs can include:

```text
/tmp/sero-electron.log
/tmp/sero-vite.log
```

Never include raw gateway tokens, web-token files, QR codes, or full login URLs.
Rotate any token that may have been exposed.

## Related docs

- [Security / Privacy](/reference/security-privacy)
- [State and Folders](/reference/state-and-folders)
- [Support Scope](/reference/support-scope)
- [Troubleshooting](/reference/troubleshooting)
