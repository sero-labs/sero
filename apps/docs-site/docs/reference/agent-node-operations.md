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
> services on the machine, and from being picked up accidentally in a backup or a
> config repository. It does **not** protect them from anyone who has root on the
> machine, or from anyone who can run code as the node's service account. The node
> must be able to read these secrets without a human present, so anything else running
> in that same position can read them too.

The agent has shell tools and runs as the service account. A successful prompt
injection can therefore read these files. File permissions do not contain code
that runs as `sero-node`.

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
```

Add writable workspace paths explicitly. Test each hardening change with the
agent tools that the node must run. Do not set `MemoryDenyWriteExecute=yes`.
Bun uses a JIT and cannot start with that setting. Do not set `ProtectHome=yes`
when an approved workspace or tool needs files under a home directory.

Use these standard commands:

```sh
sudo systemctl enable --now sero-agent-node.service
sudo systemctl status sero-agent-node.service
sudo journalctl -u sero-agent-node.service
sudo systemctl restart sero-agent-node.service
systemd-analyze security sero-agent-node.service
```

After enrolment, the service starts with the operating system and registers
again without a person at the node. A controller must still be authorised.

## Enrolment and addresses

Start enrolment from the node's local operator interface. Give the one-time
code, reachable address, and identity fingerprint to the Desktop user by a
trusted path. The user enters the DNS name or IP address manually. The node
does not advertise itself or search the local network.

The controller pins `identity.key` during enrolment. Back up this file only as
an operator-held credential. If it is lost, enrol the node again. Never send a
private key to a controller.

## Provider credentials

Use Pi provider authentication. Do not create a second credential format. API
keys can come from an environment reference or Pi's `!command` resolver. OAuth
credentials must stay in writable `auth.json` because token refresh rewrites
the file. A read-only systemd credential can supply an API key, but it cannot
store a refreshed OAuth login.

Provider login is a Sero control operation. It is not an A2A task. Desktop
relays the URL, device code, manual-code prompt, selection prompt, and cancel
request. Only the controller that starts a login can answer it. Other
controllers receive masked status only.

## Reconnect and replay

A2A 1.0 carries `SendMessage`, `SendStreamingMessage`, `GetTask`, `CancelTask`,
`ListTasks`, and `SubscribeToTask`. It does not list persistent contexts. It
does not replay missed events. The Sero control plane lists persistent sessions.
A declared Sero extension records and replays sequenced events.

After a connection loss, restore the persistent session and task snapshot.
Replay events after the controller's last sequence position. Then subscribe to
new events. Use `GetTask` for a terminal task because `SubscribeToTask` must
reject a terminal task.

## Rotate TLS

The TLS key and the pinned identity key are independent. Rotate `tls.key` and
its certificate without replacing `identity.key`:

1. Create the new TLS key and certificate in the protected state directory.
2. Verify the certificate name and trust chain.
3. Replace the TLS files atomically.
4. Restart the service.
5. Connect from an enrolled controller and verify the pinned node identity.
6. Remove the old TLS key after the check passes.

If `identity.key` changes, stop. This is re-enrolment, not TLS rotation.

## Installation and updates

The control connection does not install or update Agent Node, Sero Desktop, or
other software. Use the approved host package and service procedure. Validate
both Linux release artifacts on Linux before release.

Use `scripts/validate-agent-node-evidence.mjs` and its template to check the
release evidence. Do not mark DGX Spark hardware as passed unless the arm64
artifact ran on that hardware.
