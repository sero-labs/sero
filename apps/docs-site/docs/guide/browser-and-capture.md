# Browser and Capture

Sero has two related visual surfaces:

- the visible Explorer browser, which opens workspace-scoped browser tabs
- the UI-backed app/capture bridge, which can switch apps, inspect UI, capture screenshots, preview dev servers, and record short MP4s

They are useful for development previews, support reports, and agent/operator workflows, but they are not a replacement for a full browser automation framework.

## Quick path: preview a dev server

1. Start the server in the selected workspace runtime. Keep this terminal running.

For a Host workspace, use the development server's normal local bind:

```bash
npm run dev
```

For a container workspace, bind the server to all container interfaces:

```bash
npm run dev -- --host 0.0.0.0
```

2. In a second terminal, register the running server. Use the command that matches the selected runtime.

```bash
# Host workspace
sero devserver register --name "Web app" --port 3000 --command "npm run dev" --framework vite

# Container workspace
sero devserver register --name "Web app" --port 3000 --command "npm run dev -- --host 0.0.0.0" --framework vite

sero devserver list
```

3. Open the listed URL in the visible browser or in a capturable app preview.

```bash
sero browser open <url-from-devserver-list>
sero app preview <url-from-devserver-list>
```

4. Capture what Sero sees.

```bash
sero app screenshot --save ./preview.png
```

For container networking details, see [Containers and Dev Servers](/guide/containers-dev-servers).

## Visible browser

The `browser` namespace controls loaded in-app browser tabs.

```bash
sero browser open https://example.com
sero browser list
sero browser get-text
sero browser screenshot
```

Important behavior:

- browser tabs are scoped to the current workspace
- explicit tab ids cannot control another workspace's tabs
- only `http:` and `https:` URLs are accepted for open/navigate
- `get-text` and `screenshot` default to the active tab in the current workspace
- tabs appear in `list` only after their browser view is loaded

Use the visible browser for normal preview and page-reading workflows. Use `sero app preview` when you specifically need the preview inside the app panel for app screenshot/record capture.

## App navigation and screenshots

The `app` namespace goes through Sero's renderer bridge.

```bash
sero app list
sero app open explorer
sero app active
sero app screenshot --save ./sero-app.png
sero app screenshot --app explorer --save ./explorer.png
```

Screenshots return an image block to the agent and can optionally save a PNG to disk. Relative `--save` paths resolve from the command cwd.

Failures usually mean the app panel is not available or not visible. Open the target app first, wait for it to render, then retry.

## DOM interactions

Sero can perform simple interactions against the currently visible app panel.

```bash
sero app click "button[data-testid='save']"
sero app click --x 240 --y 180
sero app type "hello" --selector "textarea"
sero app scroll --selector "aside.inspector" --y 700
sero app scroll-to --text "Read-only evidence" --within "aside.inspector"
sero app screenshot-around --text "Read-only evidence" --within "aside.inspector" --save ./evidence.png
sero app visible --text "Read-only evidence"
sero app scroll-containers
sero app hover ".menu-item"
sero app inspect --visible-only --limit 20
sero app get-text --app factory --selector "aside.inspector" --visible-only
```

`click`, `type`, `scroll`, `scroll-to`, `select`, and `hover` auto-capture a screenshot after the action. `inspect`, `visible`, `snapshot`, `scroll-containers`, and `get-text` return text/JSON and skip the post-action screenshot.
`inspect` and `snapshot` include temporary element refs, which can be reused with commands such as `sero app click --ref e17` or `sero app scroll --ref e42 --y 500`.

Limitations:

- selector support depends on the rendered DOM in Sero's app panel
- coordinate actions are relative to the app screenshot, not the entire desktop
- typing requires an input, textarea, or contenteditable target
- hidden, offscreen, sandboxed, or cross-origin content may not expose useful DOM targets

## Recording MP4s

Use recording for short visual evidence of UI behavior.

```bash
sero app record start
# perform actions manually or with `sero app ...`
sero app record status
sero app record stop
sero app record stop --save ./demo.mp4
```

Recording captures at 2 FPS. The default save location is:

```text
<workspace>/sero-recordings/
```

If MP4 output is not available for a capture, Sero may save a PNG frame folder instead. Recording state is bridge-local and ephemeral; do not expect it to survive renderer reloads or app restarts.

## Screenshots for support reports

A useful support report usually includes:

```bash
sero app active
sero app screenshot --save ./support-screenshot.png
sero session info
sero devserver list
```

Redact private code, tokens, account data, and personal content before sharing screenshots or recordings.

## Recovery tips

| Symptom | Try this |
|---|---|
| `No active tab` from `sero browser screenshot` | Open a tab with `sero browser open <url>` or switch to the Browser panel. |
| Browser tab belongs to another workspace | Switch to that workspace or open the URL in the current workspace. |
| `app panel not found or not visible` | Run `sero app open <app>` and wait for the app panel to render. |
| Click/type misses the target | Run `sero app screenshot`, inspect coordinates/selectors, then retry. |
| Recording stop fails | Confirm `sero app record status` shows recording and that frames were captured. |
| Preview URL fails after a runtime restart | Run `sero devserver list`. Re-register the server if its entry is gone, then use the reported URL. |

## Related docs

- [Sero CLI](/reference/sero-cli#app)
- [Sero CLI browser commands](/reference/sero-cli#browser)
- [Containers and Dev Servers](/guide/containers-dev-servers)
- [Explorer](/guide/explorer-workspace)
- [Troubleshooting](/reference/troubleshooting)
