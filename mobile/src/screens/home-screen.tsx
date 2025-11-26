import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Button } from '@rneui/themed';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import CodeEntry from '../components/CodeEntry';
import CreateLobby from '../components/CreateLobby';
import { getLCUBridge } from '../lib/lcuBridge';
import { RIFT_URL } from '../config';
import { RiftSocketState, type RiftSocketStateValue } from '../lib/riftSocket';

export default function HomeScreen({ session }: { session: Session }) {
    const [code, setCode] = useState('');
    const [connectionState, setConnectionState] = useState<RiftSocketStateValue>(RiftSocketState.DISCONNECTED);
    const [connected, setConnected] = useState(false);
    const [gamePhase, setGamePhase] = useState<string>('None');
    const [lobby, setLobby] = useState<any>(null);
    const [readyCheck, setReadyCheck] = useState<any>(null);
    const [champSelect, setChampSelect] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showCreateLobby, setShowCreateLobby] = useState(false);
    const [connectionAborted, setConnectionAborted] = useState(false);

    const lcuBridge = getLCUBridge();

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            lcuBridge.disconnect();
        };
    }, []);

    const handleCodeComplete = async (enteredCode: string) => {
        if (enteredCode.length !== 6 || !/^\d{6}$/.test(enteredCode)) {
            Alert.alert('Invalid Code', 'Please enter a valid 6-digit code');
            return;
        }

        setLoading(true);
        setConnectionState(RiftSocketState.CONNECTING);
        setConnectionAborted(false);

        try {
            await lcuBridge.connect(enteredCode, RIFT_URL);
            
            // Check if connection was aborted
            if (connectionAborted) {
                lcuBridge.disconnect();
                return;
            }
            
            setConnected(true);
            setConnectionState(RiftSocketState.CONNECTED);
            
            // Subscribe to LCU endpoints
            setupLCUObservers();
        } catch (error: any) {
            if (!connectionAborted) {
                console.error('Failed to connect:', error);
                Alert.alert('Connection Failed', error.message || 'Failed to connect to desktop');
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
        setCode('');
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
            Alert.alert('Success', 'Entered queue');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to enter queue');
        }
    };

    const handleCancelQueue = async () => {
        try {
            await lcuBridge.request('/lol-lobby/v2/lobby/matchmaking/search', 'DELETE');
            Alert.alert('Success', 'Left queue');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to leave queue');
        }
    };

    const handleAcceptReadyCheck = async () => {
        try {
            await lcuBridge.request('/lol-matchmaking/v1/ready-check/accept', 'POST');
            Alert.alert('Success', 'Accepted match');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to accept');
        }
    };

    const handleDeclineReadyCheck = async () => {
        try {
            await lcuBridge.request('/lol-matchmaking/v1/ready-check/decline', 'POST');
            Alert.alert('Success', 'Declined match');
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to decline');
        }
    };

    const handlePickChampion = async (championId: number) => {
        if (!champSelect) return;

        try {
            const localPlayerCellId = champSelect.localPlayerCellId;
            const myTeam = champSelect.myTeam || [];
            const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
            
            if (!localPlayer) {
                Alert.alert('Error', 'Could not find local player');
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
                        Alert.alert('Success', 'Champion selected');
                        return;
                    }
                }
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to pick champion');
        }
    };

    if (!connected) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Auto Champ Select</Text>
                    <Text style={styles.subtitle}>Enter the 6-digit code from your desktop app</Text>
                </View>
                
                <View style={styles.codeEntryContainer}>
                    <CodeEntry
                        value={code}
                        onChange={setCode}
                        onComplete={handleCodeComplete}
                        loading={loading}
                    />
                </View>

                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#4f46e5" />
                        <Text style={styles.loadingText}>Connecting...</Text>
                        <Button
                            title="Cancel"
                            onPress={handleCancelConnection}
                            buttonStyle={styles.cancelButton}
                            titleStyle={styles.cancelButtonText}
                            containerStyle={styles.cancelButtonContainer}
                        />
                    </View>
                )}

                {connectionState === RiftSocketState.FAILED_NO_DESKTOP && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>Desktop app not found. Make sure it's running.</Text>
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
                <Text style={styles.status}>Status: {gamePhase}</Text>
            </View>
            
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

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

            {(gamePhase === 'None' || !gamePhase) && (
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
                    Alert.alert('Success', 'Lobby created successfully');
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

                <View style={styles.footer}>
                    <Button
                        title="Disconnect"
                        onPress={() => {
                            lcuBridge.disconnect();
                            setConnected(false);
                            setCode('');
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
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a', // neutral-950
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
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
        paddingBottom: 40,
    },
    codeEntryContainer: {
        marginTop: 40,
        marginBottom: 20,
    },
    loadingContainer: {
        marginTop: 30,
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
        marginTop: 20,
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
    footer: {
        padding: 20,
        gap: 12,
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
        marginBottom: 20,
        padding: 15,
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
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
});
