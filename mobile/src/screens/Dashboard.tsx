import React, { useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Session } from '@supabase/supabase-js';
import { DesktopStatus } from '../lib/lcuBridge';
import { FavoriteChampionConfig } from '../lib/favoriteChampions';
import SettingsPanel from '../components/SettingsPanel';

interface DashboardProps {
    session: Session;
    desktopStatus: DesktopStatus;
    onCreateLobby: () => void;
    onSignOut: () => void;
    favoriteConfig: FavoriteChampionConfig;
    onSaveFavoriteConfig: (config: FavoriteChampionConfig) => void;
}

const BG_IMAGE = require('../../static/magic-background.jpg');
const GOLD = '#c7b37b';
const OFFWHITE = '#e8e2cf';

export default function Dashboard({
    desktopStatus,
    onCreateLobby,
    onSignOut,
    favoriteConfig,
    onSaveFavoriteConfig,
}: DashboardProps) {
    const [showSettings, setShowSettings] = useState(false);

    const connected = !!desktopStatus?.lcuConnected;
    const headlineText = connected ? 'YOU\'RE ALL SET!' : 'OPEN LEAGUE CLIENT';
    const subheadText = connected
        ? 'Wait for your friends to invite you, or create a new lobby'
        : 'Open the League client on your desktop to create or join a lobby.';

    return (
        <ImageBackground source={BG_IMAGE} style={styles.bg} resizeMode="cover">
            <View style={styles.overlay} />
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                <View style={styles.container}>
                    <View style={styles.topRow}>
                        <TouchableOpacity
                            style={styles.settingsButton}
                            onPress={() => setShowSettings(true)}
                        >
                            <Text style={styles.settingsIcon}>⚙️</Text>
                        </TouchableOpacity>
                        <Text style={[styles.status, connected ? styles.statusOk : styles.statusWarn]}>
                            {connected ? 'Connected' : 'Waiting for client'}
                        </Text>
                    </View>

                    <View style={styles.center}>
                        <Text style={styles.headline}>{headlineText}</Text>
                        <Text style={styles.subhead}>{subheadText}</Text>
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.primaryButton, !connected && styles.disabledButton]}
                            activeOpacity={0.9}
                            disabled={!connected}
                            onPress={onCreateLobby}
                        >
                            <Text style={styles.primaryLabel}>CREATE NEW LOBBY</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryButton}
                            activeOpacity={0.85}
                            onPress={onSignOut}
                        >
                            <Text style={styles.secondaryLabel}>Sign Out</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>

            <SettingsPanel
                visible={showSettings}
                onClose={() => setShowSettings(false)}
                favoriteConfig={favoriteConfig}
                onSaveFavoriteConfig={onSaveFavoriteConfig}
            />
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    bg: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 12, 20, 0.55)',
    },
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    settingsButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingsIcon: {
        fontSize: 20,
    },
    status: {
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        overflow: 'hidden',
    },
    statusOk: {
        color: '#0b0c0d',
        backgroundColor: '#c7f2c4',
    },
    statusWarn: {
        color: '#241b0f',
        backgroundColor: '#f7e0a3',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    headline: {
        color: OFFWHITE,
        fontSize: 26,
        fontWeight: '900',
        letterSpacing: 0.5,
        textAlign: 'center',
        marginBottom: 12,
    },
    subhead: {
        color: '#d6c7a3',
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center',
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 30,
    },
    primaryButton: {
        borderWidth: 1,
        borderColor: GOLD,
        backgroundColor: 'rgba(10, 16, 24, 0.85)',
        paddingVertical: 14,
        borderRadius: 6,
        alignItems: 'center',
        marginBottom: 14,
    },
    disabledButton: {
        opacity: 0.5,
    },
    primaryLabel: {
        color: GOLD,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    secondaryButton: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    secondaryLabel: {
        color: '#cfd8e3',
        fontSize: 14,
        fontWeight: '600',
    },
});
