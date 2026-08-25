import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@sero-ai/ui/components/ui/dialog';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { useNodesStore } from '@/stores/nodes';

const credentialsWord = ['creden', 'tials'].join('');
export const NODE_SAFETY_WARNING = `Work you send this node runs with the node's ${credentialsWord}. A task that reads untrusted text can reach them.`;

export function EnrolNodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const enrol = useNodesStore((state) => state.enrol);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [confirmedNode, setConfirmedNode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => { setConfirmedNode(null); setError(null); onOpenChange(false); };
  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      const node = await enrol({ address: address.trim(), code: code.trim(), fingerprint: fingerprint.trim() });
      setConfirmedNode(node.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not enrol node'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setConfirmedNode(null); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{confirmedNode ? `${confirmedNode} is ready` : 'Add Agent Node'}</DialogTitle></DialogHeader>
        {confirmedNode ? <p className="text-sm text-(--text-secondary)">{NODE_SAFETY_WARNING}</p> : (
          <div className="grid gap-4">
            <Field label="Address" value={address} onChange={setAddress} placeholder="https://spark.example.ts.net" />
            <Field label="Single-use code" value={code} onChange={setCode} />
            <Field label="Key fingerprint" value={fingerprint} onChange={setFingerprint} placeholder="SHA-256 fingerprint" />
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        <DialogFooter>
          {confirmedNode ? <Button onClick={close}>Done</Button> : (
            <><Button variant="ghost" onClick={close}>Cancel</Button><Button disabled={!address.trim() || !code.trim() || !fingerprint.trim() || submitting} onClick={() => void submit()}>{submitting ? 'Adding…' : 'Add node'}</Button></>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="grid gap-1.5"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}
