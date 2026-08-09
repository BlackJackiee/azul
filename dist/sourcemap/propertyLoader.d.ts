import type { InstanceData } from "../ipc/messages.js";
interface SourcemapNode {
    name: string;
    className: string;
    guid?: string;
    properties?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    tags?: string[];
    children?: SourcemapNode[];
    filePaths?: string[];
}
export interface SourcemapPropertyIndex {
    byGuid: Map<string, SourcemapNode>;
    byPathClass: Map<string, SourcemapNode[]>;
    byFilePath: Map<string, SourcemapNode>;
}
export declare function loadSourcemapPropertyIndex(sourcemapPath: string): SourcemapPropertyIndex | null;
/**
 * Applies properties/attributes/tags from a sourcemap index to a set of instances based on matching guid or path+class.
 * @param instances
 * @param index
 * @returns
 */
export declare function applySourcemapProperties(instances: InstanceData[], index: SourcemapPropertyIndex | null): number;
export declare function buildInstancesFromSourcemap(sourcemapPath: string): InstanceData[] | null;
export declare function findNodeForFilepath(filepath: string, index: SourcemapPropertyIndex | null): SourcemapNode | null;
export {};
//# sourceMappingURL=propertyLoader.d.ts.map