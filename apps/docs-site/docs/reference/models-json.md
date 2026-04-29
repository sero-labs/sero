# `models.json` Reference

`models.json` configures local and custom model providers for the active Sero profile. The file lives in the profile-scoped agent directory:

```text
<SERO_HOME>/agent/models.json
```

For the default profile, that is usually `~/.sero-ui/agent/models.json`. Sero reads and writes this file through the local models UI, then refreshes model availability.

## Minimal shape

```json
{
  "providers": {
    "lm-studio": {
      "baseUrl": "http://localhost:1234/v1",
      "api": "openai-completions",
      "apiKey": "lm-studio",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "local-model-id",
          "name": "Local model"
        }
      ]
    }
  }
}
```

`providers` is a map. Each key is the provider ID shown to Sero, and each value is a provider configuration.

## Provider fields

| Field | Type | Notes |
| --- | --- | --- |
| `baseUrl` | string | Base URL for the provider API, such as `http://localhost:1234/v1`. |
| `api` | string | Supported values: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`. |
| `apiKey` | string | Literal key, environment variable name, or command form supported by Sero's resolver. Use `none` when the local server should not receive an auth header. |
| `headers` | object | Extra request headers. Values use the same resolver behavior as `apiKey`. |
| `compat` | object | OpenAI-compatibility flags from the Pi SDK type used by Sero. The UI currently exposes `supportsDeveloperRole` and `supportsReasoningEffort`. |
| `authHeader` | boolean | For OpenAI-compatible APIs, controls whether Sero attaches `Authorization: Bearer <apiKey>`. Defaults to true when an API key is present and not `none`. |
| `models` | array | Explicit local/custom model entries. |
| `modelOverrides` | object | Per-model overrides for built-in provider models. |

## Model entry fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Required model ID. |
| `name` | string | Optional display name. |
| `api` | string | Optional per-model API shape; same values as provider `api`. |
| `baseUrl` | string | Optional per-model base URL. |
| `reasoning` | boolean | Whether Sero should treat the model as reasoning-capable. |
| `input` | array | Supported input types: `text`, `image`. |
| `contextWindow` | number | Context window size when known. |
| `maxTokens` | number | Max output tokens when known. |
| `cost` | object | Cost per million tokens. See below. |
| `headers` | object | Per-model headers. |
| `compat` | object | Per-model OpenAI compatibility overrides. |

## Cost fields

When specified on a model, `cost` uses numbers per million tokens:

```json
{
  "input": 0,
  "output": 0,
  "cacheRead": 0,
  "cacheWrite": 0
}
```

Model overrides can use partial cost objects, so only the fields you need to override are required there.

## Supported API shapes and discovery

| `api` value | Discovery behavior | Auth behavior |
| --- | --- | --- |
| `openai-completions` | Fetches `<baseUrl>/models`; if that fails, tries Ollama `/api/tags` after stripping a trailing `/v1`. | Adds `Authorization: Bearer <apiKey>` unless `apiKey` is `none` or `authHeader` is false. |
| `openai-responses` | Same model discovery as OpenAI-compatible completions. | Same bearer behavior as above. |
| `anthropic-messages` | Fetches `<baseUrl>/models` and parses OpenAI-style `data[].id` model lists. | Adds `x-api-key` and `anthropic-version: 2023-06-01` when needed. |
| `google-generative-ai` | Fetches `<baseUrl>/models` and parses `models[].name`, trimming `models/`. | Adds `x-goog-api-key` or `?key=` when an API key is present and not `none`. |

## Resolver behavior for keys and headers

For `apiKey` and `headers` values:

- an empty value is ignored
- a value starting with `!` is executed as a shell command and the trimmed stdout is used
- otherwise Sero first checks `process.env[value]`; if no environment variable exists, the literal value is used

Treat command-based and environment-backed values as sensitive. Do not commit private `models.json` files.

## Model overrides

`modelOverrides` is keyed by model ID and can adjust display/metadata for built-in provider models:

```json
{
  "providers": {
    "openai": {
      "modelOverrides": {
        "gpt-example": {
          "name": "Example display name",
          "reasoning": true,
          "contextWindow": 128000,
          "maxTokens": 8192
        }
      }
    }
  }
}
```

Supported override fields are `name`, `reasoning`, `input`, `cost`, `contextWindow`, `maxTokens`, `headers`, and `compat`.

## Validation and recovery

If `models.json` is malformed or contains unsupported values, the model registry can report an error and the local models UI may ask you to fix the invalid entry before adding or editing providers.

Recovery steps:

1. Back up `<SERO_HOME>/agent/models.json`.
2. Validate it as JSON.
3. Remove fields not listed on this page.
4. Reopen the model manager or restart Sero.
5. Test connection and fetch models again.

## Related docs

- [Local LLMs with LM Studio](/guide/local-llms-lm-studio)
- [Models and Providers](/guide/models-and-providers)
- [State and Folders](/reference/state-and-folders)
