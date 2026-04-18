export interface AppToolTextContent {
  type: 'text';
  text: string;
}

export interface AppToolImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type AppToolContentBlock =
  | AppToolTextContent
  | AppToolImageContent;

export interface AppToolResult {
  text: string;
  content: AppToolContentBlock[];
  details: Record<string, unknown> | null;
  isError: boolean;
}
