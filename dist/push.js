import fs from "node:fs";
import path from "node:path";
import { promises as fsp } from "node:fs";
import { IPCServer } from "./ipc/server.js";
import { config } from "./config.js";
import { log } from "./util/log.js";
import { SnapshotBuilder } from "./snapshot.js";
import { RojoSnapshotBuilder } from "./snapshot/rojo/index.js";
import { generateGUID } from "./util/id.js";
import { classifyScriptFileName, isInstanceJsonName, isScriptFileName, } from "./util/scriptFile.js";
import { applySourcemapProperties, buildInstancesFromSourcemap, findNodeForFilepath, loadSourcemapPropertyIndex, } from "./sourcemap/propertyLoader.js";
export class PushCommand {
    ipc;
    options;
    sourcemapPath;
    sourcemapIndex;
    sourcemapIndexByPath;
    constructor(options = {}) {
        this.options = options;
        this.sourcemapPath = path.resolve(options.sourcemapPath ?? config.sourcemapPath);
        this.sourcemapIndex = loadSourcemapPropertyIndex(this.sourcemapPath);
        this.sourcemapIndexByPath = new Map([
            [this.sourcemapPath, this.sourcemapIndex],
        ]);
        this.ipc = new IPCServer(config.port, undefined, {
            requestSnapshotOnConnect: false,
        });
    }
    async run() {
        if (this.options.rojoMode) {
            log.info("Rojo compatibility mode: ignoring place config; destination becomes a prefix.");
            const destSegments = this.options.destination
                ? this.parseDestination(this.options.destination)
                : [];
            const instances = await this.buildRojoInstances(destSegments, this.options.source);
            if (!instances)
                return false;
            const snapshotMappings = [
                {
                    destination: destSegments,
                    destructive: Boolean(this.options.destructive),
                    instances,
                },
            ];
            return this.sendPushSnapshot(snapshotMappings);
        }
        const mappings = await this.collectMappings();
        if (!mappings || mappings.length === 0) {
            log.error("No push mappings available. Provide '--source' / '--destination' or place config.");
            return false;
        }
        log.info(`Building ${mappings.length} mapping(s) for push...`);
        const snapshotMappings = [];
        for (const mapping of mappings) {
            const destSegments = mapping.destination;
            log.debug(`Processing push mapping: ${mapping.source} -> ${destSegments.join("/")}${mapping.destructive ? " (destructive)" : ""}${mapping.rojoMode ? " (Rojo mode)" : ""}${mapping.fromSourcemap
                ? ` (from sourcemap: ${mapping.fromSourcemap})`
                : ""}`);
            if (mapping.rojoMode) {
                log.info(`Mapping source ${mapping.source} in Rojo compatibility mode.`);
                const instances = await this.buildRojoInstances(destSegments, mapping.source);
                if (!instances)
                    continue;
                snapshotMappings.push({
                    destination: destSegments,
                    destructive: Boolean(mapping.destructive),
                    instances,
                });
                continue;
            }
            const mappingSourcemapPath = this.resolveMappingSourcemapPath(mapping);
            if (mappingSourcemapPath) {
                const instances = this.buildPushInstancesFromSourcemap(mapping.source, destSegments, mappingSourcemapPath);
                if (instances) {
                    snapshotMappings.push({
                        destination: destSegments,
                        destructive: Boolean(mapping.destructive),
                        instances,
                    });
                    log.success(`Prepared ${instances.length} instances from ${mapping.source} -> ${destSegments.join("/")}`);
                    continue;
                }
                log.warn(`Could not find sourcemap source path ${mapping.source}; trying the filesystem.`);
            }
            const sourceCandidates = this.expandSourceCandidates(mapping.source);
            const sourcePath = sourceCandidates.find((candidate) => fs.existsSync(candidate));
            if (!sourcePath) {
                log.error(`Source path not found for push mapping. Tried: ${sourceCandidates.join(", ")}`);
                continue;
            }
            let sourceStats;
            try {
                sourceStats = await fsp.stat(sourcePath);
            }
            catch {
                log.error(`Could not read source path for push mapping: ${sourcePath}`);
                continue;
            }
            const isSourceDirectory = sourceStats.isDirectory();
            const isSourceFile = sourceStats.isFile();
            if (!isSourceDirectory && !isSourceFile) {
                log.error(`Source path must be a file or directory for push mapping: ${sourcePath}`);
                continue;
            }
            const builder = new SnapshotBuilder({
                sourceDir: sourcePath,
                destPrefix: destSegments,
                skipSymlinks: true,
            });
            if (isSourceDirectory) {
                const instances = await builder.build();
                if (!instances) {
                    continue;
                }
                if (this.options.applySourcemapProperties !== false) {
                    const sourcemapIndex = this.getSourcemapIndexForPath(this.sourcemapPath);
                    applySourcemapProperties(instances, sourcemapIndex);
                }
                log.success(`Prepared ${instances.length} instances from ${sourcePath} -> ${destSegments.join("/")}`);
                snapshotMappings.push({
                    destination: destSegments,
                    destructive: Boolean(mapping.destructive),
                    instances,
                });
            }
            else if (isSourceFile) {
                const pushedFile = await this.buildPushInstancesFromFile(sourcePath, destSegments);
                if (!pushedFile) {
                    log.error(`Failed to build push instances from source file: ${sourcePath}`);
                    continue;
                }
                snapshotMappings.push({
                    destination: destSegments,
                    destructive: Boolean(mapping.destructive),
                    instances: pushedFile,
                });
                if (this.options.applySourcemapProperties !== false) {
                    const sourcemapIndex = this.getSourcemapIndexForPath(this.sourcemapPath);
                    applySourcemapProperties(pushedFile, sourcemapIndex);
                }
            }
        }
        if (snapshotMappings.length === 0) {
            log.error("No push mappings could be prepared (missing source paths).");
            return false;
        }
        return this.sendPushSnapshot(snapshotMappings);
    }
    async sendPushSnapshot(snapshotMappings) {
        return new Promise((resolve) => {
            let isFinished = false;
            const finish = (wasSent) => {
                if (isFinished)
                    return;
                isFinished = true;
                clearTimeout(timeoutHandle);
                this.ipc.close();
                resolve(wasSent);
            };
            const sendSnapshot = (mappings) => {
                if (isFinished)
                    return;
                log.info("Sending push snapshot...");
                this.ipc.send({ type: "pushSnapshot", mappings });
                setTimeout(() => {
                    finish(true);
                }, 200);
            };
            const timeoutHandle = setTimeout(() => {
                log.error("Timed out waiting for Studio to connect and accept the push.");
                finish(false);
            }, 30000);
            if (this.options.missingOnly) {
                this.ipc.onMessage((message) => {
                    if (message.type !== "fullSnapshot")
                        return;
                    sendSnapshot(this.filterExistingInstances(snapshotMappings, message.data));
                });
            }
            this.ipc.onConnection(() => {
                log.info("Studio connected. Waiting for handshake...");
            });
            this.ipc.onHandshake(() => {
                log.info("Handshake complete.");
                if (this.options.missingOnly) {
                    log.info("Reading existing Studio instances...");
                    this.ipc.requestSnapshot();
                }
                else {
                    sendSnapshot(snapshotMappings);
                }
            });
        });
    }
    filterExistingInstances(snapshotMappings, existingInstances) {
        const existingInstancesByPath = new Map();
        for (const existingInstance of existingInstances) {
            const pathKey = existingInstance.path.join("\u0001");
            const pathInstances = existingInstancesByPath.get(pathKey) ?? [];
            pathInstances.push(existingInstance);
            existingInstancesByPath.set(pathKey, pathInstances);
        }
        return snapshotMappings.map((snapshotMapping) => {
            const sourcePathCounts = new Map();
            const conflictPaths = new Set();
            let preservedCount = 0;
            let conflictCount = 0;
            const instances = snapshotMapping.instances.filter((instance) => {
                for (let pathLength = 1; pathLength < instance.path.length; pathLength += 1) {
                    const ancestorPath = instance.path
                        .slice(0, pathLength)
                        .join("\u0001");
                    if (conflictPaths.has(ancestorPath)) {
                        preservedCount += 1;
                        return false;
                    }
                }
                const pathKey = instance.path.join("\u0001");
                const sourcePathCount = (sourcePathCounts.get(pathKey) ?? 0) + 1;
                sourcePathCounts.set(pathKey, sourcePathCount);
                const existingInstance = existingInstancesByPath.get(pathKey)?.[sourcePathCount - 1];
                if (!existingInstance)
                    return true;
                preservedCount += 1;
                if (existingInstance.className !== instance.className) {
                    conflictPaths.add(pathKey);
                    conflictCount += 1;
                    log.warn(`Cannot add ${instance.path.join("/")} (${instance.className}) because an existing ${existingInstance.className} uses that path.`);
                }
                return false;
            });
            log.success(`Prepared missing-only push for ${snapshotMapping.destination.join("/")}: ${instances.length} missing, ${preservedCount} preserved, ${conflictCount} conflicts.`);
            return {
                ...snapshotMapping,
                destructive: false,
                instances,
            };
        });
    }
    async buildPushInstancesFromFile(sourceFile, destSegments) {
        if (!isScriptFileName(path.basename(sourceFile))) {
            log.error(`Source file is not a .lua/.luau script and cannot be pushed directly: ${sourceFile}`);
            return null;
        }
        const fileName = path.basename(sourceFile);
        const { className, scriptName } = classifyScriptFileName(fileName, {
            stripDisambiguationSuffix: true,
        });
        const source = await fsp.readFile(sourceFile, "utf-8");
        // Get the sourcemap node for this file, if it exists, so we can pull properties/attributes/tags from it
        const sourcemapIndex = this.getSourcemapIndexForPath(this.sourcemapPath);
        const node = findNodeForFilepath(sourceFile, sourcemapIndex);
        return [
            {
                guid: node?.guid ?? generateGUID(),
                className,
                name: scriptName,
                path: [...destSegments, scriptName],
                source,
                properties: node?.properties,
                attributes: node?.attributes,
                tags: node?.tags,
            },
        ];
    }
    async buildRojoInstances(destSegments, sourceOverride) {
        const sourceRootOpt = sourceOverride ?? this.options.source;
        const projectFiles = await this.resolveRojoProjectFiles(sourceRootOpt);
        if (projectFiles.length === 0) {
            if (!sourceRootOpt) {
                log.error("Rojo compatibility mode could not find default.project.json. Provide --rojo-project or point --source to a folder that contains one.");
                return null;
            }
            const sourceRoot = path.resolve(process.cwd(), sourceRootOpt);
            if (!fs.existsSync(sourceRoot)) {
                log.error(`Source path not found for Rojo compatibility mode: ${sourceRoot}`);
                return null;
            }
            log.warn("No default.project.json found; falling back to loose script import with Rojo-style init module handling.");
            const loose = await this.collectLooseScripts(sourceRoot, destSegments, new Set(), new Set(), new Set());
            log.info(`Rojo compatibility imported ${loose.length} loose instance(s) without a project JSON from ${sourceRoot}`);
            if (loose.length === 0) {
                log.warn(`Rojo compatibility fallback found no scripts under ${sourceRoot}.`);
            }
            return this.dedupeRojoInstances(loose);
        }
        const allInstances = [];
        const projectDirs = new Set();
        for (const projectFile of projectFiles) {
            // If a source root was provided, include the relative path from that root to the project file's folder
            let relativeSegments = [];
            if (sourceRootOpt) {
                const sourceRoot = path.resolve(process.cwd(), sourceRootOpt);
                const projectDir = path.dirname(projectFile);
                projectDirs.add(projectDir);
                const rel = path.relative(sourceRoot, projectDir).replace(/\\/g, "/");
                if (rel && !rel.startsWith("..")) {
                    relativeSegments = rel.split("/").filter(Boolean);
                }
            }
            const effectivePrefix = [...destSegments, ...relativeSegments];
            const builder = new RojoSnapshotBuilder({
                projectFile,
                cwd: process.cwd(),
                destPrefix: effectivePrefix,
            });
            log.info(`Preparing Rojo compatibility push from ${projectFile}`);
            try {
                const built = await builder.build();
                allInstances.push(...built);
            }
            catch (error) {
                log.error(`${error}`);
                return null;
            }
        }
        // Emit loose scripts not covered by a Rojo project (e.g., cmdr.lua, janitor.lua, Promise.lua)
        if (sourceRootOpt) {
            const sourceRoot = path.resolve(process.cwd(), sourceRootOpt);
            const existingFolders = new Set(allInstances
                .filter((i) => i.className === "Folder")
                .map((i) => i.path.join("/")));
            const existingPaths = new Set(allInstances.map((i) => i.path.join("/")));
            const loose = await this.collectLooseScripts(sourceRoot, destSegments, projectDirs, existingFolders, existingPaths);
            allInstances.push(...loose);
            if (loose.length > 0) {
                log.info(`Rojo compatibility imported ${loose.length} loose instance(s) not covered by default.project.json files.`);
            }
        }
        if (allInstances.length === 0) {
            log.warn("Rojo compatibility build produced 0 instances. Check project paths and ignores.");
        }
        return this.dedupeRojoInstances(allInstances);
    }
    dedupeRojoInstances(instances) {
        const byKey = new Map();
        for (const instance of instances) {
            const key = `${instance.path.join("/")}::${instance.className}`;
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, instance);
                continue;
            }
            const existingIsFolder = existing.className === "Folder";
            const incomingIsFolder = instance.className === "Folder";
            if (existingIsFolder && !incomingIsFolder) {
                byKey.set(key, instance);
                continue;
            }
            if (!existingIsFolder && incomingIsFolder) {
                continue;
            }
            const existingIsScript = this.isScriptClassName(existing.className);
            const incomingIsScript = this.isScriptClassName(instance.className);
            if (existingIsScript && incomingIsScript) {
                if (typeof existing.source === "string" &&
                    typeof instance.source === "string" &&
                    existing.source !== instance.source) {
                    log.warn(`Rojo push dedupe: conflicting script content at ${instance.path.join("/")} (${instance.className}); keeping first occurrence.`);
                }
            }
        }
        const deduped = [...byKey.values()];
        deduped.sort((a, b) => {
            if (a.path.length !== b.path.length) {
                return a.path.length - b.path.length;
            }
            return a.path.join("/").localeCompare(b.path.join("/"));
        });
        if (deduped.length !== instances.length) {
            log.debug(`Rojo push dedupe removed ${instances.length - deduped.length} duplicate instance(s).`);
        }
        return deduped;
    }
    isScriptClassName(className) {
        return (className === "Script" ||
            className === "LocalScript" ||
            className === "ModuleScript");
    }
    /**
     * Determines push mappings to use based on CLI options and/or place config from Studio.
     * Priority:
     * 1. CLI-provided source/destination
     * 2. Place config provided by Studio (if --use-place-config is not false)
     * @returns
     */
    async collectMappings() {
        if (this.options.mappings && this.options.mappings.length > 0) {
            const mappings = [];
            for (const mapping of this.options.mappings) {
                const destination = this.parseDestination(mapping.destination);
                if (destination.length === 0) {
                    log.error("Destination must be a dot-separated path (e.g., ReplicatedStorage.Packages)");
                    return null;
                }
                mappings.push({
                    source: mapping.source,
                    destination,
                    destructive: Boolean(this.options.destructive),
                });
            }
            return mappings;
        }
        // CLI-provided mapping takes priority
        if (this.options.source && this.options.destination) {
            const destSegments = this.parseDestination(this.options.destination);
            if (destSegments.length === 0) {
                log.error("Destination must be a dot-separated path (e.g., ReplicatedStorage.Packages)");
                return null;
            }
            return [
                {
                    source: this.options.source,
                    destination: destSegments,
                    destructive: Boolean(this.options.destructive),
                },
            ];
        }
        if (this.options.usePlaceConfig === false) {
            return null;
        }
        log.info("No source/destination provided. Requesting push config from Studio... (ServerStorage.Azul.Config)");
        const config = await this.waitForPushConfig();
        if (!config) {
            return null;
        }
        log.debug("Received push config from Studio.", config);
        const sanitizedMappings = config.mappings?.filter((m) => Boolean(m && m.source && m.destination && m.destination.length > 0));
        if (!sanitizedMappings || sanitizedMappings.length === 0) {
            log.error("Received push config, but no valid mappings were found.");
            return null;
        }
        return sanitizedMappings.map((m) => ({
            source: m.source,
            destination: m.destination,
            destructive: Boolean(m.destructive),
            rojoMode: Boolean(m.rojoMode),
            fromSourcemap: typeof m.fromSourcemap === "string" && m.fromSourcemap.trim().length > 0
                ? m.fromSourcemap
                : undefined,
        }));
    }
    /**
     * Parses a destination string into path segments, trimming whitespace and ignoring empty segments.
     * Accepts dot, forward slash, or backslash as separators for user convenience.
     * @param input
     * @returns
     */
    parseDestination(input) {
        return input
            .split(/[./\\]+/)
            .map((segment) => segment.trim())
            .filter(Boolean);
    }
    /**
     * Builds instances for a push mapping using a specified sourcemap as the source of truth.
     * @param sourceDir
     * @param destSegments
     * @param sourcemapPath
     * @returns
     */
    buildPushInstancesFromSourcemap(sourceDir, destSegments, sourcemapPath) {
        const all = buildInstancesFromSourcemap(sourcemapPath);
        if (!all || all.length === 0) {
            return null;
        }
        const sourcePrefix = this.inferSourcePrefixFromPath(sourceDir, all);
        if (!sourcePrefix || sourcePrefix.length === 0) {
            return null;
        }
        const selected = all.filter((instance) => this.pathStartsWith(instance.path, sourcePrefix));
        const rebased = selected
            .filter((instance) => instance.path.length > sourcePrefix.length)
            .map((instance) => ({
            ...instance,
            path: [...destSegments, ...instance.path.slice(sourcePrefix.length)],
        }));
        log.debug(`Mapped ${selected.length} instance(s) from sourcemap subtree "${sourcePrefix.join("/")}" to destination "${destSegments.join("/")}".`);
        // const rebasedString = rebased
        //   .map((i) => `${i.path.join("/")} (${i.className})`)
        //   .join(",\n");
        // log.debug(`Rebased instances: ${rebasedString}`);
        rebased.sort((a, b) => a.path.length - b.path.length);
        return rebased;
    }
    resolveMappingSourcemapPath(mapping) {
        if (this.options.useSourcemapAsSource) {
            return this.sourcemapPath;
        }
        if (typeof mapping.fromSourcemap === "string" &&
            mapping.fromSourcemap.trim().length > 0) {
            return path.resolve(process.cwd(), mapping.fromSourcemap);
        }
        return null;
    }
    /**
     * Retrieves the property index for a given sourcemap path, loading it if necessary.
     * @param sourcemapPath The file path to the sourcemap to load the index for.
     * @returns The property index for the specified sourcemap.
     */
    getSourcemapIndexForPath(sourcemapPath) {
        const existing = this.sourcemapIndexByPath.get(sourcemapPath);
        if (existing) {
            return existing;
        }
        const loaded = loadSourcemapPropertyIndex(sourcemapPath);
        this.sourcemapIndexByPath.set(sourcemapPath, loaded);
        return loaded;
    }
    inferSourcePrefixFromPath(sourceDir, instances) {
        const studioPath = this.parseDestination(sourceDir);
        if (studioPath.length > 0 &&
            instances.some((instance) => this.pathStartsWith(instance.path, studioPath))) {
            return studioPath;
        }
        const normalized = path
            .resolve(sourceDir)
            .replace(/\\/g, "/")
            .split("/")
            .filter(Boolean);
        let best = null;
        for (let start = 0; start < normalized.length; start++) {
            const candidate = normalized.slice(start);
            if (candidate.length === 0)
                continue;
            const matches = instances.some((instance) => this.pathStartsWith(instance.path, candidate));
            if (!matches)
                continue;
            if (!best || candidate.length > best.length) {
                best = candidate;
            }
        }
        return best;
    }
    pathStartsWith(pathSegments, prefix) {
        if (prefix.length > pathSegments.length)
            return false;
        for (let index = 0; index < prefix.length; index++) {
            if (pathSegments[index] !== prefix[index])
                return false;
        }
        return true;
    }
    async resolveRojoProjectFiles(sourceOverride) {
        const cwd = process.cwd();
        const results = new Set();
        const add = (p) => {
            const abs = path.resolve(cwd, p);
            if (fs.existsSync(abs)) {
                results.add(abs);
            }
        };
        if (this.options.rojoProjectFile) {
            add(this.options.rojoProjectFile);
            return [...results];
        }
        const sourceRootOpt = sourceOverride ?? this.options.source;
        // If a source root is provided, only search within it (and its nested projects).
        if (sourceRootOpt) {
            const srcRoot = path.resolve(cwd, sourceRootOpt);
            if (!fs.existsSync(srcRoot)) {
                log.warn(`--source path does not exist: ${srcRoot}`);
                return [];
            }
            const direct = path.join(srcRoot, "default.project.json");
            if (fs.existsSync(direct)) {
                results.add(direct);
            }
            const foundInSource = await this.findProjectJsons(srcRoot, 6);
            for (const f of foundInSource) {
                results.add(f);
            }
            return [...results];
        }
        // No source root: search at workspace root (previous behavior).
        const rootDirect = path.join(cwd, "default.project.json");
        if (fs.existsSync(rootDirect)) {
            results.add(rootDirect);
        }
        const found = await this.findProjectJsons(cwd, 3);
        for (const f of found) {
            results.add(f);
        }
        return [...results];
    }
    /**
     * Breadth-first search for all default.project.json under a root.
     * Skips common vendor/ignored folders.
     */
    async findProjectJsons(root, maxDepth) {
        const queue = [{ dir: root, depth: 0 }];
        const found = [];
        const FOLDERS_TO_SKIP = new Set(["node_modules", ".git", "dist", "sync"]);
        while (queue.length > 0) {
            const { dir, depth } = queue.shift();
            if (depth > maxDepth)
                continue;
            let entries;
            try {
                entries = await fsp.readdir(dir, { withFileTypes: true });
            }
            catch {
                continue;
            }
            // Deterministic order
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (entry.isFile() && entry.name === "default.project.json") {
                    found.push(path.join(dir, entry.name));
                }
            }
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                if (FOLDERS_TO_SKIP.has(entry.name))
                    continue;
                queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
            }
        }
        return found;
    }
    async collectLooseScripts(root, destSegments, projectDirs, emittedFolders, emittedPaths) {
        const results = [];
        const walk = async (dir, relSegments) => {
            // Skip directories already handled by a Rojo project
            for (const proj of projectDirs) {
                if (dir === proj || dir.startsWith(proj + path.sep)) {
                    return;
                }
            }
            let entries;
            try {
                entries = await fsp.readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            // If this directory has an init-like file, treat the directory itself as that script
            const initCandidates = [
                "init.lua",
                "init.luau",
                "init.server.lua",
                "init.server.luau",
                "init.client.lua",
                "init.client.luau",
                "init.module.lua",
                "init.module.luau",
            ];
            const initEntry = entries.find((e) => e.isFile() && initCandidates.includes(e.name));
            const initModelEntry = entries.find((e) => e.isFile() && e.name === "init.model.json");
            if (initModelEntry) {
                const full = path.join(dir, "init.model.json");
                const destPath = [...destSegments, ...relSegments];
                const key = destPath.join("/");
                if (!emittedPaths.has(key)) {
                    this.ensureFolder(destPath.slice(0, -1), results, emittedFolders);
                    emittedPaths.add(key);
                    emittedFolders.add(key); // prevent folder emission at this path
                    const builder = new RojoSnapshotBuilder({ cwd: process.cwd() });
                    const modelInstances = await builder.parseModelFile(full, destPath);
                    if (modelInstances.length > 0) {
                        const rootInstance = modelInstances[0];
                        if (initEntry) {
                            const scriptClass = classifyScriptFileName(initEntry.name, {
                                stripDisambiguationSuffix: true,
                            }).className;
                            const source = await fsp.readFile(path.join(dir, initEntry.name), "utf-8");
                            rootInstance.className = scriptClass;
                            rootInstance.source = source;
                        }
                        results.push(...modelInstances);
                    }
                }
            }
            else if (initEntry) {
                const full = path.join(dir, initEntry.name);
                const { className } = classifyScriptFileName(initEntry.name, {
                    stripDisambiguationSuffix: true,
                });
                const destPath = [...destSegments, ...relSegments];
                const key = destPath.join("/");
                if (!emittedPaths.has(key)) {
                    this.ensureFolder(destPath.slice(0, -1), results, emittedFolders);
                    emittedPaths.add(key);
                    emittedFolders.add(key); // prevent folder emission at this path
                    results.push({
                        guid: generateGUID(),
                        className,
                        name: destPath[destPath.length - 1] ?? path.basename(dir),
                        path: destPath,
                        source: await fsp.readFile(full, "utf-8"),
                    });
                }
            }
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(full, [...relSegments, entry.name]);
                    continue;
                }
                if (initEntry && initEntry.name === entry.name) {
                    continue; // already emitted as the container
                }
                if (initModelEntry && entry.name === "init.model.json") {
                    continue;
                }
                if (isInstanceJsonName(entry.name)) {
                    const baseName = entry.name.slice(0, -".model.json".length);
                    const destPath = [...destSegments, ...relSegments, baseName];
                    const key = destPath.join("/");
                    if (emittedPaths.has(key))
                        continue;
                    this.ensureFolder(destPath.slice(0, -1), results, emittedFolders);
                    emittedPaths.add(key);
                    const builder = new RojoSnapshotBuilder({ cwd: process.cwd() });
                    const modelInstances = await builder.parseModelFile(full, destPath);
                    if (modelInstances.length > 0) {
                        const rootInstance = modelInstances[0];
                        const companionScript = entries.find((e) => e.isFile() &&
                            isScriptFileName(e.name) &&
                            classifyScriptFileName(e.name, {
                                stripDisambiguationSuffix: true,
                            }).scriptName === baseName);
                        if (companionScript) {
                            const scriptClass = classifyScriptFileName(companionScript.name, {
                                stripDisambiguationSuffix: true,
                            }).className;
                            const source = await fsp.readFile(path.join(dir, companionScript.name), "utf-8");
                            rootInstance.className = scriptClass;
                            rootInstance.source = source;
                        }
                        results.push(...modelInstances);
                    }
                    continue;
                }
                if (!isScriptFileName(entry.name))
                    continue;
                // Skip scripts that are companion scripts of a companion model file
                const baseName = classifyScriptFileName(entry.name, {
                    stripDisambiguationSuffix: true,
                }).scriptName;
                const companionModelName = `${baseName}.model.json`;
                const hasCompanionModel = entries.some((e) => e.isFile() && e.name === companionModelName);
                if (hasCompanionModel) {
                    continue;
                }
                const { className, scriptName } = classifyScriptFileName(entry.name, {
                    stripDisambiguationSuffix: true,
                });
                const destPath = [...destSegments, ...relSegments, scriptName];
                const key = destPath.join("/");
                if (emittedPaths.has(key))
                    continue;
                this.ensureFolder(destPath.slice(0, -1), results, emittedFolders);
                emittedPaths.add(key);
                results.push({
                    guid: generateGUID(),
                    className,
                    name: scriptName,
                    path: destPath,
                    source: await fsp.readFile(full, "utf-8"),
                });
            }
        };
        await walk(root, []);
        return results;
    }
    ensureFolder(pathSegments, results, emittedFolders) {
        if (pathSegments.length === 0)
            return;
        const key = pathSegments.join("/");
        if (emittedFolders.has(key))
            return;
        this.ensureFolder(pathSegments.slice(0, -1), results, emittedFolders);
        emittedFolders.add(key);
        results.push({
            guid: generateGUID(),
            className: "Folder",
            name: pathSegments[pathSegments.length - 1],
            path: [...pathSegments],
        });
    }
    /**
     * Normalize source path strings from config, preferring the raw value but
     * attempting obvious fixes (e.g., accidental leading '.' before a folder).
     */
    expandSourceCandidates(source) {
        const candidates = [];
        const cwd = process.cwd();
        const add = (p) => {
            const abs = path.resolve(cwd, p);
            if (!candidates.includes(abs)) {
                candidates.push(abs);
            }
        };
        add(source);
        // If someone wrote ".Packages" by mistake, try "Packages"
        if (source.startsWith(".")) {
            const trimmedDot = source.replace(/^\.*/, "");
            if (trimmedDot)
                add(trimmedDot);
        }
        // If someone prefixed with ./ or .\, resolve both forms
        if (source.startsWith("./") || source.startsWith(".\\")) {
            add(source.slice(2));
        }
        return candidates;
    }
    async waitForPushConfig() {
        return new Promise((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    log.warn("Timed out waiting for push config from Studio.");
                    resolved = true;
                    resolve(null);
                }
            }, 8000);
            this.ipc.onMessage((message) => {
                if (message.type === "pushConfig") {
                    const pushConfig = message.config;
                    clearTimeout(timeout);
                    if (!resolved) {
                        resolved = true;
                        resolve(pushConfig);
                    }
                }
            });
            // Ask the plugin to send config after connection
            this.ipc.onConnection(() => {
                log.info("Studio connected. Waiting for handshake...");
            });
            this.ipc.onHandshake(() => {
                const request = { type: "requestPushConfig" };
                this.ipc.send(request);
            });
        });
    }
}
//# sourceMappingURL=push.js.map