import type { ComponentProps } from 'react';
import { Languages } from 'lucide-react';
import { cn } from '../../lib/utils';

export type VoiceSelectorAccentValue =
  | 'american'
  | 'british'
  | 'australian'
  | 'canadian'
  | 'irish'
  | 'scottish'
  | 'indian'
  | 'south-african'
  | 'new-zealand'
  | 'spanish'
  | 'french'
  | 'german'
  | 'italian'
  | 'portuguese'
  | 'brazilian'
  | 'mexican'
  | 'argentinian'
  | 'japanese'
  | 'chinese'
  | 'korean'
  | 'russian'
  | 'arabic'
  | 'dutch'
  | 'swedish'
  | 'norwegian'
  | 'danish'
  | 'finnish'
  | 'polish'
  | 'turkish'
  | 'greek'
  | string;

export type VoiceSelectorAccentProps = ComponentProps<'span'> & {
  value?: VoiceSelectorAccentValue;
};

export const VoiceSelectorAccent = ({
  className,
  children,
  ...props
}: VoiceSelectorAccentProps) => (
  <span className={cn('text-muted-foreground text-xs', className)} {...props}>
    {children ?? <Languages className="size-4" />}
  </span>
);
