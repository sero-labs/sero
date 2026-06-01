/**
 * Individual model row in the Model Manager.
 * Shows model name, provider, favourite star, and visibility toggle.
 */

import { memo, useCallback } from 'react';
import { Star, Eye, EyeOff, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { modelKey } from '@/stores/model-preferences';
import type { ModelInfo } from './types';

interface ModelManagerItemProps {
  model: ModelInfo;
  providerLogo: string;
  providerName: string;
  isFavourite: boolean;
  isHidden: boolean;
  isHiddenByProvider: boolean;
  onToggleFavourite: (key: string) => void;
  onToggleHidden: (key: string) => void;
}

const ModelManagerItem = memo(function ModelManagerItem({
  model,
  providerLogo,
  providerName,
  isFavourite,
  isHidden,
  isHiddenByProvider,
  onToggleFavourite,
  onToggleHidden,
}: ModelManagerItemProps) {
  const key = modelKey(model.provider, model.modelId);
  const hideActionDisabled = isHiddenByProvider;
  const hideActionTitle = hideActionDisabled
    ? 'Hidden by provider, use the provider toggle to show these models'
    : isHidden
      ? 'Show in selector'
      : 'Hide from selector';

  const handleFavourite = useCallback(() => onToggleFavourite(key), [key, onToggleFavourite]);
  const handleHidden = useCallback(() => {
    if (hideActionDisabled) return;
    onToggleHidden(key);
  }, [hideActionDisabled, key, onToggleHidden]);

  return (
    <motion.div
      layout="position"
      layoutId={key}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isHidden ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-100
        hover:bg-[var(--bg-elevated)]/60"
      style={{ contain: 'layout style' }}
    >
      {/* Provider logo + model name */}
      <img
        src={providerLogo}
        alt={providerName}
        className="size-4 shrink-0 rounded-sm dark:invert"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`truncate text-xs font-medium ${
          isHidden ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
        }`}>
          {model.name}
        </span>
        {model.reasoning && (
          <Sparkles className="size-3 shrink-0 text-[var(--status-warning)]/60" />
        )}
        <span className="hidden truncate text-[10px] text-[var(--text-muted)] group-hover:inline">
          {providerName}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button type="button"
          onClick={handleFavourite}
          title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          className={`rounded-md p-1 transition-all duration-150 ${
            isFavourite
              ? 'text-amber-400 hover:text-amber-300'
              : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-amber-400'
          }`}
        >
          <Star
            className="size-3.5"
            fill={isFavourite ? 'currentColor' : 'none'}
          />
        </button>

        <button type="button"
          onClick={handleHidden}
          disabled={hideActionDisabled}
          title={hideActionTitle}
          className={`rounded-md p-1 transition-all duration-150 ${
            hideActionDisabled
              ? 'cursor-not-allowed text-[var(--text-muted)] opacity-60'
              : isHidden
                ? 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-secondary)]'
          }`}
        >
          {isHidden ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </button>
      </div>
    </motion.div>
  );
});

export { ModelManagerItem };
