import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Button, Avatar } from '@rneui/themed';
import { Session } from '@supabase/supabase-js';
import { DesktopStatus } from '../lib/lcuBridge';

interface DashboardProps {
    session: Session;
    desktopStatus: DesktopStatus;
    onCreateLobby: () => void;
    onSignOut: () => void;
}

export default function Dashboard({ session, desktopStatus, onCreateLobby, onSignOut }: DashboardProps) {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Dashboard</Text>
                <View style={styles.statusContainer}>
                    <View style={[styles.statusDot, desktopStatus.lcuConnected ? styles.connected : styles.disconnected]} />
                    <Text style={styles.statusText}>
                        {desktopStatus.lcuConnected ? 'League Client Connected' : 'Waiting for League Client...'}
                    </Text>
                </View>
            </View>

            <View style={styles.content}>
                <View style={styles.profileCard}>
                    <Avatar
                        size={80}
                        rounded
                        title={session.user.email?.substring(0, 2).toUpperCase()}
                        containerStyle={{ backgroundColor: '#3d4db7' }}
                    />
                    <Text style={styles.email}>{session.user.email}</Text>
                </View>

                <View style={styles.actionContainer}>
                    <Button
                        title="Create Lobby"
                        onPress={onCreateLobby}
                        disabled={!desktopStatus.lcuConnected}
                        buttonStyle={styles.createButton}
                        containerStyle={styles.buttonContainer}
                        icon={{
                            name: 'gamepad',
                            type: 'font-awesome',
                            size: 20,
                            color: 'white',
                        }}
                    />
                </View>
            </View>

            <View style={styles.footer}>
                <Button
                    title="Sign Out"
                    onPress={onSignOut}
                    type="outline"
                    buttonStyle={styles.signOutButton}
                    titleStyle={styles.signOutText}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        padding: 20,
    },
    header: {
        marginTop: 40,
        marginBottom: 30,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 10,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#171717',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    connected: {
        backgroundColor: '#22c55e',
    },
    disconnected: {
        backgroundColor: '#f59e0b',
    },
    statusText: {
        color: '#a3a3a3',
        fontSize: 12,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileCard: {
        alignItems: 'center',
        marginBottom: 40,
    },
    email: {
        color: '#ffffff',
        fontSize: 18,
        marginTop: 12,
        fontWeight: '500',
    },
    actionContainer: {
        width: '100%',
        paddingHorizontal: 20,
    },
    createButton: {
        backgroundColor: '#4f46e5',
        paddingVertical: 15,
        borderRadius: 12,
    },
    buttonContainer: {
        width: '100%',
    },
    footer: {
        marginBottom: 20,
    },
    signOutButton: {
        borderColor: '#ef4444',
        borderRadius: 12,
        paddingVertical: 12,
    },
    signOutText: {
        color: '#ef4444',
    },
});
