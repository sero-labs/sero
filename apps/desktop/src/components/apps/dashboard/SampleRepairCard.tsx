import { useEffect, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { AuthLoginDialog } from '@/components/layout/auth/AuthLoginDialog';
import { useSampleRepairStore } from '@/stores/sample-repair';
import { useProfileStore } from '@/stores/profiles';

export function SampleRepairCard() {
  const { eligible, tiers, busy, error, projectId, load, launch } = useSampleRepairStore();
  const profileId = useProfileStore((state) => state.activeProfile?.id);
  const [expanded, setExpanded] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  useEffect(() => { void load(); }, [load, profileId]);
  if (!eligible && !error) return null;
  return (
    <section aria-label="Sample repair" className="m-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
      <h2 className="text-base font-semibold">See Sero repair a small bug</h2>
      <p className="mt-1 text-sm">Try a disposable sample. Sero fixes a text helper, runs its check, and shows you the changed file.</p>
      {!expanded ? <Button className="mt-3" onClick={() => setExpanded(true)}>Try a sample repair</Button> : (
        <div className="mt-3 space-y-3 text-sm">
          <p>A new sample repository stays in this profile. Your existing projects are untouched. Sero saves the faulty starting version in Git so you can compare the repair.</p>
          <p>Sero uses your selected workspace runtime. Node.js and Git are required; verified installed tools are reused, or shared tools are downloaded automatically. Your selected container runtime may also need to start or download its image. Internet access may be needed. No project packages are installed.</p>
          <p>Model calls use your connected provider account and may incur charges. The start cap is $5; it is not a price estimate. You will approve file and shell access before model work starts.</p>
          <ul className="list-inside list-disc">
            {Object.entries(tiers).map(([tier, model]) => model && <li key={tier}>{tier}: {model.provider} / {model.modelId}</li>)}
          </ul>
          <p>Use Stop on the work page to stop model work. If a provider fails, reconnect it and Resume the same sample. If setup fails, retry here; saved files are kept. After delivery, use See the checks, Open Git changes, and Open result.</p>
          {error && <p role="alert" className="text-[var(--text-danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !eligible} onClick={() => void launch()}>{busy ? 'Preparing sample…' : projectId ? 'Open sample repair' : error ? 'Retry sample setup' : 'Prepare sample and approve access'}</Button>
            <Button variant="outline" onClick={() => setProvidersOpen(true)}>Manage providers</Button>
          </div>
        </div>
      )}
      <AuthLoginDialog open={providersOpen} onOpenChange={setProvidersOpen} onComplete={() => { setProvidersOpen(false); void load(); }} />
    </section>
  );
}
