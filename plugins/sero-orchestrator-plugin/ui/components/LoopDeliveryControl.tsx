/**
 * LoopDeliveryControl — where this loop's results ship (spec 13). A user-level
 * setting like worktree placement: a destination picker plus that destination's
 * params, applied via `set_delivery`; never touched by the planner. Changing it
 * takes effect on the next plan revision/run (the receipt contract follows the
 * setting immediately).
 */

import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NativeSelect,
  NativeSelectOption,
} from '@sero-ai/ui';
import type { DeliveryDestinationId, Loop, OrchestratorAction } from '../../shared/types';
import { DELIVERY_DESTINATIONS, deliveryDestinationInfo, effectiveDelivery } from '../../shared/delivery-types';

export function LoopDeliveryControl({
  loop,
  busy,
  onAction,
}: {
  loop: Loop;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = effectiveDelivery(loop);
  const [destination, setDestination] = useState<DeliveryDestinationId>(current.destination);
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(current.params ?? {}).map(([k, v]) => [k, String(v)])),
  );

  const hints = deliveryDestinationInfo(destination).paramHints;

  const apply = () => {
    const filled = Object.fromEntries(
      hints.map((h) => [h.key, params[h.key]?.trim()]).filter(([, v]) => v),
    ) as Record<string, string>;
    onAction({
      kind: 'set_delivery',
      loopId: loop.id,
      delivery: { destination, params: Object.keys(filled).length ? filled : undefined },
    });
    setOpen(false);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} title="Where this loop's results ship">
        <Send className="mr-1 h-3.5 w-3.5" />
        Delivery
        {loop.delivery && <span className="ml-1 size-1.5 rounded-full bg-primary" />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delivery</DialogTitle>
            <DialogDescription>
              Where this loop's results ship. Externally visible destinations always ask you to approve the exact
              content before anything is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <NativeSelect value={destination} onChange={(e) => setDestination(e.target.value as DeliveryDestinationId)}>
              {DELIVERY_DESTINATIONS.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {hints.map((h) => (
              <Input
                key={h.key}
                value={params[h.key] ?? ''}
                placeholder={h.placeholder}
                onChange={(e) => setParams((p) => ({ ...p, [h.key]: e.target.value }))}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={apply}>Save delivery</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
