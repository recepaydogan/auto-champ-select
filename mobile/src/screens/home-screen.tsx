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

    // If connected but LCU goes down, reset lobby/phase and close creation
    useEffect(() => {
        if (connected && !desktopStatus.lcuConnected) {
            setShowCreateLobby(false);
            setGamePhase('None');
            setLobby(null);
            setQueuePenaltySeconds(0);
        }
    }, [connected, desktopStatus.lcuConnected]);

    // If LCU disconnects while app is connected, drop back to home and close create lobby
    useEffect(() => {
        if (connected && !desktopStatus.lcuConnected) {
            setShowCreateLobby(false);
            setGamePhase('None');
            setLobby(null);
        }
    }, [connected, desktopStatus.lcuConnected]);

    const lcuBridge = getLCUBridge();

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
            setGamePhase('None');
            stopQueueTimer();
            setTimeInQueue(0);
            setEstimatedQueueTime(null);
            setQueuePenaltySeconds(0);
            setLobby(null);
            setReadyCheck(null);
            setChampSelect(null);
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
    }, [showAlert]);

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
                    setGamePhase(gameflowResult.content.phase);
                    
                    // If we're already in a lobby, immediately fetch lobby data
                    if (gameflowResult.content.phase === 'Lobby' || 
                        gameflowResult.content.phase === 'Matchmaking' || 
                        gameflowResult.content.phase === 'ReadyCheck') {
                        console.log('[HomeScreen] Already in lobby/matchmaking, fetching initial lobby data');
                        try {
                            const lobbyResult = await lcuBridge.request('/lol-lobby/v2/lobby');
                            if (lobbyResult.status === 200 && lobbyResult.content) {
                               
                                setLobby(lobbyResult.content);
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
                    }
                    
                    // If we're in champ select, fetch champ select data
                    if (gameflowResult.content.phase === 'ChampSelect') {
                        try {
                            const champSelectResult = await lcuBridge.request('/lol-champ-select/v1/session');
                            if (champSelectResult.status === 200 && champSelectResult.content) {
                                setChampSelect(champSelectResult.content);
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

        const unsubscribe = lcuBridge.observe('/lol-gameflow/v1/session', (result) => {

            if (result.status === 200 && result.content && result.content.phase) {
                // Valid phase - clear any pending "None" timeout and set phase immediately
                if (nonePhaseTimeout) {
                    clearTimeout(nonePhaseTimeout);
                    nonePhaseTimeout = null;
                }
                setGamePhase(result.content.phase);
            } else {
                // Invalid/None phase - wait a bit before setting to None to avoid flickering
                // This handles transient 404s or empty responses during transitions
                if (!nonePhaseTimeout && gamePhase !== 'None') {
                    nonePhaseTimeout = setTimeout(() => {
                        setGamePhase('None');
                        nonePhaseTimeout = null;
                    }, 500); // 500ms grace period
                } else if (gamePhase === 'None') {
                    // Already None, keep it
                    if (nonePhaseTimeout) {
                        clearTimeout(nonePhaseTimeout);
                        nonePhaseTimeout = null;
                    }
                }
            }
        });

        return () => {
            if (nonePhaseTimeout) clearTimeout(nonePhaseTimeout);
            unsubscribe();
        };
    }, [connected]);

    // Effect to observe Lobby and Matchmaking (Active in Lobby, Matchmaking, ReadyCheck)
    const shouldObserveLobby = connected && (gamePhase === 'Lobby' || gamePhase === 'Matchmaking' || gamePhase === 'ReadyCheck');
    useEffect(() => {
        if (!shouldObserveLobby) {
            setLobby(null);
            return;
        }

        // Immediately fetch lobby data when entering lobby phase (in case observer hasn't fired yet)
        const fetchInitialLobby = async () => {
            try {
                const result = await lcuBridge.request('/lol-lobby/v2/lobby');
                if (result.status === 200 && result.content) {
                    setLobby(result.content);
                }
            } catch (error) {
                console.error('[HomeScreen] Failed to fetch initial lobby:', error);
            }
        };
        
        // Fetch initial lobby data when phase changes to lobby-related phases
        // This ensures immediate data display when connecting while already in lobby
        fetchInitialLobby();

        const unsubscribeLobby = lcuBridge.observe('/lol-lobby/v2/lobby', (result) => {
            if (result.status === 200 && result.content) {
                setLobby((prev) => {
                    const incoming = { ...result.content };
                    const incomingMembers = Array.isArray(incoming.members) ? incoming.members : [];
                    const prevMembers = Array.isArray(prev?.members) ? prev.members : [];

                    // If server sends a transient empty members array while we still have members, keep previous to prevent flicker.
                    if (incomingMembers.length === 0 && prevMembers.length > 0) {
                        incoming.members = prevMembers;
                        // Preserve localMember if missing or incomplete
                        if (!incoming.localMember && prev?.localMember) {
                            incoming.localMember = prev.localMember;
                        }
                    }

                  
                    return incoming;
                });
            } else if (result.status === 404) {
                // 404 means no lobby - this is valid, clear it
                console.log('[HomeScreen] Lobby observer - 404, no lobby exists');
                setLobby(null);
            } else {
                // Other errors - don't clear lobby, might be transient
                console.warn('[HomeScreen] Lobby observer - non-200 status:', result.status, 'keeping existing lobby data');
            }
        });

        return () => {
            console.log('[HomeScreen] Unsubscribing from Lobby');
            unsubscribeLobby();
        };
    }, [shouldObserveLobby]);

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
            setReadyCheck(null);
            return;
        }

        const unsubscribeReadyCheck = lcuBridge.observe('/lol-matchmaking/v1/ready-check', (result) => {
            if (result.status === 200) {
                setReadyCheck(result.content);

                // Auto Accept Logic
                if (autoAcceptRef.current && result.content && result.content.state === 'InProgress' && result.content.playerResponse === 'None') {
                    handleAcceptReadyCheck();
                }
            } else {
                setReadyCheck(null);
            }
        });

        return () => {
            unsubscribeReadyCheck();
        };
    }, [connected, gamePhase]);

    // Effect to observe Champ Select (Active in ChampSelect)
    useEffect(() => {
        if (!connected) return;
        if (gamePhase !== 'ChampSelect') {
            setChampSelect(null);
            return;
        }

        // Immediately fetch champ select data when entering champ select phase
        const fetchInitialChampSelect = async () => {
            try {
                const result = await lcuBridge.request('/lol-champ-select/v1/session');
                if (result.status === 200 && result.content) {
                    console.log('[HomeScreen] Initial champ select fetch on phase change');
                    setChampSelect(result.content);
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
                setChampSelect(result.content);
            } else {
                setChampSelect(null);
            }
        });

        return () => {
            console.log('[HomeScreen] Unsubscribing from Champ Select');
            unsubscribeChampSelect();
        };
    }, [connected, gamePhase]);

    const handleEnterQueue = async () => {
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby/matchmaking/search', 'POST');
            showAlert('Success', 'Entered queue', undefined, 'success');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to enter queue', undefined, 'error');
        }
    };

    const handleCancelQueue = async () => {
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby/matchmaking/search', 'DELETE');
            showAlert('Success', 'Left queue', undefined, 'success');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to leave queue', undefined, 'error');
        }
    };

    const handleAcceptReadyCheck = async () => {
        try {
            await lcuBridge.request('/lol-matchmaking/v1/ready-check/accept', 'POST');
            showAlert('Success', 'Accepted match', undefined, 'success');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to accept', undefined, 'error');
        }
    };

    const handleDeclineReadyCheck = async () => {
        try {
            await lcuBridge.request('/lol-matchmaking/v1/ready-check/decline', 'POST');
            showAlert('Success', 'Declined match', undefined, 'success');
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to decline', undefined, 'error');
        }
    };

    const handleLeaveLobby = async () => {
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby', 'DELETE');
            // Optimistic update to ensure immediate navigation
            setGamePhase('None');
            setLobby(null);
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to leave lobby', undefined, 'error');
        }
    };

    const handlePickChampion = async (championId: number) => {
        if (!champSelect) return;

        try {
            const localPlayerCellId = champSelect.localPlayerCellId;
            const myTeam = champSelect.myTeam || [];
            const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);

            if (!localPlayer) {
                showAlert('Error', 'Could not find local player', undefined, 'error');
                return;
            }

            const actions = champSelect.actions || [];
            for (const turn of actions) {
                for (const action of turn) {
                    if (action.actorCellId === localPlayerCellId && !action.completed) {
                        await lcuBridge.request(
                            `/lol-champ-select/v1/session/actions/${action.id}`,
                            'PATCH',
                            { championId, completed: true }
                        );
                        showAlert('Success', 'Champion selected', undefined, 'success');
                        return;
                    }
                }
            }
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to pick champion', undefined, 'error');
        }
    };

    const handleUpdateRoles = async (first: string, second: string) => {
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
                    onSuccess={(message) => showAlert('Success', message, undefined, 'success')}
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
            const handleLeaveAndCreate = async () => {
                try {
                    await handleLeaveLobby();
                    setShowCreateLobby(true);
                } catch (e) {
                    console.error('Failed to leave lobby before creating new one', e);
                }
            };
            return (
                <LobbyScreen
                    lobby={lobby}
                    onEnterQueue={handleEnterQueue}
                    onLeaveLobby={handleLeaveLobby}
                    onUpdateRoles={handleUpdateRoles}
                    onOpenCreateLobby={handleLeaveAndCreate}
                    estimatedQueueTime={estimatedQueueTime}
                    onError={(message) => showAlert('Error', message, undefined, 'error')}
                    onSuccess={(message) => showAlert('Success', message, undefined, 'success')}
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
                    showAlert('Success', 'Lobby created successfully', undefined, 'success');
                    // Force update game phase
                    try {
                        const result = await lcuBridge.request('/lol-gameflow/v1/session');
                        if (result.status === 200 && result.content && result.content.phase) {
                            setGamePhase(result.content.phase);
                        }
                    } catch (e) {
                        console.log('Failed to force update phase', e);
                    }
                }}
                onError={(message) => {
                    showAlert('Error', message, undefined, 'error');
                }}
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
