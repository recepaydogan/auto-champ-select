import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@rneui/themed';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import CreateLobby from '../components/CreateLobby';
import { getLCUBridge, checkDesktopOnline, type DesktopStatus } from '../lib/lcuBridge';
import { RIFT_URL, RIFT_HTTP_URL } from '../config';
import { RiftSocketState, type RiftSocketStateValue } from '../lib/riftSocket';
import CustomModal, { type CustomModalButton } from '../components/CustomModal';
import ConnectionStatus, { type ConnectionStatusState } from '../components/ConnectionStatus';
import Dashboard from './Dashboard';
import LobbyScreen from './LobbyScreen';
import QueueScreen from './QueueScreen';
import ChampSelectScreen from './ChampSelectScreen';
import {
    defaultFavoriteConfig,
    FavoriteChampionConfig,
    Lane,
    loadFavoriteChampionConfig,
    normalizeLane,
    saveFavoriteChampionConfig
} from '../lib/favoriteChampions';

const safeStringify = (value: any): string | null => {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
};

export default function HomeScreen({ session }: { session: Session }) {
    const [connectionState, setConnectionState] = useState<RiftSocketStateValue>(RiftSocketState.DISCONNECTED);
    const [connected, setConnected] = useState(false);
    const [gamePhase, setGamePhase] = useState<string>('None');
    const [lobby, setLobby] = useState<any>(null);
    const [readyCheck, setReadyCheck] = useState<any>(null);
    const [champSelect, setChampSelect] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showCreateLobby, setShowCreateLobby] = useState(false);
    const [connectionAborted, setConnectionAborted] = useState(false);
    const [autoAccept, setAutoAccept] = useState(false);
    const [timeInQueue, setTimeInQueue] = useState(0);
    const [estimatedQueueTime, setEstimatedQueueTime] = useState<number | null>(null);
    const [queuePenaltySeconds, setQueuePenaltySeconds] = useState<number>(0);
    const [favoriteConfig, setFavoriteConfig] = useState<FavoriteChampionConfig>({ ...defaultFavoriteConfig });
    const [favoritesLoaded, setFavoritesLoaded] = useState(false);

    // Custom modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [modalConfig, setModalConfig] = useState<{
        title: string;
        message?: string;
        type?: 'info' | 'success' | 'warning' | 'error';
        buttons?: CustomModalButton[];
    }>({ title: '' });

    // Desktop status tracking (after connection)
    const [desktopStatus, setDesktopStatus] = useState<DesktopStatus>({
        riftConnected: false,
        mobileConnected: false,
        lcuConnected: false
    });

    // Pre-connection desktop status (before connecting)
    const [isDesktopOnline, setIsDesktopOnline] = useState<boolean | null>(null); // null = checking
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [serverReachable, setServerReachable] = useState(true);
    const statusCheckInterval = useRef<NodeJS.Timeout | null>(null);
    const autoAcceptRef = useRef(autoAccept);
    const queueTimerRef = useRef<NodeJS.Timeout | null>(null);
    const queueStartRef = useRef<number | null>(null);
    const lastQueueSeenRef = useRef<number | null>(null);
    const autoPickStateRef = useRef<{ lastActionId?: number; lastAppliedChampionId?: number; manualOverride?: boolean }>({});
    const lastLobbySnapshotRef = useRef<string | null>(null);
    const lastReadyCheckSnapshotRef = useRef<string | null>(null);
    const lastChampSelectSnapshotRef = useRef<string | null>(null);
    const gamePhaseRef = useRef(gamePhase);

    const clearLobbyState = useCallback(() => {
        lastLobbySnapshotRef.current = null;
        setLobby(null);
    }, []);

    const clearReadyCheckState = useCallback(() => {
        lastReadyCheckSnapshotRef.current = null;
        setReadyCheck(null);
    }, []);

    const clearChampSelectState = useCallback(() => {
        lastChampSelectSnapshotRef.current = null;
        setChampSelect(null);
    }, []);

    const updateGamePhase = useCallback((phase: string) => {
        if (!phase) return;
        if (gamePhaseRef.current === phase) return;
        gamePhaseRef.current = phase;
        setGamePhase(phase);
    }, []);

    const clearGamePhase = useCallback(() => {
        if (gamePhaseRef.current === 'None') return;
        gamePhaseRef.current = 'None';
        setGamePhase('None');
    }, []);

    const applyLobbyUpdate = useCallback((incomingRaw: any) => {
        if (incomingRaw === null || incomingRaw === undefined) return;
        setLobby((prev: any) => {
            // Prevent flickering by ignoring updates that drop critical data (gameConfig)
            // This happens when LCU returns a partial/empty lobby object during transitions or lag
            if (prev?.gameConfig && !incomingRaw.gameConfig) {
                return prev;
            }

            const incoming = { ...incomingRaw };
            const incomingMembers = Array.isArray(incoming.members) ? incoming.members : [];
            const prevMembers = Array.isArray(prev?.members) ? prev.members : [];

            // Preserve existing members on transient empty payloads to prevent flicker
            if (incomingMembers.length === 0 && prevMembers.length > 0) {
                incoming.members = prevMembers;
                if (!incoming.localMember && prev?.localMember) {
                    incoming.localMember = prev.localMember;
                }
            }

            const serialized = safeStringify(incoming);
            if (!serialized || serialized === lastLobbySnapshotRef.current) {
                return prev;
            }
            lastLobbySnapshotRef.current = serialized;
            return incoming;
        });
    }, []);

    const applyReadyCheckUpdate = useCallback((incoming: any) => {
        if (incoming === null || incoming === undefined) return;
        const serialized = safeStringify(incoming);
        if (!serialized || serialized === lastReadyCheckSnapshotRef.current) return;
        lastReadyCheckSnapshotRef.current = serialized;
        setReadyCheck(incoming);
    }, []);

    const applyChampSelectUpdate = useCallback((incoming: any) => {
        if (!incoming) return;
        setChampSelect((prev: any) => {
            // Prevent flickering by ignoring updates that drop critical data (myTeam)
            if (prev?.myTeam && prev.myTeam.length > 0 && (!incoming.myTeam || incoming.myTeam.length === 0)) {
                return prev;
            }

            const serialized = safeStringify(incoming);
            if (!serialized || serialized === lastChampSelectSnapshotRef.current) return prev;
            lastChampSelectSnapshotRef.current = serialized;
            return incoming;
        });
    }, []);

    const lcuBridge = getLCUBridge();
    const ensureConnected = useCallback(() => {
        if (!lcuBridge.getIsConnected()) {
            setConnected(false);
            clearGamePhase();
            clearLobbyState();
            clearChampSelectState();
            clearReadyCheckState();
            setShowCreateLobby(false);
            return false;
        }
        return true;
    }, [clearChampSelectState, clearGamePhase, clearLobbyState, clearReadyCheckState, lcuBridge]);

    const stopQueueTimer = useCallback(() => {
        if (queueTimerRef.current) {
            clearInterval(queueTimerRef.current);
            queueTimerRef.current = null;
        }
        queueStartRef.current = null;
        lastQueueSeenRef.current = null;
    }, []);

    const startQueueTimer = useCallback((reportedSeconds: number) => {
        const now = Date.now();
        lastQueueSeenRef.current = now;
        queueStartRef.current = now - reportedSeconds * 1000;

        setTimeInQueue(reportedSeconds);

        if (!queueTimerRef.current) {
            queueTimerRef.current = setInterval(() => {
                if (queueStartRef.current !== null) {
                    const elapsed = Math.max(0, Math.floor((Date.now() - queueStartRef.current) / 1000));
                    setTimeInQueue(elapsed);
                }
            }, 1000);
        }
    }, []);

    const extractQueuePenalty = (searchContent: any): number => {
        if (!searchContent) return 0;
        const candidates: number[] = [];
        if (Array.isArray(searchContent.errors)) {
            searchContent.errors.forEach((e: any) => {
                if (typeof e?.penaltyTimeRemaining === 'number') candidates.push(e.penaltyTimeRemaining);
            });
        }
        if (typeof searchContent.penaltyTimeRemaining === 'number') candidates.push(searchContent.penaltyTimeRemaining);
        if (typeof searchContent.lowPriorityData?.penaltyTimeRemaining === 'number') candidates.push(searchContent.lowPriorityData.penaltyTimeRemaining);
        if (typeof searchContent.dodgeData?.penaltyTimeRemaining === 'number') candidates.push(searchContent.dodgeData.penaltyTimeRemaining);
        return Math.max(0, ...(candidates.length ? candidates : [0]));
    };

    useEffect(() => {
        autoAcceptRef.current = autoAccept;
    }, [autoAccept]);

    useEffect(() => {
        let mounted = true;
        const loadFavorites = async () => {
            const config = await loadFavoriteChampionConfig();
            if (mounted) {
                setFavoriteConfig(config);
                setFavoritesLoaded(true);
            }
        };
        loadFavorites().catch((error) => console.warn('[HomeScreen] Failed to load favorites', error));
        return () => {
            mounted = false;
        };
    }, []);

    // If connected but LCU goes down, reset lobby/phase and close creation
    useEffect(() => {
        if (connected && !desktopStatus.lcuConnected) {
            setShowCreateLobby(false);
            clearGamePhase();
            clearLobbyState();
            setQueuePenaltySeconds(0);
        }
    }, [clearGamePhase, clearLobbyState, connected, desktopStatus.lcuConnected]);

    // If LCU disconnects while app is connected, drop back to home and close create lobby
    useEffect(() => {
        if (connected && !desktopStatus.lcuConnected) {
            setShowCreateLobby(false);
            clearGamePhase();
            clearLobbyState();
        }
    }, [clearGamePhase, clearLobbyState, connected, desktopStatus.lcuConnected]);

    // Custom alert function
    const showAlert = useCallback((
        title: string,
        message?: string,
        buttons?: CustomModalButton[],
        type?: 'info' | 'success' | 'warning' | 'error'
    ) => {
        setModalConfig({
            title,
            message,
            type: type || 'info',
            buttons: buttons || [{ text: 'OK', onPress: () => { }, style: 'primary' }]
        });
        setModalVisible(true);
    }, []);

    // Check desktop status periodically (before connecting)
    const checkStatus = useCallback(async () => {
        if (!session?.user?.id) return;

        try {
            const result = await checkDesktopOnline(session.user.id, RIFT_HTTP_URL);
            setIsDesktopOnline(result.desktopOnline);
            setServerReachable(!result.error);
            setCheckingStatus(false);
        } catch (error) {
            setIsDesktopOnline(false);
            setServerReachable(false);
            setCheckingStatus(false);
        }
    }, [session?.user?.id]);

    const persistFavoriteConfig = useCallback(async (config: FavoriteChampionConfig) => {
        setFavoriteConfig(config);
        await saveFavoriteChampionConfig(config);
    }, []);

    // Set up callbacks once on mount
    useEffect(() => {
        // Set up status callback
        lcuBridge.setStatusCallback((status) => {
            setDesktopStatus(status);
        });

        // Cleanup on unmount only
        return () => {
            lcuBridge.disconnect();
        };
    }, []);

    // Set up disconnect callback (needs access to showAlert and checkStatus)
    useEffect(() => {
        lcuBridge.setDisconnectCallback((reason) => {
            console.log('[HomeScreen] Desktop disconnected:', reason);
            setConnected(false);
            setConnectionState(RiftSocketState.DISCONNECTED);
            clearGamePhase();
            stopQueueTimer();
            setTimeInQueue(0);
            setEstimatedQueueTime(null);
            setQueuePenaltySeconds(0);
            clearLobbyState();
            clearReadyCheckState();
            clearChampSelectState();
            setShowCreateLobby(false);
            setDesktopStatus({
                riftConnected: false,
                mobileConnected: false,
                lcuConnected: false
            });

            // Show disconnection alert
            showAlert(
                'Disconnected',
                'Connection to desktop was lost. The desktop app may have closed.',
                [{ text: 'OK', onPress: () => { }, style: 'primary' }],
                'warning'
            );
        });
    }, [clearChampSelectState, clearGamePhase, clearLobbyState, clearReadyCheckState, showAlert, stopQueueTimer]);

    // Handle desktop status checking (before connection)
    useEffect(() => {
        if (!connected) {
            // Check immediately
            checkStatus();
            // Set up interval
            statusCheckInterval.current = setInterval(checkStatus, 5000);
        } else {
            // Connected - stop checking
            if (statusCheckInterval.current) {
                clearInterval(statusCheckInterval.current);
                statusCheckInterval.current = null;
            }
        }

        // Cleanup interval on unmount or when connected changes
        return () => {
            if (statusCheckInterval.current) {
                clearInterval(statusCheckInterval.current);
                statusCheckInterval.current = null;
            }
        };
    }, [connected, checkStatus]);

    // Fallback gameflow poll to stay in sync with desktop transitions
    useEffect(() => {
        if (!connected) return;
        const interval = setInterval(async () => {
            try {
                const res = await lcuBridge.request('/lol-gameflow/v1/session');
                if (res.status === 200 && res.content?.phase) {
                    updateGamePhase(res.content.phase);
                }
            } catch {
                // ignore transient errors
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [connected, lcuBridge, updateGamePhase]);

    const handleConnect = async () => {
        if (!session?.user?.id) {
            showAlert('Error', 'No user session available', undefined, 'error');
            return;
        }

        setLoading(true);
        setConnectionState(RiftSocketState.CONNECTING);
        setConnectionAborted(false);

        try {
            // Connect using Supabase user ID
            await lcuBridge.connect(session.user.id, RIFT_URL);

            // Check if connection was aborted
            if (connectionAborted) {
                lcuBridge.disconnect();
                return;
            }

            setConnected(true);
            setConnectionState(RiftSocketState.CONNECTED);

            // Stop polling for desktop status since we're now connected
            if (statusCheckInterval.current) {
                clearInterval(statusCheckInterval.current);
                statusCheckInterval.current = null;
            }

            // Request initial status from desktop
            lcuBridge.requestStatus();

            // Immediately fetch current gameflow phase and lobby data
            // This ensures we get the current state right away when connecting
            try {
                const gameflowResult = await lcuBridge.request('/lol-gameflow/v1/session');

                if (gameflowResult.status === 200 && gameflowResult.content?.phase) {
                    updateGamePhase(gameflowResult.content.phase);

                    // If we're already in a lobby, immediately fetch lobby data
                    if (gameflowResult.content.phase === 'Lobby' ||
                        gameflowResult.content.phase === 'Matchmaking' ||
                        gameflowResult.content.phase === 'ReadyCheck') {
                        console.log('[HomeScreen] Already in lobby/matchmaking, fetching initial lobby data');
                        try {
                            const lobbyResult = await lcuBridge.request('/lol-lobby/v2/lobby');
                            if (lobbyResult.status === 200 && lobbyResult.content) {

                                applyLobbyUpdate(lobbyResult.content);
                            } else {
                                console.warn('[HomeScreen] Lobby fetch returned non-200 status:', lobbyResult.status);
                            }
                        } catch (lobbyError) {
                            console.error('[HomeScreen] Error fetching initial lobby:', lobbyError);
                        }

                        // Also fetch matchmaking search state if in queue
                        if (gameflowResult.content.phase === 'Matchmaking') {
                            try {
                                const searchResult = await lcuBridge.request('/lol-matchmaking/v1/search');
                                if (searchResult.status === 200 && searchResult.content) {
                                    if (searchResult.content.isCurrentlyInQueue) {
                                        const reported = searchResult.content.timeInQueue || 0;
                                        startQueueTimer(reported);
                                        setEstimatedQueueTime(searchResult.content.estimatedQueueTime || null);
                                    }
                                    setQueuePenaltySeconds(extractQueuePenalty(searchResult.content));
                                }
                            } catch (searchError) {
                                console.error('[HomeScreen] Error fetching matchmaking search:', searchError);
                            }
                        }

                        // Fetch Ready Check if in ReadyCheck phase
                        if (gameflowResult.content.phase === 'ReadyCheck') {
                            try {
                                const rcResult = await lcuBridge.request('/lol-matchmaking/v1/ready-check');
                                if (rcResult.status === 200 && rcResult.content) {
                                    applyReadyCheckUpdate(rcResult.content);
                                }
                            } catch (rcError) {
                                console.error('[HomeScreen] Error fetching initial ready check:', rcError);
                            }
                        }
                    }

                    // If we're in champ select, fetch champ select data
                    if (gameflowResult.content.phase === 'ChampSelect') {
                        try {
                            const champSelectResult = await lcuBridge.request('/lol-champ-select/v1/session');
                            if (champSelectResult.status === 200 && champSelectResult.content) {
                                applyChampSelectUpdate(champSelectResult.content);
                            }
                        } catch (champSelectError) {
                            console.error('[HomeScreen] Error fetching initial champ select:', champSelectError);
                        }
                    }
                } else {
                    console.warn('[HomeScreen] Gameflow fetch returned invalid response:', gameflowResult.status, gameflowResult.content);
                }
            } catch (error) {
                console.error('[HomeScreen] Failed to fetch initial gameflow state:', error);
                // Continue anyway - observers will handle updates
            }

            // Subscribe to Gameflow (Primary Source of Truth)
            // We don't call setupLCUObservers anymore, we use useEffects
        } catch (error: any) {
            if (!connectionAborted) {
                console.error('Failed to connect:', error);
                showAlert('Connection Failed', error.message || 'Failed to connect to desktop', undefined, 'error');
                setConnectionState(RiftSocketState.DISCONNECTED);
                setConnected(false);
            }
        } finally {
            setLoading(false);
            setConnectionAborted(false);
        }
    };

    const handleCancelConnection = () => {
        setConnectionAborted(true);
        lcuBridge.disconnect();
        setLoading(false);
        setConnectionState(RiftSocketState.DISCONNECTED);
    };

    // Effect to observe Gameflow (Always active when connected)
    useEffect(() => {
        if (!connected) return;

        let nonePhaseTimeout: NodeJS.Timeout | null = null;
        let phaseRefresher: NodeJS.Timeout | null = null;

        const unsubscribe = lcuBridge.observe('/lol-gameflow/v1/session', (result) => {
            const phase = result?.content?.phase;
            if (result.status === 200 && phase) {
                if (nonePhaseTimeout) {
                    clearTimeout(nonePhaseTimeout);
                    nonePhaseTimeout = null;
                }
                updateGamePhase(phase);
                // When champ select starts, trigger an immediate refresh to sync team/bench
                if (phase === 'ChampSelect') {
                    lcuBridge.request('/lol-champ-select/v1/session').then((res) => {
                        if (res.status === 200 && res.content) {
                            applyChampSelectUpdate(res.content);
                        }
                    }).catch(() => { /* ignore */ });
                }
                return;
            }

            if (result.status !== 404) {
                return;
            }

            if (!nonePhaseTimeout && gamePhaseRef.current !== 'None') {
                nonePhaseTimeout = setTimeout(() => {
                    clearGamePhase();
                    nonePhaseTimeout = null;
                }, 500);
            } else if (gamePhaseRef.current === 'None') {
                if (nonePhaseTimeout) {
                    clearTimeout(nonePhaseTimeout);
                    nonePhaseTimeout = null;
                }
            }
        });

        // Fallback periodic sync while connected to keep gamePhase fresh
        phaseRefresher = setInterval(async () => {
            try {
                const res = await lcuBridge.request('/lol-gameflow/v1/session');
                if (res.status === 200 && res.content?.phase) {
                    updateGamePhase(res.content.phase);
                    if (res.content.phase === 'ChampSelect') {
                        const cs = await lcuBridge.request('/lol-champ-select/v1/session');
                        if (cs.status === 200 && cs.content) {
                            applyChampSelectUpdate(cs.content);
                        }
                    }
                }
            } catch {
                // ignore
            }
        }, 2000);

        return () => {
            if (nonePhaseTimeout) clearTimeout(nonePhaseTimeout);
            if (phaseRefresher) clearInterval(phaseRefresher);
            unsubscribe();
        };
    }, [applyChampSelectUpdate, clearGamePhase, connected, lcuBridge, updateGamePhase]);

    // Clear lobby when gamePhase becomes None
    useEffect(() => {
        if (gamePhase === 'None') {
            clearLobbyState();
        }
    }, [clearLobbyState, gamePhase]);

    // Keep a ref to gamePhase for use in effects without triggering re-runs
    useEffect(() => {
        gamePhaseRef.current = gamePhase;
    }, [gamePhase]);

    // React to GamePhase changes to ensure data sync and UI state
    useEffect(() => {
        if (!connected) return;

        console.log('[HomeScreen] GamePhase changed to:', gamePhase);

        if (gamePhase === 'Lobby') {
            // We entered lobby (possibly from desktop)
            setShowCreateLobby(false); // Close modal if open
            // Force fetch lobby data to ensure UI is up to date
            lcuBridge.request('/lol-lobby/v2/lobby').then(result => {
                if (result.status === 200 && result.content) {
                    applyLobbyUpdate(result.content);
                }
            }).catch(e => console.warn('[HomeScreen] Failed to fetch lobby on phase change', e));
        } else if (gamePhase === 'Matchmaking') {
            // Force fetch search data
            lcuBridge.request('/lol-matchmaking/v1/search').then(result => {
                if (result.status === 200 && result.content) {
                    if (result.content.isCurrentlyInQueue) {
                        const reported = typeof result.content.timeInQueue === 'number' ? result.content.timeInQueue : 0;
                        startQueueTimer(reported);
                        setEstimatedQueueTime(result.content.estimatedQueueTime || null);
                    }
                }
            }).catch(e => console.warn('[HomeScreen] Failed to fetch search on phase change', e));
        } else if (gamePhase === 'ReadyCheck') {
            // Force fetch ready check data
            lcuBridge.request('/lol-matchmaking/v1/ready-check').then(result => {
                if (result.status === 200 && result.content) {
                    applyReadyCheckUpdate(result.content);
                }
            }).catch(e => console.warn('[HomeScreen] Failed to fetch ready check on phase change', e));
        } else if (gamePhase === 'ChampSelect') {
            // Force fetch champ select data
            lcuBridge.request('/lol-champ-select/v1/session').then(result => {
                if (result.status === 200 && result.content) {
                    applyChampSelectUpdate(result.content);
                }
            }).catch(e => console.warn('[HomeScreen] Failed to fetch champ select on phase change', e));
        } else if (gamePhase === 'None') {
            // Game ended; check if lobby exists and sync back to lobby screen
            lcuBridge.request('/lol-lobby/v2/lobby').then(result => {
                if (result.status === 200 && result.content) {
                    applyLobbyUpdate(result.content);
                    updateGamePhase('Lobby');
                } else {
                    clearLobbyState();
                }
            }).catch(() => {
                clearLobbyState();
            });
        }
    }, [gamePhase, connected, lcuBridge, applyLobbyUpdate, applyChampSelectUpdate, startQueueTimer, applyReadyCheckUpdate]);

    // Effect to observe Lobby and Matchmaking (Active in Lobby, Matchmaking, ReadyCheck)
    const shouldObserveLobby = connected;
    useEffect(() => {
        if (!shouldObserveLobby) {
            clearLobbyState();
            return;
        }

        let lobbyClearTimeout: NodeJS.Timeout | null = null;

        // Immediately fetch lobby data when entering lobby phase (in case observer hasn't fired yet)
        const fetchInitialLobby = async () => {
            try {
                const result = await lcuBridge.request('/lol-lobby/v2/lobby');
                if (result.status === 200 && result.content) {
                    if (lobbyClearTimeout) {
                        clearTimeout(lobbyClearTimeout);
                        lobbyClearTimeout = null;
                    }
                    applyLobbyUpdate(result.content);
                }
            } catch (error) {
                console.error('[HomeScreen] Failed to fetch initial lobby:', error);
            }
        };

        // Fetch initial lobby data when connection is established
        fetchInitialLobby();

        const unsubscribeLobby = lcuBridge.observe('/lol-lobby/v2/lobby', async (result) => {
            if (result.status === 200 && result.content) {
                if (lobbyClearTimeout) {
                    clearTimeout(lobbyClearTimeout);
                    lobbyClearTimeout = null;
                }
                applyLobbyUpdate(result.content);
                return;
            }

            // If we get a 404 or other error, we strictly IGNORE it.
            // We rely on gamePhase changes to clear the lobby state.
            // This prevents flickering due to transient LCU errors.
        });

        return () => {
            console.log('[HomeScreen] Unsubscribing from Lobby');
            if (lobbyClearTimeout) clearTimeout(lobbyClearTimeout);
            unsubscribeLobby();
        };
    }, [applyLobbyUpdate, clearLobbyState, lcuBridge, shouldObserveLobby]);

    // Effect to observe Matchmaking Search (Active in Lobby, Matchmaking)
    const shouldObserveSearch = connected && (gamePhase === 'Lobby' || gamePhase === 'Matchmaking');
    useEffect(() => {
        if (!shouldObserveSearch) {
            stopQueueTimer();
            setQueuePenaltySeconds(0);
            return;
        }

        const unsubscribeSearch = lcuBridge.observe('/lol-matchmaking/v1/search', (result) => {
            if (result.status === 200) {
                if (!result.content) {
                    // Ignore empty payload to prevent flicker
                    return;
                }
                if (result.content.isCurrentlyInQueue) {
                    const reported = typeof result.content.timeInQueue === 'number' ? result.content.timeInQueue : 0;
                    startQueueTimer(reported);
                    setEstimatedQueueTime(prev => (
                        typeof result.content.estimatedQueueTime === 'number'
                            ? result.content.estimatedQueueTime
                            : prev
                    ));
                    setQueuePenaltySeconds(extractQueuePenalty(result.content));
                    return;
                }
                setQueuePenaltySeconds(extractQueuePenalty(result.content));
                // Explicitly not in queue; avoid clearing instantly if we just saw a queue state (debounce transient drops)
                const now = Date.now();
                if (lastQueueSeenRef.current && now - lastQueueSeenRef.current < 4000) {
                    return;
                }
                stopQueueTimer();
                setTimeInQueue(0);
                setEstimatedQueueTime(null);
                setQueuePenaltySeconds(0);
            } else if (result.status === 404) {
                // 404 indicates no search; clear values
                stopQueueTimer();
                setTimeInQueue(0);
                setEstimatedQueueTime(null);
                setQueuePenaltySeconds(0);
            } // Ignore transient errors to avoid flicker
        });

        return () => {
            unsubscribeSearch();
            stopQueueTimer();
        };
    }, [shouldObserveSearch, startQueueTimer, stopQueueTimer]);

    // Effect to observe Ready Check (Active in ReadyCheck)
    useEffect(() => {
        if (!connected) return;
        if (gamePhase !== 'ReadyCheck') {
            clearReadyCheckState();
            return;
        }

        // Fetch initial ready check state
        const fetchInitialReadyCheck = async () => {
            try {
                const result = await lcuBridge.request('/lol-matchmaking/v1/ready-check');
                if (result.status === 200 && result.content) {
                    applyReadyCheckUpdate(result.content);
                }
            } catch (error) {
                console.error('[HomeScreen] Failed to fetch initial ready check:', error);
            }
        };
        fetchInitialReadyCheck();

        const unsubscribeReadyCheck = lcuBridge.observe('/lol-matchmaking/v1/ready-check', (result) => {
            if (result.status === 200 && result.content) {
                applyReadyCheckUpdate(result.content);

                // Auto Accept Logic
                if (autoAcceptRef.current && result.content && result.content.state === 'InProgress' && result.content.playerResponse === 'None') {
                    handleAcceptReadyCheck();
                }

                // If everyone accepted, force-refresh gameflow to leave the accepting screen
                const state = (result.content.state || '').toLowerCase();
                if (state === 'accepted' || state === 'everyoneready') {
                    lcuBridge.request('/lol-gameflow/v1/session').then((res) => {
                        if (res.status === 200 && res.content?.phase) {
                            updateGamePhase(res.content.phase);
                        }
                    }).catch(() => { /* ignore */ });
                }
            }
        });

        return () => {
            unsubscribeReadyCheck();
        };
    }, [applyReadyCheckUpdate, clearReadyCheckState, connected, gamePhase]);

    // Effect to observe Champ Select (Active in ChampSelect)
    useEffect(() => {
        if (!connected) return;
        if (gamePhase !== 'ChampSelect') {
            clearChampSelectState();
            return;
        }

        let champSelectClearTimeout: NodeJS.Timeout | null = null;

        // Immediately fetch champ select data when entering champ select phase
        const fetchInitialChampSelect = async () => {
            try {
                const result = await lcuBridge.request('/lol-champ-select/v1/session');
                if (result.status === 200 && result.content) {
                    console.log('[HomeScreen] Initial champ select fetch on phase change');
                    if (champSelectClearTimeout) {
                        clearTimeout(champSelectClearTimeout);
                        champSelectClearTimeout = null;
                    }
                    applyChampSelectUpdate(result.content);
                }
            } catch (error) {
                console.error('[HomeScreen] Failed to fetch initial champ select:', error);
            }
        };

        // Fetch initial champ select data when phase changes to ChampSelect
        // This ensures immediate data display when connecting while already in champ select
        fetchInitialChampSelect();

        console.log('[HomeScreen] Subscribing to Champ Select');
        const unsubscribeChampSelect = lcuBridge.observe('/lol-champ-select/v1/session', (result) => {
            if (result.status === 200 && result.content) {
                if (champSelectClearTimeout) {
                    clearTimeout(champSelectClearTimeout);
                    champSelectClearTimeout = null;
                }
                applyChampSelectUpdate(result.content);
            } else {
                // Strictly IGNORE errors/nulls.
                // We rely on gamePhase changes to clear champSelect state.
            }
        });

        return () => {
            console.log('[HomeScreen] Unsubscribing from Champ Select');
            if (champSelectClearTimeout) clearTimeout(champSelectClearTimeout);
            unsubscribeChampSelect();
        };
    }, [applyChampSelectUpdate, clearChampSelectState, connected, gamePhase]);

    // Clear champSelect when gamePhase changes from ChampSelect
    useEffect(() => {
        if (gamePhase !== 'ChampSelect') {
            clearChampSelectState();
        }
    }, [clearChampSelectState, gamePhase]);

    useEffect(() => {
        if (gamePhase !== 'ChampSelect') {
            autoPickStateRef.current = {};
        }
    }, [gamePhase]);


    const resolvePreferredLane = useCallback((cs: any): Lane => {
        const localPlayerCellId = cs?.localPlayerCellId;
        const myTeam = cs?.myTeam || [];
        const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
        const laneFromChampSelect = normalizeLane(
            localPlayer?.assignedPosition ||
            localPlayer?.selectedPosition ||
            localPlayer?.role ||
            localPlayer?.position
        );
        const primaryLobbyLane = normalizeLane(lobby?.localMember?.firstPositionPreference);
        const secondaryLobbyLane = normalizeLane(lobby?.localMember?.secondPositionPreference);

        if (laneFromChampSelect && laneFromChampSelect !== 'FILL') return laneFromChampSelect;
        if (primaryLobbyLane && primaryLobbyLane !== 'FILL') return primaryLobbyLane as Lane;
        if (secondaryLobbyLane && secondaryLobbyLane !== 'FILL') return secondaryLobbyLane as Lane;
        return 'FILL';
    }, [lobby?.localMember?.firstPositionPreference, lobby?.localMember?.secondPositionPreference]);

    const autoApplyFavoriteChampion = useCallback(async (cs: any) => {
        if (!cs) return;
        if (!favoriteConfig.autoHover && !favoriteConfig.autoLock) return;
        if (!favoritesLoaded) return;
        if (!ensureConnected()) return;

        // When ARAM offers an initial pool (2-3 champs), only pick from that pool.
        const pickablePool = Array.isArray(cs.pickableChampionIds)
            ? cs.pickableChampionIds.filter((id: any) => typeof id === 'number' && id > 0)
            : [];
        const pickableSet = pickablePool.length > 0 ? new Set<number>(pickablePool) : null;

        const localPlayerCellId = cs.localPlayerCellId;
        const myTeam = cs.myTeam || [];
        const theirTeam = cs.theirTeam || [];
        const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
        if (!localPlayer) return;

        const lane = resolvePreferredLane(cs);
        const lanePrefs = favoriteConfig.preferences?.[lane] || [];
        const fillPrefs = favoriteConfig.allowFillFallback && lane !== 'FILL'
            ? (favoriteConfig.preferences?.FILL || [])
            : [];
        const candidates = [...lanePrefs, ...fillPrefs].filter((id, idx, arr) => id > 0 && arr.indexOf(id) === idx);
        if (!candidates.length) return;

        const banned = new Set<number>();
        const addIfValid = (id?: number) => {
            if (typeof id === 'number' && id > 0) banned.add(id);
        };
        (cs.bans?.myTeamBans || []).forEach(addIfValid);
        (cs.bans?.theirTeamBans || []).forEach(addIfValid);
        (cs.actions || []).forEach((turn: any[]) => {
            turn.forEach((action: any) => {
                if (
                    action?.completed &&
                    typeof action.championId === 'number' &&
                    action.championId > 0 &&
                    (action.type || '').toLowerCase() === 'ban'
                ) {
                    banned.add(action.championId);
                }
            });
        });

        const picked = new Set<number>();
        [...myTeam, ...theirTeam].forEach((member: any) => {
            if (typeof member?.championId === 'number' && member.championId > 0) {
                picked.add(member.championId);
            }
        });

        const blocked = new Set<number>([...banned, ...picked]);
        const choice = candidates.find((id) => !blocked.has(id) && (!pickableSet || pickableSet.has(id)));
        if (!choice) return;

        const actions = cs.actions || [];
        let currentAction: any = null;
        for (const turn of actions) {
            for (const action of turn) {
                if (action.actorCellId === localPlayerCellId && !action.completed) {
                    currentAction = action;
                    break;
                }
            }
            if (currentAction) break;
        }
        if (!currentAction) return;

        const actionType = (currentAction.type || '').toLowerCase();
        if (actionType === 'ban') {
            return; // do not auto-ban yet
        }

        const state = autoPickStateRef.current;
        if (state.lastActionId !== currentAction.id) {
            state.lastActionId = currentAction.id;
            state.manualOverride = false;
            state.lastAppliedChampionId = undefined;
        }

        if (currentAction.championId && currentAction.championId !== state.lastAppliedChampionId) {
            state.manualOverride = true; // user picked something else
        }
        if (state.manualOverride) return;

        const alreadyOnChoice = currentAction.championId === choice;
        const shouldLock = favoriteConfig.autoLock && currentAction.isInProgress && (!actionType || actionType === 'pick');
        if (alreadyOnChoice && (!shouldLock || currentAction.completed)) {
            state.lastAppliedChampionId = choice;
            return;
        }

        try {
            const payload: any = { championId: choice };
            if (shouldLock) payload.completed = true;
            await lcuBridge.request(`/lol-champ-select/v1/session/actions/${currentAction.id}`, 'PATCH', payload);
            state.lastAppliedChampionId = choice;
        } catch (error: any) {
            console.warn('[HomeScreen] Auto-favorite apply failed', error?.message || error);
        }
    }, [ensureConnected, favoriteConfig, favoritesLoaded, lcuBridge, resolvePreferredLane]);

    useEffect(() => {
        if (!connected || gamePhase !== 'ChampSelect') return;
        autoApplyFavoriteChampion(champSelect);
    }, [connected, gamePhase, champSelect, autoApplyFavoriteChampion]);

    const handleEnterQueue = async () => {
        if (!ensureConnected()) return;
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby/matchmaking/search', 'POST');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to enter queue', undefined, 'error');
        }
    };

    const handleCancelQueue = async () => {
        if (!ensureConnected()) return;
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby/matchmaking/search', 'DELETE');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to leave queue', undefined, 'error');
        }
    };

    const handleAcceptReadyCheck = async () => {
        if (!ensureConnected()) return;
        try {
            await lcuBridge.request('/lol-matchmaking/v1/ready-check/accept', 'POST');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to accept', undefined, 'error');
        }
    };

    const handleDeclineReadyCheck = async () => {
        if (!ensureConnected()) return;
        try {
            await lcuBridge.request('/lol-matchmaking/v1/ready-check/decline', 'POST');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to decline', undefined, 'error');
        }
    };

    const handleLeaveLobby = async () => {
        if (!ensureConnected()) return;
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby', 'DELETE');
            // Optimistic update to ensure immediate navigation
            clearGamePhase();
            clearLobbyState();
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to leave lobby', undefined, 'error');
        }
    };

    const handlePickChampion = async (championId: number) => {
        if (!ensureConnected()) return;

        try {
            let session = champSelect;
            if (!session) {
                const res = await lcuBridge.request('/lol-champ-select/v1/session');
                if (res.status === 200 && res.content) {
                    setChampSelect(res.content);
                    session = res.content;
                }
            }
            if (!session) {
                showAlert('Error', 'No champ select session available', undefined, 'error');
                return;
            }

            const localPlayerCellId = session.localPlayerCellId;
            const myTeam = session.myTeam || [];
            const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);

            if (!localPlayer) {
                showAlert('Error', 'Could not find local player', undefined, 'error');
                return;
            }

            const findActiveAction = (s: any) => {
                const acts = s?.actions || [];
                for (const turn of acts) {
                    for (const action of turn) {
                        if (
                            action.actorCellId === localPlayerCellId &&
                            !action.completed &&
                            action.isInProgress &&
                            (action.type || '').toLowerCase() === 'pick' &&
                            typeof action.id === 'number' &&
                            action.id >= 0
                        ) {
                            return action;
                        }
                    }
                }
                return null;
            };

            let current = findActiveAction(session);

            if (!current) {
                // Try a fresh session once
                const refreshed = await lcuBridge.request('/lol-champ-select/v1/session');
                if (refreshed.status === 200 && refreshed.content) {
                    setChampSelect(refreshed.content);
                    session = refreshed.content;
                    current = findActiveAction(session);
                }
            }

            if (!current) {
                showAlert('Error', 'No active pick turn right now', undefined, 'error');
                return;
            }

            await lcuBridge.request(
                `/lol-champ-select/v1/session/actions/${current.id}`,
                'PATCH',
                { championId, completed: true }
            );
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to pick champion', undefined, 'error');
        }
    };

    const handleUpdateRoles = async (first: string, second: string) => {
        if (!ensureConnected()) return;
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby/members/localMember/position-preferences', 'PUT', {
                firstPreference: first,
                secondPreference: second
            });
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to update roles', undefined, 'error');
        }
    };

    // Build connection status for display
    const connectionStatus: ConnectionStatusState = {
        riftConnected: serverReachable,
        desktopOnline: connected ? true : (isDesktopOnline === true), // Use pre-check before connecting
        mobileConnected: connected,
        lcuConnected: connected ? desktopStatus.lcuConnected : false
    };

    // Render appropriate screen based on game phase
    const renderContent = () => {
        if (!connected) {
            return (
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Auto Champ Select</Text>
                    </View>

                    <ConnectionStatus
                        status={connectionStatus}
                        onConnect={handleConnect}
                        onDisconnect={handleCancelConnection}
                        loading={loading || checkingStatus}
                    />

                    {connectionState === RiftSocketState.FAILED_NO_DESKTOP && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>Desktop app not found. Make sure it's running and you're signed in with the same account.</Text>
                        </View>
                    )}

                    {connectionState === RiftSocketState.FAILED_DESKTOP_DENY && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>Connection denied by desktop app.</Text>
                        </View>
                    )}

                    <View style={styles.footer}>
                        <Button
                            title="Sign Out"
                            onPress={() => supabase.auth.signOut()}
                            buttonStyle={styles.signOutButton}
                            titleStyle={styles.signOutButtonText}
                        />
                    </View>

                    <CustomModal
                        visible={modalVisible}
                        title={modalConfig.title}
                        message={modalConfig.message}
                        type={modalConfig.type}
                        buttons={modalConfig.buttons}
                        onClose={() => setModalVisible(false)}
                    />
                </View>
            );
        }

        if (gamePhase === 'ChampSelect') {
            return (
                <ChampSelectScreen
                    champSelect={champSelect}
                    onPick={handlePickChampion}
                    onBan={() => { }} // TODO: Implement ban
                    onError={(message) => showAlert('Error', message, undefined, 'error')}
                    onSuccess={undefined}
                />
            );
        }

        if (gamePhase === 'Matchmaking' || gamePhase === 'Queue' || gamePhase === 'ReadyCheck') {
            return (
                <QueueScreen
                    onCancelQueue={handleCancelQueue}
                    timeInQueue={timeInQueue}
                    estimatedQueueTime={estimatedQueueTime}
                    penaltySeconds={queuePenaltySeconds}
                    readyCheck={readyCheck}
                    onAccept={handleAcceptReadyCheck}
                    onDecline={handleDeclineReadyCheck}
                    autoAccept={autoAccept}
                    onToggleAutoAccept={(val) => setAutoAccept(val)}
                />
            );
        }

        if (gamePhase === 'Lobby') {
            const handleSwitchLobbyMode = () => {
                setShowCreateLobby(true); // do not leave; switching modes should keep members
            };
            return (
                <LobbyScreen
                    lobby={lobby}
                    onEnterQueue={handleEnterQueue}
                    onLeaveLobby={handleLeaveLobby}
                    onUpdateRoles={handleUpdateRoles}
                    onOpenCreateLobby={handleSwitchLobbyMode}
                    estimatedQueueTime={estimatedQueueTime}
                    favoriteConfig={favoriteConfig}
                    onSaveFavoriteConfig={persistFavoriteConfig}
                    favoritesLoaded={favoritesLoaded}
                    onError={(message) => showAlert('Error', message, undefined, 'error')}
                    onSuccess={undefined}
                />
            );
        }

        // Default: Dashboard
        return (
            <Dashboard
                session={session}
                desktopStatus={desktopStatus}
                onCreateLobby={() => setShowCreateLobby(true)}
                onSignOut={() => supabase.auth.signOut()}
            />
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>

                {renderContent()}

                <CreateLobby
                    visible={showCreateLobby}
                    onClose={() => setShowCreateLobby(false)}
                    onSuccess={async () => {
                        setShowCreateLobby(false);
                        // Force update game phase
                        try {
                            const result = await lcuBridge.request('/lol-gameflow/v1/session');
                            if (result.status === 200 && result.content && result.content.phase) {
                                updateGamePhase(result.content.phase);
                            }
                        } catch (e) {
                            console.log('Failed to force update phase', e);
                        }
                    }}
                    onError={undefined}
                />

                <CustomModal
                    visible={modalVisible}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    type={modalConfig.type}
                    buttons={modalConfig.buttons}
                    onClose={() => setModalVisible(false)}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        paddingTop: 12,
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 24,
        backgroundColor: '#171717',
        borderBottomWidth: 1,
        borderBottomColor: '#262626',
    },
    title: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    errorContainer: {
        marginHorizontal: 20,
        padding: 16,
        backgroundColor: '#7f1d1d',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    errorText: {
        color: '#fca5a5',
        textAlign: 'center',
        fontSize: 14,
    },
    signOutButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#525252',
        borderRadius: 8,
        paddingVertical: 12,
    },
    signOutButtonText: {
        borderRadius: 20,
        marginTop: 12,
        alignSelf: 'center',
        width: '80%',
    },
    statusBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#111827',
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    statusItem: {
        color: '#d1d5db',
        fontSize: 12,
        fontWeight: '600',
    },
    autoAcceptLabel: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 40,
        backgroundColor: '#0a0a0a',
        borderTopWidth: 1,
        borderTopColor: '#262626',
    },
});
