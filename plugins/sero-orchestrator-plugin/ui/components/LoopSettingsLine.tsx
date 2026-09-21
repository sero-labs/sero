/**
 * The Workflow's settings, each value under a label that names it.
 *
 * This replaces a line of icon chips. A folder, a lightning bolt, a gauge and
 * a coin told the reader nothing until they had learnt the set, and the two
 * values the user can change sat in a separate row of buttons below. Now the
 * label says what the value is, and Results to and Context open from the value
 * itself.
 *
 * What starts the Workflow names its events and schedules in the same words
 * the Workflows list uses. Their filters and conditions are one click away,
 * because a filter is read when something fires unexpectedly, not every time
 * the page opens.
 */

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type { Loop, LoopRunSummary, OrchestratorAction } from '../../shared/types';
import { SETTING_VALUE_CLASS, loopSettings, type TriggerDetail } from '../lib/loop-settings';
import { LoopContextControl } from './LoopContextControl';
import { LoopDeliveryControl } from './LoopDeliveryControl';

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-[280px] flex-col gap-[3px]">
      <dt className="room-mono-micro uppercase tracking-[0.08em] text-room-text3">{label}</dt>
      <dd className="truncate text-[12.5px] leading-tight text-room-text2">{children}</dd>
    </div>
  );
}

/** Every trigger, and what narrows each one. */
function TriggerDetailDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: TriggerDetail[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>What starts this Workflow</DialogTitle>
          <DialogDescription>
            Each trigger and the conditions that must also hold before it runs the Workflow.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {detail.map((trigger) => (
            <li key={trigger.key} className="flex flex-col gap-1">
              <span className="text-sm text-room-text">{trigger.source}</span>
              {trigger.lines.length === 0 ? (
                <span className="text-xs text-room-text3">Runs every time.</span>
              ) : (
                trigger.lines.map((line) => (
                  <span key={line} className="text-xs text-room-text3">
                    {line}
                  </span>
                ))
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function LoopSettingsLine({
  loop,
  runs = [],
  busy,
  onAction,
}: {
  loop: Loop;
  runs?: LoopRunSummary[];
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}) {
  const [triggersOpen, setTriggersOpen] = useState(false);
  const settings = loopSettings(loop, runs);
  const hasTriggerDetail = settings.triggerDetail.length > 0;

  return (
    <>
      <dl className="flex flex-wrap gap-x-[26px] gap-y-2.5 rounded-[9px] border border-room-line bg-room-surface px-3.5 py-[11px]">
        <Cell label="Runs in">{settings.workspace}</Cell>
        <Cell label="Results to">
          <LoopDeliveryControl loop={loop} busy={busy} onAction={onAction} variant="value" />
        </Cell>
        <Cell label="Starts">
          {hasTriggerDetail ? (
            <button type="button" className={SETTING_VALUE_CLASS} onClick={() => setTriggersOpen(true)}>
              {settings.starts}
            </button>
          ) : (
            settings.starts
          )}
        </Cell>
        <Cell label="Context">
          <LoopContextControl loop={loop} onAction={onAction} variant="value" />
        </Cell>
        {settings.spend && <Cell label="Spend">{settings.spend}</Cell>}
        {settings.attempts && <Cell label="Attempts">{settings.attempts}</Cell>}
        {settings.time && <Cell label="Time">{settings.time}</Cell>}
      </dl>
      {hasTriggerDetail && (
        <TriggerDetailDialog detail={settings.triggerDetail} open={triggersOpen} onOpenChange={setTriggersOpen} />
      )}
    </>
  );
}
