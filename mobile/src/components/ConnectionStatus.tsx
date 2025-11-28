import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

export interface ConnectionStatusState {
    riftConnected: boolean;
    desktopOnline: boolean;
    mobileConnected: boolean;
    lcuConnected: boolean;
}

interface ConnectionStatusProps {
    status: ConnectionStatusState;
    onConnect?: () => void;
    onDisconnect?: () => void;
    loading?: boolean;
}

interface StatusItemProps {
    label: string;
    connected: boolean;
    hint?: string;
}

const StatusItem = ({ label, connected, hint }: StatusItemProps) => (
    <View style={styles.statusItem}>
        <View style={styles.statusRow}>
            <View style={[styles.statusDot, connected ? styles.statusDotConnected : styles.statusDotDisconnected]} />
            <Text style={[styles.statusLabel, connected && styles.statusLabelConnected]}>{label}</Text>
            {connected && <Text style={styles.statusConnectedBadge}>Connected</Text>}
        </View>
        {!connected && hint && (
            <Text style={styles.statusHint}>{hint}</Text>
        )}
    </View>
);

export default function ConnectionStatus({ status, onConnect, onDisconnect, loading }: ConnectionStatusProps) {
    // Only display Rift/desktop status; hide mobile row
    const allConnected = status.riftConnected && status.desktopOnline;
    const partiallyConnected = false;
    const canConnect = status.desktopOnline;

    const getInstructions = () => {
        if (!status.riftConnected) {
            return {
                title: 'Checking Server...',
                message: 'Connecting to the Rift server...',
                icon: '🛰️',
            };
        }
        if (!status.desktopOnline) {
            return {
                title: 'Desktop App Offline',
                message: 'Open the desktop app and sign in with the same account. We\'ll detect it automatically.',
                icon: '🖥️',
            };
        }
        return {
            title: 'Desktop Ready!',
            message: 'Your desktop is online. Tap Connect to pair your devices.',
            icon: '🚀',
        };
    };

    const instructions = getInstructions();

    return (
        <View style={styles.container}>
            {/* Status Header */}
            <View style={styles.header}>
                <Text style={styles.headerIcon}>{instructions.icon}</Text>
                <Text style={styles.headerTitle}>{instructions.title}</Text>
                <Text style={styles.headerMessage}>{instructions.message}</Text>
            </View>

            {/* Status Items */}
            <View style={styles.statusContainer}>
                <Text style={styles.sectionTitle}>Connection Status</Text>

                <StatusItem
                    label="Desktop App"
                    connected={status.desktopOnline}
                    hint="Open desktop app & sign in"
                />

            </View>

            {/* Action Button */}
            {!partiallyConnected ? (
                <TouchableOpacity
                    style={[
                        styles.connectButton,
                        (loading || !canConnect) && styles.connectButtonDisabled
                    ]}
                    onPress={onConnect}
                    disabled={loading || !canConnect}
                >
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />
                            <Text style={styles.connectButtonText}>
                                {!status.riftConnected ? 'Checking...' : 'Connecting...'}
                            </Text>
                        </View>
                    ) : !canConnect ? (
                        <Text style={styles.connectButtonTextDisabled}>Waiting for Desktop...</Text>
                    ) : (
                        <Text style={styles.connectButtonText}>Connect to Desktop</Text>
                    )}
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={onDisconnect}
                >
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
            )}

            {/* Overall Status Banner */}
            {allConnected && (
                <View style={styles.successBanner}>
                    <Text style={styles.successIcon}>✅</Text>
                    <Text style={styles.successText}>All systems connected!</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    headerIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    headerMessage: {
        fontSize: 15,
        color: '#a3a3a3',
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 20,
    },
    statusContainer: {
        backgroundColor: '#171717',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#262626',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#737373',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
    },
    statusItem: {
        marginBottom: 16,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12,
    },
    statusDotConnected: {
        backgroundColor: '#22c55e',
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    statusDotDisconnected: {
        backgroundColor: '#525252',
    },
    statusLabel: {
        fontSize: 16,
        color: '#ffffff',
        fontWeight: '500',
        flex: 1,
    },
    statusLabelConnected: {
        color: '#ffffff',
    },
    statusConnectedBadge: {
        fontSize: 12,
        color: '#22c55e',
        fontWeight: '500',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    statusHint: {
        fontSize: 13,
        color: '#737373',
        marginLeft: 22,
        marginTop: 4,
    },
    connectButton: {
        backgroundColor: '#4f46e5',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#4f46e5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    connectButtonDisabled: {
        backgroundColor: '#3730a3',
        shadowOpacity: 0,
    },
    connectButtonText: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '600',
    },
    connectButtonTextDisabled: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 17,
        fontWeight: '600',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spinner: {
        marginRight: 10,
    },
    disconnectButton: {
        backgroundColor: '#262626',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#404040',
    },
    disconnectButtonText: {
        color: '#a3a3a3',
        fontSize: 17,
        fontWeight: '500',
    },
    successBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
        marginTop: 20,
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)',
    },
    successIcon: {
        fontSize: 18,
        color: '#22c55e',
        marginRight: 8,
        fontWeight: 'bold',
    },
    successText: {
        fontSize: 15,
        color: '#22c55e',
        fontWeight: '500',
    },
});

