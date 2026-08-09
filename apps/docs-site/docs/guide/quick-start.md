# Try Sero in 10 minutes

Sero is a local-first desktop workspace where AI agents can see, act, remember,
automate, and extend themselves. This page takes you from download to your
first working agent session.

> **Before you start: you need a model.**
> Sero does not bundle any AI model or credentials. Bring one of:
>
> - **A hosted API key** — Anthropic, OpenAI, Google (Gemini), OpenRouter,
>   xAI, Groq, Mistral, and others are supported. Paste the key during setup.
> - **A local model server** — any OpenAI-compatible server works. Sero has
>   one-click presets for **Ollama**, **LM Studio**, and **vLLM**, plus a
>   custom base-URL option. Local models cost $0 to run.
>
> You cannot use Sero without one of these two.

Total time: about 10 minutes. Steps 1–2 take ~3 minutes, step 3 takes ~3
minutes, steps 4–5 take ~4 minutes.

## 1. Download the beta

Go to the [latest release](https://github.com/sero-labs/sero/releases/latest)
and download the file for your platform:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `Sero-<version>-macos-arm64.dmg` |
| Windows (x64) | `Sero-<version>-windows-x64-setup.exe` |
| Linux (x64 / arm64) | `Sero-<version>-linux-x64.deb` / `-linux-arm64.deb` |

Not supported yet: macOS Intel and Windows arm64. Developers can also
[run from source](/guide/getting-started) with Node 22 and pnpm 10.

## 2. Install and open

- **macOS**: open the `.dmg`, drag Sero to Applications, launch it. The build
  is signed with an Apple Developer ID and notarized — it opens with no
  Gatekeeper warnings.
- **Windows**: run the installer. You may see a SmartScreen prompt during the
  beta because the Windows build is not yet code-signed.
- **Linux**: install the `.deb` with your package manager.

Success looks like: the Sero window opens and asks you to create a profile.

## 3. Connect a model

First-run setup asks you to name a profile, then checks for a usable model
provider. Pick one path:

**Path A — hosted API key (fastest)**

1. When setup asks for a provider, pick yours (e.g. Anthropic or OpenAI) and
   paste your API key. Keys are stored locally on your machine in
   `~/.sero-ui/agent/auth.json` with owner-only file permissions — nothing is
   sent anywhere except to the provider you chose.
2. Choose your LOW / MED / HIGH model defaults when prompted (fast model,
   everyday model, strongest model).

**Path B — local model (Ollama, LM Studio, vLLM, or any OpenAI-compatible server)**

1. Start your local server with a chat model loaded (for example, LM Studio's
   local server on `http://localhost:1234/v1`).
2. In Sero, open Settings → Models → **Local models** → **Add Provider**.
3. Click the preset for your server — **Ollama**, **LM Studio**, or **vLLM**.
   The base URL and API key are filled in for you (edit them if your server
   uses a different port). For anything else, pick **Custom** and enter your
   server's base URL.
4. Click **Test connection**, then **Fetch from server** to import your
   models, then save.
5. Assign the imported models to LOW / MED / HIGH.

Success looks like: the provider shows as healthy and models appear in the
model picker. Full local-model guide:
[Local LLMs with LM Studio](/guide/local-llms-lm-studio).

## 4. Open a project

Create or open a workspace from the sidebar and point it at any project folder
(a git repo is ideal). When Sero asks where to run commands, keep the default.

Success looks like: you see the file tree, a terminal, and the chat panel for
that project.

## 5. Run your first workflow

In the chat panel, try one of these:

- *"Look at this repo and tell me how it's structured."*
- *"Find the TODOs in this project and summarize them."*
- *"Run the tests and tell me what fails."*

Watch the agent read files, run commands in the terminal, and answer with real
project context. Anything risky asks for your approval first.

Success looks like: within a couple of minutes you get an answer grounded in
your actual code — not a generic reply — and you saw every command the agent
ran.

**Want the full demo?** Ask Sero to build itself a plugin:
*"Build me a release-checklist plugin for this repo."* Sero scaffolds the
plugin, you review and approve it, and its UI appears inside Sero.

## If something goes wrong

- App won't open, or a provider shows unhealthy: see
  [Troubleshooting](/reference/troubleshooting).
- Local server test fails: check the server is running, the base URL includes
  `/v1`, and the port matches.
- Everything Sero stores lives under `~/.sero-ui/` — keys never leave your
  machine except to the provider you configured.
