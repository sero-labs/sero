/**
 * useAppInfo — read-only context about the current app and workspace.
 */
export interface AppInfo {
    appId: string;
    workspacePath: string;
}
export declare function useAppInfo(): AppInfo;
