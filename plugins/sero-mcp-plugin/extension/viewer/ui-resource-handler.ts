import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServerManager } from '../manager/server-manager';
import type { UiResourceContent, UiResourceMeta } from './types';

interface ResourceContentRecord {
  uri?: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  _meta?: Record<string, unknown>;
}

export class UiResourceHandler {
  constructor(private readonly manager: McpServerManager) {}

  async readUiResource(serverName: string, resourceUri: string): Promise<UiResourceContent> {
    if (!resourceUri.startsWith('ui://')) {
      throw new Error(`Resource "${resourceUri}" is not an MCP UI resource.`);
    }

    const result = await this.manager.readResource(serverName, resourceUri);
    const content = selectContent(result, resourceUri);
    const mimeType = content.mimeType?.trim() || RESOURCE_MIME_TYPE;
    if (!isHtmlMimeType(mimeType)) {
      throw new Error(`Resource "${resourceUri}" is not HTML and cannot be hosted as an MCP UI.`);
    }

    const html = toHtml(content);
    if (!html.trim()) {
      throw new Error(`Resource "${resourceUri}" did not return any HTML.`);
    }

    return {
      uri: content.uri ?? resourceUri,
      html,
      mimeType,
      meta: mergeUiMeta(content._meta, this.getListResourceMeta(serverName, resourceUri)),
    };
  }

  private getListResourceMeta(serverName: string, resourceUri: string): Record<string, unknown> | undefined {
    const connection = this.manager.getConnection(serverName);
    const resource = connection?.resources.find((entry) => entry.uri === resourceUri);
    return resource?._meta && typeof resource._meta === 'object' ? resource._meta : undefined;
  }
}

function selectContent(result: ReadResourceResult, preferredUri: string): ResourceContentRecord {
  const contents = (result.contents ?? []) as ResourceContentRecord[];
  if (contents.length === 0) {
    throw new Error(`No contents were returned for resource "${preferredUri}".`);
  }

  return contents.find((content) => content.uri === preferredUri) ?? contents[0];
}

function isHtmlMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('text/html') || normalized === RESOURCE_MIME_TYPE.toLowerCase();
}

function toHtml(content: ResourceContentRecord): string {
  if (typeof content.text === 'string') {
    return content.text;
  }
  if (typeof content.blob === 'string') {
    return Buffer.from(content.blob, 'base64').toString('utf8');
  }
  throw new Error(`UI resource ${content.uri ?? '(unknown)'} did not include text or blob content.`);
}

function mergeUiMeta(
  contentMeta: Record<string, unknown> | undefined,
  listMeta: Record<string, unknown> | undefined,
): UiResourceMeta {
  const nextContentMeta = extractUiMeta(contentMeta);
  const nextListMeta = extractUiMeta(listMeta);
  return {
    csp: nextContentMeta.csp ?? nextListMeta.csp,
    permissions: nextContentMeta.permissions ?? nextListMeta.permissions,
    domain: nextContentMeta.domain ?? nextListMeta.domain,
    prefersBorder: nextContentMeta.prefersBorder ?? nextListMeta.prefersBorder,
  };
}

function extractUiMeta(meta: Record<string, unknown> | undefined): UiResourceMeta {
  if (!meta || typeof meta !== 'object') {
    return {};
  }

  const ui = meta.ui;
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) {
    return {};
  }

  const nextUi = ui as Record<string, unknown>;
  return {
    csp: nextUi.csp && typeof nextUi.csp === 'object' && !Array.isArray(nextUi.csp)
      ? nextUi.csp as UiResourceMeta['csp']
      : undefined,
    permissions: nextUi.permissions && typeof nextUi.permissions === 'object' && !Array.isArray(nextUi.permissions)
      ? nextUi.permissions as UiResourceMeta['permissions']
      : undefined,
    domain: typeof nextUi.domain === 'string' ? nextUi.domain : undefined,
    prefersBorder: typeof nextUi.prefersBorder === 'boolean' ? nextUi.prefersBorder : undefined,
  };
}
