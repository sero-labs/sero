# Gateway Security — Threat Model & Verification Guide

The remote control gateway (WebSocket server, web chat UI, Discord adapter,
Tailscale integration) gives external clients access to Sero's agent sessions.
This document covers the threat model, security controls, known limitations,
and a hands-on verification checklist.

---

## Architecture Overview

```
                          ┌─────────────────────────────┐
  Web Chat (browser) ─────┤                             │
                          │  GatewayServer (:18800)     │──► Agent Session Pool
  Discord Bot ────────────┤  localhost-only by default   │      (full agent access)
                          │                             │
  Tailscale (tailnet) ────┤  TLS-terminated by TS       │
                          └─────────────────────────────┘
```

**Key principle:** The gateway is OFF by default. It only starts when
`SERO_GATEWAY=1` is set. No ports are opened, no bots connect, no
Tailscale serving happens unless explicitly enabled.

---

## Threat Model

### What an authenticated gateway client can do

- Open agent sessions on **any** workspace
- Send prompts (arbitrary natural language → the LLM decides what tools to run)
- Steer or abort running agent turns
- List all workspaces and sessions

**This means:** anyone with the gateway token has the same power as the Sero
desktop UI. The agent can read/write files, execute code in containers, create
PRs, etc. Treat the gateway token like a root password.

### Attack surface by channel

| Channel | Exposure | Authentication | Risk |
|---------|----------|----------------|------|
| **WebSocket (localhost)** | `127.0.0.1:18800` only | 64-char hex token, timing-safe comparison | Low — local processes only |
| **Web chat (localhost)** | `127.0.0.1:18801` + embedded in `:18800` | Login prompt preferred; URL-token flow is legacy and discouraged | Low — local only |
| **Tailscale** | Private tailnet only (`tailscale serve`, NOT `funnel`) | Tailscale device auth + gateway token | Medium — all tailnet devices can reach the port |
| **Discord** | Public (anyone who can DM the bot) | `allowedUsers` whitelist (empty = allow ALL) | **High if misconfigured** |

---

## Security Controls

All paths below are **profile-scoped**. Replace `<SERO_HOME>` with your active
profile root. For the default profile, that is typically `~/.sero-ui`.

### 1. Gateway token (`<SERO_HOME>/agent/gateway-token`)

- **Generated:** 32 random bytes → 64-char hex (256 bits of entropy)
- **Stored:** file mode `0600` (owner read/write only)
- **Compared:** constant-time via `crypto.timingSafeEqual` (no timing side-channel)
- **Logged:** redacted in console (`5ed54100…445d`, not the full token)
- **Rotation:** call `GatewayAuth.regenerate()` via IPC or delete the file and restart

### 2. Network binding

- Gateway binds to `127.0.0.1` — not reachable from the network
- Tailscale serve proxies through the tailnet (encrypted WireGuard tunnel)
- Tailscale **serve** (tailnet-only) is used, NOT **funnel** (public internet)

### 3. Connection lifecycle

- Unauthenticated WebSocket clients are auto-disconnected after **10 seconds**
- All non-`connect` requests require prior authentication
- Client type and ID are logged on successful auth

### 4. Discord access control

- `SERO_DISCORD_USERS` env var: comma-separated Discord user IDs
- When set, only those users can interact with the bot
- When **empty**, ANY Discord user who can DM or mention the bot has full access
- Bot only responds to DMs and @mentions (ignores other channel messages)

### 5. Secrets storage

| Secret | Location | Permissions |
|--------|----------|-------------|
| Gateway token | `<SERO_HOME>/agent/gateway-token` | `0600` |
| Discord bot token | `<SERO_HOME>/agent/.env` | `0600` |
| API keys | `<SERO_HOME>/agent/.env` | `0600` |

---

## Known Limitations & Risks

### ⚠️ No rate limiting
There is no rate limiting on the gateway. A malicious authenticated client
could flood the agent with prompts, consuming API credits rapidly.

### ⚠️ No per-workspace access control
An authenticated client can open sessions on any workspace. There is no way
to restrict a gateway client to a specific workspace.

### ⚠️ No tool restrictions
Gateway clients get the same tool access as the desktop UI. The agent can
run bash commands, read/write files, use the browser tool, etc. All execution
happens inside containers, but container escape is a theoretical risk.

### ⚠️ Avoid token URLs
Some web chat flows may still accept `?token=<token>`, but public guidance
should treat that path as discouraged and avoid it outside short-lived local
diagnostics. Token URLs may leak into:
- Browser history
- Browser autocomplete suggestions
- HTTP `Referer` headers (mitigated by Tailscale TLS)
- Shared screenshots of the browser address bar

Prefer the login prompt for browser access. For CLI verification, use an
ephemeral shell variable instead of putting the token in a URL or command
history.

### ⚠️ Discord bot token = full bot control
If the Discord bot token in `.env` is leaked, an attacker can impersonate
the bot. Rotate immediately at
[discord.com/developers/applications](https://discord.com/developers/applications)
→ Bot → Reset Token.

### ⚠️ Tailscale device compromise
Any device on your tailnet can reach the gateway when `tailscale serve` is
active. If a tailnet device is compromised, the attacker can access the
gateway (still needs the auth token).

---

## Verification Checklist

Run these tests to validate security controls. Each test has an expected
outcome — if the actual outcome differs, there is a security issue.

### Prerequisites

```bash
# Set this to your active profile root.
# Default-profile example:
export SERO_HOME="${HOME}/.sero-ui"

# Start gateway
pkill -f "vite"; pkill -f "electron"
cd apps/desktop
SERO_GATEWAY=1 bash scripts/dev.sh
```

When a verification step needs the gateway token, prefer an ephemeral shell
variable populated via a hidden prompt. Avoid printing the token, storing it in
shell history, or sharing token URLs.

### Test 1: Gateway not reachable from network

**What:** Verify the gateway only listens on localhost.

```bash
# From the same Mac:
lsof -i :18800 -P | grep LISTEN
```

**Expected:** `TCP localhost:18800 (LISTEN)` — NOT `*:18800`.

```bash
# From another device on the same LAN (NOT tailnet):
curl -s http://<mac-lan-ip>:18800/health --connect-timeout 3
```

**Expected:** Connection refused or timeout.

---

### Test 2: Unauthenticated WebSocket rejected

**What:** Verify connections without a token are dropped.

```bash
# Connect but don't authenticate — should be dropped after 10s
node -e "
  const ws = new (require('ws'))('ws://127.0.0.1:18800');
  ws.on('open', () => console.log('connected'));
  ws.on('close', (code, reason) => console.log('closed:', code, reason.toString()));
  ws.on('error', (e) => console.log('error:', e.message));
"
```

**Expected:** `connected` then `closed: 4001 Authentication timeout` after ~10s.

---

### Test 3: Wrong token rejected

**What:** Verify invalid tokens are rejected immediately.

```bash
node -e "
  const ws = new (require('ws'))('ws://127.0.0.1:18800');
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'connect', token: 'wrong-token', clientType: 'cli' }));
  });
  ws.on('message', (d) => console.log(JSON.parse(d)));
  ws.on('close', (code, reason) => console.log('closed:', code, reason.toString()));
"
```

**Expected:** `{ type: 'error', requestType: 'connect', message: 'Invalid authentication token' }`
then `closed: 4003 Authentication failed`.

---

### Test 4: Valid token accepted

**What:** Verify correct token allows access.

First, load the token into a temporary shell variable without echoing it:

```bash
read -s GATEWAY_TOKEN && export GATEWAY_TOKEN
printf '\n'
```

Then verify authentication succeeds:

```bash
node -e "
  const token = process.env.GATEWAY_TOKEN;
  if (!token) throw new Error('Run: read -s GATEWAY_TOKEN && export GATEWAY_TOKEN');
  const ws = new (require('ws'))('ws://127.0.0.1:18800');
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'connect', token, clientType: 'cli' }));
  });
  ws.on('message', (d) => {
    console.log(JSON.parse(d));
    ws.close();
  });
"
```

**Expected:** `{ type: 'ok', requestType: 'connect' }`

---

### Test 5: Requests rejected before authentication

**What:** Verify non-connect requests fail without auth.

```bash
node -e "
  const ws = new (require('ws'))('ws://127.0.0.1:18800');
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'status' }));
  });
  ws.on('message', (d) => {
    console.log(JSON.parse(d));
    ws.close();
  });
"
```

**Expected:** `{ type: 'error', ..., message: 'Not authenticated. Send a connect request first.' }`

---

### Test 6: Token file permissions

```bash
stat -f "%Sp %N" "${SERO_HOME}/agent/gateway-token"
stat -f "%Sp %N" "${SERO_HOME}/agent/.env"
```

**Expected:** Both show `-rw-------` (owner read/write only).

---

### Test 7: Token not in logs (full form)

```bash
node -e "
  const fs = require('fs');
  const token = process.env.GATEWAY_TOKEN;
  if (!token) throw new Error('Run: read -s GATEWAY_TOKEN && export GATEWAY_TOKEN');
  const log = fs.readFileSync('/tmp/sero-electron.log', 'utf8');
  console.log(log.includes(token) ? 'FOUND_TOKEN_IN_LOG' : 'token-not-found');
"
```

**Expected:** `token-not-found`. The log should only contain the redacted form
(`5ed54100…445d`).

When finished, clear the temporary shell variable:

```bash
unset GATEWAY_TOKEN
```

---

### Test 8: Tailscale uses serve, not funnel

```bash
tailscale serve status
```

**Expected:** Shows the serve config. Verify it says "Available within
your tailnet" — NOT "Available on the internet".

```bash
# From a device NOT on your tailnet:
curl -s https://<your-tailnet-hostname>/health --connect-timeout 5
```

**Expected:** Connection refused or timeout — NOT `{"ok":true}`.

---

### Test 9: Discord user restriction

**What:** Verify `SERO_DISCORD_USERS` blocks unauthorized users.

1. Set `SERO_DISCORD_USERS=000000000000000000` (a fake ID) in `${SERO_HOME}/agent/.env`
2. Restart Sero with `SERO_GATEWAY=1`
3. DM the bot from your real Discord account

**Expected:** Bot ignores the message (no "Working on it...", no reply).

4. Set `SERO_DISCORD_USERS=<your-real-discord-user-id>`
5. Restart and DM again

**Expected:** Bot responds.

---

### Test 10: Gateway disabled by default

```bash
# Start WITHOUT SERO_GATEWAY=1
pkill -f "vite"; pkill -f "electron"
cd apps/desktop && bash scripts/dev.sh

# After startup:
lsof -i :18800 -P 2>/dev/null | grep LISTEN
lsof -i :18801 -P 2>/dev/null | grep LISTEN
```

**Expected:** No output — ports are not open.

---

## Hardening Recommendations

1. **Always set `SERO_DISCORD_USERS`** to your Discord user ID. An open bot
   is a public agent endpoint.

2. **Rotate the gateway token** periodically:
   ```bash
   rm "${SERO_HOME}/agent/gateway-token"
   # Restart Sero — a new token is generated
   ```

3. **Don't use or share token URLs.** Use the login prompt for browser access,
   or an ephemeral shell variable for CLI verification.

4. **Stop Tailscale serve when not needed:**
   ```bash
   tailscale serve reset
   ```

5. **Monitor agent usage** via the `$0.09` cost indicator in Sero's UI —
   unexpected spikes may indicate unauthorized use.

6. **Review open sessions** in Sero's sidebar — gateway sessions appear
   with names like `gw-<sessionId>` and are visible alongside desktop sessions.
