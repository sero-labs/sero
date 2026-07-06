# Agent sees the app — 60-second demo

## Hook

> My coding agent read a screenshot of the running app and fixed the bug it saw — I never described it.

## Shot list

| Time | Shot | Must be visible | Spoken/caption line |
| --- | --- | --- | --- |
| 0:00–0:06 | The app under test is already open in Sero's in-app browser, showing an obvious layout glitch (a primary button clipped at the right edge of its card). | The **Browser** panel (Globe icon, Activity Bar) with the URL bar reading a `http://127.0.0.1:<port>` address; the clipped button on screen. | Your coding agent usually never sees this. It edits code blind. |
| 0:06–0:14 | Open the **Dev Servers** popover from the status bar; click **Open in Sero browser** on the running app to load it into the Browser panel. | The **Dev Servers** popover with the server row: name, framework badge, `:<port>`, URL, and the **Open in Sero browser** button. | This is a real local dev server, running in the workspace. |
| 0:14–0:24 | In the chat panel, ask the agent to check the page. It runs `sero browser screenshot`; the captured PNG appears inline in the conversation. | The **ChatPanel** (right side) with the agent's `sero browser screenshot` call and the returned screenshot image in the thread. | It takes its own screenshot — and the picture comes back into the chat as an image. |
| 0:24–0:34 | The agent describes the defect from the image: the button is cut off, not from any hint I gave. | Agent message naming the specific visual issue, referencing the screenshot above it. | I didn't describe the bug. It read the screenshot and named it. |
| 0:34–0:46 | The agent opens the component file in the editor and makes the fix; the diff is visible. | The **Editor** (Monaco) under the **Explorer** panel, showing the edited component file and the changed lines. | Now it patches the actual code — same workspace, same files. |
| 0:46–0:55 | The dev server hot-reloads. The agent runs `sero browser screenshot` again; the new image shows the button fully visible. The Browser panel updates to match. | Second `sero browser screenshot` call in chat with the fixed screenshot; the **Browser** panel now showing the uncut button. | It re-screenshots to check its own work. The button's whole again. |
| 0:55–1:00 | Hold on the fixed Browser panel next to the chat thread. | The **Browser** panel (fixed UI) and the chat thread with both before/after screenshots. | See the app, change the code, verify the fix. One loop. |

## Honest caveats

- **No timelapse in this cut.** Every beat runs at real speed. If the hot-reload or a screenshot capture takes a few seconds on your machine, either wait it out on camera or add an on-screen "≈Ns" label over that beat — do not silently cut time.
- **Required setup:** a local web app must already be running as a managed dev server in the workspace (it appears in the **Dev Servers** popover with a `http://127.0.0.1:<port>` URL). The demo does not show starting that server; register/start it before recording.
- **Model must accept images.** `sero browser screenshot` returns the capture to the model as a PNG image block, so the agent only "sees" the page with a vision-capable model. A text-only model will get the call but not the picture.
- **Browser automation needs its runtime.** On a container runtime (Apple Container / Docker) the browser stack is preinstalled. In **Host** mode it requires the host browser pack — the one-time **Install browser support** download and a passing host browser-readiness check. Have this green before filming.
- **Two capture paths exist; this demo uses the visible one.** `sero browser screenshot` captures the visible **Browser** panel, which is what makes the demo filmable. There is also a hidden `automation_browser` tool for headless testing of a running app — it is not shown here because its browser never appears on screen.
- **Beta rough edges:** the in-app browser and managed dev servers are beta. Do a full dry run on the exact machine you will record on; capture timing and hot-reload speed vary by framework and runtime.
