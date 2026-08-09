import fs from "node:fs";
import { dirname, resolve } from "path";
import { log } from "./log.js";
import { fileURLToPath } from "url";
export async function getLatestVersion(packageName = "azul-sync") {
    try {
        const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
        if (!response.ok) {
            log.warn(`Could not check for updates: ${response.statusText}`);
            return null;
        }
        const data = (await response.json());
        log.debug(`Latest version of ${packageName} is ${data.version}`);
        return data.version;
    }
    catch (error) {
        log.warn(`Could not check for updates: ${error}`);
        return null;
    }
}
export function getCurrentVersion() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
    return pkg.version;
}
//# sourceMappingURL=versionUtils.js.map