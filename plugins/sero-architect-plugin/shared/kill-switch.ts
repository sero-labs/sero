/**
 * The emergency kill switch, on the Rooms and Goals precedent. Architect is on
 * by default. Set `SERO_ARCHITECT=0` or `false` before Sero starts to disable
 * the runtime without touching its records: nothing is woken, nothing is
 * written, and every project comes back as it was once the flag is removed.
 */
export function architectEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.SERO_ARCHITECT?.trim().toLowerCase();
  return flag !== '0' && flag !== 'false';
}
