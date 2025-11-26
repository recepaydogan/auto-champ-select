import { open, Database } from "sqlite";
import * as fs from "fs";
import * as path from "path";
import sqlite3 from "sqlite3";

let database!: Database;

/**
 * Creates or loads a new sqlite database.
 */
export async function create() {
    const dbPath = path.join(process.cwd(), "database.db");
    const existed = fs.existsSync(dbPath);

    database = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    if (!existed) {
        await database.exec(`
            CREATE TABLE \`conduit_instances\` (
                \`code\`	    TEXT,
                \`public_key\`	TEXT,
                PRIMARY KEY(\`code\`)
            );
        `);
    }
}

/**
 * Generates a new unique code for the specified public key and returns that key.
 * Either inserts the public key in the database, or returns the existing code
 * if it already existed.
 */
export async function generateCode(pubkey: string): Promise<string> {
    if (!database) throw new Error("Database not loaded yet.");

    const existing = await database.get(`SELECT * FROM conduit_instances WHERE public_key = ? LIMIT 1`, pubkey);
    if (existing) return (existing as { code: string }).code;

    let code: string;
    while (true) {
        // Generate a random 6 digit number as code.
        code = (Math.floor(Math.random() * 900000) + 100000).toString();

        // Check if it already existed.
        const existed = await database.get(`SELECT COUNT(*) as count FROM conduit_instances WHERE code = ?`, code);

        // Break if unique, else loop again.
        if (existed && (existed as any).count === 0) break;
    }

    await database.run(`INSERT INTO conduit_instances VALUES (?, ?)`, code, pubkey);
    return code;
}

/**
 * Looks up the public key belonging to the specified code. Returns either the
 * key, or null if not found.
 */
export async function lookup(code: string): Promise<{ public_key: string, code: string } | null> {
    if (!database) throw new Error("Database not loaded yet.");

    const entry = await database.get(`SELECT * FROM conduit_instances WHERE code = ? LIMIT 1`, code);
    return (entry as { public_key: string; code: string } | null) || null;
}

/**
 * Checks if the specified code is still a valid entry. If yes, updates the pubkey for
 * said code and returns true. Else, returns false.
 */
export async function potentiallyUpdate(code: string, pubkey: string): Promise<boolean> {
    if (!database) throw new Error("Database not loaded yet.");

    // Check if it already existed.
    const existed = await database.get(`SELECT COUNT(*) as count FROM conduit_instances WHERE code = ?`, code);
    if (!existed || (existed as any).count === 0) return false;

    await database.run(`UPDATE conduit_instances SET public_key = ? WHERE code = ?`, pubkey, code);
    return true;
}

