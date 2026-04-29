# Facts — apps/desktop/electron/features/agent

_Last reviewed: 2026-04-16_

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

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 4 (was 4)
- Largest file: `apps/desktop/electron/features/agent/assistants/voice-transcription.ts` (219 LOC)
- Files over 500 LOC: none (was none)
- Type escape hatches remaining: 0 within `apps/desktop/electron/features/agent/assistants/` (was 2 `any`-based escape points in `image-agent.ts`)

### What changed
- Replaced the image-agent multimodal part assembly with canonical `@google/genai` `Part` helpers instead of `Record<string, any>` payloads.
- Formalized the legacy `globalThis.__seroImageGen` bridge behind a typed global augmentation so the compatibility exposure remains without `globalThis as any`.
- Removed the stale “mirrored from shared/types.ts” wording and added a focused Electron test that locks the legacy exposure contract.

### Still outstanding
- No tracked follow-ups remain in this folder plan.
- External consumers of `globalThis.__seroImageGen` still are not observable in-repo, so the bridge was preserved as a typed compatibility seam rather than deleted.
