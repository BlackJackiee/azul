import type { InstanceData } from "./ipc/messages.js";
export interface SnapshotOptions {
    sourceDir: string;
    destPrefix?: string[];
    skipSymlinks?: boolean;
}
export declare class SnapshotBuilder {
    private sourceDir;
    private destPrefix;
    private skipSymlinks;
    private folderMap;
    private results;
    private scriptPaths;
    constructor(options: SnapshotOptions);
    build(): Promise<InstanceData[]>;
    private walk;
    private ensureFolder;
    private relativeSegments;
    private makeGuid;
    private pathKey;
}
//# sourceMappingURL=snapshot.d.ts.map