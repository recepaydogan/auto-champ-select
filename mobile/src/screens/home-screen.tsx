import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Button } from '@rneui/themed';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import CreateLobby from '../components/CreateLobby';
import { getLCUBridge, checkDesktopOnline, type DesktopStatus } from '../lib/lcuBridge';
import { RIFT_URL, RIFT_HTTP_URL } from '../config';
import { RiftSocketState, type RiftSocketStateValue } from '../lib/riftSocket';
import CustomModal, { type CustomModalButton } from '../components/CustomModal';
import ConnectionStatus, { type ConnectionStatusState } from '../components/ConnectionStatus';

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
            buttons: buttons || [{ text: 'OK', onPress: () => {}, style: 'primary' }]
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
            setLobby(null);
            setReadyCheck(null);
            setChampSelect(null);
            setDesktopStatus({
                riftConnected: false,
                mobileConnected: false,
                lcuConnected: false
            });
            
            // Show disconnection alert
            showAlert(
                'Disconnected',
                'Connection to desktop was lost. The desktop app may have closed.',
                [{ text: 'OK', onPress: () => {}, style: 'primary' }],
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
            
            // Subscribe to LCU endpoints
            setupLCUObservers();
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

    const setupLCUObservers = () => {
        // Observe gameflow - this is the PRIMARY source of truth for game phase
        lcuBridge.observe('/lol-gameflow/v1/session', (result) => {
            if (result.status === 200 && result.content && result.content.phase) {
                setGamePhase(result.content.phase);
            } else if (result.status !== 200) {
                // LCU not available or error
                setGamePhase('None');
            }
        });

        // Observe lobby (only use content if status is 200)
        lcuBridge.observe('/lol-lobby/v2/lobby', (result) => {
            if (result.status === 200) {
                setLobby(result.content);
            } else {
                setLobby(null);
            }
        });

        // Observe matchmaking search
        lcuBridge.observe('/lol-matchmaking/v1/search', (result) => {
            // Only update if we got a successful response with valid queue status
            if (result.status === 200 && result.content && result.content.isCurrentlyInQueue) {
                setGamePhase('Matchmaking');
            }
        });

        // Observe ready check
        lcuBridge.observe('/lol-matchmaking/v1/ready-check', (result) => {
            if (result.status === 200) {
                setReadyCheck(result.content);
            } else {
                setReadyCheck(null);
            }
        });

        // Observe champ select (only set state if status is 200 and has expected properties)
        lcuBridge.observe('/lol-champ-select/v1/session', (result) => {
            if (result.status === 200 && result.content && result.content.localPlayerCellId !== undefined) {
                setChampSelect(result.content);
            } else {
                setChampSelect(null);
            }
        });
    };

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

    // Build connection status for display
    const connectionStatus: ConnectionStatusState = {
        riftConnected: serverReachable,
        desktopOnline: connected ? true : (isDesktopOnline === true), // Use pre-check before connecting
        mobileConnected: connected,
        lcuConnected: connected ? desktopStatus.lcuConnected : false
    };

    if (!connected) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Auto Champ Select</Text>
                </View>
                
                <ConnectionStatus
                    status={connectionStatus}
                    onConnect={handleConnect}
                    onDisconnect={() => {
                        handleCancelConnection();
                    }}
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Auto Champ Select</Text>
                <View style={styles.statusContainer}>
                    <View style={styles.statusIndicator} />
                    <Text style={styles.connectedText}>Connected</Text>
                </View>
                <Text style={styles.status}>Game: {gamePhase}</Text>
                {/* LCU Status Indicator */}
                <View style={styles.lcuStatusRow}>
                    <View style={[styles.lcuStatusDot, desktopStatus.lcuConnected ? styles.lcuStatusDotConnected : styles.lcuStatusDotDisconnected]} />
                    <Text style={[styles.lcuStatusText, !desktopStatus.lcuConnected && styles.lcuStatusTextWarning]}>
                        {desktopStatus.lcuConnected ? 'League Client Connected' : 'Open League Client'}
                    </Text>
                </View>
            </View>
            
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

            {/* Warning if LCU not connected */}
            {!desktopStatus.lcuConnected && (
                <View style={styles.warningBanner}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <Text style={styles.warningText}>Open League of Legends on your computer to enable controls</Text>
                </View>
            )}

            {/* Game Phase Controls */}
            {gamePhase === 'Lobby' && lobby && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>In Lobby</Text>
                    <Button
                        title="Enter Queue"
                        onPress={handleEnterQueue}
                        buttonStyle={styles.primaryButton}
                    />
                </View>
            )}

            {(gamePhase === 'None' || !gamePhase) && desktopStatus.lcuConnected && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Not in Game</Text>
                    <Button
                        title="Create Lobby"
                        onPress={() => setShowCreateLobby(true)}
                        buttonStyle={styles.primaryButton}
                    />
                </View>
            )}

            <CreateLobby
                visible={showCreateLobby}
                onClose={() => setShowCreateLobby(false)}
                onSuccess={() => {
                    showAlert('Success', 'Lobby created successfully', undefined, 'success');
                }}
            />

            {(gamePhase === 'Matchmaking' || gamePhase === 'Queue') && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>In Queue</Text>
                    <Button
                        title="Cancel Queue"
                        onPress={handleCancelQueue}
                        buttonStyle={styles.secondaryButton}
                    />
                </View>
            )}

            {gamePhase === 'ReadyCheck' && readyCheck && readyCheck.state === 'InProgress' && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Match Found!</Text>
                    {readyCheck.timer !== undefined && (
                        <Text style={styles.timerText}>
                            {Math.ceil(readyCheck.timer)}s remaining
                        </Text>
                    )}
                    <View style={styles.buttonRow}>
                        <Button
                            title="Decline"
                            onPress={handleDeclineReadyCheck}
                            buttonStyle={styles.secondaryButton}
                            containerStyle={styles.buttonHalf}
                        />
                        <Button
                            title="Accept"
                            onPress={handleAcceptReadyCheck}
                            buttonStyle={styles.acceptButton}
                            containerStyle={styles.buttonHalf}
                        />
                    </View>
                </View>
            )}

            {gamePhase === 'ChampSelect' && champSelect && champSelect.localPlayerCellId !== undefined && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Champion Select</Text>
                    <Text style={styles.infoText}>Pick a champion:</Text>
                    <Button
                        title="Pick Ahri"
                        onPress={() => handlePickChampion(103)}
                        containerStyle={styles.champButton}
                    />
                    <Button
                        title="Pick Yasuo"
                        onPress={() => handlePickChampion(157)}
                        containerStyle={styles.champButton}
                    />
                    <Button
                        title="Pick Zed"
                        onPress={() => handlePickChampion(238)}
                        containerStyle={styles.champButton}
                    />
                </View>
            )}
            </ScrollView>

            {/* Bottom Buttons - Fixed at bottom of screen */}
            <View style={styles.bottomActions}>
                <Button
                    title="Disconnect"
                    onPress={() => {
                        lcuBridge.disconnect();
                        setConnected(false);
                    }}
                    buttonStyle={styles.disconnectButton}
                    titleStyle={styles.disconnectButtonText}
                />
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a', // neutral-950
        paddingBottom: 0, // Remove default padding since we have bottom actions
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 24,
        backgroundColor: '#171717', // neutral-900
        borderBottomWidth: 1,
        borderBottomColor: '#262626', // neutral-800
    },
    title: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        color: '#a3a3a3', // neutral-400
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 12,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    statusIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22c55e', // green-500
        marginRight: 8,
    },
    status: {
        color: '#ffffff',
        fontSize: 16,
        marginTop: 8,
        textAlign: 'center',
    },
    connectedText: {
        color: '#22c55e', // green-500
        fontSize: 14,
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 120, // Extra space for bottom buttons
    },
    connectContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    userInfoBox: {
        backgroundColor: '#171717',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#262626',
    },
    userInfoLabel: {
        color: '#a3a3a3',
        fontSize: 14,
        marginBottom: 4,
    },
    userInfoEmail: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '500',
    },
    connectButton: {
        backgroundColor: '#4f46e5', // indigo-600
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 32,
    },
    connectButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    connectButtonContainer: {
        width: '100%',
        marginBottom: 16,
    },
    hintText: {
        color: '#737373', // neutral-500
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    loadingContainer: {
        alignItems: 'center',
    },
    loadingText: {
        color: '#ffffff',
        marginTop: 16,
        marginBottom: 20,
        fontSize: 16,
    },
    cancelButton: {
        backgroundColor: '#ef4444', // red-500
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    cancelButtonText: {
        color: '#ffffff',
        fontWeight: '500',
    },
    cancelButtonContainer: {
        marginTop: 12,
    },
    errorContainer: {
        marginHorizontal: 20,
        padding: 16,
        backgroundColor: '#7f1d1d', // red-900/50
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ef4444', // red-500
    },
    errorText: {
        color: '#fca5a5', // red-300
        textAlign: 'center',
        fontSize: 14,
    },
    bottomActions: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 40,
        gap: 12,
        backgroundColor: '#0a0a0a', // Match container background
        borderTopWidth: 1,
        borderTopColor: '#262626', // neutral-800
    },
    disconnectButton: {
        backgroundColor: '#ef4444', // red-500
        borderRadius: 8,
        paddingVertical: 12,
    },
    disconnectButtonText: {
        color: '#ffffff',
        fontWeight: '500',
    },
    signOutButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#525252', // neutral-600
        borderRadius: 8,
        paddingVertical: 12,
    },
    signOutButtonText: {
        color: '#d4d4d4', // neutral-300
        fontWeight: '500',
    },
    section: {
        width: '100%',
        marginBottom: 16,
        padding: 18,
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#262626',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    sectionTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    infoText: {
        color: '#ccc',
        marginBottom: 10,
    },
    timerText: {
        color: '#ff9800',
        fontSize: 16,
        marginBottom: 15,
        textAlign: 'center',
    },
    primaryButton: {
        backgroundColor: '#2196F3',
    },
    secondaryButton: {
        backgroundColor: '#757575',
    },
    acceptButton: {
        backgroundColor: '#4CAF50',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    buttonHalf: {
        flex: 1,
        marginHorizontal: 5,
    },
    champButton: {
        marginVertical: 5,
    },
    lcuStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    lcuStatusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    lcuStatusDotConnected: {
        backgroundColor: '#22c55e',
    },
    lcuStatusDotDisconnected: {
        backgroundColor: '#f59e0b',
    },
    lcuStatusText: {
        color: '#a3a3a3',
        fontSize: 13,
    },
    lcuStatusTextWarning: {
        color: '#f59e0b',
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    warningIcon: {
        fontSize: 18,
        marginRight: 10,
    },
    warningText: {
        flex: 1,
        color: '#f59e0b',
        fontSize: 14,
    },
});
