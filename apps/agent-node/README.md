# Sero Agent Node

Sero Agent Node is a headless Bun service that hosts persistent Pi sessions. It serves A2A 1.0
over pinned TLS and a versioned Sero control API at `/sero/v1`.

## Security boundary

Run the binary as the fixed `sero-node` system account with the included system unit. The unit
keeps the operator home private and limits writes to `/var/lib/sero-node`. This is containment,
not a secret vault: **work you send this node runs with the node's credentials. A task that reads
untrusted text can reach them.** The node can read its provider tokens, identity key, TLS leaf key,
controller digests, and its workspaces.

Pi's read, grep, and find tools are confined to the session workspace. Approved shell commands
still run as `sero-node`, so review their input before you allow them.

The public Agent Card is the only unauthenticated node read. All A2A calls use
`A2A-Version: 1.0` and bearer authentication. Control calls use the same bearer token and
`Sero-Control-Version: 1`. The `enrol` operation uses a single-use code instead of a bearer token.
Provider credentials are never returned by the control API. Bedrock is not bundled or advertised.

## Build

```sh
pnpm --filter @sero/agent-node test
pnpm --filter @sero/agent-node typecheck
pnpm --filter @sero/agent-node build:linux:x64
pnpm --filter @sero/agent-node build:linux:arm64
```

The workspace pins Bun 1.2.18 and the glibc targets `bun-linux-x64-baseline` and
`bun-linux-arm64`. No container, browser, plugin, preview, dev-server, or interactive-terminal
tooling is included.

## Operate

The system service is `sero-node.service` and runs under the account defined in
`systemd/sero-node.sysusers`. The service creates its exact state layout on first start. OpenSSL
must be available to issue the local identity and TLS leaf. The delivery and update format is not
selected yet.

Before the service starts, create `/etc/sero-node/sero-node.conf` with the public HTTPS origin.
The node uses this value for its Agent Card, control extension, and authenticated blob URLs:

```sh
SERO_NODE_URL=https://spark.example:7443
```

The service refuses to start if this value is absent or is not an HTTPS origin.

Run the first enrolment ceremony over SSH:

```sh
sudo -u sero-node sh -c 'cd /var/lib/sero-node && sero-node enrol'
```

Carry both the single-use code and SHA-256 SPKI fingerprint to Desktop. The code expires after ten
minutes. Desktop must pin the fingerprint before first contact. Later controllers can mint a code
through the authenticated control API.

Rotate only the TLS leaf with the operator CLI command `sero-node rotate-tls`. TLS rotation is not
a control-plane or Desktop operation. The identity pin does not change. Never back up
`identity.key`; re-enrolment is the recovery path.

Session workspaces must be children of `/var/lib/sero-node/workspaces`. Active task streams may be
disconnected without cancelling work. Session replay uses Pi-style eight-character entry IDs as
cursors. On process restart, non-terminal durable tasks become failed with `the node restarted`.

Installation and update packaging, discovery, cross-node scheduling, worktree isolation, and
inbound third-party A2A support remain deferred.

The default systemd unit blocks host devices. Apply `systemd/sero-node-nvidia.conf` when the node
must use an NVIDIA GPU. Keep Docker access as a separate operator choice because the Docker socket
gives the agent effective root access to the host. See the
[Agent Node troubleshooting guide](../docs-site/docs/reference/agent-node-troubleshooting.md).
