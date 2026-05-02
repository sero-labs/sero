export interface UiResourceCsp {
  scriptDomains?: string[];
  styleDomains?: string[];
  fontDomains?: string[];
  imgDomains?: string[];
  mediaDomains?: string[];
  connectDomains?: string[];
  frameDomains?: string[];
  workerDomains?: string[];
  baseUriDomains?: string[];
}

export interface UiResourcePermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}

export interface UiResourceMeta {
  csp?: UiResourceCsp;
  permissions?: UiResourcePermissions;
  domain?: string;
  prefersBorder?: boolean;
}

export interface UiResourceContent {
  uri: string;
  html: string;
  mimeType: string;
  meta: UiResourceMeta;
}

export interface UiToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}
