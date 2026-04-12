# Facts — apps/desktop/electron/features/agent

_Last reviewed: 2026-04-12_

## What this code does
This module provides small assistant utilities used by IPC handlers: ad-hoc
LLM drafting (`adhoc-agent.ts`), Gemini image generation (`image-agent.ts`),
PR draft prompt/parsing helpers (`pr-draft.ts`), and OpenAI voice transcription
(`voice-transcription.ts`).

## Shape & metrics
- Total files: 4
- Total LOC: 613
- Largest file: `apps/desktop/electron/features/agent/assistants/voice-transcription.ts` (219 LOC)
- Files over 500 LOC: none
- External dependencies of note:
  - Pi SDK session creation (`@mariozechner/pi-coding-agent`)
  - provider SDK clients (`@google/genai`, OpenAI HTTP API)
  - shared infra model/auth access
- Upstream callers:
  - `runAdhocAgent` and PR draft helpers consumed by `electron/ipc/integrations/vcs.ts`
  - `generateImages` consumed by `electron/ipc/agent/handlers/imagegen.ts`
  - transcription helpers consumed by `electron/ipc/agent/handlers/voice.ts`
- Downstream dependencies:
  - model tier/settings helpers and auth infrastructure in `electron/shared/**`

## Architectural notes
- This folder is intentionally assistant-focused and avoids pulling IPC concerns in directly.
- It sits below the IPC surface as a domain helper layer; most files are cohesive and under cap.

## Surprising discoveries
- `image-agent.ts` still uses loose `any` typing in multimodal content assembly
  (`image-agent.ts:163-164`) and global exposure (`image-agent.ts:188`).
- `exposeImageAgent()` writes `globalThis.__seroImageGen` (`image-agent.ts:186-188`), but
  there is no in-repo read site for that symbol, suggesting dead bridge scaffolding.
