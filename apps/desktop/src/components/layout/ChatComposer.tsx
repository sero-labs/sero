import type {
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';
import { Loader2 } from 'lucide-react';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputProps,
} from '@sero-ai/ui/ai-elements/prompt-input';

interface ChatComposerProps {
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  onSubmit: PromptInputProps['onSubmit'];
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  textareaRef?: Ref<HTMLTextAreaElement>;
  placeholder: string;
  disabled: boolean;
  isStreaming: boolean;
  onStop: () => void;
  onSubmitClick?: MouseEventHandler<HTMLButtonElement>;
  submitTitle?: string;
  overlays?: ReactNode;
  inputChildren?: ReactNode;
  header?: ReactNode;
  tools?: ReactNode;
  toolsClassName?: string;
  multiple?: boolean;
  globalDrop?: boolean;
  maxFiles?: number;
}

/** Shared visual shell for local and Agent Node chat composers. */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  textareaRef,
  placeholder,
  disabled,
  isStreaming,
  onStop,
  onSubmitClick,
  submitTitle,
  overlays,
  inputChildren,
  header,
  tools,
  toolsClassName,
  multiple,
  globalDrop,
  maxFiles,
}: ChatComposerProps) {
  const submit = (
    <PromptInputSubmit
      disabled={!value.trim() || disabled}
      onClick={onSubmitClick}
      title={submitTitle}
      className="bg-status-success text-white hover:bg-status-success/90"
    />
  );

  return (
    <div className="relative shrink-0 p-2">
      {overlays}
      <PromptInput
        onSubmit={onSubmit}
        className="w-full"
        multiple={multiple}
        globalDrop={globalDrop}
        maxFiles={maxFiles}
      >
        {inputChildren}
        {header ? <PromptInputHeader>{header}</PromptInputHeader> : null}
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools className={toolsClassName}>{tools}</PromptInputTools>
          {isStreaming ? (
            <div className="flex items-center gap-1.5">
              {submit}
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-base font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <Loader2 className="size-3.5 animate-spin" />
                Stop
              </button>
            </div>
          ) : submit}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
