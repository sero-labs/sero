interface HostApi {
  sero?: {
    appControl?: {
      openFile?: (workspaceId: string, filePath: string) => Promise<boolean>;
    };
    shell?: {
      showItemInFolder?: (fullPath: string) => Promise<void>;
    };
    editor?: {
      delete?: (workspaceId: string, itemPath: string) => Promise<boolean>;
    };
  };
}

function getHost(): NonNullable<HostApi['sero']> {
  const sero = (window as unknown as HostApi).sero;
  if (!sero) throw new Error('window.sero is unavailable');
  return sero;
}

export async function openWorkspaceFile(workspaceId: string, filePath: string): Promise<boolean> {
  return getHost().appControl?.openFile?.(workspaceId, filePath) ?? false;
}

export async function revealInFinder(fullPath: string): Promise<void> {
  await getHost().shell?.showItemInFolder?.(fullPath);
}

export async function deleteWorkspaceFile(workspaceId: string, filePath: string): Promise<boolean> {
  return getHost().editor?.delete?.(workspaceId, filePath) ?? false;
}
