import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  Skeleton,
  Textarea,
} from '@sero-ai/ui';
import { applyThemePreset, type ThemePreset } from '@sero-ai/ui/theme';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Code2,
  Coins,
  Gauge,
  GitBranch,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  PanelLeft,
  Send,
  Sun,
  Terminal,
} from 'lucide-react';
import { STYLEGUIDE_THEMES } from './themes';
import { DashboardFixture } from './DashboardFixture';
import { PrototypeArchive } from '@/PrototypeArchive';

type Mode = 'light' | 'dark';

const tokenRows = [
  ['brand-primary', 'Primary brand', 'bg-brand-primary text-brand-primary-foreground'],
  ['brand-secondary', 'Secondary brand', 'bg-brand-secondary text-brand-secondary-foreground'],
  ['status-success', 'Success state', 'bg-status-success text-white'],
  ['status-warning', 'Warning state', 'bg-status-warning text-white'],
  ['status-error', 'Error state', 'bg-status-error text-white'],
  ['status-info', 'Info state', 'bg-status-info text-white'],
];

export function App() {
  const [themeId, setThemeId] = useState(STYLEGUIDE_THEMES[0].id);
  const [mode, setMode] = useState<Mode>('dark');
  const activeTheme = useMemo(
    () => STYLEGUIDE_THEMES.find((theme) => theme.id === themeId) ?? STYLEGUIDE_THEMES[0],
    [themeId],
  );

  useEffect(() => {
    applyThemePreset(activeTheme, mode);
  }, [activeTheme, mode]);

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 py-6">
        <Header
          activeTheme={activeTheme}
          mode={mode}
          onModeChange={setMode}
          onThemeChange={setThemeId}
          themeId={themeId}
        />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <TokenPanel />
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <ShellFixture />
            <ComponentFixture />
            <ChatFixture />
            <PluginFixture />
            <DashboardFixture />
          </div>
        </div>
        <PrototypeArchive />
      </div>
    </main>
  );
}

interface HeaderProps {
  activeTheme: ThemePreset;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onThemeChange: (themeId: string) => void;
  themeId: string;
}

function Header({ activeTheme, mode, onModeChange, onThemeChange, themeId }: HeaderProps) {
  return (
    <header className="grid gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm lg:grid-cols-[1fr_auto]">
      <div className="max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-primary-border bg-brand-primary-faint px-3 py-1 text-xs font-medium text-brand-primary">
          <LayoutDashboard className="size-3.5" />
          Sero styleguide
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Theme tokens under product pressure.
        </h1>
        <p className="mt-2 max-w-[70ch] text-base leading-6 text-muted-foreground">
          This app isolates the Sero token contract so brand, status, code, and
          surface colours can be tested before touching desktop, web remote, or plugins.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-3 lg:min-w-80">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="theme-select">Theme preset</label>
        <select
          id="theme-select"
          value={themeId}
          onChange={(event) => onThemeChange(event.currentTarget.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-base outline-none focus:border-ring"
        >
          {STYLEGUIDE_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>{theme.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant={mode === 'light' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('light')}>
            <Sun className="size-4" />
            Light
          </Button>
          <Button variant={mode === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('dark')}>
            <Moon className="size-4" />
            Dark
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{activeTheme.description}</p>
      </div>
    </header>
  );
}

function TokenPanel() {
  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <Card>
        <CardHeader>
          <CardTitle>Token contract</CardTitle>
          <CardDescription>Brand tokens must not masquerade as status or code tokens.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tokenRows.map(([token, label, className]) => (
            <div key={token} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
              <div>
                <p className="text-base font-medium">{label}</p>
                <code className="text-xs text-muted-foreground">{token}</code>
              </div>
              <div className={`h-10 w-24 rounded-lg ${className}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Semantic checks</CardTitle>
          <CardDescription>The diagnostic theme should make misuse obvious.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-base">
          <CheckLine label="Primary action" className="text-brand-primary" />
          <CheckLine label="Section accent" className="text-brand-secondary" />
          <CheckLine label="Successful run" className="text-status-success" />
          <CheckLine label="Code label" className="text-[var(--accent-code)]" />
        </CardContent>
      </Card>
    </aside>
  );
}

function CheckLine({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={className}>Sample</span>
    </div>
  );
}

function ShellFixture() {
  const nav = [
    ['Dashboard', LayoutDashboard, true],
    ['Explorer', PanelLeft, false],
    ['Admin', Terminal, false],
    ['Git', GitBranch, false],
  ] as const;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Desktop shell</CardTitle>
        <CardDescription>Primary brand handles active UI and metrics. Status stays separate.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid min-h-96 overflow-hidden rounded-2xl border border-border bg-background md:grid-cols-[170px_1fr]">
          <nav className="border-r border-border bg-card p-3">
            <p className="mb-3 px-2 text-sm font-bold uppercase tracking-wider text-brand-secondary">Apps</p>
            <div className="space-y-1">
              {nav.map(([label, Icon, active]) => (
                <button
                  key={label}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-base transition-colors ${
                    active ? 'bg-brand-primary-faint text-brand-primary ring-1 ring-brand-primary-border' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </nav>
          <section className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-base font-medium">RemoteDevServers</p>
                <p className="text-xs text-muted-foreground">Theme-safe workspace shell</p>
              </div>
              <div className="flex items-center gap-3 text-base">
                <span className="inline-flex items-center gap-1 text-status-success"><Gauge className="size-4" /> 32%</span>
                <span className="inline-flex items-center gap-1 text-brand-primary"><Coins className="size-4" /> $0.0070</span>
              </div>
            </div>
            <div className="grid flex-1 gap-3 p-4 md:grid-cols-2">
              <SurfaceCard title="Base" className="bg-background" />
              <SurfaceCard title="Card" className="bg-card" />
              <SurfaceCard title="Elevated" className="bg-popover" />
              <SurfaceCard title="Muted" className="bg-muted" />
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function SurfaceCard({ className, title }: { className: string; title: string }) {
  return (
    <div className={`rounded-xl border border-border p-4 ${className}`}>
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">Surface contrast and border visibility.</p>
    </div>
  );
}

function ComponentFixture() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared components</CardTitle>
        <CardDescription>shadcn primitives bridged to Sero tokens.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Brand</Badge>
          <Badge variant="secondary">Neutral</Badge>
          <Badge variant="outline" className="border-brand-secondary-border bg-brand-secondary-faint text-brand-secondary">Secondary accent</Badge>
          <Badge variant="outline" className="border-status-success/20 bg-status-success/10 text-status-success">Success</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Ask Sero anything" />
          <Input placeholder="Focused border uses --border-focus" />
        </div>
        <Textarea placeholder="Themeable textarea with muted placeholder text" />
        <Alert className="border-brand-secondary-border bg-brand-secondary-faint">
          <Code2 className="size-4 text-brand-secondary" />
          <AlertTitle>Code accent is separate</AlertTitle>
          <AlertDescription>Use brand-secondary for UI labels. Reserve accent-code for syntax.</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function ChatFixture() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent conversation</CardTitle>
        <CardDescription>Message bubbles, tool states, prompt input, and loading.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <Message from="user" text="Summarise the theme token issues." />
          <Message from="agent" text="Brand accents should use brand tokens. Success, warning, error, and code tokens stay semantic." />
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin text-brand-primary" />
              Testing desktop shell fixture
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-7/12" />
            </div>
          </div>
          <Separator />
          <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-2">
            <Textarea className="min-h-16 border-0 bg-transparent shadow-none" placeholder="Ask Sero anything" />
            <Button size="icon"><Send className="size-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Message({ from, text }: { from: 'agent' | 'user'; text: string }) {
  const isUser = from === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <Avatar icon={<Bot className="size-4" />} className="bg-brand-secondary-faint text-brand-secondary" />}
      <p className={`max-w-[75%] rounded-2xl px-3 py-2 text-base leading-6 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}>
        {text}
      </p>
    </div>
  );
}

function Avatar({ className, icon }: { className: string; icon: ReactNode }) {
  return <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${className}`}>{icon}</div>;
}

function PluginFixture() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plugin panel</CardTitle>
        <CardDescription>Federated surfaces should inherit the same token names.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid min-h-96 overflow-hidden rounded-2xl border border-border bg-background md:grid-cols-[150px_1fr]">
          <nav className="border-r border-border bg-card p-3">
            {['Resources', 'Config', 'System'].map((label, index) => (
              <div key={label} className="mb-4">
                <p className="mb-1.5 text-sm font-bold uppercase tracking-wider text-brand-secondary">{label}</p>
                <button type="button" className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${index === 1 ? 'border-l-2 border-l-primary bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}>
                  {index === 0 ? 'Agents' : index === 1 ? 'Settings' : 'Logs'}
                </button>
              </div>
            ))}
          </nav>
          <section className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-base font-medium">Plugin health</p>
                <p className="text-xs text-muted-foreground">Status tones are not brand tones.</p>
              </div>
              <Badge variant="outline" className="border-status-success/20 bg-status-success/10 text-status-success">
                <CheckCircle2 className="size-3" /> Running
              </Badge>
            </div>
            <div className="grid gap-3">
              <PluginRow icon={<CheckCircle2 className="size-4 text-status-success" />} title="Admin app loaded" tone="success" />
              <PluginRow icon={<CircleAlert className="size-4 text-status-warning" />} title="Plugin missing optional config" tone="warning" />
              <PluginRow icon={<Terminal className="size-4 text-brand-primary" />} title="Open logs" tone="brand" />
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function PluginRow({ icon, title, tone }: { icon: ReactNode; title: string; tone: 'success' | 'warning' | 'brand' }) {
  const toneClass = {
    success: 'border-status-success/20 bg-status-success/5',
    warning: 'border-status-warning/20 bg-status-warning/5',
    brand: 'border-brand-primary-border bg-brand-primary-faint',
  }[tone];

  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${toneClass}`}>
      {icon}
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">Uses a named semantic tone.</p>
      </div>
    </div>
  );
}
