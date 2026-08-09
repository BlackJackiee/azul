interface PushOptions {
    source?: string;
    destination?: string;
    mappings?: Array<{
        source: string;
        destination: string;
    }>;
    destructive?: boolean;
    missingOnly?: boolean;
    usePlaceConfig?: boolean;
    rojoMode?: boolean;
    rojoProjectFile?: string;
    applySourcemapProperties?: boolean;
    useSourcemapAsSource?: boolean;
    sourcemapPath?: string;
}
export declare class PushCommand {
    private ipc;
    private options;
    private sourcemapPath;
    private sourcemapIndex;
    private sourcemapIndexByPath;
    constructor(options?: PushOptions);
    run(): Promise<boolean>;
    private sendPushSnapshot;
    private filterExistingInstances;
    private buildPushInstancesFromFile;
    private buildRojoInstances;
    private dedupeRojoInstances;
    private isScriptClassName;
    /**
     * Determines push mappings to use based on CLI options and/or place config from Studio.
     * Priority:
     * 1. CLI-provided source/destination
     * 2. Place config provided by Studio (if --use-place-config is not false)
     * @returns
     */
    private collectMappings;
    /**
     * Parses a destination string into path segments, trimming whitespace and ignoring empty segments.
     * Accepts dot, forward slash, or backslash as separators for user convenience.
     * @param input
     * @returns
     */
    private parseDestination;
    /**
     * Builds instances for a push mapping using a specified sourcemap as the source of truth.
     * @param sourceDir
     * @param destSegments
     * @param sourcemapPath
     * @returns
     */
    private buildPushInstancesFromSourcemap;
    private resolveMappingSourcemapPath;
    /**
     * Retrieves the property index for a given sourcemap path, loading it if necessary.
     * @param sourcemapPath The file path to the sourcemap to load the index for.
     * @returns The property index for the specified sourcemap.
     */
    private getSourcemapIndexForPath;
    private inferSourcePrefixFromPath;
    private pathStartsWith;
    private resolveRojoProjectFiles;
    /**
     * Breadth-first search for all default.project.json under a root.
     * Skips common vendor/ignored folders.
     */
    private findProjectJsons;
    private collectLooseScripts;
    private ensureFolder;
    /**
     * Normalize source path strings from config, preferring the raw value but
     * attempting obvious fixes (e.g., accidental leading '.' before a folder).
     */
    private expandSourceCandidates;
    private waitForPushConfig;
}
export {};
//# sourceMappingURL=push.d.ts.map