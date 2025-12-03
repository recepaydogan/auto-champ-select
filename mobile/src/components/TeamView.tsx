import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Avatar } from '@rneui/themed';

interface TeamMember {
    cellId: number;
    championId: number;
    summonerName: string;
    assignedPosition: string;
    team: number;
    championName?: string;
    status?: 'picked' | 'hovering' | 'none';
}

interface TeamViewProps {
    myTeam: TeamMember[];
    theirTeam: TeamMember[];
    bans: any[];
    version?: string;
}

export default function TeamView({ myTeam, theirTeam, bans, version = '14.23.1' }: TeamViewProps) {
    const renderMember = (member: TeamMember, isEnemy: boolean) => {
        const isHovering = member.status === 'hovering';
        const isPicked = member.status === 'picked';
        const hasChampion = member.championId > 0;

        return (
            <View key={member.cellId} style={[styles.memberCard, isEnemy && styles.enemyCard]}>
                <View style={styles.memberContent}>
                    <View>
                        <Avatar
                            size={40}
                            rounded
                            source={{
                                uri: hasChampion && member.championName
                                    ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${member.championName}.png`
                                    : undefined
                            }}
                            icon={{ name: 'user', type: 'font-awesome', color: '#525252' }}
                            containerStyle={{
                                backgroundColor: '#262626',
                                borderWidth: isPicked ? 2 : 1,
                                borderColor: isPicked ? (isEnemy ? '#ef4444' : '#10b981') : (isEnemy ? '#7f1d1d' : '#1e3a8a'),
                                opacity: isHovering ? 0.6 : 1
                            }}
                        />
                        {isHovering && (
                            <View style={styles.hoverIndicator}>
                                <Text style={styles.hoverIndicatorText}>...</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>{member.summonerName || (isEnemy ? 'Enemy' : 'Ally')}</Text>
                        <Text style={styles.memberRole}>{member.assignedPosition}</Text>
                        {isHovering && <Text style={styles.statusText}>Hovering</Text>}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.teamsContainer}>
                <View style={styles.teamColumn}>
                    <Text style={styles.teamTitle}>My Team</Text>
                    {myTeam.map(m => renderMember(m, false))}
                </View>

                <View style={styles.divider} />

                <View style={styles.teamColumn}>
                    <Text style={[styles.teamTitle, styles.enemyTitle]}>Enemy Team</Text>
                    {theirTeam.map(m => renderMember(m, true))}
                </View>
            </View>

            {/* Bans Section */}
            <View style={styles.bansContainer}>
                <Text style={styles.bansTitle}>Bans</Text>
                <View style={styles.bansRow}>
                    {/* Placeholder for bans */}
                    <Text style={styles.noBans}>No bans yet</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 10,
    },
    teamsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    teamColumn: {
        flex: 1,
    },
    divider: {
        width: 10,
    },
    teamTitle: {
        color: '#60a5fa',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 8,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    enemyTitle: {
        color: '#f87171',
    },
    memberCard: {
        backgroundColor: '#171717',
        marginBottom: 8,
        borderRadius: 8,
        padding: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#3b82f6',
    },
    enemyCard: {
        borderLeftColor: '#ef4444',
        alignItems: 'flex-end',
    },
    memberContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    memberInfo: {
        marginLeft: 10,
        flex: 1,
    },
    memberName: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
    },
    memberRole: {
        color: '#737373',
        fontSize: 10,
    },
    bansContainer: {
        marginTop: 10,
        padding: 10,
        backgroundColor: '#171717',
        borderRadius: 8,
        alignItems: 'center',
    },
    bansTitle: {
        color: '#a3a3a3',
        fontSize: 12,
        marginBottom: 5,
    },
    bansRow: {
        flexDirection: 'row',
        gap: 5,
    },
    noBans: {
        color: '#525252',
        fontSize: 12,
        fontStyle: 'italic',
    },
    hoverIndicator: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#eab308',
        borderRadius: 10,
        width: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#000',
    },
    hoverIndicatorText: {
        color: '#000',
        fontSize: 10,
        fontWeight: 'bold',
        lineHeight: 12,
    },
    statusText: {
        color: '#eab308',
        fontSize: 10,
        fontStyle: 'italic',
    },
});
