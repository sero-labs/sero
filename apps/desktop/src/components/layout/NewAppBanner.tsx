import { PackagePlus } from 'lucide-react';
import { useAppStore } from '@/stores/app';

/**
 * Banner shown when the main process detects a new sero app package
 * created while Sero is running. Prompts the user to restart.
 */
export function NewAppBanner() {
  const pendingNewApp = useAppStore((s) => s.pendingNewApp);

  if (!pendingNewApp) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-t border-indigo-400/20 bg-indigo-500/10 px-4 py-1.5 text-xs text-indigo-300">
      <PackagePlus className="size-3.5" />
      <span>
        <strong>{pendingNewApp}</strong> app created — restart Sero to load it
      </span>
      <span className="text-indigo-300/50">
        (stop dev server, then <code className="rounded bg-indigo-500/15 px-1 py-0.5 font-mono text-[11px]">bash scripts/dev.sh</code>)
      </span>
    </div>
  );
}
