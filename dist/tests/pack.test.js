import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PackCommand } from "../pack.js";
import { PushCommand } from "../push.js";
import { config } from "../config.js";
import { parseCliArgs } from "../util/cliArgs.js";
// Use ephemeral IPC port to avoid collisions
config.port = 0;
test("PackCommand regenerate and pack produce _azul metadata and pack nodes", () => {
    const pack = new PackCommand({});
    try {
        const snapshot = [
            {
                guid: "groot",
                className: "ReplicatedStorage",
                name: "ReplicatedStorage",
                path: ["ReplicatedStorage"],
            },
            {
                guid: "gmod",
                className: "Folder",
                name: "ModuleA",
                path: ["ReplicatedStorage", "ModuleA"],
                parentGuid: "groot",
            },
            {
                guid: "gfoo",
                className: "ModuleScript",
                name: "Foo",
                path: ["ReplicatedStorage", "ModuleA", "Foo"],
                parentGuid: "gmod",
                properties: { X: 1 },
                attributes: { A: true },
                tags: ["t"],
            },
        ];
        const root = pack.regenerateSourcemap(snapshot, null);
        const packed = pack.packIntoSourcemap(snapshot, root);
        assert.strictEqual(typeof root._azul?.packedAt, "string");
        assert.strictEqual(root._azul?.packVersion, 1);
        assert.strictEqual(typeof packed, "number");
    }
    finally {
        pack.ipc.close();
    }
});
test("PackCommand selects multiple Studio source trees and their ancestors", () => {
    const pack = new PackCommand({
        sources: ["ReplicatedStorage.Assets.VFX", "StarterGui/VFX"],
    });
    try {
        const snapshot = [
            {
                guid: "replicated-storage",
                className: "ReplicatedStorage",
                name: "ReplicatedStorage",
                path: ["ReplicatedStorage"],
            },
            {
                guid: "assets",
                className: "Folder",
                name: "Assets",
                path: ["ReplicatedStorage", "Assets"],
            },
            {
                guid: "vfx",
                className: "Folder",
                name: "VFX",
                path: ["ReplicatedStorage", "Assets", "VFX"],
            },
            {
                guid: "sparkles",
                className: "ParticleEmitter",
                name: "Sparkles",
                path: ["ReplicatedStorage", "Assets", "VFX", "Sparkles"],
            },
            {
                guid: "sounds",
                className: "Folder",
                name: "Sounds",
                path: ["ReplicatedStorage", "Assets", "Sounds"],
            },
            {
                guid: "starter-gui",
                className: "StarterGui",
                name: "StarterGui",
                path: ["StarterGui"],
            },
            {
                guid: "gui-vfx",
                className: "ScreenGui",
                name: "VFX",
                path: ["StarterGui", "VFX"],
            },
        ];
        const selected = pack.selectSnapshotSources(snapshot);
        const selectedPaths = selected.map((instance) => instance.path.join("/"));
        assert.deepStrictEqual(selectedPaths, [
            "ReplicatedStorage",
            "ReplicatedStorage/Assets",
            "ReplicatedStorage/Assets/VFX",
            "ReplicatedStorage/Assets/VFX/Sparkles",
            "StarterGui",
            "StarterGui/VFX",
        ]);
    }
    finally {
        pack.ipc.close();
    }
});
test("parseCliArgs retains repeated pack sources and missing-only", () => {
    const parsed = parseCliArgs([
        "pack",
        "--source",
        "ReplicatedStorage.Assets",
        "-s=StarterGui.VFX",
        "--missing-only",
    ]);
    assert.deepStrictEqual(parsed.packSources, [
        "ReplicatedStorage.Assets",
        "StarterGui.VFX",
    ]);
    assert.strictEqual(parsed.missingOnly, true);
});
test("parseCliArgs retains repeated push destinations", () => {
    const parsed = parseCliArgs([
        "push",
        "--source",
        "ReplicatedStorage.LegacyAssets",
        "--destination",
        "ReplicatedStorage.Assets",
        "-s=StarterGui",
        "-d=StarterGui",
    ]);
    assert.deepStrictEqual(parsed.packSources, [
        "ReplicatedStorage.LegacyAssets",
        "StarterGui",
    ]);
    assert.deepStrictEqual(parsed.pushDestinations, [
        "ReplicatedStorage.Assets",
        "StarterGui",
    ]);
});
test("PushCommand accepts multiple explicit mappings", async () => {
    const push = new PushCommand({
        mappings: [
            {
                source: "ReplicatedStorage.LegacyAssets",
                destination: "ReplicatedStorage.Assets",
            },
            {
                source: "StarterGui",
                destination: "StarterGui",
            },
        ],
    });
    try {
        const mappings = await push.collectMappings();
        assert.deepStrictEqual(mappings, [
            {
                source: "ReplicatedStorage.LegacyAssets",
                destination: ["ReplicatedStorage", "Assets"],
                destructive: false,
            },
            {
                source: "StarterGui",
                destination: ["StarterGui"],
                destructive: false,
            },
        ]);
    }
    finally {
        push.ipc.close();
    }
});
test("PushCommand reads a Studio source path directly from a sourcemap", () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "azul-push-test-"));
    const sourcemapPath = path.join(temporaryDirectory, "assets.json");
    fs.writeFileSync(sourcemapPath, JSON.stringify({
        name: "Game",
        className: "DataModel",
        children: [
            {
                name: "ReplicatedStorage",
                className: "ReplicatedStorage",
                children: [
                    {
                        name: "Assets",
                        className: "Folder",
                        children: [
                            {
                                name: "VFX",
                                className: "Folder",
                                children: [
                                    {
                                        name: "Sparkles",
                                        className: "ParticleEmitter",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    }), "utf8");
    const push = new PushCommand({ sourcemapPath });
    try {
        const instances = push.buildPushInstancesFromSourcemap("ReplicatedStorage.Assets", ["ReplicatedStorage", "Assets"], sourcemapPath);
        assert.deepStrictEqual(instances.map((instance) => instance.path.join("/")), ["ReplicatedStorage/Assets/VFX", "ReplicatedStorage/Assets/VFX/Sparkles"]);
    }
    finally {
        push.ipc.close();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});
test("PushCommand missing-only filtering preserves existing instances", () => {
    const push = new PushCommand({ missingOnly: true });
    try {
        const mappings = [
            {
                destination: ["ReplicatedStorage", "Assets"],
                destructive: true,
                instances: [
                    {
                        guid: "vfx",
                        className: "Folder",
                        name: "VFX",
                        path: ["ReplicatedStorage", "Assets", "VFX"],
                    },
                    {
                        guid: "sparkles",
                        className: "ParticleEmitter",
                        name: "Sparkles",
                        path: ["ReplicatedStorage", "Assets", "VFX", "Sparkles"],
                    },
                    {
                        guid: "burst",
                        className: "ParticleEmitter",
                        name: "Burst",
                        path: ["ReplicatedStorage", "Assets", "VFX", "Burst"],
                    },
                    {
                        guid: "conflict",
                        className: "Frame",
                        name: "Conflict",
                        path: ["ReplicatedStorage", "Assets", "Conflict"],
                    },
                    {
                        guid: "conflict-child",
                        className: "UICorner",
                        name: "Corner",
                        path: ["ReplicatedStorage", "Assets", "Conflict", "Corner"],
                    },
                ],
            },
        ];
        const existingInstances = [
            {
                guid: "existing-vfx",
                className: "Folder",
                name: "VFX",
                path: ["ReplicatedStorage", "Assets", "VFX"],
            },
            {
                guid: "existing-sparkles",
                className: "ParticleEmitter",
                name: "Sparkles",
                path: ["ReplicatedStorage", "Assets", "VFX", "Sparkles"],
            },
            {
                guid: "existing-conflict",
                className: "Part",
                name: "Conflict",
                path: ["ReplicatedStorage", "Assets", "Conflict"],
            },
            {
                guid: "local-only",
                className: "Folder",
                name: "LocalOnly",
                path: ["ReplicatedStorage", "Assets", "LocalOnly"],
            },
        ];
        const filtered = push.filterExistingInstances(mappings, existingInstances);
        assert.strictEqual(filtered[0].destructive, false);
        assert.deepStrictEqual(filtered[0].instances.map((instance) => instance.path.join("/")), ["ReplicatedStorage/Assets/VFX/Burst"]);
    }
    finally {
        push.ipc.close();
    }
});
//# sourceMappingURL=pack.test.js.map