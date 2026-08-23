/**
 * Create a Room — one question (prototype screen 2).
 *
 * The whole required path is a single text field. Spend, time, access and
 * delivery are optional chips carrying safe defaults, so a user who opens
 * none of them still gets a Room — a chip only turns emerald once it is set.
 * Presets sit below the primary action: they seed the planner's prose and
 * never widen what the team may do.
 */

import { useState } from 'react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, Textarea, cn } from '@sero-ai/ui';
import { DELIVERY_DESTINATIONS, defaultDeliveryFor } from '../../shared/delivery-types';
import type { DeliveryDestinationId } from '../../shared/delivery-types';
import type { MemberPermissionLevel } from '../../shared/room-blueprint-types';
import { BUILT_IN_ROOM_TEMPLATES } from '../../shared/room-templates';
import { Eyebrow, SectionHead } from './room-kit';

export interface RoomBrief {
  problem: string;
  presetId?: string;
  maxCostUsd: number;
  maxMinutes: number;
  access: MemberPermissionLevel;
  deliveryDestination: DeliveryDestinationId;
}

/** The chip defaults. They match the planner's own defaults, so an untouched chip changes nothing. */
const DEFAULTS: Omit<RoomBrief, 'problem' | 'presetId' | 'deliveryDestination'> = {
  maxCostUsd: 5,
  maxMinutes: 60,
  access: 'edit-workspace',
};

/**
 * A Room started here has no chat behind it, so it cannot answer one. Offering
 * that destination lets the user pick a Room that finishes having delivered
 * nothing — the chat-origin Room sets it for itself.
 */
const PANEL_DESTINATIONS = DELIVERY_DESTINATIONS.filter((destination) => destination.id !== 'invoking-chat');

const SPEND_CHOICES = [2, 5, 10, 25];
const TIME_CHOICES = [30, 60, 120, 240];

const ACCESS_LABEL: Record<MemberPermissionLevel, string> = {
  'read-only': 'Read only',
  'edit-workspace': 'This workspace',
  'edit-and-push': 'Workspace and push',
};

function timeLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
}

interface RoomBriefFormProps {
  busy: boolean;
  onDesign: (brief: RoomBrief) => void;
  onCancel: () => void;
}

export function RoomBriefForm({ busy, onDesign, onCancel }: RoomBriefFormProps) {
  const [problem, setProblem] = useState('');
  const [presetId, setPresetId] = useState<string | undefined>();
  const [limits, setLimits] = useState(DEFAULTS);
  // Untouched, the destination follows the access — the same rule the planner
  // applies, so the chip shows what would happen rather than a fixed guess.
  const [chosenDestination, setChosenDestination] = useState<DeliveryDestinationId | null>(null);
  const deliveryDestination = chosenDestination ?? defaultDeliveryFor(limits.access);
  const ready = problem.trim().length > 0 && !busy;

  return (
    <div className="mx-auto mt-[26px] flex w-[min(808px,100%)] flex-col px-6 pb-8">
      <Eyebrow tone="brand" className="text-[10px] tracking-[0.13em]">New room</Eyebrow>
      <h2 className="mt-3.5 text-[27px] leading-[1.2] font-semibold tracking-[-0.04em] text-room-text">
        What would you like the team to accomplish?
      </h2>
      <p className="mt-2.5 text-[13px] leading-relaxed text-room-text3">
        Describe the problem and what a good result looks like. Sero designs the team from your
        description — you do not need to pick agents, models or tools.
      </p>

      <Textarea
        value={problem}
        onChange={(event) => setProblem(event.target.value)}
        rows={5}
        autoFocus
        className="mt-5 min-h-[132px] rounded-[10px] border-room-line-strong bg-room-sunken px-4 py-[15px] text-sm leading-relaxed text-room-text2 focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary-border"
        placeholder="Our login flow probably has a session-fixation problem. Find out whether it does, fix it properly, and give me a pull request with a test that fails on the old code."
      />

      <div className="mt-4 flex flex-wrap items-center gap-[9px]">
        <OptionChip
          label="Maximum spend"
          value={String(limits.maxCostUsd)}
          display={`$${limits.maxCostUsd.toFixed(2)}`}
          set={limits.maxCostUsd !== DEFAULTS.maxCostUsd}
          onChange={(value) => setLimits((current) => ({ ...current, maxCostUsd: Number(value) }))}
          options={SPEND_CHOICES.map((usd) => ({ value: String(usd), label: `$${usd.toFixed(2)}` }))}
        />
        <OptionChip
          label="Maximum time"
          value={String(limits.maxMinutes)}
          display={timeLabel(limits.maxMinutes)}
          set={limits.maxMinutes !== DEFAULTS.maxMinutes}
          onChange={(value) => setLimits((current) => ({ ...current, maxMinutes: Number(value) }))}
          options={TIME_CHOICES.map((minutes) => ({ value: String(minutes), label: timeLabel(minutes) }))}
        />
        <OptionChip
          label="Access"
          value={limits.access}
          display={ACCESS_LABEL[limits.access]}
          set={limits.access !== DEFAULTS.access}
          onChange={(value) => setLimits((current) => ({ ...current, access: value as MemberPermissionLevel }))}
          options={Object.entries(ACCESS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <OptionChip
          label="Deliver to"
          value={deliveryDestination}
          display={PANEL_DESTINATIONS.find((destination) => destination.id === deliveryDestination)?.label ?? deliveryDestination}
          set={chosenDestination !== null}
          onChange={(value) => setChosenDestination(value as DeliveryDestinationId)}
          options={PANEL_DESTINATIONS.map((destination) => ({ value: destination.id, label: destination.label }))}
        />
      </div>

      <div className="mt-6 flex items-center gap-4 border-t border-room-line pt-[18px]">
        <p className="max-w-[420px] text-[11px] leading-normal text-room-text4">
          Sero proposes a team before anything runs. Nothing starts and nothing is spent until you
          press Start room.
        </p>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button variant="ghost" className="text-room-text3" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button className="h-[38px] px-[18px] text-[13px]" disabled={!ready}
            onClick={() => onDesign({ problem: problem.trim(), presetId, ...limits, deliveryDestination })}
          >
            {busy ? 'Designing…' : 'Design the team →'}
          </Button>
        </div>
      </div>

      <div className="mt-[26px]">
        <SectionHead>
          Start from a preset
          <span className="ml-2 text-[10px] font-normal tracking-normal normal-case text-room-text4">optional</span>
        </SectionHead>
        <div className="grid gap-[9px] @min-[560px]/panel:grid-cols-2 @min-[760px]/panel:grid-cols-3">
          {BUILT_IN_ROOM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              aria-pressed={presetId === template.id}
              onClick={() => setPresetId((current) => (current === template.id ? undefined : template.id))}
              className={cn(
                'flex flex-col rounded-lg border p-3 text-left',
                presetId === template.id
                  ? 'border-brand-primary-border bg-brand-primary-faint'
                  : 'border-room-line bg-room-surface hover:bg-room-raised/60',
              )}
            >
              <b className="text-xs font-medium text-room-text2">{template.name}</b>
              <span className="mt-1.5 text-[10px] leading-normal text-room-text4">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OptionChip({
  label,
  value,
  display,
  set,
  onChange,
  options,
}: {
  label: string;
  value: string;
  /** The value as the chip shows it — `$6.00`, `2 hours`. */
  display: string;
  /** Set by the user (differs from the default): the chip turns emerald. */
  set: boolean;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          'flex h-[34px] items-center gap-2 rounded-lg border px-3 text-xs shadow-none',
          set
            ? 'border-brand-primary-border bg-brand-primary-muted text-room-ink-brand'
            : 'border-room-line bg-room-surface text-room-text3',
        )}
      >
        {label} <b className={cn('font-medium', set ? 'text-room-ink-brand' : 'text-room-text2')}>{display}</b>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
