interface BuildOptions {
    syncDir?: string;
    rojoMode?: boolean;
    rojoProjectFile?: string;
    applySourcemapProperties?: boolean;
    useSourcemapAsSource?: boolean;
    sourcemapPath?: string;
    destructive?: boolean;
}
export declare class BuildCommand {
    private ipc;
    private syncDir;
    private rojoMode;
    private rojoProjectFile?;
    private applySourcemapProperties;
    private useSourcemapAsSource;
    private sourcemapPath;
    private destructive;
    constructor(options?: BuildOptions);
    run(): Promise<void>;
}
export {};
//# sourceMappingURL=build.d.ts.map