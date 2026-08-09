import { config } from "../config.js";
import { parseArgs } from "node:util";
export function parseCliArgs(argv) {
    const args = ensureOptionalStringFlagValues(argv, ["--from-sourcemap"]);
    const { values, positionals } = parseArgs({
        args,
        strict: false,
        allowPositionals: true,
        options: {
            // Global options
            help: { type: "boolean", short: "h" },
            version: { type: "boolean" },
            debug: { type: "boolean" },
            "no-warn": { type: "boolean" },
            "sync-dir": { type: "string" },
            port: { type: "string" },
            // Build/Push options
            rojo: { type: "boolean" },
            "rojo-project": { type: "string" },
            "from-sourcemap": { type: "string" },
            source: { type: "string", short: "s" },
            destination: { type: "string", short: "d" },
            "no-place-config": { type: "boolean" },
            destructive: { type: "boolean" },
            "missing-only": { type: "boolean" },
            // Pack options
            output: { type: "string", short: "o" },
            "scripts-only": { type: "boolean" },
            // Config options
            path: { type: "boolean" },
        },
    });
    const command = positionals[0] ?? null;
    //   const fromSourcemapRawValue = getStringOption(values, "from-sourcemap");
    return {
        command,
        help: getBooleanOption(values, "help"),
        version: getBooleanOption(values, "version"),
        debug: getBooleanOption(values, "debug"),
        noWarn: getBooleanOption(values, "no-warn"),
        configPath: getBooleanOption(values, "path"),
        syncDir: getStringOption(values, "sync-dir"),
        port: getNumberOptionInRange(values, "port", 1, 65535),
        rojo: getBooleanOption(values, "rojo"),
        rojoProject: getStringOption(values, "rojo-project"),
        fromSourcemap: getStringOptionWithImplicitDefault(values, "from-sourcemap", config.sourcemapPath),
        // fromSourcemap: fromSourcemapRawValue !== undefined,
        // fromSourcemapValue:
        //   fromSourcemapRawValue === "" || fromSourcemapRawValue === undefined
        //     ? null
        //     : fromSourcemapRawValue,
        source: getStringOption(values, "source"),
        packSources: getRepeatedStringOptions(argv, ["--source", "-s"]),
        destination: getStringOption(values, "destination"),
        pushDestinations: getRepeatedStringOptions(argv, [
            "--destination",
            "-d",
        ]),
        noPlaceConfig: getBooleanOption(values, "no-place-config"),
        destructive: getBooleanOption(values, "destructive"),
        missingOnly: getBooleanOption(values, "missing-only"),
        output: getStringOption(values, "output"),
        scriptsOnly: getBooleanOption(values, "scripts-only"),
    };
}
function getRepeatedStringOptions(argv, flags) {
    const options = [];
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const matchingFlag = flags.find((flag) => argument === flag || argument.startsWith(`${flag}=`));
        if (!matchingFlag)
            continue;
        if (argument.startsWith(`${matchingFlag}=`)) {
            const value = argument.slice(matchingFlag.length + 1).trim();
            if (value)
                options.push(value);
            continue;
        }
        const value = argv[index + 1];
        if (value && !value.startsWith("-")) {
            options.push(value);
            index += 1;
        }
    }
    return options;
}
function getBooleanOption(values, flagName) {
    return values[flagName] === true;
}
function getStringOption(values, flagName) {
    const flagValue = values[flagName];
    return typeof flagValue === "string" ? flagValue : undefined;
}
function getStringOptionWithImplicitDefault(values, flagName, defaultValue) {
    const flagValue = values[flagName];
    if (flagValue === undefined) {
        return undefined;
    }
    if (flagValue === "") {
        return defaultValue;
    }
    return typeof flagValue === "string" ? flagValue : undefined;
}
function getNumberOptionInRange(values, flagName, min, max) {
    const value = getStringOption(values, flagName);
    if (value === undefined) {
        return undefined;
    }
    const numberValue = Number(value);
    if (isNaN(numberValue) || numberValue < min || numberValue > max) {
        throw new Error(`Invalid --${flagName} value "${value}": expected a number between ${min} and ${max}.`);
    }
    return numberValue;
}
function ensureOptionalStringFlagValues(argv, flags) {
    const normalized = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const matchedFlag = flags.find((flag) => arg === flag);
        if (!matchedFlag) {
            normalized.push(arg);
            continue;
        }
        const nextArg = argv[i + 1];
        if (!nextArg || nextArg.startsWith("-")) {
            normalized.push(`${matchedFlag}=`);
            continue;
        }
        normalized.push(arg);
    }
    return normalized;
}
//# sourceMappingURL=cliArgs.js.map