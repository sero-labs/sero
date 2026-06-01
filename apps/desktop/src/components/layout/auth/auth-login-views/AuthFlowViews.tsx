import { useState, type RefObject } from 'react';
import {
  CheckCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';

export function AuthenticatingView({
  authUrl,
  progressMessages,
  onCancel,
}: {
  authUrl: string | null;
  progressMessages: string[];
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span>Waiting for browser authentication…</span>
      </div>

      {authUrl ? (
        <div className="space-y-1.5 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            A browser window should have opened. If not, click below:
          </p>
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 break-all text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            Open login page
          </a>
        </div>
      ) : null}

      {progressMessages.length > 0 ? (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {progressMessages.map((message, index) => (
            <p key={`${index}-${message}`}>{message}</p>
          ))}
        </div>
      ) : null}

      <Button variant="outline" size="sm" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

export function WaitingView({ message, onCancel }: { message: string; onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span>{message}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

export function PromptView({
  message,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  inputRef,
}: {
  message: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{message}</p>
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit();
          if (event.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={!value.trim()} className="flex-1">
          Submit
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function SelectView({
  message,
  options,
  onSelect,
  onCancel,
}: {
  message: string;
  options: Array<{ id: string; label: string }>;
  onSelect: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{message}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <Button
            key={option.id}
            variant="outline"
            size="sm"
            onClick={() => onSelect(option.id)}
            className="w-full justify-start"
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel} className="w-full">
        Cancel
      </Button>
    </div>
  );
}

export function ApiKeyEntryView({
  providerName,
  value,
  onChange,
  onSave,
  onCancel,
  inputRef,
}: {
  providerName: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Enter API key for <span className="font-medium">{providerName}</span>:
      </p>
      <div className="relative">
        <Input
          ref={inputRef}
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave();
            if (event.key === 'Escape') onCancel();
          }}
          placeholder="sk-…"
          className="pr-9 font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShowKey((visible) => !visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          tabIndex={-1}
        >
          {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={!value.trim()} className="flex-1">
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ResultView({
  type,
  message,
  onDone,
}: {
  type: 'success' | 'error';
  message: string;
  onDone: () => void;
}) {
  const isSuccess = type === 'success';
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-sm">
        {isSuccess ? (
          <CheckCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-success)]" />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        )}
        <span>{message}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onDone} className="w-full">
        {isSuccess ? 'Done' : 'Back'}
      </Button>
    </div>
  );
}
