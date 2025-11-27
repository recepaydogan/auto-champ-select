import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { Button } from '@rneui/themed';
import RolePicker from '../components/RolePicker';
import QuickplaySetup from '../components/QuickplaySetup';

interface LobbyScreenProps {
    lobby: any;
    onEnterQueue: () => void;
    onLeaveLobby: () => void;
    onUpdateRoles: (first: string, second: string) => void;
}

export default function LobbyScreen({ lobby, onEnterQueue, onLeaveLobby, onUpdateRoles }: LobbyScreenProps) {
    const [showRolePicker, setShowRolePicker] = useState(false);
    const [pickingFirstRole, setPickingFirstRole] = useState(true);

    const localMember = lobby?.members?.find((m: any) => m.puuid === lobby.localMember.puuid) || lobby?.localMember;
    const isQuickplay = lobby?.gameConfig?.queueId === 480;
    console.log('Lobby Queue ID:', lobby?.gameConfig?.queueId, 'Is Quickplay:', isQuickplay);

    const handleRoleSelect = (role: string) => {
        const first = pickingFirstRole ? role : localMember?.firstPositionPreference || 'UNSELECTED';
        const second = !pickingFirstRole ? role : localMember?.secondPositionPreference || 'UNSELECTED';
        onUpdateRoles(first, second);
        setShowRolePicker(false);
    };

    const openRolePicker = (isFirst: boolean) => {
        setPickingFirstRole(isFirst);
        setShowRolePicker(true);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Lobby</Text>
                <Text style={styles.subtitle}>{lobby?.gameConfig?.gameMode} - {lobby?.gameConfig?.mapId === 11 ? 'Summoner\'s Rift' : 'Map ' + lobby?.gameConfig?.mapId}</Text>
                {isQuickplay && <Text style={styles.modeTag}>Quickplay</Text>}
            </View>

            <ScrollView style={styles.content}>
                {/* Quickplay Setup */}
                {isQuickplay ? (
                    <QuickplaySetup onReady={() => { }} />
                ) : (
                    /* Standard Member List */
                    <View style={styles.membersContainer}>
                        {lobby?.members?.map((member: any, index: number) => (
                            <View key={index} style={styles.memberRow}>
                                <View style={styles.memberInfo}>
                                    <Image
                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${member.summonerIconId}.png` }}
                                        style={styles.profileIcon}
                                    />
                                    <Text style={styles.memberName}>{member.summonerName}</Text>
                                </View>

                                {/* Role Selection (Only for local member in Draft modes) */}
                                {member.puuid === localMember?.puuid && lobby?.gameConfig?.showPositionSelector && (
                                    <View style={styles.roleContainer}>
                                        <TouchableOpacity onPress={() => openRolePicker(true)} style={styles.roleButton}>
                                            <Text style={styles.roleText}>{member.firstPositionPreference || 'FILL'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => openRolePicker(false)} style={styles.roleButton}>
                                            <Text style={styles.roleText}>{member.secondPositionPreference || 'FILL'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Button
                    title="Leave Lobby"
                    onPress={onLeaveLobby}
                    buttonStyle={styles.leaveButton}
                    containerStyle={styles.buttonContainer}
                />
                <Button
                    title="Find Match"
                    onPress={onEnterQueue}
                    buttonStyle={styles.queueButton}
                    containerStyle={styles.buttonContainer}
                    disabled={!lobby?.canStartActivity}
                />
            </View>

            <RolePicker
                visible={showRolePicker}
                onSelect={handleRoleSelect}
                onClose={() => setShowRolePicker(false)}
                currentRole={pickingFirstRole ? localMember?.firstPositionPreference : localMember?.secondPositionPreference}
            />
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
        marginBottom: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 16,
        color: '#a3a3a3',
    },
    modeTag: {
        color: '#eab308',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 5,
        textTransform: 'uppercase',
    },
    content: {
        flex: 1,
    },
    membersContainer: {
        gap: 10,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#171717',
        padding: 15,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#262626',
    },
    memberInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    profileIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    memberName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    roleContainer: {
        flexDirection: 'row',
        gap: 5,
    },
    roleButton: {
        backgroundColor: '#333',
        padding: 8,
        borderRadius: 5,
        minWidth: 50,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#444',
    },
    roleText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    footer: {
        gap: 10,
        marginTop: 20,
        marginBottom: 20,
    },
    buttonContainer: {
        width: '100%',
    },
    queueButton: {
        backgroundColor: '#4f46e5',
        paddingVertical: 15,
        borderRadius: 12,
    },
    leaveButton: {
        borderColor: '#ef4444',
        backgroundColor: 'transparent',
        borderWidth: 1,
        paddingVertical: 15,
        borderRadius: 12,
    },
});
