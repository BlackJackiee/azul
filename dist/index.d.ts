/**
 * Main orchestrator for the Azul daemon
 */
export declare class SyncDaemon {
    private ipc;
    private httpServer;
    private tree;
    private fileWriter;
    private fileWatcher;
    private sourcemapGenerator;
    private batchDepth;
    private batchNeedsSourcemapRegen;
    private stopPromise;
    constructor();
    /**
     * Set up all event handlers
     */
    private setupHandlers;
    /**
     * Handle incoming messages from Studio
     */
    private handleStudioMessage;
    /**
     * Handle full snapshot from Studio
     */
    private handleFullSnapshot;
    /**
     * Handle script source change
     */
    private handleScriptChanged;
    /**
     * Handle instance update (rename, move, etc.)
     */
    private handleInstanceUpdated;
    /**
     * Handle instance deletion
     */
    private handleDeleted;
    /**
     * Handle file change from filesystem
     */
    private handleFileChange;
    /**
     * Regenerate the sourcemap
     */
    private regenerateSourcemap;
    /**
     * Start the daemon
     */
    start(): void;
    /**
     * Stop the daemon
     */
    stop(): Promise<void>;
    private isScriptClass;
    /**
     * Delete files under syncDir that are not mapped to any instance (opt-in).
     */
    private cleanupOrphanFiles;
}
//# sourceMappingURL=index.d.ts.map