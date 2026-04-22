# Troubleshooting

## Native module issues

If terminal support fails, start with the repository's node-pty guidance.
Sero already runs native repair hooks during `pnpm install`, but manual rebuilds
may still be needed on some machines.

## Container runtime issues

If Apple containers are unavailable or unhealthy:
- verify `/usr/local/bin/container` exists
- run `container system status`
- start the system if needed
- continue in host mode if you need to unblock yourself quickly

## Host mode expectations

Host mode is supported, but it is a reduced experience. If a workflow depends
on browser automation, containerized tooling, or managed preview behavior,
container-backed runtime may be required.

## Quick recovery commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:ci
```

## See also

Current source material:
- `docs/node-pty-setup.md`
- `docs/guides/macos-containers.md`
- `CONTRIBUTING.md`
