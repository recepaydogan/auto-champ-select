import dotenv from "dotenv";
dotenv.config();

import * as db from "./database.js";
import * as http from "http";
import app from "./web.js";
import WebSocketManager from "./sockets.js";

const PORT = process.env.PORT || 51001;

(async () => {
    if (!process.env.RIFT_JWT_SECRET) {
        console.error("[-] No JWT secret found. Ensure the RIFT_JWT_SECRET environment variable is set.");
        console.error("[-] You can set it with: export RIFT_JWT_SECRET=your-secret-key");
        process.exit(1);
    }

    console.log("[+] Starting rift...");
    await db.create();

    const server = http.createServer(app);

    const sockets = new WebSocketManager();
    server.on("upgrade", sockets.handleUpgradeRequest);

    console.log("[+] Listening on 0.0.0.0:" + PORT + "... ^C to exit.");
    server.listen(PORT);
})();

