/**
 * Advanced settings — the complete blueprint (prototype screen 7).
 *
 * Read-only on purpose. The compact proposal is the consent surface, and this
 * is the evidence behind it: every field an advanced user might want to check,
 * shown exactly as the Room will run it. Changes go through Adjust, so there is
 * one path that re-validates and recomputes rather than two.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { BlueprintMember, RoomBlueprint } from '../../shared/room-blueprint-types';
import { formatCost, formatDuration } from '../lib/format';

export function RoomAdvancedSettings({ blueprint }: { blueprint: RoomBlueprint }) {
  const [open, setOpen] = useState(false);
  const { envelope } = blueprint;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-8">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Advanced settings
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          <Section title="Objective">
            <p className="text-sm text-muted-foreground">{blueprint.objective}</p>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-sm text-muted-foreground">
              {blueprint.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
            </ul>
          </Section>

          <Section title="Limits">
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Field label="Members" value={String(envelope.maxMembers)} />
              <Field label="Working at once" value={String(envelope.maxActiveTurns)} />
              <Field label="Time" value={formatDuration(envelope.maxWallClockMs)} />
              <Field label="Spend" value={formatCost(envelope.maxCostUsd)} />
              <Field label="Spend per member" value={formatCost(envelope.maxCostUsdPerMember)} />
              <Field label="Turns per member" value={String(envelope.maxTurnsPerMember)} />
              <Field label="Roster changes" value={String(envelope.maxRosterRevisions)} />
              <Field label="Replacements" value={String(envelope.maxMemberReplacements)} />
            </dl>
          </Section>

          <Section title="Workspace and delivery">
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Field label="Working mode" value={blueprint.workspacePolicy.mode} />
              <Field label="Overlapping paths" value={blueprint.workspacePolicy.claimPolicy} />
              <Field
                label="Your own files"
                value={blueprint.workspacePolicy.sharedTreeApproved ? 'members may edit them' : 'not touched directly'}
              />
              <Field label="Result goes to" value={blueprint.deliveryDestination} />
            </dl>
          </Section>

          <Section title={`Members · ${blueprint.members.length}`}>
            <div className="flex flex-col gap-2">
              {blueprint.members.map((member) => <MemberDetail key={member.key} member={member} />)}
            </div>
          </Section>

          {blueprint.openAssumptions.length > 0 && (
            <Section title="Assumptions the planner made">
              <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-muted-foreground">
                {blueprint.openAssumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function MemberDetail({ member }: { member: BlueprintMember }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-baseline gap-2">
        <b className="text-sm">{member.displayName}</b>
        <span className="text-xs text-muted-foreground">{member.role}</span>
        {member.isConductor && <span className="text-xs text-muted-foreground">· leads</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{member.responsibility}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Field label="Model" value={`${member.model} · ${member.thinking} thinking`} />
        <Field label="Access" value={member.permissions} />
        <Field label="Tools" value={member.tools.join(', ') || 'none'} />
        <Field label="Skills" value={member.skills.join(', ') || 'none'} />
        <Field label="Own worktree" value={member.needsWorktree ? 'yes' : 'no'} />
      </dl>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate">{value}</dd>
    </div>
  );
}
