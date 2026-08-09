export interface ParsedCliArgs {
    command: string | null;
    help: boolean;
    version: boolean;
    debug: boolean;
    noWarn: boolean;
    syncDir?: string;
    port?: number;
    rojo: boolean;
    rojoProject?: string;
    fromSourcemap?: string;
    source?: string;
    packSources: string[];
    destination?: string;
    pushDestinations: string[];
    noPlaceConfig: boolean;
    destructive: boolean;
    missingOnly: boolean;
    output?: string;
    scriptsOnly: boolean;
    configPath: boolean;
}
export declare function parseCliArgs(argv: string[]): ParsedCliArgs;
//# sourceMappingURL=cliArgs.d.ts.map