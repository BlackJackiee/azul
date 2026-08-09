interface PackOptions {
    outputPath?: string;
    sources?: string[];
    scriptsAndDescendantsOnly?: boolean;
}
export declare class PackCommand {
    private ipc;
    private outputPath;
    private sourcePaths;
    private scriptsAndDescendantsOnly;
    constructor(options?: PackOptions);
    run(): Promise<boolean>;
    private selectSnapshotSources;
    private requestSnapshot;
    private readExistingSourcemap;
    private regenerateSourcemap;
    private packIntoSourcemap;
    private writeSourcemap;
    private pathClassKey;
    private pathsEqual;
    private pathStartsWith;
}
export {};
//# sourceMappingURL=pack.d.ts.map