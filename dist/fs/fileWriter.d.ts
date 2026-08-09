import { TreeNode } from "./treeManager.js";
/**
 * Mapping of GUID to file path
 */
export interface FileMapping {
    guid: string;
    filePath: string;
    className: string;
}
/**
 * Handles writing the virtual tree to the filesystem
 */
export declare class FileWriter {
    private baseDir;
    private fileMappings;
    private pathToGuid;
    constructor(baseDir?: string);
    /**
     * Write all script nodes to the filesystem
     */
    writeTree(nodes: Map<string, TreeNode>): void;
    /**
     * Write multiple scripts in a batch for improved I/O efficiency
     */
    writeBatch(nodes: TreeNode[]): void;
    /**
     * Write or update a single script
     */
    writeScript(node: TreeNode): string | null;
    /**
     * Delete a script file
     */
    deleteScript(guid: string): boolean;
    /**
     * Delete a script file by path even if the mapping is missing
     */
    deleteFilePath(filePath: string): boolean;
    /**
     * Get the filesystem path for a node
     */
    getFilePath(node: TreeNode): string;
    /**
     * Get the filesystem path for a node, with optional collision map for batch operations
     */
    private getFilePathWithCollisionMap;
    /**
     * Get the appropriate filename for a script node
     */
    private getScriptFileName;
    /**
     * Keep Script/LocalScript suffixes when disambiguating collisions.
     */
    private getDisambiguatedScriptFileName;
    /**
     * Sanitize a name for use in filesystem
     */
    private sanitizeName;
    /**
     * Check if a node is a script
     */
    private isScriptNode;
    /**
     * Ensure a directory exists
     */
    private ensureDirectory;
    /**
     * Internal helper to remove a file and clean mapping
     */
    private deleteFilePathInternal;
    /**
     * Find the GUID that currently owns a file path, if any
     */
    private findGuidByFilePath;
    /**
     * Get path relative to base directory
     */
    private getRelativePath;
    /**
     * Get file mapping by GUID
     */
    getMapping(guid: string): FileMapping | undefined;
    /**
     * Get GUID by file path
     */
    getGuidByPath(filePath: string): string | undefined;
    /**
     * Get all file mappings
     */
    getAllMappings(): Map<string, FileMapping>;
    /**
     * Get the base directory
     */
    getBaseDir(): string;
    /**
     * Clean up empty directories
     */
    cleanupEmptyDirectories(): void;
    private cleanupEmptyDirsRecursive;
    /**
     * Walk up from a directory and remove empty parents until baseDir is reached.
     */
    private cleanupParentsIfEmpty;
}
//# sourceMappingURL=fileWriter.d.ts.map