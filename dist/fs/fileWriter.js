import * as fs from "fs";
import * as path from "path";
import { config } from "../config.js";
import { log } from "../util/log.js";
/**
 * Handles writing the virtual tree to the filesystem
 */
export class FileWriter {
    baseDir;
    fileMappings = new Map();
    pathToGuid = new Map(); // Reverse index for O(1) path lookups
    constructor(baseDir = config.syncDir) {
        this.baseDir = path.resolve(baseDir);
        this.ensureDirectory(this.baseDir);
    }
    /**
     * Write all script nodes to the filesystem
     */
    writeTree(nodes) {
        log.info("Writing tree to filesystem...");
        // Clear existing mappings
        this.fileMappings.clear();
        this.pathToGuid.clear();
        // Collect all script nodes for batch writing
        const scriptNodes = [];
        for (const node of nodes.values()) {
            if (this.isScriptNode(node)) {
                scriptNodes.push(node);
            }
        }
        this.writeBatch(scriptNodes);
        log.success(`Wrote ${this.fileMappings.size} scripts to filesystem`);
    }
    /**
     * Write multiple scripts in a batch for improved I/O efficiency
     */
    writeBatch(nodes) {
        // Pre-compute all file paths and collect writes
        const writes = [];
        const dirsToCreate = new Set();
        const batchPathToGuid = new Map();
        for (const node of nodes) {
            if (!this.isScriptNode(node) || node.source === undefined)
                continue;
            const filePath = this.getFilePathWithCollisionMap(node, batchPathToGuid);
            const dirPath = path.dirname(filePath);
            writes.push({ node, filePath, dirPath });
            dirsToCreate.add(dirPath);
            batchPathToGuid.set(path.resolve(filePath), node.guid);
        }
        // Batch create all directories first (sorted by depth to ensure parents exist)
        const sortedDirs = Array.from(dirsToCreate).sort((a, b) => a.length - b.length);
        for (const dir of sortedDirs) {
            this.ensureDirectory(dir);
        }
        for (const { node, filePath } of writes) {
            try {
                fs.writeFileSync(filePath, node.source, "utf-8");
                this.fileMappings.set(node.guid, {
                    guid: node.guid,
                    filePath: filePath,
                    className: node.className,
                });
                this.pathToGuid.set(path.resolve(filePath), node.guid);
                log.script(this.getRelativePath(filePath), "updated");
            }
            catch (error) {
                log.error(`Failed to write script ${filePath}:`, error);
            }
        }
    }
    /**
     * Write or update a single script
     */
    writeScript(node) {
        if (!this.isScriptNode(node)) {
            return null;
        }
        // Allow empty-string sources on new scripts; only skip if source is truly undefined
        if (node.source === undefined) {
            return null;
        }
        const existingMapping = this.fileMappings.get(node.guid);
        const filePath = this.getFilePath(node);
        const dirPath = path.dirname(filePath);
        const previousPath = existingMapping?.filePath;
        const pathChanged = previousPath && previousPath !== filePath;
        // Ensure directory exists
        this.ensureDirectory(dirPath);
        // Write file
        try {
            fs.writeFileSync(filePath, node.source, "utf-8");
            // If the target path changed for this guid, remove the old file to avoid stale copies
            if (pathChanged && previousPath && fs.existsSync(previousPath)) {
                fs.unlinkSync(previousPath);
                this.pathToGuid.delete(path.resolve(previousPath));
                this.cleanupParentsIfEmpty(path.dirname(previousPath));
            }
            // Update mapping and reverse index
            this.fileMappings.set(node.guid, {
                guid: node.guid,
                filePath: filePath,
                className: node.className,
            });
            this.pathToGuid.set(path.resolve(filePath), node.guid);
            log.script(this.getRelativePath(filePath), "updated");
            return filePath;
        }
        catch (error) {
            log.error(`Failed to write script ${filePath}:`, error);
            return null;
        }
    }
    /**
     * Delete a script file
     */
    deleteScript(guid) {
        const mapping = this.fileMappings.get(guid);
        if (!mapping) {
            return false;
        }
        try {
            const deleted = this.deleteFilePathInternal(mapping.filePath);
            this.fileMappings.delete(guid);
            this.pathToGuid.delete(path.resolve(mapping.filePath));
            return deleted;
        }
        catch (error) {
            log.error(`Failed to delete script ${mapping.filePath}:`, error);
            return false;
        }
    }
    /**
     * Delete a script file by path even if the mapping is missing
     */
    deleteFilePath(filePath) {
        try {
            return this.deleteFilePathInternal(filePath);
        }
        catch (error) {
            log.error(`Failed to delete script ${filePath}:`, error);
            return false;
        }
    }
    /**
     * Get the filesystem path for a node
     */
    getFilePath(node) {
        return this.getFilePathWithCollisionMap(node);
    }
    /**
     * Get the filesystem path for a node, with optional collision map for batch operations
     */
    getFilePathWithCollisionMap(node, batchCollisionMap) {
        // Build the path from the node's hierarchy. For scripts, we only use the parent path
        // as directories, then add the script file name. This prevents creating an extra
        // folder named after the script itself.
        const parts = [];
        const dirSegments = this.isScriptNode(node)
            ? node.path.slice(0, Math.max(0, node.path.length - 1))
            : node.path;
        for (const segment of dirSegments) {
            parts.push(this.sanitizeName(segment));
        }
        // If this is a script, add the script name as a file
        if (this.isScriptNode(node)) {
            const scriptName = this.getScriptFileName(node);
            parts.push(scriptName);
        }
        const desiredPath = path.join(this.baseDir, ...parts);
        const normalizedDesiredPath = path.resolve(desiredPath);
        // Check for collisions in both the persistent mappings and the batch collision map
        const existingGuid = this.findGuidByFilePath(desiredPath);
        const batchGuid = batchCollisionMap?.get(normalizedDesiredPath);
        const collision = existingGuid || batchGuid;
        // If another GUID already owns this path, disambiguate using a stable suffix
        if (collision && collision !== node.guid) {
            const uniqueName = this.getDisambiguatedScriptFileName(node);
            const uniqueParts = [...parts.slice(0, -1), uniqueName];
            return path.join(this.baseDir, ...uniqueParts);
        }
        return desiredPath;
    }
    /**
     * Get the appropriate filename for a script node
     */
    getScriptFileName(node) {
        const ext = config.scriptExtension;
        // If the script has the same name as its parent, use init pattern
        // const parentName = node.path[node.path.length - 2]; // 2 to get parent
        // if (node.name === parentName) {
        //   log.info(
        //     `Using init file pattern for script ${node.name} because it matches its parent directory name (${parentName}).`
        //   );
        //   return `init${ext}`;
        // }
        let name = this.sanitizeName(node.name);
        if (node.className === "Script") {
            name = `${name}.server`;
        }
        else if (node.className === "LocalScript") {
            name = `${name}.client`;
        }
        else if (node.className === "ModuleScript") {
            if (config.suffixModuleScripts) {
                name = `${name}.module`;
            }
        }
        return `${name}${ext}`;
    }
    /**
     * Keep Script/LocalScript suffixes when disambiguating collisions.
     */
    getDisambiguatedScriptFileName(node) {
        const baseFileName = this.getScriptFileName(node);
        const ext = config.scriptExtension;
        const guidSuffix = `__${node.guid.slice(0, 8)}`;
        if (!baseFileName.endsWith(ext)) {
            return `${baseFileName}${guidSuffix}`;
        }
        const stem = baseFileName.slice(0, -ext.length);
        const classSuffixMatch = stem.match(/(\.(?:server|client|module))$/);
        if (classSuffixMatch) {
            const classSuffix = classSuffixMatch[1];
            const rawName = stem.slice(0, -classSuffix.length);
            return `${rawName}${guidSuffix}${classSuffix}${ext}`;
        }
        return `${stem}${guidSuffix}${ext}`;
    }
    /**
     * Sanitize a name for use in filesystem
     */
    sanitizeName(name) {
        // Replace invalid filesystem characters
        return name.replace(/[<>:"|?*]/g, "_");
    }
    /**
     * Check if a node is a script
     */
    isScriptNode(node) {
        return (node.className === "Script" ||
            node.className === "LocalScript" ||
            node.className === "ModuleScript");
    }
    /**
     * Ensure a directory exists
     */
    ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
    /**
     * Internal helper to remove a file and clean mapping
     */
    deleteFilePathInternal(filePath) {
        const normalized = path.resolve(filePath);
        if (fs.existsSync(normalized)) {
            fs.unlinkSync(normalized);
            log.script(this.getRelativePath(normalized), "deleted");
        }
        const guid = this.pathToGuid.get(normalized);
        if (guid) {
            this.fileMappings.delete(guid);
            this.pathToGuid.delete(normalized);
        }
        return true;
    }
    /**
     * Find the GUID that currently owns a file path, if any
     */
    findGuidByFilePath(filePath) {
        const normalized = path.resolve(filePath);
        for (const [guid, mapping] of this.fileMappings) {
            if (path.resolve(mapping.filePath) === normalized) {
                return guid;
            }
        }
        return undefined;
    }
    /**
     * Get path relative to base directory
     */
    getRelativePath(filePath) {
        return path.relative(this.baseDir, filePath);
    }
    /**
     * Get file mapping by GUID
     */
    getMapping(guid) {
        return this.fileMappings.get(guid);
    }
    /**
     * Get GUID by file path
     */
    getGuidByPath(filePath) {
        return this.pathToGuid.get(path.resolve(filePath));
    }
    /**
     * Get all file mappings
     */
    getAllMappings() {
        return this.fileMappings;
    }
    /**
     * Get the base directory
     */
    getBaseDir() {
        return this.baseDir;
    }
    /**
     * Clean up empty directories
     */
    cleanupEmptyDirectories() {
        this.cleanupEmptyDirsRecursive(this.baseDir);
    }
    cleanupEmptyDirsRecursive(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return false;
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        // Recursively check subdirectories
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subPath = path.join(dirPath, entry.name);
                this.cleanupEmptyDirsRecursive(subPath);
            }
        }
        // Check if directory is now empty
        const updatedEntries = fs.readdirSync(dirPath);
        if (updatedEntries.length === 0 && dirPath !== this.baseDir) {
            fs.rmdirSync(dirPath);
            return true;
        }
        return false;
    }
    /**
     * Walk up from a directory and remove empty parents until baseDir is reached.
     */
    cleanupParentsIfEmpty(startDir) {
        let current = path.resolve(startDir);
        const root = this.baseDir;
        while (current.startsWith(root)) {
            if (current === root) {
                break;
            }
            const entries = fs.existsSync(current)
                ? fs.readdirSync(current, { withFileTypes: true })
                : [];
            if (entries.length === 0) {
                fs.rmdirSync(current);
                current = path.dirname(current);
            }
            else {
                break;
            }
        }
    }
}
//# sourceMappingURL=fileWriter.js.map