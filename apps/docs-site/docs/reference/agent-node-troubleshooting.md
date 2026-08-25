# Agent Node troubleshooting

This page is for the Linux operator. Use it when Desktop cannot connect or
when a command works over SSH but fails through Agent Node.

## Check the service

Run these commands on the node:

```sh
sudo systemctl status sero-node.service
sudo journalctl -u sero-node.service -n 200 --no-pager
systemctl show sero-node.service \
  -p ActiveState -p SubState -p User -p Group \
  -p PrivateDevices -p DevicePolicy -p DeviceAllow
```

The service must report `ActiveState=active` and `SubState=running`. Check
`/etc/sero-node/sero-node.conf` if startup reports a missing or invalid public
URL. `SERO_NODE_URL` must contain the reachable HTTPS origin.

## Enrolment command fails

Start the command from a directory that the `sero-node` account can access:

```sh
sudo -u sero-node sh -c 'cd /var/lib/sero-node && sero-node enrol'
```

Do not run `sudo -u sero-node sero-node enrol` from a private operator home
directory. The service account cannot traverse that directory. The command can
then fail before OpenSSL starts.

The command prints a one-time code and the node identity fingerprint. Enter
both values in Desktop. The code expires after ten minutes and works once.

## Confirm which computer ran a command

Send this prompt in the Agent Node conversation:

```text
Run `hostname && uname -m` and return the output exactly.
```

Compare the output with the node. This check proves that the request travelled
through Desktop to the remote Pi session.

## NVIDIA tools cannot reach the driver

First check the driver outside the service:

```sh
nvidia-smi
```

If this works over SSH but fails in the Agent Node conversation, inspect the
device policy:

```sh
systemctl show sero-node.service \
  -p PrivateDevices -p DevicePolicy -p DeviceAllow
```

The baseline unit uses `PrivateDevices=yes`, so it hides physical devices. For
an NVIDIA node, install the supplied override as a systemd drop-in:

```sh
sudo install -D -m 0644 \
  apps/agent-node/systemd/sero-node-nvidia.conf \
  /etc/systemd/system/sero-node.service.d/90-nvidia.conf
sudo systemctl daemon-reload
sudo systemctl restart sero-node.service
```

The override keeps `DevicePolicy=closed` and permits only character-device
groups whose kernel names start with `nvidia`. It supports current and future
NVIDIA device minors without opening unrelated host devices. Check the applied
policy:

```sh
systemctl show sero-node.service \
  -p PrivateDevices -p DevicePolicy -p DeviceAllow
```

Then send this prompt through Sero:

```text
Run `nvidia-smi --query-gpu=name,driver_version --format=csv,noheader` and return the output exactly.
```

Do not set `DevicePolicy=auto` as a permanent workaround. It removes the
device allowlist.

## Docker reports permission denied

Check the socket and service account:

```sh
ls -l /var/run/docker.sock
id sero-node
```

Most installations give the socket to the `docker` group. To grant access,
add the service account to that group and restart the service:

```sh
sudo usermod -aG docker sero-node
sudo systemctl restart sero-node.service
```

Docker access gives the agent effective root access to the host. A task can
start a privileged container, mount host files, or bypass the Agent Node
filesystem restrictions. Grant this access only when you trust every
controller, prompt, tool call, and source of text that the agent reads.

Verify the group and daemon from the Agent Node conversation:

```text
Run `id && docker info --format '{{.ServerVersion}}'` and return the output exactly.
```

Remove Docker access with:

```sh
sudo gpasswd -d sero-node docker
sudo systemctl restart sero-node.service
```

## Desktop disconnects after a service restart

Wait for the service to become active, then reconnect the node in Desktop. A
restart keeps the node identity, controllers, sessions, and provider state.
Inspect the journal if Desktop does not reconnect:

```sh
sudo journalctl -u sero-node.service -n 200 --no-pager
```

Do not replace `identity.key` to repair a connection. A new identity requires
enrolment again.
