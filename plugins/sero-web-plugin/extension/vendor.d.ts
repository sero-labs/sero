declare module 'better-sqlite3' {
  interface Statement<TRow = Record<string, unknown>> {
    get(): TRow | undefined;
    all(): TRow[];
  }

  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
  }

  class Database {
    constructor(path: string, options?: DatabaseOptions);
    prepare(sql: string): Statement;
    close(): void;
  }

  export = Database;
}

declare module 'turndown' {
  interface TurndownServiceOptions {
    headingStyle?: 'setext' | 'atx';
    codeBlockStyle?: 'indented' | 'fenced';
  }

  export default class TurndownService {
    constructor(options?: TurndownServiceOptions);
    turndown(input: string): string;
  }
}
