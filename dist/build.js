import path from "node:path";
import fs from "node:fs";
import { IPCServer } from "./ipc/server.js";
import { config } from "./config.js";
import { log } from "./util/log.js";
import { SnapshotBuilder } from "./snapshot.js";
import { RojoSnapshotBuilder } from "./snapshot/rojo/index.js";
import { applySourcemapProperties, buildInstancesFromSourcemap, loadSourcemapPropertyIndex, } from "./sourcemap/propertyLoader.js";
export class BuildCommand {
    ipc;
    syncDir;
    rojoMode;
    rojoProjectFile;
    applySourcemapProperties;
    useSourcemapAsSource;
    sourcemapPath;
    destructive;
    constructor(options = {}) {
        this.syncDir = path.resolve(options.syncDir ?? config.syncDir);
        this.rojoMode = Boolean(options.rojoMode);
        this.rojoProjectFile = options.rojoProjectFile;
        this.applySourcemapProperties = options.applySourcemapProperties !== false;
        this.useSourcemapAsSource = options.useSourcemapAsSource === true;
        this.sourcemapPath = path.resolve(options.sourcemapPath ?? config.sourcemapPath);
        this.destructive = options.destructive === true;
        this.ipc = new IPCServer(config.port, undefined, {
            requestSnapshotOnConnect: false,
        });
    }
    async run() {
        const builder = this.rojoMode
            ? new RojoSnapshotBuilder({
                projectFile: this.rojoProjectFile,
                cwd: process.cwd(),
                destPrefix: [],
            })
            : new SnapshotBuilder({
                sourceDir: this.syncDir,
                destPrefix: [],
                skipSymlinks: true,
            });
        if (this.rojoMode) {
            log.info(`Preparing Rojo compatibility build from ${this.rojoProjectFile ?? "default.project.json"}`);
        }
        else {
            log.info(`Preparing build snapshot from ${this.syncDir}`);
        }
        let instances = [];
        if (!this.rojoMode && this.useSourcemapAsSource) {
            const built = buildInstancesFromSourcemap(this.sourcemapPath);
            if (!built) {
                log.warn("Falling back to filesystem build because sourcemap import failed.");
            }
            else {
                instances = built;
            }
        }
        if (instances.length === 0) {
            try {
                instances = await builder.build();
            }
            catch (error) {
                log.error(`${error}`);
                return;
            }
        }
        if (!this.rojoMode &&
            this.applySourcemapProperties &&
            !this.useSourcemapAsSource) {
            const index = loadSourcemapPropertyIndex(this.sourcemapPath);
            const applied = applySourcemapProperties(instances, index);
            if (applied <= 0) {
                if (!index && fs.existsSync(this.sourcemapPath)) {
                    log.warn("Sourcemap present but could not be parsed; continuing without properties.");
                }
                else {
                    log.info("No packed properties found in sourcemap; continuing with script/folder snapshot only.");
                }
            }
        }
        log.info(`Waiting for Studio to connect on port ${config.port}...`);
        await new Promise((resolve) => {
            this.ipc.onConnection(() => {
                log.info("Studio connected. Waiting for handshake...");
            });
            this.ipc.onHandshake(() => {
                log.info("Handshake complete. Sending build snapshot...");
                this.ipc.send({
                    type: "buildSnapshot",
                    data: instances,
                    destructive: this.destructive,
                });
                log.success(`Sent ${instances.length} instances`);
                setTimeout(() => {
                    this.ipc.close();
                    resolve();
                }, 200);
            });
        });
    }
}
//# sourceMappingURL=build.js.map