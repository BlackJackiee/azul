export type ScriptClassName = "Script" | "LocalScript" | "ModuleScript";
export interface ClassifiedScriptFile {
    className: ScriptClassName;
    scriptName: string;
}
export interface ClassifyScriptFileOptions {
    stripDisambiguationSuffix?: boolean;
}
export declare function isScriptClassName(className: string): className is ScriptClassName;
export declare function isScriptFileName(fileName: string): boolean;
export declare function isInstanceJsonName(fileName: string): boolean;
export declare function normalizeLuaLikeFileName(fileName: string): string;
export declare function stripScriptDisambiguationSuffix(scriptName: string): string;
export declare function classifyScriptFileName(fileName: string, options?: ClassifyScriptFileOptions): ClassifiedScriptFile;
//# sourceMappingURL=scriptFile.d.ts.map