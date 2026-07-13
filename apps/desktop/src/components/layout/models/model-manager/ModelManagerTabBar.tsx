import { memo } from 'react';
import { EyeOff, Layers, Server, Star } from 'lucide-react';
import { motion } from 'motion/react';
import type { ManagerTab } from './types';

const TAB_CONFIG: { id: ManagerTab; label: string; icon: typeof Star }[] = [
  { id: 'all', label: 'All Models', icon: Layers },
  { id: 'favourites', label: 'Favourites', icon: Star },
  { id: 'hidden', label: 'Hidden', icon: EyeOff },
  { id: 'local', label: 'Local', icon: Server },
];

export const ModelManagerTabBar = memo(function ModelManagerTabBar({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: ManagerTab;
  onTabChange: (tab: ManagerTab) => void;
  counts: Record<ManagerTab, number>;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--bg-base)] p-1">
      {TAB_CONFIG.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              active
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {active ? (
              <motion.div
                layoutId="manager-tab-bg"
                className="absolute inset-0 rounded-md bg-[var(--bg-elevated)]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {tab.label}
              {counts[tab.id] > 0 ? (
                <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-px text-sm font-semibold text-[var(--text-muted)]">
                  {counts[tab.id]}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
});
