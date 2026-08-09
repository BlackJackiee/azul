import { InstanceData } from "../ipc/messages.js";
/**
 * Represents a node in the virtual DataModel tree
 */
export interface TreeNode {
    guid: string;
    className: string;
    name: string;
    path: string[];
    parentGuid?: string | null;
    source?: string;
    children: Map<string, TreeNode>;
    parent?: TreeNode;
}
/**
 * Manages the in-memory representation of Studio's DataModel
 */
export declare class TreeManager {
    private nodes;
    private pathIndex;
    private root;
    private pathKey;
    private addToPathIndex;
    private removeFromPathIndex;
    private registerSubtree;
    private unregisterSubtree;
    updateInstance(instance: InstanceData): {
        node: TreeNode;
        pathChanged: boolean;
        nameChanged: boolean;
        parentChanged: boolean;
        isNew: boolean;
        prevPath?: string[];
        prevName?: string;
    } | null;
    /**
     * Process a full snapshot from Studio
     */
    applyFullSnapshot(instances: InstanceData[]): void;
    /**
     * Update child paths iteratively
     */
    private recalculateChildPaths;
    getDescendantScripts(guid: string): TreeNode[];
    private isScriptNode;
    private pathsEqual;
    /**
     * Delete an instance by GUID
     */
    deleteInstance(guid: string): TreeNode | null;
    /**
     * Update script source only
     */
    updateScriptSource(guid: string, source: string): void;
    /**
     * Get a node by GUID
     */
    getNode(guid: string): TreeNode | undefined;
    /**
     * Get all nodes
     */
    getAllNodes(): Map<string, TreeNode>;
    /**
     * Get all script nodes
     */
    getScriptNodes(): TreeNode[];
    /**
     * Find a node by its path
     */
    private findNodeByPath;
    /**
     * Re-parent a node based on its path
     */
    private reparentNode;
    /**
     * Get tree statistics
     */
    getStats(): {
        totalNodes: number;
        scriptNodes: number;
        maxDepth: number;
    };
}
//# sourceMappingURL=treeManager.d.ts.map