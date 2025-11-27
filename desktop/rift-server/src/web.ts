import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken");
import cors from "cors";

import * as db from "./database.js";
import type WebSocketManager from "./sockets.js";

// Factory function to create express app with socket manager reference
export function createApp(sockets: WebSocketManager) {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json());

    // GET /. Just return some default text.
    app.get("/", (req: Request, res: Response) => {
        res.send("Rift server is running.");
    });

    // GET /status/:userId - Check if a desktop is online for a user
    app.get("/status/:userId", async (req: Request, res: Response) => {
        const userId = req.params.userId;
        
        if (!userId) {
            return res.status(400).json({
                ok: false,
                error: "Missing user ID."
            });
        }

        const isOnline = sockets.isUserOnline(userId);
        const registered = await db.lookup(userId);

        res.json({
            ok: true,
            userId,
            desktopOnline: isOnline,
            registered: !!registered
        });
    });

    // POST /register. Register a user (Supabase user ID) with their public key.
    app.post("/register", async (req: Request, res: Response) => {
        // Check that they provided a public key and user ID.
        if (typeof req.body.pubkey !== "string") {
            return res.status(400).json({
                ok: false,
                error: "Missing public key."
            });
        }

        if (typeof req.body.userId !== "string") {
            return res.status(400).json({
                ok: false,
                error: "Missing user ID."
            });
        }

        if (!process.env.RIFT_JWT_SECRET) {
            return res.status(500).json({
                ok: false,
                error: "Server configuration error."
            });
        }

        // Register the user with their public key
        const userId = await db.registerUser(req.body.userId, req.body.pubkey);
        console.log("[+] User registered. User ID: " + userId);

        // Sign a JWT and return it (contains the userId for WebSocket connection)
        res.json({
            ok: true,
            token: jwt.sign({
                userId
            }, process.env.RIFT_JWT_SECRET)
        });
    });

    // GET /check?token=jY... Checks if a specified JWT is valid.
    app.get("/check", async (req: Request, res: Response) => {
        if (typeof req.query.token !== "string") {
            return res.status(400).json({
                ok: false,
                error: "Missing a token to check."
            });
        }

        if (!process.env.RIFT_JWT_SECRET) {
            return res.status(500).json({
                ok: false,
                error: "Server configuration error."
            });
        }

        jwt.verify(req.query.token as string, process.env.RIFT_JWT_SECRET, async (err: Error | null, obj: any) => {
            // If the token could not be decoded, or if it doesn't contain a userId field, return false.
            if (err) return res.json(false);
            if (!obj || typeof obj.userId !== "string") return res.json(false);

            // Return whether or not the user exists in our database.
            const exists = await db.lookup(obj.userId);
            res.json(!!exists);
        });
    });

    return app;
}
