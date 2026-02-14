/**
 * App context — provided by Sero's shell when mounting a federated app.
 *
 * Contains the app's identity, workspace info, and the resolved state
 * file path so hooks know where to read/write.
 */
export interface AppContextValue {
    /** App identifier (e.g. "todo"). */
    appId: string;
    /** Absolute path to the workspace root. */
    workspacePath: string;
    /** Absolute path to the state file on disk. */
    stateFilePath: string;
}
export declare const AppContext: import("react").Context<AppContextValue | null>;
/**
 * Provider component — wraps federated app components.
 *
 * Usage (in Sero shell):
 *   <AppProvider value={{ appId, workspacePath, stateFilePath }}>
 *     <FederatedTodoApp />
 *   </AppProvider>
 */
export declare const AppProvider: import("react").Provider<AppContextValue | null>;
