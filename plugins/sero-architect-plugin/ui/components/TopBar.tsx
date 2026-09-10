import { useState } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sero-ai/ui';
import { ArrowLeft, ChevronRight, Coins, Compass, MoreHorizontal, Pause, Play, Plus, SlidersHorizontal, Square, Terminal, Trash2 } from 'lucide-react';

import type { AutonomySetting, ExecutionMode, ProjectRecord } from '../../shared/record';
import { AUTONOMY_SETTINGS } from '../../shared/charter-shape';
import { AUTONOMY_LABEL } from '../lib/view-model';

export interface ProjectControls {
  pause(): void;
  resume(): void;
  stop(): void;
  raiseCap(): void;
  setExecutionMode(next: ExecutionMode): void;
  setAutonomy(next: AutonomySetting): void;
  openSession(): void;
  remove(): void;
}

function nextAutonomy(current: AutonomySetting): AutonomySetting {
  const index = AUTONOMY_SETTINGS.indexOf(current);
  return AUTONOMY_SETTINGS[(index + 1) % AUTONOMY_SETTINGS.length] ?? 'milestones';
}

/** The controls menu: pause or resume, stop, raise cap, autonomy, delete. Open session sits beside it. */
export function ControlsMenu({ record, controls }: { record: ProjectRecord; controls: ProjectControls }) {
  const [open, setOpen] = useState(false);
  // Resume clears either a user pause or a blocker. A cap alone needs Raise cap.
  const canResume = record.paused || record.blockedReason !== null;
  const stopped = record.blockedReason === 'stopped by the user';
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Project controls" className="ar-btn ar-btn-icon">
          <MoreHorizontal className="ar-i" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="ar-menu">
        {canResume ? (
          <DropdownMenuItem onSelect={controls.resume}><Play className="ar-i" />Resume</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={controls.pause}><Pause className="ar-i" />Pause</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={controls.stop} disabled={stopped}><Square className="ar-i" />Stop</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={controls.raiseCap} disabled={record.budget.capUsd === null}>
          <Coins className="ar-i" />Raise cap
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => controls.setAutonomy(nextAutonomy(record.autonomy))} title={AUTONOMY_LABEL[record.autonomy]}>
          <SlidersHorizontal className="ar-i" />Autonomy: {record.autonomy}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={Boolean(record.session.workingSince) || (record.executionMode !== undefined && record.session.turns > 0)} onSelect={() => controls.setExecutionMode('workspace')}>
          Workspace{record.executionMode === 'workspace' ? ' ✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(record.session.workingSince) || (record.executionMode !== undefined && record.session.turns > 0)} onSelect={() => controls.setExecutionMode('worktree')}>
          Worktree{record.executionMode === 'worktree' ? ' ✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={controls.remove} variant="destructive"><Trash2 className="ar-i" />Delete project</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface TopBarProps {
  record: ProjectRecord | null;
  controls: ProjectControls | null;
  onBack(): void;
  onNewProject(): void;
}

export function TopBar({ record, controls, onBack, onNewProject }: TopBarProps) {
  return (
    <div className="ar-top">
      <div className="ar-brand"><span className="ar-brand-mark"><Compass className="ar-i" /></span>Architect</div>
      {record && (
        <div className="ar-crumb">
          <button type="button" className="ar-back" onClick={onBack} aria-label="Back to projects"><ArrowLeft className="ar-i" />Projects</button>
          <ChevronRight className="ar-i" />
          <span className="ar-leaf">{record.name}</span>
        </div>
      )}
      <div className="ar-top-actions">
        {record && controls ? (
          <>
            <span className="text-xs text-muted-foreground">{record.executionMode === 'workspace' ? 'Workspace' : record.executionMode === 'worktree' ? 'Worktree' : 'Choose execution location'}</span>
            <Button variant="outline" size="sm" className="ar-btn" onClick={controls.openSession}><Terminal className="ar-i" />Open session</Button>
            <ControlsMenu record={record} controls={controls} />
          </>
        ) : !record ? (
          <Button size="sm" className="ar-btn ar-btn-primary" onClick={onNewProject}><Plus className="ar-i" />New project</Button>
        ) : null}
      </div>
    </div>
  );
}
