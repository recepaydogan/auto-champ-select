// lcuHelper.ts
// Helper functions to interact with League Client Update (LCU) endpoints.
// Uses the LCU client for actual implementation.

import { getLcuClient, type LobbyQueueInfo } from './lib/lcuClient';

const client = getLcuClient();

/**
 * Enters the matchmaking queue
 */
export async function enterQueue(): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.enterQueue();
}

/**
 * Cancels the matchmaking queue
 */
export async function cancelQueue(): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.cancelQueue();
}

/**
 * Accepts a ready check
 */
export async function acceptReadyCheck(): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.acceptReadyCheck();
}

/**
 * Declines a ready check
 */
export async function declineReadyCheck(): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.declineReadyCheck();
}

/**
 * Picks or bans a champion in champion select
 */
export async function pickBanChampion(actionId: number, championId: number, completed: boolean = false): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.pickBanChampion(actionId, championId, completed);
}

/**
 * Hovers a champion (sets championId without completing the action)
 */
export async function hoverChampion(actionId: number, championId: number): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.hoverChampion(actionId, championId);
}

/**
 * Gets the current lobby state
 */
export async function getLobby(): Promise<any> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getLobby();
}

/**
 * Gets the current matchmaking search state
 */
export async function getMatchmakingSearch(): Promise<any> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getMatchmakingSearch();
}

/**
 * Gets the current ready check state
 */
export async function getReadyCheck(): Promise<any> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getReadyCheck();
}

/**
 * Gets the current champion select session
 */
export async function getChampSelectSession(): Promise<any> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getChampSelectSession();
}

/**
 * Gets pickable champion IDs
 */
export async function getPickableChampions(): Promise<number[]> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getPickableChampions();
}

/**
 * Gets bannable champion IDs
 */
export async function getBannableChampions(): Promise<number[]> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getBannableChampions();
}

/**
 * Checks if LCU is connected
 */
export function isLcuConnected(): boolean {
    return client.isConnected();
}

/**
 * Gets all available game queues
 */
export async function getGameQueues(): Promise<any[]> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getGameQueues();
}

/**
 * Gets enabled game queue IDs
 */
export async function getEnabledGameQueues(): Promise<number[]> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getEnabledGameQueues();
}

/**
 * Gets default game queue IDs
 */
export async function getDefaultGameQueues(): Promise<number[]> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    return client.getDefaultGameQueues();
}

/**
 * Creates a lobby with the specified queue ID
 */
export async function createLobby(queueId: number, queueInfo?: LobbyQueueInfo): Promise<void> {
    if (!client.isConnected()) {
        throw new Error('LCU not connected');
    }
    await client.createLobby(queueId, queueInfo);
}

/**
 * Gets the LCU client instance (for advanced usage)
 */
export function getLcuClientInstance() {
    return client;
}
