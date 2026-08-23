import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@sero-ai/ui/components/ui/resizable';
import { useOrchestratorState } from '../lib/orchestrator-state';

type LayoutMode = 'narrow' | 'roster' | 'rosterAndDetails';

interface RoomDesktopLayoutProps {
  roster: ReactNode;
  children: ReactNode;
  details?: ReactNode;
}

const ROSTER_MIN = 200;
const ROSTER_MAX = 360;
const CONTENT_MIN = 500;
const DETAILS_MIN = 280;
const DETAILS_MAX = 480;

export function RoomDesktopLayout({ roster, children, details }: RoomDesktopLayoutProps) {
  const container = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<LayoutMode>('narrow');
  const { state, updateState } = useOrchestratorState();
  const hasDetails = Boolean(details);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const updateMode = () => {
      const width = element.clientWidth;
      setMode(width >= 1200 && hasDetails ? 'rosterAndDetails' : width >= 900 ? 'roster' : 'narrow');
    };
    const observer = new ResizeObserver(updateMode);
    observer.observe(element);
    updateMode();
    return () => observer.disconnect();
  }, [hasDetails]);

  const layout = mode === 'rosterAndDetails'
    ? state.ui?.roomPanelLayouts?.rosterAndDetails
    : state.ui?.roomPanelLayouts?.roster;

  return (
    <div ref={container} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {mode === 'narrow' ? children : (
        <ResizablePanelGroup
          id={`room-${mode}-panels`}
          orientation="horizontal"
          defaultLayout={layout}
          className="min-w-0 flex-1"
          onLayoutChanged={(next, metadata) => {
            if (!metadata.isUserInteraction) return;
            updateState((current) => ({
              ...current,
              ui: {
                ...current.ui,
                roomPanelLayouts: {
                  ...current.ui?.roomPanelLayouts,
                  [mode]: next,
                },
              },
            }));
          }}
        >
          <ResizablePanel id="room-roster" defaultSize="264px" minSize={ROSTER_MIN} maxSize={ROSTER_MAX} className="flex min-h-0 overflow-hidden">
            {roster}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="room-content" minSize={CONTENT_MIN} className="flex min-h-0 min-w-0 overflow-hidden">
            {children}
          </ResizablePanel>
          {mode === 'rosterAndDetails' && details && (
            <>
              <ResizableHandle />
              <ResizablePanel id="room-details" defaultSize="320px" minSize={DETAILS_MIN} maxSize={DETAILS_MAX} className="flex min-h-0 overflow-hidden">
                {details}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );
}
