import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import type { DesignLibraryProfileSettings, RevisionBehaviour } from '../../shared/types';

export function SettingsBar({
  settings,
  onChange,
}: {
  settings: DesignLibraryProfileSettings;
  onChange: (settings: { variantCount?: number; revisionBehaviour?: RevisionBehaviour }) => void;
}) {
  return (
    <footer className="dl-settings-bar">
      <div className="dl-settings-bar__field">
        <Label htmlFor="dl-variant-count">Variants per run</Label>
        <Select
          onValueChange={(value) => onChange({ variantCount: Number(value) })}
          value={String(settings.variantCount)}
        >
          <SelectTrigger className="dl-settings-bar__trigger" id="dl-variant-count" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((count) => (
              <SelectItem key={count} value={String(count)}>{count}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="dl-settings-bar__field">
        <Label htmlFor="dl-revision-behaviour">Revision result</Label>
        <Select
          onValueChange={(value) => onChange({ revisionBehaviour: value as RevisionBehaviour })}
          value={settings.revisionBehaviour}
        >
          <SelectTrigger className="dl-settings-bar__trigger" id="dl-revision-behaviour" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="replace">Replace the visible result</SelectItem>
            <SelectItem value="retain">Retain both results</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </footer>
  );
}
