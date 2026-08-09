import { log } from "../util/log.js";
/**
 * Manages the in-memory representation of Studio's DataModel
 */
export class TreeManager {
    nodes = new Map();
    pathIndex = new Map(); // pathKey → TreeNodes (same name siblings supported)
    root = null;
    pathKey(path) {
        return path.join("\u0000");
    }
    addToPathIndex(node) {
        const key = this.pathKey(node.path);
        const bucket = this.pathIndex.get(key) ?? new Set();
        bucket.add(node);
        this.pathIndex.set(key, bucket);
    }
    removeFromPathIndex(node) {
        const key = this.pathKey(node.path);
        const bucket = this.pathIndex.get(key);
        if (!bucket)
            return;
        bucket.delete(node);
        if (bucket.size === 0) {
            this.pathIndex.delete(key);
        }
    }
    registerSubtree(node) {
        const stack = [node];
        while (stack.length > 0) {
            const current = stack.pop();
            this.addToPathIndex(current);
            for (const child of current.children.values()) {
                stack.push(child);
            }
        }
    }
    unregisterSubtree(node) {
        const stack = [node];
        while (stack.length > 0) {
            const current = stack.pop();
            this.removeFromPathIndex(current);
            for (const child of current.children.values()) {
                stack.push(child);
            }
        }
    }
    updateInstance(instance) {
        const existing = this.nodes.get(instance.guid);
        const hasParentHint = instance.parentGuid !== undefined;
        const incomingParentGuid = hasParentHint
            ? (instance.parentGuid ?? null)
            : null;
        if (existing) {
            const prevPath = [...existing.path];
            const prevName = existing.name;
            const pathChanged = !this.pathsEqual(existing.path, instance.path);
            const nameChanged = existing.name !== instance.name;
            const currentParentGuid = existing.parent?.guid ?? existing.parentGuid ?? null;
            const nextParentGuid = hasParentHint
                ? incomingParentGuid
                : currentParentGuid;
            const parentChanged = hasParentHint && nextParentGuid !== currentParentGuid;
            const nextSource = instance.source !== undefined ? instance.source : existing.source;
            if (pathChanged) {
                this.unregisterSubtree(existing);
            }
            existing.className = instance.className;
            existing.name = instance.name;
            existing.path = instance.path;
            existing.parentGuid = nextParentGuid;
            existing.source = nextSource;
            if (pathChanged || nameChanged || parentChanged) {
                this.reparentNode(existing, instance.path, nextParentGuid);
                this.recalculateChildPaths(existing);
                this.registerSubtree(existing);
            }
            log.script(`Updated instance: ${instance.path.join("/")}`, "updated");
            return {
                node: existing,
                pathChanged,
                nameChanged,
                parentChanged,
                isNew: false,
                prevPath,
                prevName,
            };
        }
        const node = {
            guid: instance.guid,
            className: instance.className,
            name: instance.name,
            path: instance.path,
            parentGuid: incomingParentGuid,
            source: instance.source,
            children: new Map(),
        };
        this.nodes.set(instance.guid, node);
        this.reparentNode(node, instance.path, incomingParentGuid);
        this.recalculateChildPaths(node);
        this.registerSubtree(node);
        log.script(`Created instance: ${instance.path.join("/")}`, "created");
        return {
            node,
            pathChanged: false,
            nameChanged: false,
            parentChanged: false,
            isNew: true,
        };
    }
    /**
     * Process a full snapshot from Studio
     */
    applyFullSnapshot(instances) {
        log.info(`Processing full snapshot: ${instances.length} instances`);
        // Clear existing tree
        this.nodes.clear();
        this.pathIndex.clear();
        this.root = null;
        // First pass: create all nodes
        for (const instance of instances) {
            const node = {
                guid: instance.guid,
                className: instance.className,
                name: instance.name,
                path: instance.path,
                parentGuid: instance.parentGuid ?? null,
                source: instance.source,
                children: new Map(),
            };
            this.nodes.set(instance.guid, node);
            this.addToPathIndex(node);
            log.debug(`Created node: ${instance.path.join("/")}`);
        }
        // Second pass: build hierarchy
        for (const instance of instances) {
            const node = this.nodes.get(instance.guid);
            if (!node)
                continue;
            if (instance.path.length === 1) {
                // This is a root service
                if (!this.root) {
                    this.root = {
                        guid: "root",
                        className: "DataModel",
                        name: "game",
                        path: [],
                        parentGuid: null,
                        children: new Map(),
                    };
                    this.nodes.set("root", this.root);
                    this.addToPathIndex(this.root);
                }
                this.root.children.set(node.guid, node);
                node.parent = this.root;
                node.parentGuid = this.root.guid;
                log.debug(`Assigned root parent for: ${instance.path.join("/")}`);
            }
            else {
                // Find parent by matching path
                const parentPath = instance.path.slice(0, -1);
                const explicitParentGuid = instance.parentGuid ?? null;
                let parent;
                if (explicitParentGuid) {
                    parent = this.nodes.get(explicitParentGuid);
                }
                if (!parent) {
                    parent = this.findNodeByPath(parentPath);
                }
                if (parent) {
                    parent.children.set(node.guid, node);
                    node.parent = parent;
                    node.parentGuid = parent.guid;
                    log.debug(`Assigned parent for: ${instance.path.join("/")}`);
                }
                else {
                    log.warn(`Parent not found for ${instance.path.join("/")}`);
                }
            }
        }
        log.success(`Tree built: ${this.nodes.size} nodes`);
    }
    /**
     * Update child paths iteratively
     */
    recalculateChildPaths(node) {
        const queue = [...node.children.values()];
        while (queue.length > 0) {
            const child = queue.shift();
            child.path = [...child.parent.path, child.name];
            for (const grandchild of child.children.values()) {
                queue.push(grandchild);
            }
        }
    }
    getDescendantScripts(guid) {
        const start = this.nodes.get(guid);
        if (!start) {
            return [];
        }
        const scripts = [];
        const stack = [...start.children.values()];
        while (stack.length > 0) {
            const node = stack.pop();
            if (this.isScriptNode(node)) {
                scripts.push(node);
            }
            for (const child of node.children.values()) {
                stack.push(child);
            }
        }
        return scripts;
    }
    isScriptNode(node) {
        return (node.className === "Script" ||
            node.className === "LocalScript" ||
            node.className === "ModuleScript");
    }
    pathsEqual(a, b) {
        if (a.length !== b.length)
            return false;
        return a.every((segment, idx) => segment === b[idx]);
    }
    /**
     * Delete an instance by GUID
     */
    deleteInstance(guid) {
        const node = this.nodes.get(guid);
        if (!node) {
            log.debug(`Delete ignored for missing node: ${guid}`);
            return null;
        }
        // Detach from parent first so no one references this subtree
        if (node.parent) {
            node.parent.children.delete(guid);
        }
        // Iterative delete to avoid repeated recursion work on large subtrees
        const stack = [node];
        while (stack.length > 0) {
            const current = stack.pop();
            for (const child of current.children.values()) {
                stack.push(child);
            }
            this.removeFromPathIndex(current);
            this.nodes.delete(current.guid);
            // Break references to help GC and prevent accidental reuse
            current.children.clear();
            current.parent = undefined;
        }
        log.script(`Deleted instance: ${node.path.join("/")}`, "deleted");
        return node;
    }
    /**
     * Update script source only
     */
    updateScriptSource(guid, source) {
        const node = this.nodes.get(guid);
        if (node) {
            node.source = source;
            log.debug(`Updated script source: ${node.path.join("/")}`);
        }
        else {
            log.warn(`Script not found for GUID: ${guid}`);
        }
    }
    /**
     * Get a node by GUID
     */
    getNode(guid) {
        return this.nodes.get(guid);
    }
    /**
     * Get all nodes
     */
    getAllNodes() {
        return this.nodes;
    }
    /**
     * Get all script nodes
     */
    getScriptNodes() {
        return Array.from(this.nodes.values()).filter((node) => this.isScriptNode(node));
    }
    /**
     * Find a node by its path
     */
    findNodeByPath(path) {
        const bucket = this.pathIndex.get(this.pathKey(path));
        if (!bucket || bucket.size === 0) {
            return undefined;
        }
        if (bucket.size === 1) {
            return bucket.values().next().value;
        }
        // Ambiguous path (same-name siblings); caller should use parent GUIDs instead
        log.debug(`Multiple nodes share path ${path.join("/")}, skipping path lookup`);
        return undefined;
    }
    /**
     * Re-parent a node based on its path
     */
    reparentNode(node, path, parentGuid) {
        // Remove from old parent
        if (node.parent) {
            node.parent.children.delete(node.guid);
        }
        // Find new parent (prefer explicit parent GUID when present)
        let parent;
        if (parentGuid) {
            parent = this.nodes.get(parentGuid);
        }
        if (!parent) {
            if (path.length === 1) {
                // Root service
                if (!this.root) {
                    this.root = {
                        guid: "root",
                        className: "DataModel",
                        name: "game",
                        path: [],
                        parentGuid: null,
                        children: new Map(),
                    };
                    this.nodes.set("root", this.root);
                    this.addToPathIndex(this.root);
                }
                parent = this.root;
            }
            else {
                const parentPath = path.slice(0, -1);
                parent = this.findNodeByPath(parentPath);
            }
        }
        if (parent) {
            parent.children.set(node.guid, node);
            node.parent = parent;
            node.parentGuid = parent.guid;
        }
        else {
            log.debug(`Parent not found for re-parenting: ${path.join("/")}`);
        }
    }
    /**
     * Get tree statistics
     */
    getStats() {
        let scriptCount = 0;
        let maxDepth = 0;
        for (const node of this.nodes.values()) {
            if (this.isScriptNode(node)) {
                scriptCount += 1;
            }
            const depth = node.path.length;
            if (depth > maxDepth) {
                maxDepth = depth;
            }
        }
        return {
            totalNodes: this.nodes.size,
            scriptNodes: scriptCount,
            maxDepth,
        };
    }
}
//# sourceMappingURL=treeManager.js.map