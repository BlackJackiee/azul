import { TreeNode } from "../fs/treeManager.js";
import { FileMapping } from "../fs/fileWriter.js";
/**
 * Rojo-compatible sourcemap tree structure
 */
interface SourcemapNode {
    name: string;
    className: string;
    guid?: string;
    filePaths?: string[];
    children?: SourcemapNode[];
}
interface SourcemapRoot {
    name: string;
    className: string;
    children: SourcemapNode[];
}
/**
 * Generates Rojo-compatible sourcemap.json for luau-lsp
 */
export declare class SourcemapGenerator {
    constructor();
    private sortTreeNodes;
    private getDuplicatePaths;
    private findRootNode;
    /**
     * Incrementally upsert a subtree into the sourcemap, optionally removing the old path first.
     * Falls back to full regeneration if anything goes wrong.
     */
    upsertSubtree(node: TreeNode, allNodes: Map<string, TreeNode>, fileMappings: Map<string, FileMapping>, outputPath: string, oldPath?: string[], isNew?: boolean): void;
    /**
     * Generate complete sourcemap from tree and file mappings
     */
    generate(nodes: Map<string, TreeNode>, fileMappings: Map<string, FileMapping>): SourcemapRoot;
    /**
     * Write sourcemap to file
     */
    write(sourcemap: SourcemapRoot, outputPath?: string): void;
    /**
     * Check if two paths match
     */
    private pathsMatch;
    /**
     * Build a SourcemapNode from a TreeNode, recursively including children.
     */
    private buildNodeFromTree;
    /**
     * Read an existing sourcemap or create a new root.
     */
    private readOrCreateRoot;
    /**
     * Insert or replace a subtree at the given path, creating intermediate parents as needed.
     */
    private insertNodeAtPath;
    private findNodeByPath;
    /**
     * Generate and write sourcemap in one call
     */
    generateAndWrite(nodes: Map<string, TreeNode>, fileMappings: Map<string, FileMapping>, outputPath?: string): void;
    /**
     * Remove a node (and now-empty ancestors) from an existing sourcemap file by path.
     * Falls back to full regeneration if the file is missing or malformed.
     */
    prunePath(pathSegments: string[], outputPath: string, nodes: Map<string, TreeNode>, fileMappings: Map<string, FileMapping>, targetClassName?: string, targetGuid?: string): boolean;
    /**
     * Remove node matching path; prune empty parents.
     */
    private removePath;
    /**
     * Validate that all paths in sourcemap point to existing files
     */
    validate(sourcemap: SourcemapRoot): {
        valid: boolean;
        errors: string[];
    };
}
export {};
//# sourceMappingURL=generator.d.ts.map