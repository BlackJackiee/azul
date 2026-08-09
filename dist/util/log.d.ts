/**
 * Simple logging utility with color support
 */
export declare const log: {
    info(message: string, ...args: any[]): void;
    success(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    userInput(message: string, ...args: any[]): void;
    script(path: string, action: "created" | "updated" | "deleted"): void;
};
//# sourceMappingURL=log.d.ts.map