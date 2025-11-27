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
        // New schema using user_id (Supabase user ID) instead of 6-digit code
        await database.exec(`
            CREATE TABLE \`conduit_instances\` (
                \`user_id\`	    TEXT,
                \`public_key\`	TEXT,
                PRIMARY KEY(\`user_id\`)
            );
        `);
    } else {
        // Check if we need to migrate from old schema (code) to new schema (user_id)
        const tableInfo = await database.all(`PRAGMA table_info(conduit_instances)`);
        const hasCode = tableInfo.some((col: any) => col.name === 'code');
        const hasUserId = tableInfo.some((col: any) => col.name === 'user_id');
        
        if (hasCode && !hasUserId) {
            console.log("[DB] Migrating database from code-based to user_id-based schema...");
            // Drop old table and create new one (we don't need to preserve old codes)
            await database.exec(`DROP TABLE conduit_instances`);
            await database.exec(`
                CREATE TABLE \`conduit_instances\` (
                    \`user_id\`	    TEXT,
                    \`public_key\`	TEXT,
                    PRIMARY KEY(\`user_id\`)
                );
            `);
            console.log("[DB] Migration complete.");
        }
    }
}

/**
 * Registers or updates the public key for a user ID (Supabase user ID).
 * Returns the user ID.
 */
export async function registerUser(userId: string, pubkey: string): Promise<string> {
    if (!database) throw new Error("Database not loaded yet.");

    const existing = await database.get(`SELECT * FROM conduit_instances WHERE user_id = ? LIMIT 1`, userId);
    if (existing) {
        // Update the public key
        await database.run(`UPDATE conduit_instances SET public_key = ? WHERE user_id = ?`, pubkey, userId);
    } else {
        // Insert new entry
        await database.run(`INSERT INTO conduit_instances VALUES (?, ?)`, userId, pubkey);
    }

    return userId;
}

/**
 * Looks up the public key belonging to the specified user ID. Returns either the
 * key, or null if not found.
 */
export async function lookup(userId: string): Promise<{ public_key: string, user_id: string } | null> {
    if (!database) throw new Error("Database not loaded yet.");

    const entry = await database.get(`SELECT * FROM conduit_instances WHERE user_id = ? LIMIT 1`, userId);
    return (entry as { public_key: string; user_id: string } | null) || null;
}

/**
 * Checks if the specified user ID is still a valid entry. If yes, updates the pubkey for
 * said user ID and returns true. Else, returns false.
 */
export async function potentiallyUpdate(userId: string, pubkey: string): Promise<boolean> {
    if (!database) throw new Error("Database not loaded yet.");

    // Check if it already existed.
    const existed = await database.get(`SELECT COUNT(*) as count FROM conduit_instances WHERE user_id = ?`, userId);
    if (!existed || (existed as any).count === 0) return false;

    await database.run(`UPDATE conduit_instances SET public_key = ? WHERE user_id = ?`, pubkey, userId);
    return true;
}

