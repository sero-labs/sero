import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AgentNodeInfo, AgentNodeSession } from '@/types/agent-node';
import { useNodesStore } from '@/stores/nodes';
import { canManageNode } from './node-display';

export function RemoteApprovalControl({ node, session }: { node: AgentNodeInfo; session: AgentNodeSession }) {
  const [open, setOpen] = useState(false);
  const setSessionApprovalMode = useNodesStore((state) => state.setSessionApprovalMode);
  const controlAvailable = canManageNode(node);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Command approval"
          title={session.approvalMode === 'ask' ? 'Command approval: Ask first' : 'Command approval: Allowed'}
          disabled={!controlAvailable}
          className="flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40"
        >
          <ShieldCheck className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent role="menu" side="top" align="start" sideOffset={8} className="w-60 p-1">
        <ApprovalOption
          active={session.approvalMode === 'ask'}
          description="Confirm write and shell tools"
          label="Ask before commands"
          onSelect={() => { setOpen(false); void setSessionApprovalMode(node.id, session.id, 'ask'); }}
        />
        <ApprovalOption
          active={session.approvalMode === 'allow'}
          description="Run without confirmation"
          label="Allow commands"
          onSelect={() => { setOpen(false); void setSessionApprovalMode(node.id, session.id, 'allow'); }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ApprovalOption({
  active,
  description,
  label,
  onSelect,
}: {
  active: boolean;
  description: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--text-muted)]">{description}</span>
      </span>
      <Check className={cn('size-3.5 text-[var(--brand-primary)]', !active && 'invisible')} />
    </button>
  );
}
