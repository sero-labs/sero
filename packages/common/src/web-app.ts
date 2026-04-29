export type WebAppAction =
  | 'clear-history'
  | 'add-bookmark'
  | 'remove-bookmark'
  | 'delete-download';

export type WebAppRequest =
  | { action: 'clear-history' }
  | {
    action: 'add-bookmark';
    url: string;
    title?: string;
    description?: string;
    tags?: string[];
  }
  | {
    action: 'remove-bookmark';
    idOrUrl: string;
  }
  | {
    action: 'delete-download';
    downloadId: string;
    relativePath?: string;
    completed?: boolean;
  };

export interface WebAppActionSuccess<A extends WebAppAction = WebAppAction> {
  ok: true;
  action: A;
}

export interface WebAppActionFailure<A extends WebAppAction = WebAppAction> {
  ok: false;
  action: A;
  message: string;
}

export type WebAppActionResult =
  | WebAppActionSuccess
  | WebAppActionFailure;

export interface SeroWebAppBridge {
  run(workspaceId: string, params: WebAppRequest): Promise<WebAppActionResult>;
}
