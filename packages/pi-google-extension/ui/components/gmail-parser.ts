/**
 * gmail-parser — decode Gmail API raw message payloads.
 *
 * Gmail API returns headers in payload.headers[], body parts in
 * payload.parts[].body.data (base64url-encoded). This module
 * extracts human-readable fields from that structure.
 */

import type { GmailMessage } from '../../shared/types';

/** Extract a header value by name (case-insensitive). */
function getHeader(headers: { name: string; value: string }[], name: string): string {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value ?? '';
}

/** Decode base64url string to UTF-8 text. */
function decodeBase64Url(data: string): string {
  try {
    // base64url → base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    // Decode to binary bytes, then UTF-8
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** Recursively find the best body part (prefer text/html, fallback text/plain). */
function findBodyParts(
  payload: any,
): { text: string; html: string } {
  const result = { text: '', html: '' };
  if (!payload) return result;

  const mimeType: string = payload.mimeType ?? '';
  const bodyData: string = payload.body?.data ?? '';

  // Leaf node with data
  if (bodyData) {
    const decoded = decodeBase64Url(bodyData);
    if (mimeType === 'text/html') result.html = decoded;
    else if (mimeType === 'text/plain') result.text = decoded;
    return result;
  }

  // Recurse into parts
  const parts: any[] = payload.parts ?? [];
  for (const part of parts) {
    const sub = findBodyParts(part);
    if (sub.html && !result.html) result.html = sub.html;
    if (sub.text && !result.text) result.text = sub.text;
  }

  return result;
}

/** Decode HTML entities in snippet (e.g. &#39; → '). */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse a raw Gmail API message object into our GmailMessage shape.
 */
export function parseGmailMessage(raw: any, fallbackThreadId: string): GmailMessage {
  const payload = raw.payload ?? {};
  const headers: { name: string; value: string }[] = payload.headers ?? [];
  const { text, html } = findBodyParts(payload);
  const snippet = decodeHtmlEntities(raw.snippet ?? '');

  return {
    id: raw.id ?? '',
    threadId: raw.threadId ?? fallbackThreadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    body: text || snippet,
    bodyHtml: html,
    snippet,
  };
}
