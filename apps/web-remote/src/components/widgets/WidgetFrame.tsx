/**
 * One remote widget, in a frame that survives its failures.
 *
 * A plugin widget is third-party code. It can fail to load, or throw
 * while rendering. Either way the frame keeps the rest of the dashboard
 * alive and says which widget broke.
 *
 * The frame also supplies the app context the widget expects. What the
 * desktop puts in `stateFilePath` is an opaque key here.
 */

import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import { Card, CardContent, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Skeleton } from '@sero-ai/ui/components/ui/skeleton';
import { widgetComponent } from '@/lib/federation';
import type { RemoteWidget } from '@/stores/widgets';

interface BoundaryProps {
  name: string;
  children: ReactNode;
}

interface BoundaryState {
  message: string | null;
}

class WidgetBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : 'The widget failed.' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[widgets] ${this.props.name} failed`, error, info);
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;

    return (
      <p className="text-sm text-muted-foreground">
        This widget did not load. {this.state.message}
      </p>
    );
  }
}

interface WidgetFrameProps {
  widget: RemoteWidget;
  /** The workspace this widget reads. Empty for a global widget. */
  workspaceId: string;
}

export function WidgetFrame({ widget, workspaceId }: WidgetFrameProps) {
  const Widget = widgetComponent(widget);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{widget.name}</CardTitle>
        <p className="text-xs text-muted-foreground">{widget.appName}</p>
      </CardHeader>
      <CardContent>
        <WidgetBoundary name={`${widget.appId}/${widget.widgetId}`}>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <AppProvider
              value={{
                appId: widget.appId,
                workspaceId,
                // A browser has no file system. A widget that reads a
                // path directly finds nothing, which is the point.
                workspacePath: '',
                stateFilePath: widget.stateKey,
              }}
            >
              <Widget />
            </AppProvider>
          </Suspense>
        </WidgetBoundary>
      </CardContent>
    </Card>
  );
}
