# Runtime preview ports

Sero container runtimes publish preview URLs through loopback host-port pools.
Docker/Podman and Apple Container both reserve internal gateway ports starting at `32000`
and bridge each detected dev server from `0.0.0.0:<gateway>` inside the runtime to
`127.0.0.1:<target>` in the same runtime namespace. The returned preview URL is
always `http://127.0.0.1:<hostPort>`.

The default pool size is **16 ports per workspace**. This keeps container startup
arguments small while covering typical app, API, Storybook, and card preview
workflows. Set `runtime.previewPortPoolSize` in `.sero-workspace.json` when a
workspace needs more concurrent previews; changing the size requires recreating
the runtime container so the new port publications exist at creation time.
