/**
 * EventDetail — rich event view matching Google Calendar's detail panel.
 *
 * Shows: date range, time, location (Maps link), attendees with RSVP,
 * cleaned description, reminders, source, visibility.
 */

import {
  Clock, MapPin, Users, ExternalLink, X, CheckCircle2, HelpCircle,
  XCircle, Bell, Link2, Lock, Globe,
} from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { formatTimeRange } from './format-utils';

interface EventDetailProps {
  event: CalendarEvent;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────

/** Format multi-day or single-day date labels. */
function formatDateRange(start: string, end: string, isAllDay: boolean): string {
  const s = new Date(start);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  if (isAllDay && end) {
    const e = new Date(end);
    // Google's all-day end date is exclusive (Feb 26 means through Feb 25)
    e.setDate(e.getDate() - 1);
    if (s.toDateString() === e.toDateString()) return fmt(s);
    const sFmt = s.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    const eFmt = e.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    return `${sFmt} – ${eFmt}`;
  }
  return fmt(s);
}

/** Convert reminder minutes to human-readable text. */
function formatReminder(method: string, minutes: number): string {
  const icon = method === 'email' ? 'Email' : 'Notification';
  if (minutes < 60) return `${icon}: ${minutes} minute${minutes !== 1 ? 's' : ''} before`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    return `${icon}: ${h} hour${h !== 1 ? 's' : ''} before`;
  }
  const d = Math.floor(minutes / 1440);
  const rem = minutes % 1440;
  if (rem === 0) return `${icon}: ${d} day${d !== 1 ? 's' : ''} before`;
  const hRem = Math.floor(rem / 60);
  return `${icon}: ${d} day${d !== 1 ? 's' : ''}, ${hRem}h before`;
}

/** Strip Google boilerplate but keep real content. */
function cleanDescription(desc: string): string | null {
  if (!desc) return null;
  const lines = desc.split('\n').filter((line) => {
    const l = line.trim();
    if (!l) return false;
    if (l.startsWith('To see detailed information for automatically created events')) return false;
    if (l.startsWith('This event was created from an email you received in Gmail')) return false;
    if (/^https?:\/\/(g\.co|mail\.google\.com|calendar\.google\.com)\b/.test(l)) return false;
    return true;
  });
  return lines.join('\n').trim() || null;
}

function parseAttendee(raw: string): { name: string; status: string; isSelf: boolean } {
  const isSelf = raw.endsWith(' — you');
  const stripped = isSelf ? raw.replace(' — you', '') : raw;
  const match = stripped.match(/^(.+?)\s*\((\w+)\)$/);
  if (match) return { name: match[1].trim(), status: match[2], isSelf };
  return { name: stripped, status: '', isSelf };
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  accepted: <CheckCircle2 className="size-3 text-emerald-500" />,
  declined: <XCircle className="size-3 text-red-400" />,
  tentative: <HelpCircle className="size-3 text-yellow-400" />,
  needsAction: <HelpCircle className="size-3 text-[var(--text-muted)]" />,
};

// ── Component ────────────────────────────────────────────────

export function EventDetail({ event, onClose }: EventDetailProps) {
  const timeRange = formatTimeRange(event.start, event.end, event.isAllDay);
  const dateRange = formatDateRange(event.start, event.end, event.isAllDay);
  const description = cleanDescription(event.description || '');
  const allAttendees = (event.attendees || []).map(parseAttendee);
  const nonSelfAttendees = allAttendees.filter((a) => !a.isSelf);
  const selfAttendee = allAttendees.find((a) => a.isSelf);
  const rsvpCount = allAttendees.filter((a) => a.status === 'accepted').length;
  const reminders = event.reminders?.filter((r) => r.minutes > 0) || [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-2.5 border-b border-[var(--border-subtle)] px-3 py-3">
        <div className="mt-1.5 size-3 shrink-0 rounded-sm bg-blue-500" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug">
            {event.summary}
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{dateRange}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3">
        {/* Time (skip for all-day single-day — already shown in header) */}
        {!event.isAllDay && (
          <Row icon={<Clock className="size-3.5" />}>
            <span className="text-[12px] text-[var(--text-primary)]">{timeRange}</span>
          </Row>
        )}

        {/* Location */}
        {event.location && (
          <Row icon={<MapPin className="size-3.5" />}>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[12px] text-blue-400 hover:underline leading-snug"
            >
              {event.location}
            </a>
          </Row>
        )}

        {/* Attendees */}
        {allAttendees.length > 0 && (
          <Row icon={<Users className="size-3.5" />}>
            <div>
              <div className="text-[12px] text-[var(--text-primary)]">
                {allAttendees.length} guest{allAttendees.length !== 1 ? 's' : ''}
              </div>
              {rsvpCount > 0 && (
                <div className="text-[10px] text-[var(--text-muted)] mb-1">
                  {rsvpCount} yes
                </div>
              )}
              <div className="space-y-1 mt-1">
                {/* Self first */}
                {selfAttendee && (
                  <AttendeeRow name={selfAttendee.name} status={selfAttendee.status} role="Organizer" />
                )}
                {nonSelfAttendees.map((a, i) => (
                  <AttendeeRow key={i} name={a.name} status={a.status} />
                ))}
              </div>
            </div>
          </Row>
        )}

        {/* Description */}
        {description && (
          <Row icon={<DescIcon />}>
            <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <Linkify text={description} />
            </div>
          </Row>
        )}

        {/* Reminders */}
        {reminders.length > 0 && (
          <Row icon={<Bell className="size-3.5" />}>
            <div className="space-y-0.5">
              {reminders.map((r, i) => (
                <div key={i} className="text-[12px] text-[var(--text-secondary)]">
                  {formatReminder(r.method, r.minutes)}
                </div>
              ))}
            </div>
          </Row>
        )}

        {/* Source (fromGmail) */}
        {event.eventType === 'fromGmail' && (
          <Row icon={<Link2 className="size-3.5" />}>
            <div>
              <div className="text-[12px] text-[var(--text-secondary)]">
                This was automatically created from an email.
              </div>
              {event.sourceUrl && (
                <a
                  href={event.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  View confirmation
                </a>
              )}
            </div>
          </Row>
        )}

        {/* Visibility */}
        {event.visibility && event.visibility !== 'default' && (
          <Row icon={event.visibility === 'private'
            ? <Lock className="size-3.5" />
            : <Globe className="size-3.5" />
          }>
            <span className="text-[12px] text-[var(--text-secondary)]">
              {event.visibility === 'private' ? 'Only me' : event.visibility}
            </span>
          </Row>
        )}

        {/* Open in Google Calendar */}
        {event.htmlLink && (
          <div className="pt-1">
            <a
              href={event.htmlLink} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              <ExternalLink className="size-3" />
              Open in Google Calendar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-[var(--text-muted)]">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function AttendeeRow({ name, status, role }: { name: string; status: string; role?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[9px] font-semibold text-blue-400">
        {name.charAt(0).toUpperCase()}
      </div>
      {STATUS_ICONS[status] || null}
      <div className="min-w-0">
        <span className="text-[11px] text-[var(--text-secondary)]">{name}</span>
        {role && <span className="ml-1 text-[10px] text-[var(--text-muted)]">{role}</span>}
      </div>
    </div>
  );
}

function DescIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="18" y2="12" /><line x1="3" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:underline break-all">{part}</a>
        ) : <span key={i}>{part}</span>,
      )}
    </>
  );
}
