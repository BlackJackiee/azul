import fs from "node:fs";
import path from "node:path";
import { IPCServer } from "./ipc/server.js";
import { config } from "./config.js";
import { log } from "./util/log.js";
const PACK_VERSION = 1;
export class PackCommand {
    ipc;
    outputPath;
    sourcePaths;
    scriptsAndDescendantsOnly;
    constructor(options = {}) {
        this.outputPath = path.resolve(options.outputPath ?? config.sourcemapPath);
        this.sourcePaths = (options.sources ?? []).map((source) => source
            .split(/[./\\]+/)
            .map((segment) => segment.trim())
            .filter(Boolean));
        this.scriptsAndDescendantsOnly = Boolean(options.scriptsAndDescendantsOnly);
        this.ipc = new IPCServer(config.port, undefined, {
            requestSnapshotOnConnect: false,
        });
    }
    async run() {
        log.info(`Waiting for Studio to connect on port ${config.port}...`);
        const snapshot = await this.requestSnapshot({
            includeProperties: true,
            scriptsAndDescendantsOnly: this.scriptsAndDescendantsOnly,
        });
        if (!snapshot) {
            log.error("Failed to receive snapshot from Studio for packing.");
            return false;
        }
        const selectedSnapshot = this.selectSnapshotSources(snapshot);
        if (!selectedSnapshot)
            return false;
        const existing = this.readExistingSourcemap();
        const regenerated = this.regenerateSourcemap(selectedSnapshot, existing);
        const packedCount = this.packIntoSourcemap(selectedSnapshot, regenerated);
        this.writeSourcemap(regenerated, this.outputPath);
        log.success(`Packed ${packedCount} node(s) into ${this.outputPath}`);
        return true;
    }
    selectSnapshotSources(snapshot) {
        if (this.sourcePaths.length === 0)
            return snapshot;
        for (const sourcePath of this.sourcePaths) {
            const sourceExists = snapshot.some((instance) => this.pathsEqual(instance.path, sourcePath));
            if (!sourceExists) {
                log.error(`Studio source path not found: ${sourcePath.join("/")}`);
                return null;
            }
        }
        return snapshot.filter((instance) => this.sourcePaths.some((sourcePath) => this.pathStartsWith(instance.path, sourcePath) ||
            this.pathStartsWith(sourcePath, instance.path)));
    }
    async requestSnapshot(options) {
        return new Promise((resolve) => {
            let timeoutHandle = null;
            let resolved = false;
            const finalize = (result) => {
                if (resolved)
                    return;
                resolved = true;
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
                setTimeout(() => {
                    this.ipc.close();
                }, 200);
                resolve(result);
            };
            this.ipc.onMessage((message) => {
                if (message.type !== "fullSnapshot")
                    return;
                finalize(message.data);
            });
            this.ipc.onConnection(() => {
                log.info("Studio connected. Waiting for handshake...");
            });
            this.ipc.onHandshake(() => {
                log.info("Handshake complete. Requesting snapshot...");
                this.ipc.requestSnapshot(options);
            });
            timeoutHandle = setTimeout(() => {
                log.error("Timed out waiting for Studio snapshot.");
                finalize(null);
            }, 30000);
        });
    }
    readExistingSourcemap() {
        if (!fs.existsSync(this.outputPath)) {
            return null;
        }
        try {
            const raw = fs.readFileSync(this.outputPath, "utf8");
            return JSON.parse(raw);
        }
        catch (error) {
            log.warn(`Failed to read existing sourcemap at ${this.outputPath}: ${error}`);
            return null;
        }
    }
    regenerateSourcemap(snapshot, existing) {
        const root = {
            name: "Game",
            className: "DataModel",
            children: [],
        };
        const guidFilePaths = new Map();
        const pathClassFilePaths = new Map();
        const pathClassCursor = new Map();
        const indexExisting = (node, currentPath) => {
            const nodePath = [...currentPath, node.name];
            if (node.filePaths && node.filePaths.length > 0) {
                if (node.guid) {
                    guidFilePaths.set(node.guid, node.filePaths);
                }
                const key = this.pathClassKey(nodePath, node.className);
                const bucket = pathClassFilePaths.get(key) ?? [];
                bucket.push(node.filePaths);
                pathClassFilePaths.set(key, bucket);
            }
            for (const child of node.children ?? []) {
                indexExisting(child, nodePath);
            }
        };
        for (const child of existing?.children ?? []) {
            indexExisting(child, []);
        }
        const byGuid = new Map();
        byGuid.set("root", root);
        const sorted = [...snapshot].sort((a, b) => {
            if (a.path.length !== b.path.length) {
                return a.path.length - b.path.length;
            }
            return a.path.join("/").localeCompare(b.path.join("/"));
        });
        for (const item of sorted) {
            const node = {
                name: item.name,
                className: item.className,
                guid: item.guid,
            };
            const directFilePaths = guidFilePaths.get(item.guid);
            if (directFilePaths && directFilePaths.length > 0) {
                node.filePaths = directFilePaths;
            }
            else {
                const key = this.pathClassKey(item.path, item.className);
                const bucket = pathClassFilePaths.get(key);
                if (bucket && bucket.length > 0) {
                    const cursor = pathClassCursor.get(key) ?? 0;
                    const candidate = bucket[cursor];
                    if (candidate && candidate.length > 0) {
                        node.filePaths = candidate;
                        pathClassCursor.set(key, cursor + 1);
                    }
                }
            }
            let parentNode = root;
            if (item.parentGuid && item.parentGuid !== "root") {
                parentNode = byGuid.get(item.parentGuid) ?? root;
            }
            if (!parentNode.children) {
                parentNode.children = [];
            }
            parentNode.children.push(node);
            byGuid.set(item.guid, node);
        }
        return root;
    }
    packIntoSourcemap(snapshot, sourcemap) {
        const byGuid = new Map();
        const byPathClass = new Map();
        for (const item of snapshot) {
            byGuid.set(item.guid, item);
            const key = this.pathClassKey(item.path, item.className);
            const bucket = byPathClass.get(key) ?? [];
            bucket.push(item);
            byPathClass.set(key, bucket);
        }
        const usedGuids = new Set();
        let packed = 0;
        const visit = (node, currentPath) => {
            const nodePath = [...currentPath, node.name];
            let match;
            if (node.guid) {
                const direct = byGuid.get(node.guid);
                if (direct) {
                    match = direct;
                    usedGuids.add(direct.guid);
                }
            }
            if (!match) {
                const key = this.pathClassKey(nodePath, node.className);
                const bucket = byPathClass.get(key);
                if (bucket && bucket.length > 0) {
                    match = bucket.find((candidate) => !usedGuids.has(candidate.guid));
                    if (match) {
                        usedGuids.add(match.guid);
                    }
                }
            }
            if (match) {
                if (match.properties && Object.keys(match.properties).length > 0) {
                    node.properties = match.properties;
                }
                else if (!this.scriptsAndDescendantsOnly) {
                    delete node.properties;
                }
                if (match.attributes && Object.keys(match.attributes).length > 0) {
                    node.attributes = match.attributes;
                }
                else if (!this.scriptsAndDescendantsOnly) {
                    delete node.attributes;
                }
                if (match.tags && match.tags.length > 0) {
                    node.tags = match.tags;
                }
                else if (!this.scriptsAndDescendantsOnly) {
                    delete node.tags;
                }
                if (match.properties || match.attributes || match.tags) {
                    packed += 1;
                }
            }
            else if (!this.scriptsAndDescendantsOnly) {
                delete node.properties;
                delete node.attributes;
                delete node.tags;
            }
            for (const child of node.children ?? []) {
                visit(child, nodePath);
            }
        };
        for (const child of sourcemap.children ?? []) {
            visit(child, []);
        }
        sourcemap._azul = {
            packVersion: PACK_VERSION,
            packedAt: new Date().toISOString(),
            mode: this.scriptsAndDescendantsOnly
                ? "scripts-and-descendants"
                : this.sourcePaths.length > 0
                    ? "selected"
                    : "all",
            sources: this.sourcePaths.length > 0
                ? this.sourcePaths.map((sourcePath) => sourcePath.join("/"))
                : undefined,
        };
        return packed;
    }
    writeSourcemap(sourcemap, outputPath) {
        const dir = path.dirname(outputPath);
        if (dir && dir !== "." && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, `${JSON.stringify(sourcemap, null, 2)}\n`, "utf8");
    }
    pathClassKey(pathSegments, className) {
        return `${pathSegments.join("\u0001")}::${className}`;
    }
    pathsEqual(first, second) {
        return (first.length === second.length &&
            first.every((segment, index) => segment === second[index]));
    }
    pathStartsWith(pathSegments, prefix) {
        return (pathSegments.length >= prefix.length &&
            prefix.every((segment, index) => pathSegments[index] === segment));
    }
}
//# sourceMappingURL=pack.js.map