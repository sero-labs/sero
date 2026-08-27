import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { useNodesStore } from '@/stores/nodes';

export function NodeAuthInteraction({ nodeId }: { nodeId: string }) {
  const event = useNodesStore((state) => state.authEvents[nodeId]);
  const respond = useNodesStore((state) => state.respondAuth);
  const cancel = useNodesStore((state) => state.cancelLogin);
  const [value, setValue] = useState('');
  if (!event) return null;

  const needsResponse = event.type === 'prompt' || event.type === 'select' || event.type === 'manual_input';
  const message = event.type === 'auth' ? event.instructions ?? 'Continue authentication in your browser.'
    : event.type === 'device_code' ? `Enter code ${event.userCode} in the browser. This code expires in ${event.expiresInSeconds} seconds.`
      : event.type === 'manual_input' ? event.prompt
        : 'message' in event ? event.message
          : event.type === 'cancelled' ? 'Authentication was cancelled.' : 'Authentication is in progress.';

  return <section className="grid gap-2 rounded-md border p-2" aria-live="polite">
    <h3 className="text-sm font-semibold">Authentication</h3>
    <p className="text-xs text-(--text-secondary)">{message}</p>
    {event.type === 'auth' || event.type === 'device_code' ? <a
      className="break-all text-xs underline"
      href={event.type === 'auth' ? event.url : event.verificationUri}
      target="_blank"
      rel="noreferrer"
    >Open provider sign-in</a> : null}
    {event.type === 'select' ? <div className="flex flex-wrap gap-1">{event.options.map((option) => (
      <Button key={option.id} size="sm" variant="outline" onClick={() => void respond(nodeId, option.id)}>{option.label}</Button>
    ))}</div> : null}
    {(event.type === 'prompt' || event.type === 'manual_input') ? <Input
      aria-label="Authentication response"
      placeholder={event.type === 'prompt' ? event.placeholder : undefined}
      value={value}
      onChange={(input) => setValue(input.target.value)}
    /> : null}
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => void cancel(nodeId)}>Cancel</Button>
      {needsResponse && event.type !== 'select' ? <Button size="sm" disabled={!value} onClick={() => void respond(nodeId, value)}>Continue</Button> : null}
    </div>
  </section>;
}
