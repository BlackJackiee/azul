import type { InstanceData } from "../../ipc/messages.js";
export interface RojoSnapshotOptions {
    projectFile?: string;
    cwd?: string;
    destPrefix?: string[];
}
/**
 * Builds InstanceData[] from a Rojo-style default.project.json (compat layer).
 */
export declare class RojoSnapshotBuilder {
    private projectFile;
    private cwd;
    private emittedFolders;
    private moduleContainers;
    private destPrefix;
    private ignoreMatchers;
    constructor(options?: RojoSnapshotOptions);
    build(): Promise<InstanceData[]>;
    private loadProjectFrom;
    private prepareIgnoreMatchers;
    private globToRegex;
    private isIgnored;
    private walkTree;
    parseModelFile(filePath: string, destPath: string[]): Promise<InstanceData[]>;
    private parseModelNode;
    private emitNode;
    private resolveClassName;
    private walkDirectory;
    /**
     * Ensure a Folder chain exists for the given path.
     */
    private ensureFolder;
    /**
     * Finds an init script (init.lua, init.server.luau, etc.) in a directory.
     * @param dirPath
     * @returns The file name and source of the init script, or null if not found.
     */
    private findInit;
    /**
     * Returns a list of potential init script filenames.
     */
    private getInitCandidates;
    private isJsonModuleFile;
    private readJsonModuleSource;
    private jsonToLuau;
    private isLuaIdentifier;
    private exists;
    private pathKind;
    private makeGuid;
}
//# sourceMappingURL=builder.d.ts.map