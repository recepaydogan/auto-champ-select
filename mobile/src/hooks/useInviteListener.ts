import { useState, useEffect, useRef } from 'react';
import { getLCUBridge } from '../lib/lcuBridge';
import { scheduleLobbyInviteNotification } from '../lib/notifications';

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
    const activeInviteRef = useRef<Invite | null>(null);

    useEffect(() => {
        activeInviteRef.current = activeInvite;
    }, [activeInvite]);

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
        let cancelled = false;
        let pollInterval: NodeJS.Timeout | null = null;

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

        const handleInvites = async (invites: any[]) => {
            const pendingInvite = invites.find((i: any) => i.state === 'Pending');

            if (pendingInvite) {
                // Show immediately to avoid blocking on extra fetches
                if (activeInviteRef.current?.invitationId !== pendingInvite.invitationId) {
                    console.log('[useInviteListener] Found new pending invite:', pendingInvite.invitationId);
                    setActiveInvite(pendingInvite);

                    // Send notification for new invite
                    fetchInviteDetails(pendingInvite).then((enhanced) => {
                        if (!cancelled && enhanced?.invitationId === pendingInvite.invitationId) {
                            setActiveInvite(enhanced);
                            // Trigger notification with enhanced details
                            scheduleLobbyInviteNotification(
                                enhanced.fromSummonerName || 'A player',
                                enhanced.queueName || 'a game'
                            );
                        }
                    });
                }
            } else if (activeInviteRef.current) {
                setActiveInvite(null);
            }
        };

        const onObserve = (result: any) => {
            if (result.status !== 200 || !Array.isArray(result.content)) return;
            handleInvites(result.content);
        };

        const pollOnce = async () => {
            try {
                const res = await lcuBridge.request('/lol-lobby/v2/received-invitations');
                if (res.status === 200 && Array.isArray(res.content)) {
                    handleInvites(res.content);
                }
            } catch (e) {
                console.warn('[useInviteListener] Poll error', e);
            }
        };

        // Initial fetch and subscribe
        pollOnce();
        const unsubscribe = lcuBridge.observe('/lol-lobby/v2/received-invitations', onObserve);
        pollInterval = setInterval(pollOnce, 1000); // fast polling fallback for reliability

        return () => {
            cancelled = true;
            if (pollInterval) clearInterval(pollInterval);
            unsubscribe();
        };
    }, [isConnected]);

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
