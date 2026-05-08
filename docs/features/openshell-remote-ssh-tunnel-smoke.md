# OpenShell Remote SSH Tunnel Manual Smoke

Gateway proof target: `sero-remote-gcp`

Purpose: prove OpenShell Remote works through Sero's managed SSH tunnel on an SSH-accessible Linux host, without requiring public reachability to the OpenShell gateway port.

## Hard requirement

Do **not** add or update any public firewall rule for TCP `18080`.

For the GCP proof target, `sero-remote-gcp` must be reachable by SSH only. The remote OpenShell gateway may listen on the host's loopback/private interface, but inbound `18080` from the Mac/client public IP must remain closed or absent.

## Prerequisites

- Sero desktop built from the Phase 7 branch/commit under test.
- OpenShell CLI available on the Mac where Sero runs.
- SSH access to the remote Linux host used by `sero-remote-gcp`.
- Docker available on the remote Linux host.
- No client-IP/public ingress firewall rule for TCP `18080`.

Optional host proof commands:

```sh
ssh <user>@<gcp-host> 'uname -a && docker info --format {{.ServerVersion}}'
# Intentionally do not run any gcloud command that opens TCP 18080.
```

## Checklist

1. Confirm SSH-only setup: SSH and remote Docker work; no public TCP `18080` firewall rule was added or updated.
2. In Sero, create/open an OpenShell Remote workspace and select saved gateway `sero-remote-gcp` in default tunnel mode.
3. Refresh status; expect mode `Sero-managed SSH tunnel` and endpoint `https://127.0.0.1:<localPort>`.
4. Run a first agent command so Sero ensures the gateway and sandbox.
5. Run bash: `uname -a && pwd && printf 'provider=%s\n' openshell-remote`; expect Linux output under `/sandbox/workspace/<basename>`.
6. Use write/read/edit tools on `openshell-ssh-tunnel-smoke.txt`; confirm the host workspace copy syncs back.
7. Stream logs and confirm remote sandbox log lines arrive.
8. Start `python3 -m http.server 4173`, forward preview port `4173`, and load the local preview URL while TCP `18080` remains unopened publicly.

## Failure interpretation

- `ssh-auth-failed`: SSH cannot authenticate non-interactively. Check SSH destination, key path, ssh-agent/key permissions, and passwordless SSH from the Mac running Sero.
- `local-port-conflict`: Sero cannot bind `127.0.0.1:<localPort>`. Stop the local conflicting process or change the saved gateway `localPort`; do not open remote firewall access as a workaround.
- `remote-gateway-not-listening`: SSH tunnel setup succeeded, but the remote OpenShell gateway is not accepting connections on remote `127.0.0.1:<gatewayPort>`. Check remote Docker/OpenShell gateway startup.
- `openshell-status-failed`: The tunnel exists and the gateway endpoint was selected, but `openshell status` failed. Inspect the sanitized OpenShell failure text, CLI version, selected gateway name, and remote gateway health.

## Results template

| Field | Value |
| --- | --- |
| Date |  |
| Tester |  |
| Sero commit |  |
| OpenShell CLI version |  |
| Gateway | `sero-remote-gcp` |
| SSH destination |  |
| Connection mode | `Sero-managed SSH tunnel` |
| Local endpoint | `https://127.0.0.1:` |
| Remote gateway port | `18080` |
| Confirmed no public TCP 18080 firewall change | Pass / Fail |
| Health/status | Pass / Fail — notes: |
| Sandbox creation | Pass / Fail — notes: |
| Bash | Pass / Fail — notes: |
| Write/read/edit | Pass / Fail — notes: |
| Logs | Pass / Fail — notes: |
| Preview forwarding | Pass / Fail — notes: |
| Failure diagnostics observed | None / notes: |
| Phase 7 accepted | Yes / No |

Phase 7 is accepted only when `sero-remote-gcp` passes with SSH access alone and without adding or updating public firewall access for TCP `18080`.
