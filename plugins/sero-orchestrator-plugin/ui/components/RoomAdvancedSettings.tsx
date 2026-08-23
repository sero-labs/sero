/**
 * Advanced settings — the complete blueprint (prototype screen 7).
 *
 * Read-only on purpose (D6). The compact proposal is the consent surface, and
 * this is the evidence behind it: every field an advanced user might want to
 * check, shown exactly as the Room will run it, through the kit's read-only
 * field language. Changes go through Adjust, so there is one path that
 * re-validates and recomputes rather than two.
 *
 * Three panes ≥1200px; the computed rail moves above the form 900–1199px; the
 * section nav becomes a select below 900px. All container queries — the panel
 * decides, not the window.
 */

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
import { cn } from '@sero-ai/ui/lib/utils';
import type { BlueprintMember, RoomBlueprint } from '../../shared/room-blueprint-types';
import { computeProposalSummary } from '../../shared/room-proposal';
import { accessTile } from '../lib/access-tile';
import { formatCost, formatTokens } from '../lib/format';
import { memberGlyph } from '../lib/member-glyph';
import { workingTimeLabel } from '../lib/proposal-diff';
import { Eyebrow, FieldLabel, FieldRow, FieldSelect, FieldText, Pill, StatusDot, TokenChip } from './room-kit';

type SectionId = 'objective' | 'envelope' | 'communication' | 'workspace' | 'delivery';

type Selection = { kind: 'section'; id: SectionId } | { kind: 'member'; key: string };

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'objective', label: 'Objective & success' },
  { id: 'envelope', label: 'Operating envelope' },
  { id: 'communication', label: 'Communication' },
  { id: 'workspace', label: 'Workspace & Git' },
  { id: 'delivery', label: 'Delivery' },
];

const PERMISSION_LABEL: Record<BlueprintMember['permissions'], string> = {
  'read-only': 'Read only',
  'edit-workspace': 'Edit workspace',
  'edit-and-push': 'Edit and push',
};

const WORKSPACE_MODE_LABEL: Record<RoomBlueprint['workspacePolicy']['mode'], string> = {
  'read-only-shared': 'Read-only shared',
  'worktree-per-member': 'Worktree per member',
  'shared-working-tree': 'Shared working tree',
};

export function RoomAdvancedSettings({ blueprint }: { blueprint: RoomBlueprint }) {
  const [selection, setSelection] = useState<Selection>({ kind: 'section', id: 'objective' });
  const { envelope } = blueprint;
  const selectedMember = selection.kind === 'member'
    ? blueprint.members.find((member) => member.key === selection.key)
    : undefined;

  /** The nav as one flat value for the <900px select. */
  const selectValue = selection.kind === 'section' ? `s:${selection.id}` : `m:${selection.key}`;
  const onSelectValue = (value: string) => {
    if (value.startsWith('s:')) setSelection({ kind: 'section', id: value.slice(2) as SectionId });
    else setSelection({ kind: 'member', key: value.slice(2) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col @min-[900px]/panel:grid @min-[900px]/panel:grid-cols-[210px_minmax(0,1fr)] @min-[1200px]/panel:grid-cols-[210px_minmax(0,1fr)_300px]">
      {/* <900px: the section nav as a select (F3 — nothing disappears). */}
      <div className="shrink-0 border-b border-room-line p-3 @min-[900px]/panel:hidden">
        <Select value={selectValue} onValueChange={onSelectValue}>
          <SelectTrigger className="h-[33px] w-full border-room-line-strong bg-room-sunken text-[11px] text-room-text2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((section) => (
              <SelectItem key={section.id} value={`s:${section.id}`}>{section.label}</SelectItem>
            ))}
            {blueprint.members.map((member) => (
              <SelectItem key={member.key} value={`m:${member.key}`}>{member.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <aside className="hidden overflow-y-auto border-r border-room-line px-2.5 py-[15px] @min-[900px]/panel:block">
        <div className="room-mono-micro flex h-[26px] items-center px-2 tracking-[0.1em] text-room-text4 uppercase">Room</div>
        {SECTIONS.map((section) => (
          <NavRow
            key={section.id}
            on={selection.kind === 'section' && selection.id === section.id}
            onClick={() => setSelection({ kind: 'section', id: section.id })}
          >
            {section.label}
            {section.id === 'envelope' && (
              <span className="room-mono-micro ml-auto text-room-text4">{ENVELOPE_LIMITS.length}</span>
            )}
          </NavRow>
        ))}
        <div className="room-mono-micro mt-3 flex h-[26px] items-center px-2 tracking-[0.1em] text-room-text4 uppercase">Members</div>
        {blueprint.members.map((member) => (
          <NavRow
            key={member.key}
            on={selection.kind === 'member' && selection.key === member.key}
            onClick={() => setSelection({ kind: 'member', key: member.key })}
          >
            <StatusDot status={member.isConductor ? 'working' : 'idle'} className="shadow-none" />
            <span className="truncate">{member.displayName}</span>
          </NavRow>
        ))}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
        {/* 900–1199px: the computed rail as a block above the form. */}
        <div className="mb-4 @min-[1200px]/panel:hidden">
          <ComputedRail blueprint={blueprint} compact />
        </div>
        {selectedMember
          ? <MemberPane member={selectedMember} blueprint={blueprint} />
          : <SectionPane id={selection.kind === 'section' ? selection.id : 'objective'} blueprint={blueprint} />}
      </div>

      <aside className="hidden overflow-y-auto border-l border-room-line bg-room-sunken px-3.5 py-[15px] @min-[1200px]/panel:block">
        <ComputedRail blueprint={blueprint} />
      </aside>
    </div>
  );
}

function NavRow({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[31px] w-full items-center gap-[9px] rounded-md px-[9px] text-left text-xs',
        on ? 'bg-room-raised text-room-text' : 'text-room-text3 hover:text-room-text2',
      )}
    >
      {children}
    </button>
  );
}

// ── The computed rail ────────────────────────────────────────

function ComputedRail({ blueprint, compact = false }: { blueprint: RoomBlueprint; compact?: boolean }) {
  const proposal = computeProposalSummary(blueprint);
  const access = accessTile(proposal.access);
  return (
    <div>
      <div className="rounded-lg border border-brand-primary-border bg-brand-primary-faint p-3">
        <Eyebrow tone="brand">Computed proposal</Eyebrow>
        <p className="mt-2 text-[10px] leading-relaxed text-room-text4">
          These are derived from the blueprint on the left. They cannot be edited directly, and the
          planner cannot write them.
        </p>
        <div className={cn(compact && 'grid @min-[700px]/panel:grid-cols-2 @min-[700px]/panel:gap-x-6')}>
          <RailLine label="Team">{proposal.teamSize} members</RailLine>
          <RailLine label="Working time">Up to {workingTimeLabel(proposal.maxWallClockMs)}</RailLine>
          <RailLine label="Spend">Up to {formatCost(proposal.maxCostUsd)}</RailLine>
          <RailLine label="Access">{access.value}</RailLine>
        </div>
      </div>
      {!compact && (
        <>
          <LockedNote className="mt-3">
            <b className="text-room-text3">Access is the union of every member.</b> Narrowing one member
            does not move the summary while another member still holds the capability — the tile
            follows the whole team, not the member you are viewing.
          </LockedNote>
          <LockedNote className="mt-[9px]">
            <b className="text-room-text3">Ceilings you set stay ceilings.</b> The envelope's spend,
            time, team size and permission limits are the hard boundary. Neither the planner nor the
            Conductor can raise them at runtime — they can only ask you.
          </LockedNote>
        </>
      )}
    </div>
  );
}

function RailLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center border-t border-brand-primary-muted py-[7px] text-[11px] text-room-text2 first:mt-2">
      <small className="mr-auto text-[10px] text-room-text4">{label}</small>
      {children}
    </div>
  );
}

function LockedNote({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-room-line px-[11px] py-2.5 text-[10px] leading-relaxed text-room-text4', className)}>
      {children}
    </div>
  );
}

// ── Section panes ────────────────────────────────────────────

const ENVELOPE_LIMITS: Array<{ label: string; value: (blueprint: RoomBlueprint) => string }> = [
  { label: 'Members', value: (b) => String(b.envelope.maxMembers) },
  { label: 'Working at once', value: (b) => String(b.envelope.maxActiveTurns) },
  { label: 'Time', value: (b) => workingTimeLabel(b.envelope.maxWallClockMs) },
  { label: 'Spend', value: (b) => formatCost(b.envelope.maxCostUsd) },
  { label: 'Spend per member', value: (b) => formatCost(b.envelope.maxCostUsdPerMember) },
  { label: 'Tokens', value: (b) => formatTokens(b.envelope.maxTokens) },
  { label: 'Tokens per member', value: (b) => formatTokens(b.envelope.maxTokensPerMember) },
  { label: 'Turns per member', value: (b) => String(b.envelope.maxTurnsPerMember) },
  { label: 'Retries per member', value: (b) => String(b.envelope.maxRetriesPerMember) },
  { label: 'Consecutive failures', value: (b) => String(b.envelope.maxConsecutiveFailures) },
  { label: 'Roster changes', value: (b) => String(b.envelope.maxRosterRevisions) },
  { label: 'Replacements', value: (b) => String(b.envelope.maxMemberReplacements) },
  { label: 'Pause when idle for', value: (b) => workingTimeLabel(b.envelope.maxIdleMs) },
  { label: 'Nested subagents', value: (b) => (b.envelope.allowNestedSubagents ? 'Allowed' : 'Off') },
];

function PaneTitle({ title, pill }: { title: string; pill?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <h4 className="text-[15px] font-semibold tracking-[-0.02em] text-room-text">{title}</h4>
      {pill && <Pill>{pill}</Pill>}
    </div>
  );
}

function SectionPane({ id, blueprint }: { id: SectionId; blueprint: RoomBlueprint }) {
  if (id === 'objective') {
    return (
      <div>
        <PaneTitle title="Objective & success" />
        <FieldRow>
          <FieldLabel>Objective</FieldLabel>
          <FieldText>{blueprint.objective}</FieldText>
        </FieldRow>
        <FieldRow>
          <FieldLabel hint="the Room finishes when these hold">Success criteria</FieldLabel>
          <FieldText>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {blueprint.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
            </ul>
          </FieldText>
        </FieldRow>
        <FieldRow>
          <FieldLabel hint="rules every member follows">Room instructions</FieldLabel>
          <FieldText tall>{blueprint.roomInstructions}</FieldText>
        </FieldRow>
        {blueprint.openAssumptions.length > 0 && (
          <FieldRow>
            <FieldLabel>Assumptions the planner made</FieldLabel>
            <FieldText>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {blueprint.openAssumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
            </FieldText>
          </FieldRow>
        )}
      </div>
    );
  }
  if (id === 'envelope') {
    return (
      <div>
        <PaneTitle title="Operating envelope" pill="the hard boundary" />
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {ENVELOPE_LIMITS.map((limit) => (
            <div key={limit.label}>
              <FieldLabel>{limit.label}</FieldLabel>
              <FieldSelect>{limit.value(blueprint)}</FieldSelect>
            </div>
          ))}
        </div>
        <FieldRow>
          <FieldLabel hint="the Conductor may assign from these">Allowed models</FieldLabel>
          <div className="flex flex-wrap gap-[5px]">
            {blueprint.envelope.allowedModels.map((model) => <TokenChip key={model} on>{model}</TokenChip>)}
          </div>
        </FieldRow>
        <FieldRow>
          <FieldLabel>Allowed thinking levels</FieldLabel>
          <div className="flex flex-wrap gap-[5px]">
            {blueprint.envelope.allowedThinkingLevels.map((level) => <TokenChip key={level} on>{level}</TokenChip>)}
          </div>
        </FieldRow>
      </div>
    );
  }
  if (id === 'communication') {
    return (
      <div>
        <PaneTitle title="Communication" />
        <FieldRow>
          <FieldLabel hint="how work and messages flow between members">Collaboration strategy</FieldLabel>
          <FieldText tall>{blueprint.collaborationStrategy}</FieldText>
        </FieldRow>
      </div>
    );
  }
  if (id === 'workspace') {
    const policy = blueprint.workspacePolicy;
    return (
      <div>
        <PaneTitle title="Workspace & Git" />
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Working mode</FieldLabel>
            <FieldSelect>{WORKSPACE_MODE_LABEL[policy.mode]}</FieldSelect>
          </div>
          <div>
            <FieldLabel>Overlapping paths</FieldLabel>
            <FieldSelect>{policy.claimPolicy === 'warn' ? 'Warn and keep going' : 'Block the second claim'}</FieldSelect>
          </div>
          <div>
            <FieldLabel>Your own files</FieldLabel>
            <FieldSelect>{policy.sharedTreeApproved ? 'Members may edit them' : 'Not touched directly'}</FieldSelect>
          </div>
          <div>
            <FieldLabel>Own worktrees</FieldLabel>
            <FieldSelect>{blueprint.members.filter((member) => member.needsWorktree).length} members</FieldSelect>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <PaneTitle title="Delivery" />
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div>
          <FieldLabel>Result goes to</FieldLabel>
          <FieldSelect>{blueprint.deliveryDestination}</FieldSelect>
        </div>
      </div>
      <FieldRow>
        <FieldLabel>Destinations this Room may use</FieldLabel>
        <div className="flex flex-wrap gap-[5px]">
          {blueprint.envelope.allowedDeliveryDestinations.map((destination) => (
            <TokenChip key={destination} on>{destination}</TokenChip>
          ))}
        </div>
      </FieldRow>
    </div>
  );
}

// ── Member pane ──────────────────────────────────────────────

/** Held first and emerald; the rest of the envelope's catalogue off. */
function chipSet(held: string[], allowed: string[]): Array<{ name: string; on: boolean }> {
  const heldSet = new Set(held);
  return [
    ...held.map((name) => ({ name, on: true })),
    ...allowed.filter((name) => !heldSet.has(name)).map((name) => ({ name, on: false })),
  ];
}

function MemberPane({ member, blueprint }: { member: BlueprintMember; blueprint: RoomBlueprint }) {
  const { envelope } = blueprint;
  const face = memberGlyph(member.displayName, member.isConductor);
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="room-mono-micro grid size-[26px] place-items-center rounded-[7px] bg-room-muted text-room-text2">
          {face}
        </span>
        <PaneTitle title={member.displayName} pill="Generated · no saved agent file" />
      </div>
      <FieldRow>
        <FieldLabel hint="changes instructions only — never capabilities">Mandate</FieldLabel>
        <FieldText tall>{member.mandate}</FieldText>
      </FieldRow>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div>
          <FieldLabel>Model</FieldLabel>
          <FieldSelect>{member.model}</FieldSelect>
        </div>
        <div>
          <FieldLabel>Thinking</FieldLabel>
          <FieldSelect className="capitalize">{member.thinking}</FieldSelect>
        </div>
      </div>
      <FieldRow>
        <FieldLabel hint="from this Room's approved catalogue">Tools</FieldLabel>
        <div className="flex flex-wrap gap-[5px]">
          {chipSet(member.tools, envelope.allowedTools).map((chip) => (
            <TokenChip key={chip.name} on={chip.on}>{chip.name}</TokenChip>
          ))}
        </div>
      </FieldRow>
      <FieldRow>
        <FieldLabel>Skills</FieldLabel>
        <div className="flex flex-wrap gap-[5px]">
          {chipSet(member.skills, envelope.allowedSkills).map((chip) => (
            <TokenChip key={chip.name} on={chip.on}>{chip.name}</TokenChip>
          ))}
        </div>
      </FieldRow>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div>
          <FieldLabel>Workspace</FieldLabel>
          <FieldSelect>
            {member.needsWorktree ? 'Own worktree' : WORKSPACE_MODE_LABEL[blueprint.workspacePolicy.mode]}
          </FieldSelect>
        </div>
        <div>
          <FieldLabel>Permissions</FieldLabel>
          <FieldSelect>{PERMISSION_LABEL[member.permissions]}</FieldSelect>
        </div>
      </div>
      {member.promptAdditions.length > 0 && (
        <FieldRow>
          <FieldLabel hint="appended after the mandate">Extra prompt</FieldLabel>
          <FieldText>{member.promptAdditions.join('\n\n')}</FieldText>
        </FieldRow>
      )}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div>
          <FieldLabel>Turn limit</FieldLabel>
          <FieldSelect>{envelope.maxTurnsPerMember} turns</FieldSelect>
        </div>
        <div>
          <FieldLabel>Cost limit</FieldLabel>
          <FieldSelect>{formatCost(envelope.maxCostUsdPerMember)}</FieldSelect>
        </div>
      </div>
    </div>
  );
}
