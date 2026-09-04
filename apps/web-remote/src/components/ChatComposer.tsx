/**
 * Composer — the `PromptInput` shell the desktop `ChatComposer` uses.
 *
 * `PromptInput` owns the attachment list, the file dialog, drag-and-drop
 * and paste. This component turns the submitted files into the
 * `{ data, mimeType }` pairs the gateway expects.
 *
 * There is no model selector: the gateway has no model request, and a
 * control that cannot work is worse than none.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@sero-ai/ui/ai-elements/prompt-input';
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@sero-ai/ui/ai-elements/attachments';
import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useWorkspaceStore } from '@/stores/workspace';
import { VoiceTranscriptionControl } from './VoiceTranscriptionControl';

/** 20 MB, matching the gateway's own attachment ceiling. */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface GatewayImage {
  data: string;
  mimeType: string;
}

/**
 * `PromptInput` hands back `data:<mime>;base64,<payload>` URLs. The
 * gateway wants the mime type and the payload apart.
 */
function toGatewayImage(url: string, mediaType?: string): GatewayImage | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?,(.*)$/s.exec(url);
  if (!match) return null;
  const [, urlMediaType, payload] = match;
  return { data: payload, mimeType: mediaType || urlMediaType };
}

export function ChatComposer() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const composerPrefill = useChatStore((s) => s.composerPrefill);
  const connectionState = useConnectionStore((s) => s.state);
  const client = useConnectionStore((s) => s.client);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);

  const isConnected = connectionState === 'connected';
  const disabled = !isConnected || !activeWorkspaceId;

  // Consume prefill pushed by another panel (a preview element grab).
  useEffect(() => {
    if (!composerPrefill) return;
    setInput((prev) => (prev ? `${prev}\n${composerPrefill}` : composerPrefill));
    useChatStore.getState().clearComposerPrefill();
    textareaRef.current?.focus();
  }, [composerPrefill]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (disabled || isStreaming) return;

      const text = (message.text ?? '').trim();
      const images = (message.files ?? [])
        .map((file) => toGatewayImage(file.url, file.mediaType))
        .filter((image): image is GatewayImage => image !== null);

      if (!text && images.length === 0) return;

      sendMessage(text || '(image)', images.length > 0 ? images : undefined);
      setInput('');
    },
    [disabled, isStreaming, sendMessage],
  );

  const handleStop = useCallback(() => {
    if (activeSessionId) client.abortSession(activeSessionId);
  }, [activeSessionId, client]);

  const handleTranscript = useCallback((text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    setInput((prev) => {
      if (!prev.trim()) return transcript;
      return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
    });
    textareaRef.current?.focus();
  }, []);

  const placeholder = !isConnected
    ? 'Not connected...'
    : !activeWorkspaceId
      ? 'Select a workspace first...'
      : 'Send a message...';

  const submit = (
    <PromptInputSubmit
      disabled={disabled || isStreaming || !input.trim()}
      title="Send message"
      className="bg-status-success text-white hover:bg-status-success/90"
    />
  );

  return (
    <div className="relative shrink-0 p-2">
      <PromptInput
        onSubmit={handleSubmit}
        className="w-full"
        accept="image/*"
        multiple
        maxFileSize={MAX_FILE_SIZE}
      >
        <PendingAttachments />

        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
          />
        </PromptInputBody>

        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger disabled={disabled} />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Add an image" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>

            <VoiceTranscriptionControl
              client={client}
              isConnected={isConnected}
              disabled={disabled || isStreaming}
              onTranscript={handleTranscript}
            />
          </PromptInputTools>

          {isStreaming ? (
            <div className="flex items-center gap-1.5">
              {submit}
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <Loader2 className="size-3.5 animate-spin" />
                Stop
              </button>
            </div>
          ) : (
            submit
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

/**
 * Pending attachments, shown above the textarea. Copied from the desktop
 * `PromptAttachmentsBar`. Renders nothing when nothing is attached, so
 * the header row does not take space in the common case.
 */
function PendingAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((file) => (
          <Attachment
            key={file.id}
            data={file}
            onRemove={() => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}
