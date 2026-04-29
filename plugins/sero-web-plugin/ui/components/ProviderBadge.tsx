// components/ProviderBadge.tsx — Small badge showing the search provider.

import { Badge } from '@sero-ai/ui/components/ui/badge';
import { cn } from '@sero-ai/ui/lib/utils';

const PROVIDER_COLORS: Record<string, string> = {
  exa: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  perplexity: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  gemini: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  auto: 'bg-muted text-muted-foreground border-border',
};

interface ProviderBadgeProps {
  provider?: string;
  className?: string;
}

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  if (!provider) return null;
  const colors = PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.auto;

  return (
    <Badge
      variant="outline"
      className={cn(
        'px-1.5 py-0 text-[10px] font-medium leading-4 border',
        colors,
        className,
      )}
    >
      {provider}
    </Badge>
  );
}

export default ProviderBadge;
