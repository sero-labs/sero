import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui';
import { ExternalLink, FileCode2, Image, type LucideIcon } from 'lucide-react';

const interactivePrototypes = [
  ['Add workspace menu', 'add-workspace-menu.html'],
  ['Graphify free code indexing', 'graphify-free-code-indexing.html'],
  ['Profile removal', 'profile-removal.html'],
  ['Agent plugins integration', 'sero-agent-plugins-integration.html'],
  ['Agent Rooms', 'sero-agent-rooms.html'],
  [
    'Design Library generation workflow',
    'sero-design-library-generation-workflow-enhancement.html',
  ],
  ['Design Library plugin', 'sero-design-library-plugin.html'],
  ['Workflow skill extraction', 'sero-workflow-skill-extraction.html'],
  ['Streaming file writes', 'streaming-file-writes.html'],
  ['Expanded tool call group', 'tool-call-group-expanded.html'],
  ['Agent Node desktop', 'agent-node-desktop.html'],
] as const;

const agentRoomScreens = [
  [
    '1 · Orchestrator — Workflows and Rooms',
    'agent-rooms/1 · Orchestrator — Workflows and Rooms.jpg',
  ],
  [
    '2 · Create a Room — one question',
    'agent-rooms/2 · Create a Room — one question.jpg',
  ],
  ['3 · Preparing the team', 'agent-rooms/3 · Preparing the team.jpg'],
  [
    '4 · The proposal — computed, not written',
    'agent-rooms/4 · The proposal — computed, not written.jpg',
  ],
  [
    '5 · Adjust — natural language first',
    'agent-rooms/5 · Adjust — natural language first.jpg',
  ],
  [
    '6 · Why this team? — optional supporting detail',
    'agent-rooms/6 · Why this team — optional supporting detail.jpg',
  ],
  [
    '7 · Advanced settings — the complete blueprint',
    'agent-rooms/7 · Advanced settings — the complete blueprint.jpg',
  ],
  ['8 · The live Room', 'agent-rooms/8 · The live Room.jpg'],
  [
    '9 · Watching the whole team work',
    'agent-rooms/9 · Watching the whole team work.jpg',
  ],
  [
    '10 · Inside one member’s session — live, with its whole history',
    'agent-rooms/10 · Inside one member’s session — live, with its whole history.jpg',
  ],
  ['Member session details', 'screenshots/sero-agent-rooms-member-info.png'],
] as const;

function prototypeUrl(path: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${import.meta.env.BASE_URL}prototypes/${encodedPath}`;
}

export function PrototypeArchive() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved prototypes</CardTitle>
        <CardDescription>
          Historical design references. They do not define current product behaviour.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <PrototypeList
          icon={FileCode2}
          items={interactivePrototypes.map(([label, path]) => ({ label, path }))}
          title="Interactive prototypes"
        />
        <PrototypeList
          icon={Image}
          items={agentRoomScreens.map(([label, path]) => ({ label, path }))}
          title="Agent Rooms screens"
        />
      </CardContent>
    </Card>
  );
}

interface PrototypeListProps {
  icon: LucideIcon;
  items: ReadonlyArray<{ label: string; path: string }>;
  title: string;
}

function PrototypeList({ icon: Icon, items, title }: PrototypeListProps) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-base font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(({ label, path }) => (
          <a
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
            href={prototypeUrl(path)}
            key={path}
            rel="noreferrer"
            target="_blank"
          >
            <span>{label}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
