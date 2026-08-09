/**
 * Configuration for the sync daemon
 */
export interface AzulConfig {
    /** WebSocket server port */
    port: number;
    /** Enable debug mode */
    debugMode: boolean;
    /** Directory where synced files will be stored (relative to project root) */
    syncDir: string;
    /** Path where sourcemap.json is written (relative to project root) */
    sourcemapPath: string;
    /** File extension for scripts */
    scriptExtension: string;
    /** Debounce delay for file watching (ms) */
    fileWatchDebounce: number;
    /** Delete unmapped files in syncDir after a new connection/full snapshot */
    deleteOrphansOnConnect: boolean;
    /** Suffix ModuleScript names with ".module"? */
    suffixModuleScripts: boolean;
    /** Check for Daemon updates? (Uses NPM API) */
    checkForUpdates: boolean;
}
export declare const defaultConfig: Readonly<AzulConfig>;
export declare const config: AzulConfig;
export declare function getUserConfigPath(): string;
export declare function initializeConfig(): void;
//# sourceMappingURL=config.d.ts.map