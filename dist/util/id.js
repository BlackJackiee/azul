import { randomBytes } from "crypto";
/**
 * Generate a unique GUID for tracking instances
 */
export function generateGUID() {
    return randomBytes(16).toString("hex");
}
/**
 * Validate GUID format
 */
export function isValidGUID(guid) {
    return /^[a-f0-9]{32}$/.test(guid);
}
//# sourceMappingURL=id.js.map