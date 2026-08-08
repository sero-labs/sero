import { Component, Suspense, useId } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import type { ComponentContribution } from '@sero-ai/common';
import { PluginStyleScope } from '@sero-ai/ui/plugin-style-scope';
import type { SeroAppManifest } from '@/types/ipc';
import { getFederatedComponent } from '@/lib/federation-registry';
import { useAppRuntimeMount } from './useAppRuntimeMount';

interface FederatedContributionMountProps {
  manifest: SeroAppManifest;
  contribution: ComponentContribution;
  contributionKey: string;
  loading: ReactNode;
  unavailable: ReactNode;
  missingWorkspace?: ReactNode;
}

interface ContributionErrorBoundaryProps {
  identity: string;
  fallback: ReactNode;
  children: ReactNode;
}

class ContributionErrorBoundary extends Component<
  ContributionErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[contribution:${this.props.identity}]`, error, info);
  }

  componentDidUpdate(previous: ContributionErrorBoundaryProps): void {
    if (previous.identity !== this.props.identity && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Mount one validated federated component with the standard plugin runtime boundary. */
export function FederatedContributionMount({
  manifest,
  contribution,
  contributionKey,
  loading,
  unavailable,
  missingWorkspace = unavailable,
}: FederatedContributionMountProps) {
  const { contextValue, status } = useAppRuntimeMount(manifest);
  const surfaceId = useId();

  if (status === 'loading-workspace') return loading;
  if (status === 'missing-workspace') return missingWorkspace;
  if (!manifest.uiEntry && !manifest.remoteEntryOverride && !manifest.devPort) return unavailable;

  const LazyComponent = getFederatedComponent(
    manifest.id,
    contribution.component,
    manifest.devPort,
    manifest.remoteEntryOverride,
  );
  if (!LazyComponent) return unavailable;

  return (
    <ContributionErrorBoundary identity={contributionKey} fallback={unavailable}>
      <AppProvider value={contextValue}>
        <PluginStyleScope pluginId={manifest.id} surfaceId={surfaceId}>
          <div
            data-sero-plugin={manifest.id}
            data-sero-contribution={contribution.id}
            data-sero-extension-point={contribution.extensionPoint}
            className="contents"
          >
            <Suspense fallback={loading}>
              <LazyComponent />
            </Suspense>
          </div>
        </PluginStyleScope>
      </AppProvider>
    </ContributionErrorBoundary>
  );
}
