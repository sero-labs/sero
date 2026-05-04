# Web Remote Voice Transcription Exploration

## Context

`apps/desktop` already has voice transcription in the chat composer, but `apps/web-remote` does not. The goal is to understand whether the desktop approach can be reused in a browser-based remote client, and to identify a path that also leaves room for a future React Native app.

## Current desktop implementation

The existing desktop implementation is split across two layers:

1. Browser-style recording UI in the Electron renderer.
2. Electron IPC-backed transcription in the main process.

The renderer-side control is `apps/desktop/src/components/layout/VoiceTranscriptionControl.tsx`. It uses standard browser APIs such as `navigator.mediaDevices`, `MediaRecorder`, `Blob`, and `FileReader` to capture microphone audio, enumerate input devices, record audio chunks, convert the final blob to a data URL, and pass it to `window.sero.voice.transcribe(...)`.

Supporting browser audio utilities live in `apps/desktop/src/components/layout/voice-utils.ts`. These utilities handle microphone selection, fallback to the default device, supported recording MIME type detection, stream cleanup, blob-to-data-URL conversion, and microphone error formatting.

The Electron boundary is exposed through the preload API as `window.sero.voice.status()` and `window.sero.voice.transcribe(...)`, typed in `apps/desktop/src/types/electron.d.ts`.

The IPC handler is `apps/desktop/electron/ipc/agent/handlers/voice.ts`. It resolves an OpenAI API key from stored desktop auth or `OPENAI_API_KEY`, then calls the assistant-level transcription implementation.

The actual transcription implementation is `apps/desktop/electron/features/agent/assistants/voice-transcription.ts`. It posts a `FormData` request to OpenAI's audio transcription endpoint using `gpt-4o-mini-transcribe`, forces `response_format` to `text`, enforces a 25 MB audio payload limit, and applies a 60 second timeout.

## Is the desktop method directly available to `web-remote`?

No, not directly.

`apps/web-remote` is a browser app. It does not have the Electron preload API, so it cannot call `window.sero.voice.status()` or `window.sero.voice.transcribe(...)`.

The current `apps/web-remote/src/components/ChatPanel.tsx` owns a plain textarea composer, image attachment handling, send, and abort controls. It has no voice control and no transcription client.

`web-remote` communicates with the desktop host through the gateway WebSocket client in `apps/web-remote/src/lib/gateway-client.ts`. That client supports prompt, workspace, session, file, artifact, dev server, token, and abort operations, but it does not currently support voice transcription.

The server-side gateway protocol in `apps/desktop/electron/features/gateway/server/protocol.ts` likewise has no `voice_status` or `voice_transcribe` request type. The request handler in `apps/desktop/electron/features/gateway/server/request-handler.ts` does not route transcription requests either.

The important distinction is that the microphone recording layer is mostly browser-compatible, but the transcription bridge is Electron-specific today.

## Recommended architecture

Use the existing desktop gateway as the transcription backend for `web-remote`.

Do not call OpenAI directly from `web-remote`. A direct browser call would require exposing an OpenAI API key to the browser, asking every browser client to manage its own key, or adding a separate hosted backend. The desktop app already has credential storage and an existing transcription helper, so the gateway is the cleanest boundary.

The preferred architecture is:

1. Capture audio in the browser or native client.
2. Convert it to a data URL or other gateway-supported payload.
3. Send it to the desktop host over the authenticated gateway.
4. Let the desktop host resolve credentials and call OpenAI.
5. Return the transcript to the client and append it to the chat composer.

This keeps API credentials on the trusted desktop host and gives web, mobile browser, and future React Native clients a shared transcription path.

## Proposed first implementation

Add two new gateway request types:

```ts
interface GatewayVoiceStatusRequest {
  type: 'voice_status';
}

interface GatewayVoiceTranscribeRequest {
  type: 'voice_transcribe';
  audioDataUrl: string;
  mimeType?: string;
}
```

Add these to the gateway request union, validation allowlist, and validation switch in `apps/desktop/electron/features/gateway/server/protocol.ts`.

Route them in the gateway request handler or an extended handler:

- `voice_status` calls `getVoiceTranscriptionStatus(...)` after resolving the OpenAI key.
- `voice_transcribe` calls `transcribeWithOpenAi(audioDataUrl, mimeType, key)`.

Return a response shape like:

```ts
{
  type: 'ok',
  requestType: 'voice_transcribe',
  data: {
    text: string,
    model: string
  }
}
```

Add matching methods to `GatewayClient`, for example:

```ts
voiceStatus(): Promise<VoiceTranscriptionStatus>;
transcribeVoice(audioDataUrl: string, mimeType?: string): Promise<VoiceTranscriptionResult>;
```

The current gateway client is mostly fire-and-forget and dispatches responses through global message handlers. Transcription is a request/response interaction where the caller needs the returned text. Before adding voice transcription, consider adding request correlation to the gateway protocol:

```ts
interface GatewayRequest {
  type: string;
  requestId?: string;
}

interface GatewayOkResponse {
  type: 'ok';
  requestType: string;
  requestId?: string;
  data?: unknown;
}

interface GatewayErrorResponse {
  type: 'error';
  requestType: string;
  requestId?: string;
  message: string;
}
```

Then `GatewayClient` can maintain a pending promise map keyed by `requestId`. This would make transcription and future request/response features easier to implement safely.

## UI integration in `web-remote`

The first UI integration can mirror the desktop flow:

1. Add or share a `VoiceTranscriptionControl` variant that does not depend on `window.sero`.
2. Reuse the capture utilities from `voice-utils.ts`, ideally by moving shared browser-safe utilities into a package or shared web module.
3. In `apps/web-remote/src/components/ChatPanel.tsx`, add a mic button alongside the attachment and send buttons.
4. On successful transcription, append the transcript to `input`:

```ts
setInput((prev) => {
  const transcript = text.trim();
  if (!transcript) return prev;
  if (!prev.trim()) return transcript;
  return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
});
```

For mobile layouts, consider hiding the input-device selector and using the system default microphone. Device selection is useful on desktop browsers but less useful on phones.

## Browser and mobile browser considerations

The browser capture layer should work in principle because it relies on standard web APIs, but there are deployment and compatibility details to verify:

- `getUserMedia` requires a secure context, usually HTTPS, except for localhost.
- `MediaRecorder` support and supported MIME types differ between browsers.
- The current MIME picker already checks `MediaRecorder.isTypeSupported(...)`, which is the right pattern.
- Mobile browsers may produce different audio formats than desktop browsers.
- Device labels may be blank until permission is granted.
- Device enumeration and `devicechange` behaviour can be limited on mobile.
- Large recordings should remain bounded by the existing 25 MB transcription payload limit.

The existing transcription helper accepts common audio MIME types and maps them to extensions including wav, mp3, m4a, webm, ogg, and flac, which is useful for cross-browser capture.

## React Native considerations

A future React Native app should not rely on `MediaRecorder` or `navigator.mediaDevices`, because those are web APIs.

The gateway-backed architecture still works well for React Native if capture is abstracted behind a platform adapter:

- Web adapter: `navigator.mediaDevices` plus `MediaRecorder`.
- React Native adapter: native audio recording library, such as Expo AV or a bare React Native recorder.
- Shared transcription client: gateway `voice_transcribe` request.

That keeps transcription, credential handling, auth, and model selection centralised in the desktop host while allowing each client platform to use its best local recording API.

## Alternatives considered

### Direct OpenAI call from the browser

This is not recommended. It exposes credential management to the browser client and makes revocation, storage, and security harder.

### Web Speech API

This could be offered as a browser-only fallback or experimental option, but it should not be the primary path. It has inconsistent browser support, behaviour can vary by platform, and it does not map cleanly to React Native.

### Hosted transcription backend

A hosted backend would work, but it is unnecessary for the current app shape because the desktop gateway is already present, authenticated, and able to access the user's stored OpenAI credentials.

## Recommended path

Implement gateway-backed transcription first.

This gives `web-remote` voice transcription without exposing API keys, reuses the desktop OpenAI transcription logic, and gives a clean future path for both desktop/mobile browsers and React Native.

Suggested task order:

1. Add request correlation support to the gateway client and server responses, or introduce a minimal promise-based request helper for the new voice requests.
2. Add `voice_status` and `voice_transcribe` protocol types and validation.
3. Reuse desktop `getVoiceTranscriptionStatus` and `transcribeWithOpenAi` in the gateway handler.
4. Add voice methods to `apps/web-remote/src/lib/gateway-client.ts` and `GatewayClientLike`.
5. Extract/share browser-safe voice capture utilities.
6. Add the mic control to `apps/web-remote/src/components/ChatPanel.tsx`.
7. Verify desktop Chrome, desktop Safari, mobile Safari, and Android Chrome recording formats and microphone permission UX.
