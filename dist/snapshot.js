import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { log } from "./util/log.js";
import { classifyScriptFileName, isScriptFileName } from "./util/scriptFile.js";
export class SnapshotBuilder {
    sourceDir;
    destPrefix;
    skipSymlinks;
    folderMap = new Map();
    results = [];
    scriptPaths = new Set();
    constructor(options) {
        this.sourceDir = path.resolve(options.sourceDir);
        this.destPrefix = options.destPrefix ?? [];
        this.skipSymlinks = options.skipSymlinks !== false; // default: skip links
    }
    async build() {
        this.results = [];
        this.folderMap.clear();
        this.scriptPaths.clear();
        await this.walk(this.sourceDir);
        this.results.sort((a, b) => a.path.length - b.path.length);
        return this.results;
    }
    async walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = entries.filter((entry) => entry.isFile());
        const directories = entries.filter((entry) => entry.isDirectory());
        for (const entry of files) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isSymbolicLink && entry.isSymbolicLink()) {
                if (!this.skipSymlinks) {
                    continue;
                }
                log.debug(`Skipping symlinked file during snapshot: ${fullPath}`);
                continue;
            }
            if (isScriptFileName(entry.name)) {
                const relSegments = this.relativeSegments(fullPath);
                const { className, scriptName } = classifyScriptFileName(entry.name, {
                    stripDisambiguationSuffix: true,
                });
                const dirSegments = relSegments.slice(0, -1);
                if (dirSegments.length > 0) {
                    this.ensureFolder(dirSegments);
                }
                const filePathSegments = [
                    ...this.destPrefix,
                    ...dirSegments,
                    scriptName,
                ];
                const source = await fs.readFile(fullPath, "utf-8");
                this.scriptPaths.add(this.pathKey(filePathSegments));
                const fileData = {
                    guid: this.makeGuid(),
                    className,
                    name: scriptName,
                    path: filePathSegments,
                    source,
                };
                this.results.push(fileData);
            }
        }
        for (const entry of directories) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isSymbolicLink && entry.isSymbolicLink()) {
                if (!this.skipSymlinks) {
                    continue;
                }
                log.debug(`Skipping symlinked directory during snapshot: ${fullPath}`);
                continue;
            }
            const relSegments = this.relativeSegments(fullPath);
            if (relSegments.length > 0) {
                this.ensureFolder(relSegments);
            }
            await this.walk(fullPath);
        }
    }
    ensureFolder(segments) {
        for (let i = 1; i <= segments.length; i++) {
            const keySegments = segments.slice(0, i);
            const full = [...this.destPrefix, ...keySegments];
            const key = this.pathKey(full);
            if (this.scriptPaths.has(key))
                continue;
            if (this.folderMap.has(key))
                continue;
            const data = {
                guid: this.makeGuid(),
                className: "Folder",
                name: keySegments[i - 1],
                path: full,
            };
            this.folderMap.set(key, data);
            this.results.push(data);
        }
    }
    relativeSegments(targetPath) {
        const rel = path.relative(this.sourceDir, targetPath);
        if (!rel || rel === "")
            return [];
        return rel.split(path.sep).filter(Boolean);
    }
    makeGuid() {
        return randomUUID().replace(/-/g, "");
    }
    pathKey(segments) {
        return segments.join("/");
    }
}
//# sourceMappingURL=snapshot.js.map