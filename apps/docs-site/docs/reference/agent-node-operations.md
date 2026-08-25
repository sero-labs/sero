# Agent Node Operations

This page is for the Linux operator. Agent Node supports Linux x64 and Linux
arm64. NVIDIA DGX Spark is an arm64 target. Do not use AWS Bedrock with Agent
Node.

## Service account and state

Run the node as the fixed `sero-node` system account. Do not use
`DynamicUser=`. Keep state in `/var/lib/sero-node` with these permissions:

```text
/var/lib/sero-node/  0700  sero-node:sero-node
  identity.key       0600  pinned Ed25519 identity seed
  tls.key            0600  independent, rotatable TLS key
  auth.json          0600  writable Pi provider credentials
  clients.json       0600  salted client-token hashes
```

Refuse startup if `identity.key` is readable by its group or by other users.
Repair `auth.json` to mode `0600` after Pi writes it. Set
`StateDirectoryMode=0700` explicitly. The systemd default is `0755`.

> The node stores its identity key and provider credentials in files that only the
> node's own service account can read. This protects them from other users and other
> services on the machine. It does **not** protect them from anyone who has root on the
> machine, or from anyone who can run code as the node's service account. The node
> must be able to read these secrets without a human present, so anything else running
> in that same position can read them too.

The agent has shell tools and runs as the service account. A successful prompt
injection can therefore read these files. File permissions do not contain code
that runs as `sero-node`.

Each session stores an approval mode. `ask` requires controller approval for
`bash`, `write`, and `edit`. `allow` permits those tools for later turns without
another prompt. Desktop can change the mode at any time. Keep `ask` as the
default, especially when the service account can use Docker.

## systemd operation

Use `Type=exec`, `Restart=always`, and a restart delay. Keep the default
`KillMode=control-group`. It stops child processes with the service. Use these
hardening settings as the baseline:

```ini
[Service]
User=sero-node
Group=sero-node
StateDirectory=sero-node
StateDirectoryMode=0700
NoNewPrivileges=yes
ProtectSystem=strict
PrivateTmp=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ProtectHome=yes
```

Add writable workspace paths explicitly. Test each hardening change with the
agent tools that the node must run. Do not set `MemoryDenyWriteExecute=yes`.
Bun uses a JIT and cannot start with that setting. Keep `ProtectHome=yes` so the
node cannot read operator home directories. Node workspaces stay under
`/var/lib/sero-node/workspaces`.

The baseline unit also uses `PrivateDevices=yes`. Grant hardware access only
when the node needs it. Use a closed device policy and allow the required
device groups. Do not use `DevicePolicy=auto` as a permanent configuration.
See [Agent Node Troubleshooting](/reference/agent-node-troubleshooting) for the
NVIDIA procedure and Docker trust boundary.

Use these standard commands:

```sh
sudo systemctl enable --now sero-node.service
sudo systemctl status sero-node.service
sudo journalctl -u sero-node.service
sudo systemctl restart sero-node.service
systemd-analyze security sero-node.service
```

After enrolment, the service starts with the operating system and registers
again without a person at the node. A controller must still be authorised.

## Enrolment and addresses

Start enrolment from the node's local operator interface. Give the one-time
code, reachable address, and identity fingerprint to the Desktop user by a
trusted path. The user enters the DNS name or IP address manually. The node
does not advertise itself or search the local network.

The controller pins the SHA-256 fingerprint of the identity public key during
enrolment. Never back up `identity.key`. If it is lost, enrol the node again.
Never send a private key to a controller.

## Provider credentials

Use Pi provider authentication. Do not create a second credential format. API
keys can come from an environment reference or Pi's `!command` resolver. OAuth
credentials must stay in writable `auth.json` because token refresh rewrites
the file. A read-only systemd credential can supply an API key, but it cannot
store a refreshed OAuth login.

Provider login is a Sero control operation. It is not an A2A task. Desktop
relays the URL, device code, manual-code prompt, selection prompt, and cancel
request. Any active controller can answer or cancel the current login. All
controllers receive masked status only.

## Reconnect and replay

A2A 1.0 carries the five operations Desktop uses: `SendMessage`,
`SendStreamingMessage`, `GetTask`, `CancelTask`, and `SubscribeToTask`. Sero
does not call `ListTasks`. A2A does not list persistent contexts or replay
missed events. The Sero control plane lists persistent sessions and streams
session entries with Pi entry IDs as cursors.

After a connection loss, restore the persistent session and task snapshot.
Replay committed entries after the controller's last cursor, send one partial
assistant snapshot when a turn is active, and then stream live deltas. Use
`GetTask` for a terminal task because `SubscribeToTask` must reject a terminal
task.

## Rotate TLS

The TLS key and the pinned identity key are independent. Run
`sero-node rotate-tls` on the node to rotate `tls.key` and its certificate
without replacing `identity.key`. Rotation is a CLI-only operator action. It is
not a control-plane operation or a Desktop action.

If `identity.key` changes, stop. This is re-enrolment, not TLS rotation.

For service failures and host capability checks, see
[Agent Node Troubleshooting](/reference/agent-node-troubleshooting).

## Release validation

The delivery and update format is not selected. Validate both Linux release
artifacts on Linux before release.

Use `scripts/validate-agent-node-evidence.mjs` and its template to check the
release evidence. Do not mark DGX Spark hardware as passed unless the arm64
artifact ran on that hardware.
