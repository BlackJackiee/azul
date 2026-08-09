export function isScriptClassName(className) {
    return (className === "Script" ||
        className === "LocalScript" ||
        className === "ModuleScript");
}
export function isScriptFileName(fileName) {
    return fileName.endsWith(".lua") || fileName.endsWith(".luau");
}
export function isInstanceJsonName(fileName) {
    return fileName.endsWith(".model.json");
    // || fileName.endsWith(".meta.json"); // No support for this yet
}
export function normalizeLuaLikeFileName(fileName) {
    return fileName.replace(/\.lua$/i, ".luau");
}
export function stripScriptDisambiguationSuffix(scriptName) {
    return scriptName.replace(/__\{?[a-z0-9-]{6,}\}?$/i, "");
}
export function classifyScriptFileName(fileName, options = {}) {
    const normalized = normalizeLuaLikeFileName(fileName);
    const base = normalized.replace(/\.luau$/i, "");
    const normalizeName = (name) => options.stripDisambiguationSuffix
        ? stripScriptDisambiguationSuffix(name)
        : name;
    if (base.endsWith(".server")) {
        return {
            className: "Script",
            scriptName: normalizeName(base.replace(/\.server$/, "")),
        };
    }
    if (base.endsWith(".client")) {
        return {
            className: "LocalScript",
            scriptName: normalizeName(base.replace(/\.client$/, "")),
        };
    }
    if (base.endsWith(".module")) {
        return {
            className: "ModuleScript",
            scriptName: normalizeName(base.replace(/\.module$/, "")),
        };
    }
    return {
        className: "ModuleScript",
        scriptName: normalizeName(base),
    };
}
//# sourceMappingURL=scriptFile.js.map