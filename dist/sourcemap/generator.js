import * as fs from "fs";
import * as path from "path";
import { log } from "../util/log.js";
/**
 * Generates Rojo-compatible sourcemap.json for luau-lsp
 */
export class SourcemapGenerator {
    constructor() { }
    sortTreeNodes(nodes) {
        return Array.from(nodes).sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0)
                return nameCompare;
            const classCompare = a.className.localeCompare(b.className);
            if (classCompare !== 0)
                return classCompare;
            return a.guid.localeCompare(b.guid);
        });
    }
    getDuplicatePaths(nodes) {
        const buckets = new Map();
        for (const node of nodes.values()) {
            const key = node.path.join("\u0001");
            const bucket = buckets.get(key) ?? [];
            bucket.push(node);
            buckets.set(key, bucket);
        }
        const duplicates = [];
        for (const [key, bucket] of buckets.entries()) {
            if (bucket.length > 1) {
                duplicates.push({ path: key.split("\u0001"), nodes: bucket });
            }
        }
        return duplicates;
    }
    findRootNode(nodes) {
        const root = nodes.get("root");
        if (root) {
            return root;
        }
        for (const node of nodes.values()) {
            if (node.path.length === 0 && node.className === "DataModel") {
                return node;
            }
        }
        return null;
    }
    /**
     * Incrementally upsert a subtree into the sourcemap, optionally removing the old path first.
     * Falls back to full regeneration if anything goes wrong.
     */
    upsertSubtree(node, allNodes, fileMappings, outputPath, oldPath, isNew) {
        const duplicates = this.getDuplicatePaths(allNodes);
        if (duplicates.length > 0) {
            log.debug(`Duplicate instance paths detected (${duplicates.length}); proceeding with GUID-based incremental update`);
        }
        try {
            const sourcemap = this.readOrCreateRoot(outputPath);
            // If the node moved/renamed, prune the previous location
            if (oldPath && !this.pathsMatch(oldPath, node.path)) {
                this.removePath(sourcemap, oldPath, node.className, node.guid);
            }
            const newSubtree = this.buildNodeFromTree(node, fileMappings);
            if (newSubtree) {
                this.insertNodeAtPath(sourcemap, newSubtree, node.path, allNodes, Boolean(isNew));
                this.write(sourcemap, outputPath);
            }
        }
        catch (error) {
            log.warn("Incremental sourcemap update failed, regenerating:", error);
            this.generateAndWrite(allNodes, fileMappings, outputPath);
        }
    }
    /**
     * Generate complete sourcemap from tree and file mappings
     */
    generate(nodes, fileMappings) {
        log.info("Generating sourcemap...");
        log.debug(`Total nodes: ${nodes.size}, File mappings: ${fileMappings.size}`);
        const rootNode = this.findRootNode(nodes);
        const serviceNodes = rootNode
            ? this.sortTreeNodes(rootNode.children.values())
            : this.sortTreeNodes(Array.from(nodes.values()).filter((node) => node.path.length === 1));
        const visited = new Set();
        const children = [];
        for (const serviceNode of serviceNodes) {
            const built = this.buildNodeFromTree(serviceNode, fileMappings, visited, process.cwd());
            if (built) {
                children.push(built);
            }
        }
        const sourcemap = {
            name: "Game",
            className: "DataModel",
            children,
        };
        log.success(`Sourcemap generated with ${children.length} root services`);
        return sourcemap;
    }
    /**
     * Write sourcemap to file
     */
    write(sourcemap, outputPath = "sourcemap.json") {
        try {
            // Ensure destination directory exists
            const dir = path.dirname(outputPath);
            if (dir && dir !== "." && !fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const json = JSON.stringify(sourcemap, null, 2);
            fs.writeFileSync(outputPath, json, "utf-8");
            log.debug(`Sourcemap written to: ${outputPath}`);
        }
        catch (error) {
            log.error("Failed to write sourcemap:", error);
        }
    }
    /**
     * Check if two paths match
     */
    pathsMatch(path1, path2) {
        if (path1.length !== path2.length)
            return false;
        return path1.every((segment, i) => segment === path2[i]);
    }
    /**
     * Build a SourcemapNode from a TreeNode, recursively including children.
     */
    buildNodeFromTree(node, fileMappings, visited = new Set(), cwd = process.cwd()) {
        if (visited.has(node.guid)) {
            log.debug(`Detected cyclic path in sourcemap generation: ${node.path.join("/")}`);
            return null;
        }
        visited.add(node.guid);
        const result = {
            name: node.name,
            className: node.className,
            guid: node.guid,
        };
        const mapping = fileMappings.get(node.guid);
        if (mapping) {
            const relativePath = path.relative(cwd, mapping.filePath);
            result.filePaths = [relativePath.replace(/\\/g, "/")];
        }
        const sortedChildren = this.sortTreeNodes(node.children.values());
        const children = [];
        for (const child of sortedChildren) {
            const built = this.buildNodeFromTree(child, fileMappings, visited, cwd);
            if (built) {
                children.push(built);
            }
        }
        if (children.length > 0) {
            result.children = children;
        }
        return result;
    }
    /**
     * Read an existing sourcemap or create a new root.
     */
    readOrCreateRoot(outputPath) {
        if (fs.existsSync(outputPath)) {
            try {
                const raw = fs.readFileSync(outputPath, "utf-8");
                return JSON.parse(raw);
            }
            catch (error) {
                log.warn("Failed to read existing sourcemap, recreating:", error);
            }
        }
        return {
            name: "Game",
            className: "DataModel",
            children: [],
        };
    }
    /**
     * Insert or replace a subtree at the given path, creating intermediate parents as needed.
     */
    insertNodeAtPath(root, newNode, pathSegments, allNodes, isNewEntry) {
        if (pathSegments.length === 0)
            return;
        let currentChildren = root.children;
        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];
            const ancestorNode = this.findNodeByPath(allNodes, pathSegments.slice(0, i + 1));
            const ancestorGuid = ancestorNode?.guid;
            let existingIndex = ancestorGuid
                ? currentChildren.findIndex((n) => n.guid === ancestorGuid)
                : currentChildren.findIndex((n) => n.name === segment);
            if (i === pathSegments.length - 1) {
                const guidIndex = newNode.guid
                    ? currentChildren.findIndex((n) => n.guid === newNode.guid)
                    : -1;
                if (guidIndex !== -1) {
                    currentChildren.splice(guidIndex, 1, newNode);
                    return;
                }
                if (isNewEntry) {
                    // Appending preserves siblings with identical names/classes from being merged
                    currentChildren.push(newNode);
                    return;
                }
                existingIndex = currentChildren.findIndex((n) => n.name === segment && n.className === newNode.className);
                if (existingIndex !== -1) {
                    currentChildren.splice(existingIndex, 1, newNode);
                }
                else {
                    currentChildren.push(newNode);
                }
                return;
            }
            if (existingIndex === -1) {
                const className = ancestorNode?.className ?? "Folder";
                const placeholder = {
                    name: segment,
                    className,
                    guid: ancestorGuid,
                    children: [],
                };
                currentChildren.push(placeholder);
                existingIndex = currentChildren.length - 1;
            }
            const holder = currentChildren[existingIndex];
            if (!holder.children) {
                holder.children = [];
            }
            currentChildren = holder.children;
        }
    }
    findNodeByPath(nodes, pathSegments) {
        for (const node of nodes.values()) {
            if (this.pathsMatch(node.path, pathSegments)) {
                return node;
            }
        }
        return undefined;
    }
    /**
     * Generate and write sourcemap in one call
     */
    generateAndWrite(nodes, fileMappings, outputPath = "sourcemap.json") {
        const sourcemap = this.generate(nodes, fileMappings);
        this.write(sourcemap, outputPath);
    }
    /**
     * Remove a node (and now-empty ancestors) from an existing sourcemap file by path.
     * Falls back to full regeneration if the file is missing or malformed.
     */
    prunePath(pathSegments, outputPath, nodes, fileMappings, targetClassName, targetGuid) {
        try {
            if (!fs.existsSync(outputPath)) {
                this.generateAndWrite(nodes, fileMappings, outputPath);
                return true;
            }
            const raw = fs.readFileSync(outputPath, "utf-8");
            const json = JSON.parse(raw);
            const removed = this.removePath(json, pathSegments, targetClassName, targetGuid);
            if (removed) {
                this.write(json, outputPath);
            }
            return removed;
        }
        catch (error) {
            log.warn("Prune failed, regenerating sourcemap:", error);
            this.generateAndWrite(nodes, fileMappings, outputPath);
            return true;
        }
    }
    /**
     * Remove node matching path; prune empty parents.
     */
    removePath(root, pathSegments, targetClassName, targetGuid) {
        if (pathSegments.length === 0)
            return false;
        const pruneRecursive = (nodes, idx) => {
            if (!nodes)
                return false;
            const name = pathSegments[idx];
            let nodeIndex = nodes.findIndex((n) => {
                if (n.name !== name)
                    return false;
                if (idx === pathSegments.length - 1) {
                    if (targetGuid && n.guid) {
                        return n.guid === targetGuid;
                    }
                    if (targetClassName) {
                        return n.className === targetClassName;
                    }
                }
                return true;
            });
            // Fallback to name-only match so we still prune even if class drifted
            if (nodeIndex === -1 && idx === pathSegments.length - 1) {
                if (targetGuid) {
                    nodeIndex = nodes.findIndex((n) => n.guid === targetGuid);
                }
                if (nodeIndex === -1) {
                    nodeIndex = nodes.findIndex((n) => n.name === name);
                }
            }
            if (nodeIndex === -1)
                return false;
            const node = nodes[nodeIndex];
            if (idx === pathSegments.length - 1) {
                // Remove the entire subtree
                nodes.splice(nodeIndex, 1);
                return true;
            }
            const removed = pruneRecursive(node.children, idx + 1);
            // Clean up empty child containers
            if (removed &&
                node.children &&
                node.children.length === 0 &&
                !node.filePaths) {
                nodes.splice(nodeIndex, 1);
            }
            return removed;
        };
        return pruneRecursive(root.children, 0);
    }
    /**
     * Validate that all paths in sourcemap point to existing files
     */
    validate(sourcemap) {
        const errors = [];
        const checkNode = (node) => {
            if (node.filePaths) {
                for (const filePath of node.filePaths) {
                    const fullPath = path.resolve(process.cwd(), filePath);
                    if (!fs.existsSync(fullPath)) {
                        errors.push(`Missing file: ${filePath}`);
                    }
                }
            }
            if (node.children) {
                for (const child of node.children) {
                    checkNode(child);
                }
            }
        };
        for (const child of sourcemap.children) {
            checkNode(child);
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
}
//# sourceMappingURL=generator.js.map