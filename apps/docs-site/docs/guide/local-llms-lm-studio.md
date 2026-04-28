# Local LLMs with LM Studio

LM Studio can run a local model server that Sero treats like an OpenAI-compatible provider. Use this when you want to test local models, work with private local endpoints, or avoid sending a specific task to a hosted model provider.

Local models still need enough memory and GPU/CPU capacity on your machine. They may be slower or less capable than hosted models, and they are not automatically available inside every workspace container unless the URL is reachable from the process that needs it.

## Quick path

1. In LM Studio, download a chat/instruct model.
2. Load the model.
3. Start LM Studio's local server with OpenAI-compatible API enabled.
4. In Sero, open Settings/Admin → Models → Local models.
5. Add a provider and choose the **LM Studio** preset.
6. Confirm the base URL is `http://localhost:1234/v1`.
7. Use API key `lm-studio` or `none` unless your server requires a specific key.
8. Test the connection, fetch models, save the provider, then assign LOW/MED/HIGH tiers.

Source checked: `apps/desktop/src/types/local-models.ts`, `apps/desktop/electron/ipc/agent/handlers/local-models.ts`, and `apps/desktop/src/components/layout/models/model-manager/local-models/presets.ts`.

## Set up LM Studio

In LM Studio:

1. Install or open LM Studio.
2. Download a model that supports chat.
3. Load the model into the runtime.
4. Open the local server panel.
5. Start the server.
6. Keep the server running while Sero uses it.

The Sero preset expects:

| Field | Value |
| --- | --- |
| Provider name | `lm-studio` |
| Base URL | `http://localhost:1234/v1` |
| API shape | `openai-completions` |
| API key | `lm-studio` |
| Compatibility | developer role off, reasoning effort off |

If your LM Studio server uses a different port, update the base URL before testing.

## Add the provider in Sero

1. Open the model management surface from Settings/Admin or the model manager.
2. Open **Local models**.
3. Click **Add Local Provider**.
4. Choose **LM Studio** in Quick Setup.
5. Click **Test connection**.
6. Click **Fetch from server** to import model IDs from LM Studio's `/models` endpoint.
7. Save the provider.

Sero writes local provider configuration to `<SERO_HOME>/agent/models.json` and refreshes model availability after saving.

## Assign tiers

After saving the provider, open Admin → Model and choose LOW, MED, and HIGH defaults.

A practical local setup is:

| Tier | Suggested use |
| --- | --- |
| LOW | Small/fast local model for quick edits or summaries |
| MED | Stronger local model for everyday development work |
| HIGH | Best local model you can run comfortably, or a hosted fallback |

Thinking levels only appear when Sero believes the selected model supports them. Many OpenAI-compatible local servers do not support reasoning-effort controls, so the LM Studio preset disables that compatibility flag.

## Host and container reachability

`localhost` means “this process's machine or network namespace.” That is usually fine for Sero desktop talking to LM Studio on your Mac. If a tool inside a workspace container must call the same local server directly, `localhost` from inside the container may point at the container, not the host.

If a containerized command cannot reach LM Studio:

- use a host-reachable URL instead of `localhost` when your setup supports it
- verify the LM Studio server binds to an address reachable from the container
- test from the same place that will make the request
- avoid exposing the server on untrusted networks

For most model selection and chat usage, configure the provider through Sero and let Sero manage model calls from the desktop process.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Test connection fails | LM Studio server is running, base URL includes `/v1`, port is correct, firewall is not blocking loopback. |
| Fetch returns no models | A model is loaded in LM Studio and the server's `/models` endpoint returns data. |
| `HTTP 404` | Base URL may be missing `/v1` or using the wrong port. |
| Auth error | Use `lm-studio` or `none` unless your server requires a real API key. |
| Model appears but tier save warns | The model may have been unloaded, renamed, or removed from the local server. Fetch again or choose another model. |
| Container tool cannot reach the server | See the host/container reachability caveat above. |

## Related docs

- [Models and Providers](/guide/models-and-providers)
- [models.json Reference](/reference/models-json)
- [State and Folders](/reference/state-and-folders)
