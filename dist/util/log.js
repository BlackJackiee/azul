/**
 * Simple logging utility with color support
 */
import { config } from "../config.js";
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
};
function timestamp() {
    return new Date().toISOString().slice(11, 23);
}
export const log = {
    info(message, ...args) {
        console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.blue}ℹ${colors.reset} ${message}`, ...args);
    },
    success(message, ...args) {
        console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}✓${colors.reset} ${message}`, ...args);
    },
    warn(message, ...args) {
        console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}⚠ ${message}${colors.reset}`, ...args);
    },
    error(message, ...args) {
        console.error(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}✗ ${message}${colors.reset}`, ...args);
    },
    debug(message, ...args) {
        if (config.debugMode) {
            console.log(`${colors.dim}[${timestamp()}] 🔍 ${message}${colors.reset}`, ...args);
        }
    },
    userInput(message, ...args) {
        console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.cyan}?${colors.reset} ${message}`, ...args);
    },
    script(path, action) {
        const emoji = action === "created" ? "+" : action === "updated" ? "~" : "−";
        const color = action === "created"
            ? colors.green
            : action === "updated"
                ? colors.yellow
                : colors.red;
        console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${color}${emoji}${colors.reset} ${path}`);
    },
};
//# sourceMappingURL=log.js.map