export type FileChangeHandler = (filePath: string, source: string) => void;
/**
 * Watches the filesystem for changes and notifies handlers
 */
export declare class FileWatcher {
    private watcher;
    private changeHandler;
    private debounceTimers;
    private suppressedUntil;
    private expectedContents;
    /**
     * Start watching a directory
     */
    watch(directory: string): void;
    /**
     * Handle a file change with debouncing
     */
    private handleFileChange;
    /**
     * Process a file change after debouncing
     */
    private processFileChange;
    /**
     * Check if a file is a script file
     */
    private isScriptFile;
    /**
     * Register a handler for file changes
     */
    onChange(handler: FileChangeHandler): void;
    /**
     * Suppress the next change event for a specific file path (normalized)
     */
    suppressNextChange(filePath: string, expectedSource?: string): void;
    /**
     * Stop watching
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=watcher.d.ts.map