function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function formatTimezoneOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${sign}${pad(hours, 2)}:${pad(minutes, 2)}`;
}

export function getLocalDayStamp(date: Date): string {
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1, 2),
    pad(date.getDate(), 2),
  ].join('-');
}

export function formatLocalTimestamp(date: Date): string {
  return `${getLocalDayStamp(date)}T${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}${formatTimezoneOffset(date)}`;
}

export function parseLocalDayStamp(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const date = Number.parseInt(dayText, 10);
  const parsed = new Date(year, month - 1, date);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== date
  ) {
    return null;
  }

  return parsed;
}

export function getLocalDayRetentionCutoff(retentionDays: number, now: Date): Date {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setDate(cutoff.getDate() - Math.max(0, retentionDays - 1));
  return cutoff;
}
