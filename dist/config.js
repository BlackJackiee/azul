import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "./util/log.js";
export const defaultConfig = {
    port: 8080,
    debugMode: false,
    syncDir: "./sync",
    sourcemapPath: "./sourcemap.json",
    scriptExtension: ".luau",
    fileWatchDebounce: 100,
    deleteOrphansOnConnect: true,
    suffixModuleScripts: false,
    checkForUpdates: true,
};
export const config = { ...defaultConfig };
let initialized = false;
export function getUserConfigPath() {
    const configRoot = getPlatformConfigRoot();
    return path.join(configRoot, "azul", "config.json");
}
export function initializeConfig() {
    if (initialized) {
        return;
    }
    initialized = true;
    const configPath = getUserConfigPath();
    ensureUserConfigExists(configPath);
    const userConfig = readUserConfig(configPath);
    if (!userConfig) {
        return;
    }
    addMissingFields(userConfig);
    Object.assign(config, userConfig);
}
function getPlatformConfigRoot() {
    if (process.platform === "win32") {
        return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    }
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support");
    }
    return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
}
function ensureUserConfigExists(configPath) {
    try {
        const configDir = path.dirname(configPath);
        fs.mkdirSync(configDir, { recursive: true });
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
        }
    }
    catch (error) {
        log.warn("Failed to initialize Azul user config file:", error);
    }
}
function addMissingFields(target) {
    Object.assign(target, { ...defaultConfig, ...target });
    try {
        const configPath = getUserConfigPath();
        fs.writeFileSync(configPath, `${JSON.stringify(target, null, 2)}\n`, "utf8");
    }
    catch (error) {
        log.warn("Failed to add missing fields to Azul user config:", error);
    }
}
function readUserConfig(configPath) {
    try {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) {
            return null;
        }
        return sanitizeConfig(parsed);
    }
    catch (error) {
        log.warn("Failed to read Azul user config file:", error);
        return null;
    }
}
function sanitizeConfig(input) {
    const sanitized = {};
    if (isPositiveInteger(input.port)) {
        sanitized.port = input.port;
    }
    if (typeof input.debugMode === "boolean") {
        sanitized.debugMode = input.debugMode;
    }
    if (isNonEmptyString(input.syncDir)) {
        sanitized.syncDir = input.syncDir;
    }
    if (isNonEmptyString(input.sourcemapPath)) {
        sanitized.sourcemapPath = input.sourcemapPath;
    }
    if (isNonEmptyString(input.scriptExtension)) {
        sanitized.scriptExtension = input.scriptExtension;
    }
    if (isPositiveInteger(input.fileWatchDebounce)) {
        sanitized.fileWatchDebounce = input.fileWatchDebounce;
    }
    if (typeof input.deleteOrphansOnConnect === "boolean") {
        sanitized.deleteOrphansOnConnect = input.deleteOrphansOnConnect;
    }
    if (typeof input.suffixModuleScripts === "boolean") {
        sanitized.suffixModuleScripts = input.suffixModuleScripts;
    }
    if (typeof input.checkForUpdates === "boolean") {
        sanitized.checkForUpdates = input.checkForUpdates;
    }
    return sanitized;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
//# sourceMappingURL=config.js.map