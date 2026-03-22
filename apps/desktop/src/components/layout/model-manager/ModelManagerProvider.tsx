/**
 * Provider section in the Model Manager — collapsible group with
 * a visibility toggle for the entire provider.
 */

import { memo, useState, useCallback } from 'react';
import { ChevronRight, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ModelInfo, AvailableModelGroup } from './types';
import { ModelManagerItem } from './ModelManagerItem';

interface ModelManagerProviderProps {
  group: AvailableModelGroup;
  isProviderHidden: boolean;
  isFavourite: (key: string) => boolean;
  isHidden: (key: string) => boolean;
  onToggleFavourite: (key: string) => void;
  onToggleHidden: (key: string) => void;
  onToggleProvider: (provider: string) => void;
  /** If set, only show these models (for search filtering). */
  visibleModels?: ModelInfo[];
}

const ModelManagerProvider = memo(function ModelManagerProvider({
  group,
  isProviderHidden,
  isFavourite,
  isHidden,
  onToggleFavourite,
  onToggleHidden,
  onToggleProvider,
  visibleModels,
}: ModelManagerProviderProps) {
  const [expanded, setExpanded] = useState(true);
  const models = visibleModels ?? group.models;

  const handleToggleProvider = useCallback(
    () => onToggleProvider(group.provider),
    [group.provider, onToggleProvider],
  );

  return (
    <div className="py-0.5">
      {/* Provider header */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="size-3 text-[var(--text-muted)]" />
          </motion.div>
          <img
            src={group.logo}
            alt={group.displayName}
            className="size-3.5 rounded-sm dark:invert"
          />
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${
            isProviderHidden ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
          }`}>
            {group.displayName}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">
            {models.length}
          </span>
        </button>

        {/* Provider-wide visibility toggle */}
        <button
          onClick={handleToggleProvider}
          title={isProviderHidden ? 'Show provider' : 'Hide entire provider'}
          className={`rounded-md p-1 transition-colors duration-150 ${
            isProviderHidden
              ? 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              : 'text-[var(--text-muted)] opacity-0 hover:text-[var(--text-secondary)] group-hover:opacity-100'
          }`}
          style={{ opacity: isProviderHidden ? 1 : undefined }}
        >
          <EyeOff className="size-3" />
        </button>
      </div>

      {/* Model list (collapsible) */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden pl-2"
          >
            {models.map((model) => {
              const key = `${model.provider}/${model.modelId}`;
              return (
                <ModelManagerItem
                  key={key}
                  model={model}
                  providerLogo={group.logo}
                  providerName={group.displayName}
                  isFavourite={isFavourite(key)}
                  isHidden={isProviderHidden || isHidden(key)}
                  onToggleFavourite={onToggleFavourite}
                  onToggleHidden={onToggleHidden}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export { ModelManagerProvider };
