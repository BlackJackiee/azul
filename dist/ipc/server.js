import { WebSocketServer, WebSocket } from "ws";
import { log } from "../util/log.js";
export class IPCServer {
    wss;
    client = null;
    messageHandler = null;
    connectionHandler = null;
    handshakeHandler = null;
    requestSnapshotOnConnect;
    pingIntervals = new Map();
    handshakeComplete = false;
    constructor(port, server, options) {
        this.requestSnapshotOnConnect = options?.requestSnapshotOnConnect !== false;
        if (server) {
            // Use existing HTTP server
            this.wss = new WebSocketServer({
                server,
                // perMessageDeflate: false, // Roblox WebSocket client does not negotiate RSV2/RSV3 extensions
                maxPayload: 256 * 1024 * 1024, // 256 MB
            });
        }
        else {
            // Create standalone WebSocket server
            this.wss = new WebSocketServer({
                port: port || 8080,
                // perMessageDeflate: false, // avoid RSV2/RSV3 bits from compression
                maxPayload: 256 * 1024 * 1024, // 256 MB
            });
        }
        this.setupServer();
    }
    setupServer() {
        this.wss.on("connection", (ws) => {
            log.info("Studio client connected");
            log.info("Waiting for Studio messages...");
            // Disconnect previous client if exists
            if (this.client) {
                log.warn("Disconnecting previous client");
                this.client.close();
            }
            this.client = ws;
            this.handshakeComplete = false;
            if (this.connectionHandler) {
                this.connectionHandler();
            }
            ws.on("message", (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    log.debug(`Received: ${message.type}`);
                    if (message.type === "handshakeStudio") {
                        if (!this.handshakeComplete) {
                            this.handshakeComplete = true;
                            if (this.handshakeHandler) {
                                this.handshakeHandler();
                            }
                        }
                        this.send({ type: "handshakeAck" });
                        return;
                    }
                    if (this.messageHandler) {
                        this.messageHandler(message);
                    }
                }
                catch (error) {
                    log.error("Failed to parse message:", error);
                    this.sendError("Invalid JSON message");
                }
            });
            ws.on("close", () => {
                const pingInterval = this.pingIntervals.get(ws);
                if (pingInterval) {
                    clearInterval(pingInterval);
                    this.pingIntervals.delete(ws);
                }
                log.info("Studio client disconnected");
                this.client = null;
                this.handshakeComplete = false;
            });
            ws.on("error", (error) => {
                log.error("WebSocket error:", error);
            });
            // Set up ping/pong to keep connection alive
            ws.on("pong", () => {
                log.debug("Received pong from client");
            });
            // Send ping every 30 seconds
            const pingInterval = setInterval(() => {
                if (this.client === ws && ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                }
                else {
                    clearInterval(pingInterval);
                    this.pingIntervals.delete(ws);
                }
            }, 30000);
            this.pingIntervals.set(ws, pingInterval);
            // Request initial snapshot after a brief delay
            if (this.requestSnapshotOnConnect) {
                setTimeout(() => {
                    if (this.client === ws) {
                        this.send({ type: "requestSnapshot" });
                    }
                }, 100);
            }
        });
        this.wss.on("listening", () => {
            log.success("WebSocket server ready");
        });
        this.wss.on("error", (error) => {
            log.error("WebSocket server error:", error);
        });
    }
    /**
     * Register a handler for incoming Studio messages
     */
    onMessage(handler) {
        this.messageHandler = handler;
    }
    /**
     * Register a handler that fires when a Studio client connects
     */
    onConnection(handler) {
        this.connectionHandler = handler;
    }
    /**
     * Register a handler that fires when Studio completes the handshake
     */
    onHandshake(handler) {
        this.handshakeHandler = handler;
        if (this.handshakeComplete) {
            handler();
        }
    }
    /**
     * Send a message to the connected Studio client
     */
    send(message) {
        if (!this.client || this.client.readyState !== WebSocket.OPEN) {
            log.warn("Cannot send message: no connected client");
            return false;
        }
        try {
            this.client.send(JSON.stringify(message));
            log.debug(`Sent: ${message.type}`);
            return true;
        }
        catch (error) {
            log.error("Failed to send message:", error);
            return false;
        }
    }
    /**
     * Send a patch to update a script's source in Studio
     */
    patchScript(guid, source) {
        return this.send({
            type: "patchScript",
            guid,
            source,
        });
    }
    /**
     * Send an error message to Studio
     */
    sendError(message) {
        return this.send({
            type: "error",
            message,
        });
    }
    /**
     * Request a full snapshot from Studio
     */
    requestSnapshot(options) {
        return this.send({
            type: "requestSnapshot",
            options,
        });
    }
    /**
     * Check if a client is connected
     */
    isConnected() {
        return this.client !== null && this.client.readyState === WebSocket.OPEN;
    }
    /**
     * Close the server
     */
    close() {
        for (const interval of this.pingIntervals.values()) {
            clearInterval(interval);
        }
        this.pingIntervals.clear();
        if (this.client) {
            this.client.close();
            this.client = null;
        }
        this.wss.close();
        log.info("WebSocket server closed.");
    }
}
//# sourceMappingURL=server.js.map