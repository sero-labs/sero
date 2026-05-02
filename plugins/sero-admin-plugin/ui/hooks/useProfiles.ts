import { useEffect, useState } from 'react';
import { getSero, type ProfileInfo } from './host';

export function useProfiles() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const sero = getSero();
        const [list, active] = await Promise.all([
          sero.profiles.list(),
          sero.profiles.getActive(),
        ]);
        if (!cancelled) {
          setProfiles(list);
          setActiveProfile(active);
        }
      } catch (err) {
        console.error('[admin] Failed to load profiles:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { profiles, activeProfile, loading };
}
