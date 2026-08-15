/**
 * Throwaway preview harness (ux-refit-plan.md §7). Renders room-kit
 * primitives and screens from fixtures on the plugin dev server:
 *
 *   SERO_DEV_PLUGINS=orchestrator pnpm dev   (or `pnpm --filter @sero-ai/plugin-orchestrator dev`)
 *   http://localhost:5198/ui/preview.html
 *
 * The Sero shell normally supplies the scope root and the design tokens;
 * here the mount div carries data-sero-plugin="orchestrator" and the theme
 * switcher writes each preset's tokens inline on that root, exactly the
 * variables the host's applyThemePreset would set on the document.
 *
 * Removed with the rest of the harness before the final commit.
 */

import { StrictMode, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@sero-ai/ui';
import { validateThemePreset } from '@sero-ai/ui/theme';
import type { ColorTokens, ThemePreset } from '@sero-ai/ui/theme';
import defaultThemeJson from '../../../packages/templates/themes/default.json';
import rosePineThemeJson from '../../../packages/templates/themes/rose-pine.json';
import {
  AuthorityBand,
  EventCard,
  Eyebrow,
  Face,
  FaceStack,
  FieldLabel,
  FieldRow,
  FieldSelect,
  FieldText,
  LivePill,
  Meter,
  ModeCard,
  NeedsBand,
  NeedsRow,
  NoteBlock,
  Pill,
  SectionHead,
  StatusDot,
  TokenChip,
  type MemberStatus,
} from './components/room-kit';
import { ShellTopBar } from './components/ShellTopBar';
import { HomeView } from './components/HomeView';
import { RoomBriefForm } from './components/RoomBriefForm';
import { RoomPreparing } from './components/RoomPlanning';
import { RoomProposal } from './components/RoomProposal';
import { RoomAdvancedSettings } from './components/RoomAdvancedSettings';
import { RoomTopBar } from './components/RoomTopBar';
import { RoomRoster } from './components/RoomRoster';
import { RoomActivity } from './components/RoomActivity';
import { RoomSidePanel } from './components/RoomSidePanel';
import { MEMBER_DOT, memberGlyph } from './lib/member-glyph';
import {
  FIXTURE_BLUEPRINT,
  FIXTURE_LIVE_MEMBERS,
  FIXTURE_LIVE_ROOM,
  FIXTURE_LOOPS,
  FIXTURE_PROPOSAL,
  FIXTURE_PROPOSAL_REVISED,
  FIXTURE_ROOMS,
  FIXTURE_TIMELINE,
  NOOP,
} from './preview-fixtures';
import './preview-harness.css';

// ── Theme plumbing ───────────────────────────────────────────

function mustParse(raw: unknown, name: string): ThemePreset {
  const preset = validateThemePreset(raw);
  if (!preset) throw new Error(`Harness theme ${name} failed validation`);
  return preset;
}

const defaultTheme = mustParse(defaultThemeJson, 'default');
const rosePineTheme = mustParse(rosePineThemeJson, 'rose-pine');

interface ThemeChoice {
  label: string;
  preset: ThemePreset;
  mode: 'light' | 'dark';
}

const THEMES: ThemeChoice[] = [
  { label: 'Default · dark', preset: defaultTheme, mode: 'dark' },
  { label: 'Default · light', preset: defaultTheme, mode: 'light' },
  { label: 'Rosé Pine', preset: rosePineTheme, mode: 'dark' },
];

const WIDTHS = [1400, 1000, 780] as const;

/**
 * Mirror of apply-theme.ts's derived opacity variants — the host generates
 * these from the base tokens at apply time, so the harness must too.
 */
const DERIVED_OPACITY_VARS: Array<[string, keyof ColorTokens, number]> = [
  ['--brand-primary-muted', 'brandPrimary', 10],
  ['--brand-primary-subtle', 'brandPrimary', 15],
  ['--brand-primary-faint', 'brandPrimary', 3],
  ['--brand-primary-border', 'brandPrimary', 20],
  ['--brand-secondary-muted', 'brandSecondary', 10],
  ['--brand-secondary-subtle', 'brandSecondary', 15],
  ['--brand-secondary-faint', 'brandSecondary', 3],
  ['--brand-secondary-border', 'brandSecondary', 20],
  ['--status-success-muted', 'statusSuccess', 10],
  ['--status-success-subtle', 'statusSuccess', 15],
  ['--status-success-faint', 'statusSuccess', 3],
  ['--status-success-border', 'statusSuccess', 20],
  ['--status-warning-muted', 'statusWarning', 10],
  ['--status-warning-subtle', 'statusWarning', 15],
  ['--status-warning-faint', 'statusWarning', 3],
  ['--status-warning-border', 'statusWarning', 20],
  ['--status-error-muted', 'statusError', 10],
  ['--status-error-subtle', 'statusError', 15],
  ['--status-error-faint', 'statusError', 3],
  ['--status-error-border', 'statusError', 20],
  ['--status-info-muted', 'statusInfo', 10],
  ['--status-info-subtle', 'statusInfo', 15],
  ['--status-info-faint', 'statusInfo', 3],
  ['--status-info-border', 'statusInfo', 20],
  ['--collab-primary-muted', 'collabPrimary', 10],
  ['--collab-primary-subtle', 'collabPrimary', 15],
  ['--collab-primary-border', 'collabPrimary', 20],
  ['--voice-recording-muted', 'voiceRecording', 20],
  ['--voice-processing-muted', 'voiceProcessing', 15],
  ['--banner-primary-muted', 'bannerPrimary', 10],
  ['--banner-primary-subtle', 'bannerPrimary', 15],
  ['--banner-primary-border', 'bannerPrimary', 20],
];

function kebab(key: string): string {
  return `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

/** Inline CSS variables for one preset+mode, as applyThemePreset would set. */
function themeVars(colors: ColorTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string' && value) vars[kebab(key)] = value;
  }
  for (const [cssVar, baseKey, pct] of DERIVED_OPACITY_VARS) {
    const base = colors[baseKey];
    if (base) vars[cssVar] = `color-mix(in srgb, ${base} ${pct}%, transparent)`;
  }
  return vars;
}

// ── Capture crops ────────────────────────────────────────────
// The approved captures are 2584px over a 1400-CSS-px app frame; scaling by
// 1400/2584 shows a crop at exactly the size the kit renders beside it.

// Safe-name copies of docs/prototypes/agent-rooms — the originals' commas
// and question marks 404 through vite's static middleware.
const CAPTURES_DIR = '/ui/preview-captures';
const CAPTURE_WIDTH = 2584;
const CAPTURE_SCALE = 1400 / CAPTURE_WIDTH;

interface CropSpec {
  file: string;
  /** Crop rect in the capture's own pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

function Crop({ file, x, y, w, h, label }: CropSpec) {
  const s = CAPTURE_SCALE;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: w * s, height: h * s, overflow: 'hidden', position: 'relative' }}>
        <img
          alt={label}
          src={`${CAPTURES_DIR}/${encodeURIComponent(file)}`}
          style={{ position: 'absolute', left: -x * s, top: -y * s, width: CAPTURE_WIDTH * s, maxWidth: 'none' }}
        />
      </div>
      <figcaption className="room-mono-micro mt-1 text-room-text4">{label}</figcaption>
    </figure>
  );
}

// ── Preview sections ─────────────────────────────────────────
// Phase 2 registers every room-kit primitive here; screen phases add their
// fixture-driven screens.

interface Section {
  title: string;
  render: () => ReactNode;
  /** Matching regions from the approved captures, shown under the section. */
  crops?: CropSpec[];
}

const CAP_HOME = 'cap1.jpg';
const CAP_CREATE = 'cap2.jpg';
const CAP_PREPARING = 'cap3.jpg';
const CAP_PROPOSAL = 'cap4.jpg';
const CAP_ADJUST = 'cap5.jpg';
const CAP_WHY = 'cap6.jpg';
const CAP_ADVANCED = 'cap7.jpg';
const CAP_LIVE = 'cap8.jpg';
const CAP_WATCH = 'cap9.jpg';

const ALL_STATUSES: MemberStatus[] = ['working', 'waiting', 'idle', 'blocked', 'done', 'suspended'];

/** The prototype's small .btn (26px, 11px type) for fixture actions. */
const SMALL_BTN = 'h-[26px] px-2.5 text-[11px]';

/**
 * Phase 11's screen composed from its four regions, with RoomDetail's
 * container behaviour reproduced (face strip <900, drawer <1200): the real
 * RoomDetail needs live IPC hooks the harness does not have.
 */
function LiveRoomPreview() {
  const [view, setView] = useState<'result' | 'timeline' | 'watch'>('timeline');
  const [selectedId, setSelectedId] = useState<string | null>('implementer-1');
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'brief' | 'team'>('brief');
  const members = new Map(FIXTURE_LIVE_MEMBERS.map((member) => [member.id, member]));
  const names = new Map(FIXTURE_LIVE_MEMBERS.map((member) => [member.id, member.displayName]));

  return (
    <div className="flex h-[820px] flex-col">
      <RoomTopBar
        room={FIXTURE_LIVE_ROOM}
        view={view}
        busy={false}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        onBack={NOOP}
        onView={setView}
        onMessage={NOOP}
        onPause={NOOP}
        onResume={NOOP}
        onStop={NOOP}
      />
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-room-line px-[18px] py-2 @min-[900px]/panel:hidden">
        {FIXTURE_LIVE_MEMBERS.map((member) => (
          <button
            key={member.id}
            type="button"
            title={member.displayName}
            aria-pressed={member.id === selectedId}
            onClick={() => setSelectedId(member.id === selectedId ? null : member.id)}
            className={`rounded-[7px] ${member.id === selectedId ? 'ring-1 ring-room-line-strong' : ''}`}
          >
            <Face
              size={26}
              tone={member.isConductor ? 'conductor' : 'member'}
              label={memberGlyph(member.displayName, member.isConductor)}
              status={MEMBER_DOT[member.status]}
            />
          </button>
        ))}
      </div>
      <div className="relative flex min-h-0 flex-1">
        <RoomRoster
          memberIds={FIXTURE_LIVE_ROOM.memberIds}
          members={members}
          selectedId={selectedId}
          onSelect={(memberId) => setSelectedId(memberId === selectedId ? null : memberId)}
          className="hidden @min-[900px]/panel:flex"
        />
        <RoomActivity events={FIXTURE_TIMELINE} members={members} />
        <RoomSidePanel room={FIXTURE_LIVE_ROOM} names={names} className="hidden @min-[1200px]/panel:flex" />
        {panelOpen && (
          <div className="absolute inset-y-0 right-0 z-10 flex w-80 max-w-full flex-col border-l border-room-line bg-room-bg shadow-xl @min-[1200px]/panel:hidden">
            <div role="tablist" aria-label="Room panel" className="flex h-9 shrink-0 border-b border-room-line @min-[900px]/panel:hidden">
              {(['brief', 'team'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === option}
                  onClick={() => setDrawerTab(option)}
                  className={`grid flex-1 place-items-center text-[11px] ${
                    drawerTab === option
                      ? 'text-room-text2 shadow-[inset_0_-1px_0_var(--brand-primary)]'
                      : 'text-room-text4 hover:text-room-text3'
                  }`}
                >
                  {option === 'brief' ? 'Brief' : 'Team'}
                </button>
              ))}
            </div>
            <RoomRoster
              memberIds={FIXTURE_LIVE_ROOM.memberIds}
              members={members}
              selectedId={selectedId}
              onSelect={(memberId) => setSelectedId(memberId === selectedId ? null : memberId)}
              className={drawerTab === 'team' ? 'w-full flex-1 border-r-0 @min-[900px]/panel:hidden' : 'hidden'}
            />
            <RoomSidePanel
              room={FIXTURE_LIVE_ROOM}
              names={names}
              className={drawerTab === 'team' ? 'hidden w-full flex-1 border-l-0 @min-[900px]/panel:flex' : 'w-full flex-1 border-l-0'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    title: 'Phase 11 — The live Room',
    crops: [
      { file: CAP_LIVE, x: 0, y: 104, w: 2584, h: 1410, label: 'live room — full' },
    ],
    render: () => <LiveRoomPreview />,
  },
  {
    title: 'Phase 10 — Advanced settings',
    crops: [
      { file: CAP_ADVANCED, x: 0, y: 104, w: 2584, h: 1410, label: 'advanced — full' },
    ],
    render: () => (
      <div className="flex h-[820px] flex-col">
        <RoomAdvancedSettings blueprint={FIXTURE_BLUEPRINT} />
      </div>
    ),
  },
  {
    title: 'Phase 8 — Adjust (revised proposal)',
    crops: [
      { file: CAP_ADJUST, x: 540, y: 120, w: 1520, h: 1300, label: 'adjust — column' },
    ],
    render: () => (
      <RoomProposal
        proposal={FIXTURE_PROPOSAL_REVISED}
        clamps={[]}
        busy={false}
        onStart={NOOP}
        onAdjust={NOOP}
        onDiscard={NOOP}
        onOpenAdvanced={NOOP}
        previous={FIXTURE_PROPOSAL}
        initialInstruction="Use one implementer instead of two, keep the cost under $2, and don't let anything push to GitHub."
        onDismissRevision={NOOP}
      />
    ),
  },
  {
    title: 'Phase 7 — The proposal (open Why this team? for phase 9, cap6)',
    crops: [
      { file: CAP_PROPOSAL, x: 540, y: 120, w: 1520, h: 1400, label: 'proposal — column' },
      { file: CAP_WHY, x: 540, y: 120, w: 1520, h: 1360, label: 'why this team — column' },
    ],
    render: () => (
      <RoomProposal
        proposal={FIXTURE_PROPOSAL}
        clamps={[]}
        busy={false}
        onStart={NOOP}
        onAdjust={NOOP}
        onDiscard={NOOP}
        onOpenAdvanced={NOOP}
      />
    ),
  },
  {
    title: 'Phase 4 — Home',
    crops: [
      { file: CAP_HOME, x: 0, y: 104, w: 2584, h: 1410, label: 'home — full body' },
    ],
    render: () => (
      <HomeView
        loops={FIXTURE_LOOPS}
        busy={false}
        onAction={NOOP}
        onOpenLoop={NOOP}
        onNew={NOOP}
        onNewRoom={NOOP}
        rooms={FIXTURE_ROOMS}
        onRoomApproval={NOOP}
        onRoomAnswer={NOOP}
        onRoomResume={NOOP}
        onOpenRoom={NOOP}
      />
    ),
  },
  {
    title: 'Phase 5 — Create a Room',
    crops: [
      { file: CAP_CREATE, x: 540, y: 140, w: 1500, h: 1220, label: 'create — column' },
    ],
    render: () => <RoomBriefForm busy={false} onDesign={NOOP} onCancel={NOOP} />,
  },
  {
    title: 'Phase 6 — Preparing',
    crops: [
      { file: CAP_PREPARING, x: 680, y: 300, w: 1220, h: 1000, label: 'preparing — column' },
    ],
    render: () => <RoomPreparing title="Designing your team" />,
  },
  {
    title: 'Phase 3 — shell top bar',
    crops: [
      { file: CAP_HOME, x: 0, y: 0, w: 2584, h: 106, label: 'top bar — home' },
    ],
    render: () => (
      <div className="flex flex-col">
        <ShellTopBar
          active="home"
          workflowCount={7}
          roomCount={2}
          needsCount={0}
          onSelect={() => {}}
          onNew={() => {}}
          actions={[{ label: 'Reflect all', onSelect: () => {} }]}
        />
        <ShellTopBar
          active="rooms"
          workflowCount={7}
          roomCount={2}
          needsCount={3}
          onSelect={() => {}}
          onNew={() => {}}
          actions={[{ label: 'Reflect all', onSelect: () => {} }]}
        />
      </div>
    ),
  },
  {
    title: 'identity — Face / FaceStack / StatusDot / LivePill',
    crops: [
      { file: CAP_PROPOSAL, x: 568, y: 497, w: 503, h: 264, label: '30px faces — proposal roster' },
      { file: CAP_LIVE, x: 52, y: 239, w: 428, h: 496, label: '26px faces + corner dots — roster rail' },
      { file: CAP_HOME, x: 1909, y: 993, w: 590, h: 77, label: 'face stack — home row' },
      { file: CAP_WATCH, x: 74, y: 252, w: 1197, h: 86, label: 'live pill — watch tile' },
      { file: CAP_WATCH, x: 74, y: 664, w: 1197, h: 74, label: 'idle pill — watch tile' },
    ],
    render: () => (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <Face label="◎" tone="conductor" size={36} />
          <Face label="◎" tone="conductor" size={30} />
          <Face label="R" size={30} />
          <Face label="1" size={26} />
          <Face label="M" tone="new" size={26} />
          <Face label="2" size={24} />
          <Face label="T" size={22} />
        </div>
        <div className="flex items-center gap-3">
          <Face label="◎" tone="conductor" size={26} status="working" />
          <Face label="R" size={26} status="done" />
          <Face label="1" size={26} status="working" />
          <Face label="2" size={26} status="waiting" />
          <Face label="T" size={26} status="idle" />
          <Face label="M" tone="new" size={26} status="suspended" />
          <span className="ml-4">
            <FaceStack
              faces={[
                { label: 'C', tone: 'conductor' },
                { label: 'R' },
                { label: 'I' },
                { label: 'I' },
                { label: 'T' },
              ]}
            />
          </span>
        </div>
        <div className="flex items-center gap-4">
          {ALL_STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-2 text-[11px] text-room-text3">
              <StatusDot status={s} />
              {s}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <LivePill>Live · turn 12</LivePill>
          <LivePill idle>Waiting 3m</LivePill>
          <LivePill idle>Finished</LivePill>
          <LivePill idle>Not started</LivePill>
        </div>
      </div>
    ),
  },
  {
    title: 'chrome — Eyebrow / Pill / SectionHead / Meter / NoteBlock',
    crops: [
      { file: CAP_PROPOSAL, x: 568, y: 187, w: 336, h: 32, label: 'eyebrow — proposed room' },
      { file: CAP_LIVE, x: 1993, y: 316, w: 522, h: 39, label: 'eyebrow — room brief' },
      { file: CAP_LIVE, x: 1838, y: 142, w: 240, h: 42, label: 'pills — selected + neutral' },
      { file: CAP_LIVE, x: 306, y: 151, w: 97, h: 36, label: 'pill — running' },
      { file: CAP_LIVE, x: 1780, y: 819, w: 138, h: 35, label: 'pill — warn' },
      { file: CAP_WHY, x: 1783, y: 226, w: 194, h: 35, label: 'pill — collab' },
      { file: CAP_HOME, x: 74, y: 935, w: 2425, h: 45, label: 'section head' },
      { file: CAP_LIVE, x: 445, y: 148, w: 795, h: 45, label: 'meters — room bar' },
      { file: CAP_LIVE, x: 1993, y: 1025, w: 522, h: 142, label: 'note — conductor' },
      { file: CAP_WHY, x: 593, y: 1129, w: 1380, h: 90, label: 'note — planner' },
    ],
    render: () => (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-5">
          <Eyebrow>Room brief · updated 14:33</Eyebrow>
          <Eyebrow tone="brand">Proposed room</Eyebrow>
          <Eyebrow tone="collab">Planner reasoning</Eyebrow>
          <Eyebrow tone="warn">Needs you</Eyebrow>
        </div>
        <div className="flex items-center gap-2">
          <Pill>Watch</Pill>
          <Pill tone="brand">Running</Pill>
          <Pill tone="collab">Applied</Pill>
          <Pill tone="warn">Waiting 3m</Pill>
          <Pill tone="error">3 attempts</Pill>
          <Pill tone="info">Already allowed</Pill>
        </div>
        <div className="max-w-[520px]">
          <SectionHead count="2">Rooms</SectionHead>
        </div>
        <div className="flex items-center gap-6">
          <Meter value="41m" of="2h" pct={34} />
          <Meter value="$3.18" of="$6.00" pct={53} />
          <Meter value="$5.70" of="$6.00" pct={95} />
        </div>
        <div className="grid max-w-[640px] gap-2.5">
          <NoteBlock tone="collab">
            This is the planner explaining its choices. It does not change what the team is allowed
            to do — the access, spend, time and team size you approve are computed from the plan
            itself, and this text cannot alter them.
          </NoteBlock>
          <NoteBlock tone="brand" title="Conductor's note">
            Keeping the tester idle until Implementer 1's branch settles — writing the test against
            a moving target wastes turns.
          </NoteBlock>
          <NoteBlock tone="info" title="Real session">
            <b>This is a real session, not a chat.</b> It lives in this Room's session folder, so it
            does not appear in your chat history.
          </NoteBlock>
        </div>
      </div>
    ),
  },
  {
    title: 'blocks — EventCard / AuthorityBand / ModeCard / NeedsBand',
    crops: [
      { file: CAP_LIVE, x: 694, y: 454, w: 1243, h: 142, label: 'event card — finding (ok)' },
      { file: CAP_LIVE, x: 694, y: 806, w: 1243, h: 151, label: 'event card — question (neutral, warn pill)' },
      { file: CAP_PROPOSAL, x: 568, y: 1013, w: 1440, h: 228, label: 'authority band' },
      { file: CAP_ADJUST, x: 568, y: 619, w: 1440, h: 284, label: 'recompute band' },
      { file: CAP_HOME, x: 74, y: 632, w: 2425, h: 256, label: 'mode cards' },
      { file: CAP_HOME, x: 74, y: 290, w: 2425, h: 306, label: 'needs band' },
    ],
    render: () => (
      <div className="flex flex-col gap-4 p-4">
        <div className="grid max-w-[640px] gap-2.5">
          <EventCard tone="ok" title="Finding · session fixation is real" pill={<Pill tone="brand">Artifact</Pill>}>
            The session identifier issued before authentication survives the privilege change in{' '}
            <span className="room-tabular text-room-text3">src/auth/session.ts:118</span>. An attacker
            who fixes the identifier before login keeps a valid authenticated session.
          </EventCard>
          <EventCard title="Question → Implementer 1" pill={<Pill tone="warn">Waiting 3m</Pill>}>
            “Are you rotating the identifier on login, or issuing a new session object entirely? The
            downstream cache keys off the object identity, so it changes what I have to update.”
          </EventCard>
          <EventCard
            tone="revision"
            title="Room revision · member added"
            pill={<Pill tone="collab">Applied</Pill>}
            actions={
              <>
                <Button variant="outline" size="sm" className={SMALL_BTN}>Inspect the change</Button>
                <Button variant="outline" size="sm" className={SMALL_BTN}>Undo</Button>
              </>
            }
          >
            <b className="text-room-text2">Migration checker</b> — the session table has a stored
            identifier column, so the fix needs a migration nobody was checking.
          </EventCard>
          <EventCard tone="warn" title="Room revision · replace member" pill={<Pill tone="warn">Waiting for you</Pill>}>
            The replacement needs database write access, which no member currently has and the
            envelope does not allow.
          </EventCard>
        </div>
        <div className="max-w-[760px]">
          <AuthorityBand
            title="✓ What you are approving"
            hint="computed from the plan the team will run under"
            cells={[
              { label: 'Team', value: '5 members', sub: '1 leads, 4 work' },
              { label: 'Working time', value: 'Up to 2 hours', sub: 'then it pauses for you' },
              { label: 'Spend', value: 'Up to $6.00', sub: 'hard stop' },
              { label: 'Access', value: 'This workspace and GitHub', sub: 'read, edit, push' },
            ]}
          />
        </div>
        <div className="max-w-[760px]">
          <AuthorityBand
            tone="neutral"
            title={<><span className="text-brand-primary">✓</span> Recomputed from the revised plan</>}
            cells={[
              { label: 'Team', value: '4 members', was: '5 members' },
              { label: 'Working time', value: 'Up to 2 hours' },
              { label: 'Spend', value: 'Up to $2.00', was: '$6.00' },
              { label: 'Access', value: 'This workspace', was: 'and GitHub' },
            ]}
            footer={
              <>
                <b className="font-medium text-room-text3">Kept as you set them:</b> the 2-hour limit,
                delivery back to this chat, and the read-and-edit access you approved.{' '}
                <b className="font-medium text-room-text3">Removed:</b> Implementer 2, and GitHub push
                for every member.
              </>
            }
          />
        </div>
        <div className="grid max-w-[900px] grid-cols-2 gap-3.5">
          <ModeCard glyph="⟳" title="Workflow" meta={<><Pill>7 workflows</Pill><Pill>2 running</Pill><Pill>Step graph</Pill></>}>
            Describe a repeatable job. Sero plans the steps, their order and their completion
            checks, then runs it — once, on a schedule, or on an event.
          </ModeCard>
          <ModeCard
            on
            glyph="◎"
            title="Room"
            badge={<Pill tone="brand" className="h-[19px] text-[9px]">New</Pill>}
            meta={<><Pill>2 rooms</Pill><Pill tone="brand">1 running</Pill><Pill>Persistent team</Pill></>}
          >
            Describe a problem. Sero builds a team for it — a Conductor plus the specialists the
            problem needs — and they work, talk and adapt until it is done.
          </ModeCard>
        </div>
        <div className="max-w-[900px]">
          <NeedsBand count="3 items">
            <NeedsRow
              status="blocked"
              source="Room · Auth hardening · Implementer 2"
              action={<Button variant="outline" size="sm" className={SMALL_BTN}>Review</Button>}
            >
              Push branch <span className="room-tabular text-room-text2">room/auth-hardening/impl-2</span> to origin
            </NeedsRow>
            <NeedsRow
              source="Room · Auth hardening · Conductor"
              action={<Button variant="outline" size="sm" className={SMALL_BTN}>Review</Button>}
            >
              Raise the spend limit from $6.00 to $9.00
            </NeedsRow>
            <NeedsRow
              source="Workflow · Nightly dependency sweep"
              action={<Button variant="outline" size="sm" className={SMALL_BTN}>Answer</Button>}
            >
              Answer planner question about the target branch
            </NeedsRow>
          </NeedsBand>
        </div>
      </div>
    ),
  },
  {
    title: 'fields — FieldRow / FieldLabel / FieldText / FieldSelect / TokenChip',
    crops: [
      { file: CAP_ADVANCED, x: 442, y: 226, w: 1525, h: 194, label: 'mandate field' },
      { file: CAP_ADVANCED, x: 442, y: 452, w: 1525, h: 90, label: 'selects' },
      { file: CAP_ADVANCED, x: 442, y: 568, w: 1525, h: 187, label: 'tools + skills chips' },
    ],
    render: () => (
      <div className="max-w-[560px] p-4">
        <FieldRow className="mt-0">
          <FieldLabel hint="changes instructions only — never capabilities">Mandate</FieldLabel>
          <FieldText tall>
            Confirm whether the login flow is vulnerable to session fixation. Read the session
            lifecycle end to end before concluding. State the exact file and line where the session
            identifier survives authentication, or state clearly that it does not.
          </FieldText>
        </FieldRow>
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <div>
            <FieldLabel>Model</FieldLabel>
            <FieldSelect>Claude Opus 5</FieldSelect>
          </div>
          <div>
            <FieldLabel>Thinking</FieldLabel>
            <FieldSelect>High</FieldSelect>
          </div>
        </div>
        <FieldRow>
          <FieldLabel hint="from this workspace's real catalogue">Tools</FieldLabel>
          <div className="flex flex-wrap gap-[5px]">
            <TokenChip on>read</TokenChip>
            <TokenChip on>grep</TokenChip>
            <TokenChip on>bash</TokenChip>
            <TokenChip on>sero-cli</TokenChip>
            <TokenChip>write</TokenChip>
            <TokenChip>edit</TokenChip>
            <TokenChip>gh</TokenChip>
            <TokenChip>browser</TokenChip>
          </div>
        </FieldRow>
      </div>
    ),
  },
  {
    title: 'Phase 1 — room token layer',
    render: () => (
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-[9px] border border-room-line bg-room-surface p-4">
          <div className="room-mono-micro uppercase tracking-[0.12em] text-brand-primary">Proposed room</div>
          <div className="mt-2 text-base font-semibold text-room-text">Session-fixation fix for the login flow</div>
          <div className="mt-1 text-sm text-room-text2">
            Ink tier 2 — the approach sentence sits in this tone.
          </div>
          <div className="mt-1 text-sm text-room-text3">
            Ink tier 3 — supporting detail and row subtitles.
          </div>
          <div className="mt-1 text-sm text-room-text4">
            Ink tier 4 — hints, footnotes, and the faintest meta.
          </div>
          <div className="mt-3 rounded-lg border border-room-line-strong bg-room-sunken p-3 text-sm text-room-text2">
            Sunken input fill — derived, offset from the base toward the ink.
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="size-[30px] rounded-lg bg-linear-[140deg] from-room-face-from to-room-face-to" />
            <span className="size-[30px] rounded-lg bg-linear-[140deg] from-room-face-c-from to-room-face-c-to" />
            <span className="size-[30px] rounded-lg bg-linear-[140deg] from-room-face-new-from to-room-face-new-to" />
            <span className="room-tabular text-sm text-room-text3">$3.18 / $6.00 · 41m</span>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="rounded-md bg-brand-primary px-3 py-1 text-sm text-brand-primary-foreground">brand</span>
          <span className="rounded-md border border-brand-primary-border bg-brand-primary-muted px-3 py-1 text-sm text-brand-primary">emerald wash</span>
          <span className="rounded-md border border-collab-primary-border bg-collab-primary-muted px-3 py-1 text-sm text-collab-primary">violet wash</span>
          <span className="rounded-md border border-status-warning-border bg-status-warning-muted px-3 py-1 text-sm text-status-warning">amber wash</span>
          <span className="rounded-md border border-status-error-border bg-status-error-muted px-3 py-1 text-sm text-status-error">red wash</span>
          <span className="rounded-md border border-status-info-border bg-status-info-muted px-3 py-1 text-sm text-status-info">blue wash</span>
        </div>
      </div>
    ),
  },
];

// ── Harness shell ────────────────────────────────────────────

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  color: '#b7b7c0',
  fontSize: 12,
  borderBottom: '1px solid #26262b',
  position: 'sticky',
  top: 0,
  background: '#050506',
  zIndex: 10,
};

function ToolbarButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: 'inherit',
        padding: '4px 10px',
        borderRadius: 6,
        border: on ? '1px solid #34d399' : '1px solid #393940',
        background: on ? 'rgba(52,211,153,.1)' : 'transparent',
        color: on ? '#8ce7c5' : '#b7b7c0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function PreviewApp() {
  const [themeIndex, setThemeIndex] = useState(0);
  const [width, setWidth] = useState<number>(WIDTHS[0]);
  const [showCrops, setShowCrops] = useState(true);
  const theme = THEMES[themeIndex];
  const colors = theme.mode === 'dark' ? theme.preset.colors.dark : theme.preset.colors.light;
  const vars = themeVars(colors);

  return (
    <>
      <div style={toolbarStyle}>
        <span style={{ marginRight: 8, color: '#74747f' }}>Orchestrator preview</span>
        {THEMES.map((t, i) => (
          <ToolbarButton key={t.label} label={t.label} on={i === themeIndex} onClick={() => setThemeIndex(i)} />
        ))}
        <span style={{ width: 1, height: 16, background: '#26262b', margin: '0 6px' }} />
        {WIDTHS.map((w) => (
          <ToolbarButton key={w} label={`${w}px`} on={w === width} onClick={() => setWidth(w)} />
        ))}
        <span style={{ width: 1, height: 16, background: '#26262b', margin: '0 6px' }} />
        <ToolbarButton
          label={showCrops ? 'Hide capture crops' : 'Show capture crops'}
          on={showCrops}
          onClick={() => setShowCrops((v) => !v)}
        />
      </div>
      <div style={{ padding: 24, display: 'grid', justifyContent: 'start', gap: 24 }}>
        <div style={{ width, border: '1px solid #26262b', borderRadius: 10, overflow: 'hidden' }}>
          <div
            data-sero-plugin="orchestrator"
            className={theme.mode === 'dark' ? 'dark' : undefined}
            style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', ...vars } as CSSProperties}
          >
            {/* Scoped utilities never match the scope root itself; the panel
                container lives one level in, as it does under the Sero shell. */}
            <div className="@container/panel">
            {SECTIONS.map((section) => (
              <section key={section.title} className="border-b border-room-line pb-5 last:border-b-0">
                <div className="room-mono-micro px-4 pt-4 uppercase tracking-[0.08em] text-room-text3">
                  {section.title}
                </div>
                {section.render()}
                {section.crops && showCrops && (
                  <div className="mx-4 mt-1 rounded-lg border border-dashed border-room-line-strong p-3">
                    <div className="room-mono-micro mb-2 uppercase tracking-[0.08em] text-status-warning">
                      ⚠ reference only — crops from the approved captures (always dark). The live
                      components are above.
                    </div>
                    <div className="flex flex-wrap items-start gap-4">
                      {section.crops.map((crop) => (
                        <Crop key={crop.label} {...crop} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('preview: #root missing');
createRoot(rootEl).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
