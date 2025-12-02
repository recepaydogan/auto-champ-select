import { useState, useEffect, useRef } from 'react';
import { getLCUBridge } from '../lib/lcuBridge';

export interface Invite {
    invitationId: string;
    state: string;
    fromSummonerId: number;
    fromSummonerName?: string; // Enhanced with name
    gameConfig?: {
        queueId: number;
        mapId: number;
        gameMode: string;
    };
    queueName?: string; // Enhanced with queue name
}

export function useInviteListener() {
    const [activeInvite, setActiveInvite] = useState<Invite | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const lcuBridge = getLCUBridge();
    const processedInvites = useRef<Set<string>>(new Set());

    useEffect(() => {
        const onConnectionChange = (connected: boolean) => {
            setIsConnected(connected);
        };

        lcuBridge.addConnectionListener(onConnectionChange);
        setIsConnected(lcuBridge.getIsConnected());

        return () => {
            lcuBridge.removeConnectionListener(onConnectionChange);
        };
    }, []);

    useEffect(() => {
        if (!isConnected) return;

        const fetchInviteDetails = async (invite: any) => {
            try {
                // 1. Fetch Sender Name
                let senderName = 'Unknown Player';
                try {
                    const summonerRes = await lcuBridge.request(`/lol-summoner/v1/summoners/${invite.fromSummonerId}`);
                    if (summonerRes.status === 200 && summonerRes.content) {
                        senderName = summonerRes.content.displayName ||
                            summonerRes.content.gameName ||
                            summonerRes.content.summonerName ||
                            'Unknown Player';
                    }
                } catch (e) {
                    console.warn('[useInviteListener] Failed to fetch sender name', e);
                }

                // 2. Fetch Queue Name
                let queueName = 'Custom Game';
                if (invite.gameConfig?.queueId) {
                    try {
                        const queueRes = await lcuBridge.request(`/lol-game-queues/v1/queues/${invite.gameConfig.queueId}`);
                        if (queueRes.status === 200 && queueRes.content) {
                            queueName = queueRes.content.shortName || queueRes.content.name || queueRes.content.description || 'Game';
                        }
                    } catch (e) {
                        console.warn('[useInviteListener] Failed to fetch queue info', e);
                    }
                }

                return {
                    ...invite,
                    fromSummonerName: senderName,
                    queueName: queueName
                };
            } catch (error) {
                console.error('[useInviteListener] Error enhancing invite:', error);
                return invite;
            }
        };

        const handleInvites = async (result: any) => {
            if (result.status !== 200 || !Array.isArray(result.content)) return;

            const invites = result.content;
            // Find the first Pending invite that we haven't processed or is currently active
            const pendingInvite = invites.find((i: any) => i.state === 'Pending');

            if (pendingInvite) {
                // If it's a new invite we haven't seen as active yet
                if (activeInvite?.invitationId !== pendingInvite.invitationId) {
                    console.log('[useInviteListener] Found new pending invite:', pendingInvite.invitationId);
                    const enhancedInvite = await fetchInviteDetails(pendingInvite);
                    setActiveInvite(enhancedInvite);
                }
            } else {
                // No pending invites
                if (activeInvite) {
                    setActiveInvite(null);
                }
            }
        };

        // Subscribe to received invitations
        lcuBridge.request('/lol-lobby/v2/received-invitations').then(handleInvites).catch(console.error);
        const unsubscribe = lcuBridge.observe('/lol-lobby/v2/received-invitations', handleInvites);

        return () => {
            unsubscribe();
        };
    }, [activeInvite, isConnected]);

    const acceptInvite = async (invitationId: string) => {
        try {
            await lcuBridge.request(`/lol-lobby/v2/received-invitations/${invitationId}/accept`, 'POST');
            setActiveInvite(null);
        } catch (error) {
            console.error('[useInviteListener] Failed to accept invite:', error);
        }
    };

    const declineInvite = async (invitationId: string) => {
        try {
            await lcuBridge.request(`/lol-lobby/v2/received-invitations/${invitationId}/decline`, 'POST');
            setActiveInvite(null);
        } catch (error) {
            console.error('[useInviteListener] Failed to decline invite:', error);
        }
    };

    return {
        activeInvite,
        acceptInvite,
        declineInvite
    };
}
