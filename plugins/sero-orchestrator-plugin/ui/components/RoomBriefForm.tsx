/**
 * Create a Room — one question (prototype screen 2).
 *
 * The whole required path is a single text field. Spend, time, access and
 * delivery are optional and carry safe defaults, so a user who opens none of
 * them still gets a Room. Presets sit below the primary action: they seed the
 * planner's prose and never widen what the team may do.
 */

import { useState } from 'react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@sero-ai/ui';
import { DELIVERY_DESTINATIONS, defaultDeliveryFor } from '../../shared/delivery-types';
import type { DeliveryDestinationId } from '../../shared/delivery-types';
import type { MemberPermissionLevel } from '../../shared/room-blueprint-types';
import { BUILT_IN_ROOM_TEMPLATES } from '../../shared/room-templates';

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New room</p>
        <h2 className="mt-1 text-xl font-semibold">What would you like the team to accomplish?</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Describe the problem and what a good result looks like. Sero designs the team from your
          description — you do not need to pick agents, models or tools.
        </p>
      </div>

      <Textarea
        value={problem}
        onChange={(event) => setProblem(event.target.value)}
        rows={6}
        autoFocus
        placeholder="Our login flow probably has a session-fixation problem. Find out whether it does, fix it properly, and give me a pull request with a test that fails on the old code."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Maximum spend">
          <Choice
            value={String(limits.maxCostUsd)}
            onChange={(value) => setLimits((current) => ({ ...current, maxCostUsd: Number(value) }))}
            options={SPEND_CHOICES.map((usd) => ({ value: String(usd), label: `$${usd.toFixed(2)}` }))}
          />
        </Chip>
        <Chip label="Maximum time">
          <Choice
            value={String(limits.maxMinutes)}
            onChange={(value) => setLimits((current) => ({ ...current, maxMinutes: Number(value) }))}
            options={TIME_CHOICES.map((minutes) => ({
              value: String(minutes),
              label: minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`,
            }))}
          />
        </Chip>
        <Chip label="Access">
          <Choice
            value={limits.access}
            onChange={(value) => setLimits((current) => ({ ...current, access: value as MemberPermissionLevel }))}
            options={Object.entries(ACCESS_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Chip>
        <Chip label="Deliver to">
          <Choice
            value={deliveryDestination}
            onChange={(value) => setChosenDestination(value as DeliveryDestinationId)}
            options={PANEL_DESTINATIONS.map((destination) => ({ value: destination.id, label: destination.label }))}
          />
        </Chip>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Sero proposes a team before anything runs. Nothing starts and nothing is spent until you press Start room.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            disabled={!ready}
            onClick={() => onDesign({ problem: problem.trim(), presetId, ...limits, deliveryDestination })}
          >
            {busy ? 'Designing…' : 'Design the team'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Start from a preset · optional
        </span>
        <div className="grid gap-2 sm:grid-cols-3">
          {BUILT_IN_ROOM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setPresetId((current) => (current === template.id ? undefined : template.id))}
              className={`flex flex-col gap-1 rounded-md border p-3 text-left hover:bg-accent/40 ${
                presetId === template.id ? 'border-primary bg-accent/30' : 'border-border'
              }`}
            >
              <b className="text-sm">{template.name}</b>
              <span className="text-xs text-muted-foreground">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </span>
  );
}

function Choice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
