import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken");
import cors from "cors";

import * as db from "./database.js";

// Create a new express app using CORS and JSON bodies.
const app = express();
app.use(cors());
app.use(bodyParser.json());

// GET /. Just return some default text.
app.get("/", (req: Request, res: Response) => {
    res.send("Rift server is running.");
});

// POST /register. Receive a code for the specified public key.
app.post("/register", async (req: Request, res: Response) => {
    // Check that they provided a public key.
    if (typeof req.body.pubkey !== "string") {
        return res.status(400).json({
            ok: false,
            error: "Missing public key."
        });
    }

    if (!process.env.RIFT_JWT_SECRET) {
        return res.status(500).json({
            ok: false,
            error: "Server configuration error."
        });
    }

    // Generate a new unique code.
    const code = await db.generateCode(req.body.pubkey);
    console.log("[+] New Conduit registered. Code: " + code);

    // Sign a JWT and return it.
    res.json({
        ok: true,
        token: jwt.sign({
            code
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
        // If the token could not be decoded, or if it doesn't contain a code field, return false.
        if (err) return res.json(false);
        if (!obj || typeof obj.code !== "string") return res.json(false);

        // Return whether or not the code exists in our database.
        const exists = await db.lookup(obj.code);
        res.json(!!exists);
    });
});

export default app;

