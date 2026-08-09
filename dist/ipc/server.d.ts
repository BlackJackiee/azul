import type { StudioMessage, DaemonMessage } from "./messages.js";
import type { SnapshotRequestOptions } from "./messages.js";
import type { Server as HttpServer } from "http";
export type MessageHandler = (message: StudioMessage) => void;
interface IPCServerOptions {
    requestSnapshotOnConnect?: boolean;
}
export declare class IPCServer {
    private wss;
    private client;
    private messageHandler;
    private connectionHandler;
    private handshakeHandler;
    private requestSnapshotOnConnect;
    private pingIntervals;
    private handshakeComplete;
    constructor(port?: number, server?: HttpServer, options?: IPCServerOptions);
    private setupServer;
    /**
     * Register a handler for incoming Studio messages
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Register a handler that fires when a Studio client connects
     */
    onConnection(handler: () => void): void;
    /**
     * Register a handler that fires when Studio completes the handshake
     */
    onHandshake(handler: () => void): void;
    /**
     * Send a message to the connected Studio client
     */
    send(message: DaemonMessage): boolean;
    /**
     * Send a patch to update a script's source in Studio
     */
    patchScript(guid: string, source: string): boolean;
    /**
     * Send an error message to Studio
     */
    sendError(message: string): boolean;
    /**
     * Request a full snapshot from Studio
     */
    requestSnapshot(options?: SnapshotRequestOptions): boolean;
    /**
     * Check if a client is connected
     */
    isConnected(): boolean;
    /**
     * Close the server
     */
    close(): void;
}
export {};
//# sourceMappingURL=server.d.ts.map