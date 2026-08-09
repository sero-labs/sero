# Zero to first workflow — 60-second demo

## Hook

I timed it: fresh Mac, no Sero installed, to an agent answering questions about my own repo.

## Shot list

Sixty seconds of film covering a real ten-minute journey. A live elapsed-time
clock stays pinned in a corner the whole cut so viewers can see exactly how much
real time each beat took. The clock reads real minutes even where the footage is
timelapsed; jump-cuts are labelled as timelapse so nothing looks faked.

| Time | Shot | Must be visible | Spoken/caption line |
| --- | --- | --- | --- |
| 0:00–0:04 | Cold open on the GitHub Releases page, cursor over the latest release. Elapsed clock starts at 00:00. | `github.com/sero-labs/sero/releases/latest`, the `Sero-<version>-macos-arm64.dmg` asset, elapsed clock `00:00`. | No editing tricks. One clock, running the whole time. |
| 0:04–0:09 | Click the macOS arm64 `.dmg`, download completes. | The `.dmg` filename in the browser download bar. | Grab the signed macOS build. |
| 0:09–0:15 | Open the `.dmg`, drag Sero into Applications, launch it. No Gatekeeper warning appears. | The drag-to-Applications window; the app opening with no "unidentified developer" dialog. | Signed and notarised on macOS — it just opens. |
| 0:15–0:20 | First run asks you to create a profile; type a name. | The profile-creation prompt on first launch. | First run: name a profile. |
| 0:20–0:24 | Timelapse card: "You need a model — bring your own." Two labelled paths appear. | On-screen text: "Hosted API key OR local server (Ollama · LM Studio · vLLM)". | Sero ships no model. Bring an API key, or point it at a local server. |
| 0:24–0:32 | Path A, hosted: pick a provider in setup, paste an API key, set LOW / MED / HIGH model defaults. | The provider pick, the pasted (masked) key, the LOW/MED/HIGH assignment. | Path A: paste a key, pick your fast, everyday and strongest models. |
| 0:32–0:42 | Path B, local: Settings → Models → Local models → **Add Provider**. Click the **LM Studio** preset (base URL fills to `http://localhost:1234/v1`), click **Test**, then **Fetch from server**, then assign models. | The **Local models** panel, **Add Provider**, the LM Studio preset, the auto-filled base URL, the green **Test** tick, **Fetch from server**. | Path B: one-click Ollama, LM Studio or vLLM preset, Test, Fetch, done. Local runs at zero cost. |
| 0:42–0:47 | Open a project: point a new workspace at a real git repo. File tree, terminal and chat panel appear. | The workspace pointed at a folder; file tree + terminal + chat panel loading. | Point a workspace at any repo. |
| 0:47–0:56 | In the chat panel type *"Look at this repo and tell me how it's structured."* Agent reads files, runs a command in the terminal, and answers with real project detail. | The typed prompt, files being read, a command running in the terminal, an answer naming actual folders/files from the repo. | First workflow: it reads the actual code, not a generic reply — and you see every command it runs. |
| 0:56–1:00 | Cut to the pinned clock. It reads roughly 09–10 real minutes. Hold on it. | Elapsed clock showing the honest total (~00:09–00:10 in real minutes). | Download to a working agent on my own repo: under ten minutes. That's the whole demo. |

## Honest caveats

- **What the film compresses.** The 60-second cut represents a real run of
  roughly nine to ten minutes end to end. The download, install and first
  agent response happen in real time; the model-connect and project-open beats
  are timelapsed and labelled as such. The pinned clock always shows real
  elapsed minutes, never film seconds.
- **Signing is macOS-only.** The macOS Apple Silicon `.dmg` is signed with an
  Apple Developer ID and notarised, so it opens with no Gatekeeper warning —
  that is the build shown. During the beta the Windows `setup.exe` is not
  code-signed (expect a SmartScreen "unknown publisher" prompt) and the Linux
  `.deb` is unsigned. Don't imply Windows or Linux are signed.
- **You must bring a model.** Sero bundles no model or credentials. You need
  either a hosted API key (Anthropic, OpenAI, Google, OpenRouter and others) or
  a local OpenAI-compatible server. Hosted keys cost per-token from your
  provider; local servers (Ollama, LM Studio, vLLM) cost nothing to run but you
  supply the machine and model. If you film the local path, have the server
  running with a chat model loaded before the clock starts, and keep that setup
  step inside the honest total.
- **This is beta software.** Expect rough edges. The ten-minute figure assumes a
  reasonable connection and a model that's already available (key in hand, or
  local model already pulled). A slow download, a first-time local model pull,
  or a provider that needs a different port will push the real time up — show
  the true number rather than a best case.
