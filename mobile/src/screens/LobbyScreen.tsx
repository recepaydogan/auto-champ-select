import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@rneui/themed';
import RolePicker from '../components/RolePicker';
import QuickplaySetup from '../components/QuickplaySetup';
import { getLCUBridge } from '../lib/lcuBridge';

interface LobbyScreenProps {
    lobby: any;
    onEnterQueue: () => void;
    onLeaveLobby: () => void;
    onUpdateRoles: (first: string, second: string) => void;
    onOpenCreateLobby?: () => void;
    estimatedQueueTime?: number | null;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
}

export default function LobbyScreen({ lobby, onEnterQueue, onLeaveLobby, onUpdateRoles, onOpenCreateLobby, estimatedQueueTime, onError, onSuccess }: LobbyScreenProps) {
    const [showRolePicker, setShowRolePicker] = useState(false);
    const [pickingFirstRole, setPickingFirstRole] = useState(true);
    const [memberNames, setMemberNames] = useState<{ [summonerId: number]: string }>({});
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [friends, setFriends] = useState<any[]>([]);
    const [loadingFriends, setLoadingFriends] = useState(false);
    const [invitingId, setInvitingId] = useState<number | null>(null);
    const [friendSearch, setFriendSearch] = useState('');
    const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'online'>('all');
    const [queueInfo, setQueueInfo] = useState<any>(null);
    const [friendSortMode, setFriendSortMode] = useState<'availability' | 'name'>('availability');
    const fetchedIdsRef = useRef<Set<number>>(new Set());
    const [localPendingInvites, setLocalPendingInvites] = useState<any[]>([]);
    const cachedFriendsRef = useRef<any[]>([]);

    const lcuBridge = getLCUBridge();
    const localMember = lobby?.members?.find((m: any) => m.puuid === lobby?.localMember?.puuid) || lobby?.localMember;
    const isQuickplay = !!(lobby?.gameConfig?.showQuickPlaySlotSelection || [480, 490].includes(lobby?.gameConfig?.queueId));
    
    // Fetch queue information to get shortName
    useEffect(() => {
        const fetchQueueInfo = async () => {
            const queueId = lobby?.gameConfig?.queueId;
            if (!queueId || !lcuBridge.getIsConnected()) {
                setQueueInfo(null);
                return;
            }

            try {
                const result = await lcuBridge.request(`/lol-game-queues/v1/queues/${queueId}`);
                if (result.status === 200 && result.content) {
                    setQueueInfo(result.content);
                } else {
                    setQueueInfo(null);
                }
            } catch (error) {
                console.error('[LobbyScreen] Failed to fetch queue info:', error);
                setQueueInfo(null);
            }
        };

        fetchQueueInfo();
    }, [lobby?.gameConfig?.queueId]);
    
    // Fetch summoner names for all members
    useEffect(() => {
        const hasMembers = lobby?.members && lobby.members.length > 0;
        const hasInvites = lobby?.invitations && lobby.invitations.length > 0;

        if (!hasMembers && !hasInvites) {
            setMemberNames({});
            fetchedIdsRef.current.clear();
            return;
        }

        const fetchSummonerNames = async () => {
            const names: { [summonerId: number]: string } = {};
            const idsToFetch = new Set<number>();

            lobby?.members?.forEach((member: any) => {
                if (member.summonerId) idsToFetch.add(member.summonerId);
            });
            lobby?.invitations?.forEach((invite: any) => {
                if (invite.toSummonerId) idsToFetch.add(invite.toSummonerId);
            });

            const idsNeedingFetch = Array.from(idsToFetch).filter(id => !fetchedIdsRef.current.has(id));

            if (idsNeedingFetch.length === 0) {
                return;
            }

            console.log(`[LobbyScreen] Fetching names for ${idsNeedingFetch.length} players...`);

            const fetchPromises = idsNeedingFetch.map(async (summonerId: number) => {
                try {
                    console.log(`[LobbyScreen] Fetching name for summoner ${summonerId}...`);
                    const result = await lcuBridge.request(`/lol-summoner/v1/summoners/${summonerId}`);
                    console.log(`[LobbyScreen] Response for ${summonerId}:`, result.status, result.content);
                    
                    if (result.status === 200 && result.content) {
                        const displayName = result.content.displayName || 
                                         result.content.gameName || 
                                         result.content.summonerName ||
                                         result.content.name;
                        if (displayName) {
                            names[summonerId] = displayName;
                            fetchedIdsRef.current.add(summonerId);
                            console.log(`[LobbyScreen] ✓ Fetched name for ${summonerId}: ${displayName}`);
                        } else {
                            console.warn(`[LobbyScreen] No name found in response for ${summonerId}:`, result.content);
                        }
                    } else {
                        console.warn(`[LobbyScreen] Failed to fetch summoner ${summonerId}: status ${result.status}`);
                    }
                } catch (error: any) {
                    console.error(`[LobbyScreen] Error fetching summoner name for ${summonerId}:`, error?.message || error);
                }
            });

            await Promise.all(fetchPromises);
            
            // Update state with newly fetched names
            if (Object.keys(names).length > 0) {
                console.log(`[LobbyScreen] Updating state with ${Object.keys(names).length} new names`);
                setMemberNames(prev => ({ ...prev, ...names }));
            } else {
                console.warn('[LobbyScreen] No names were fetched');
            }
        };

        fetchSummonerNames();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lobby?.members, lobby?.invitations]);

    const loadFriends = async () => {
        if (!lcuBridge.getIsConnected()) {
            return;
        }
        try {
            setLoadingFriends(true);
            const result = await lcuBridge.request('/lol-chat/v1/friends');
            if (result.status === 200 && Array.isArray(result.content)) {
                const availabilityOrder: Record<string, number> = {
                    chat: 0,
                    mobile: 1,
                    away: 2,
                    dnd: 3,
                    offline: 4
                };
                const byAvailability = [...result.content].sort((a: any, b: any) => {
                    const aStatus = (a.availability || '').toLowerCase();
                    const bStatus = (b.availability || '').toLowerCase();
                    const aRank = availabilityOrder[aStatus] ?? 5;
                    const bRank = availabilityOrder[bStatus] ?? 5;
                    if (aRank !== bRank) return aRank - bRank;
                    const aName = (a.gameName || a.name || '').toLowerCase();
                    const bName = (b.gameName || b.name || '').toLowerCase();
                    return aName.localeCompare(bName);
                });
                const byName = [...result.content].sort((a: any, b: any) => {
                    const aName = (a.gameName || a.name || '').toLowerCase();
                    const bName = (b.gameName || b.name || '').toLowerCase();
                    return aName.localeCompare(bName);
                });
                const sorted = friendSortMode === 'availability' ? byAvailability : byName;
                setFriends(sorted);
                cachedFriendsRef.current = sorted;
            } else {
                setFriends(cachedFriendsRef.current || []);
            }
        } catch (error) {
            console.error('[LobbyScreen] Failed to load friends list:', error);
            setFriends(cachedFriendsRef.current || []);
        } finally {
            setLoadingFriends(false);
        }
    };

    useEffect(() => {
        if (showInviteModal) {
            loadFriends();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showInviteModal]);

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

    const formatEstimatedTime = (seconds: number): string => {
        if (seconds < 60) {
            return `${Math.round(seconds)} saniye`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        if (remainingSeconds === 0) {
            return `${minutes} dakika`;
        }
        return `${minutes} dakika ${remainingSeconds} saniye`;
    };

    const getMapName = (mapId: number | null | undefined): string => {
        if (!mapId) return 'Unknown Map';
        
        switch (mapId) {
            case 10:
                return 'Twisted Treeline';
            case 11:
                return 'Summoner\'s Rift';
            case 12:
                return 'Howling Abyss';
            case 22:
                return 'Teamfight Tactics';
            case 30:
                return 'Arena';
            default:
                return `Map ${mapId}`;
        }
    };

    const getSubtitle = (): string => {
        // Prioritize shortName from queue info, then description, then name
        const queueName = queueInfo?.shortName || queueInfo?.description || queueInfo?.name;
        const mapId = lobby?.gameConfig?.mapId;
        const mapName = getMapName(mapId);
        
        // If we have queue name and map, show both
        if (queueName && mapId) {
            return `${queueName} - ${mapName}`;
        }
        
        // If we have queue name, show just that
        if (queueName) {
            return queueName;
        }
        
        // Fallback to gameMode if queue info not available yet
        const gameMode = lobby?.gameConfig?.gameMode;
        if (gameMode && mapId) {
            return `${gameMode} - ${mapName}`;
        }
        
        if (gameMode) {
            return gameMode;
        }
        
        if (mapId) {
            return mapName;
        }
        
        // Final fallback
        return 'Lobby';
    };

    const sendInvite = async (toSummonerId: number) => {
        if (!toSummonerId || !lcuBridge.getIsConnected()) {
            if (onError) onError('Not connected to desktop client');
            return;
        }

        const alreadyInvited = lobby?.invitations?.some((invite: any) => invite.toSummonerId === toSummonerId && invite.state === 'Pending');
        if (alreadyInvited) {
            if (onError) onError('Invite already pending for this player');
            return;
        }

        try {
            setInvitingId(toSummonerId);
            const result = await lcuBridge.request('/lol-lobby/v2/lobby/invitations', 'POST', [{ toSummonerId }]);
            if (result.status >= 400) {
                const message = result.content?.message || result.content?.error || 'Failed to send invite';
                throw new Error(message);
            }
            // Optimistically track pending invite locally
            setLocalPendingInvites(prev => {
                if (prev.some(p => p.toSummonerId === toSummonerId)) return prev;
                return [...prev, { toSummonerId, state: 'Pending', invitationId: `local-${Date.now()}` }];
            });
            // Refresh lobby invitations snapshot
            try {
                const lobbyRes = await lcuBridge.request('/lol-lobby/v2/lobby');
                if (lobbyRes.status === 200 && lobbyRes.content?.invitations) {
                    setLocalPendingInvites(prev => prev.filter(p => lobbyRes.content.invitations.every((i: any) => i.toSummonerId !== p.toSummonerId)));
                }
            } catch (e) {
                console.warn('[LobbyScreen] Failed to refresh invites after send', e);
            }
            // Suppress lobby-level success modal
        } catch (error: any) {
            const message = error.message || 'Failed to send invite';
            console.error('[LobbyScreen] Error sending invite:', message);
        } finally {
            setInvitingId(null);
        }
    };

    const renderInviteState = (state: string) => {
        if (!state) return 'Pending';
        return state;
    };

    const sentInvites = (lobby?.invitations || []).filter((invite: any) => invite.toSummonerId !== localMember?.summonerId);
    const combinedInvites = [
        ...sentInvites,
        ...localPendingInvites.filter(p => !sentInvites.some(i => i.toSummonerId === p.toSummonerId)),
    ];
    const pendingInvites = sentInvites.filter((i: any) => i.state === 'Pending').length;
    const acceptedInvites = sentInvites.filter((i: any) => i.state === 'Accepted').length;
    const declinedInvites = sentInvites.filter((i: any) => i.state === 'Declined').length;

    const renderFriendName = (friend: any) => {
        return friend?.gameName || friend?.name || 'Unknown player';
    };

    const renderFriendStatus = (friend: any) => {
        const status = (friend?.availability || '').toLowerCase();
        if (!status) return 'offline';
        return status;
    };

    const filteredFriends = friends.filter((f) => {
        const name = (f.gameName || f.name || '').toLowerCase();
        const matchesSearch = name.includes(friendSearch.trim().toLowerCase());
        const status = (f.availability || '').toLowerCase();
        const isOnline = status === 'chat' || status === 'mobile';
        if (availabilityFilter === 'online' && !isOnline) return false;
        return matchesSearch;
    });

    const availabilityColor = (availability?: string) => {
        const status = (availability || '').toLowerCase();
        if (status === 'chat' || status === 'online') return '#22c55e';
        if (status === 'mobile') return '#a855f7';
        if (status === 'away') return '#eab308';
        if (status === 'dnd') return '#ef4444';
        return '#6b7280';
    };

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setFriendSearch('');
        setAvailabilityFilter('all');
        setInvitingId(null);
    };

    // Ensure no lingering overlay blocks touches if the modal state ever desyncs
    useEffect(() => {
        if (!showInviteModal) {
            setInvitingId(null);
        }
    }, [showInviteModal]);

  

    // Show loading state if lobby is null
    if (!lobby) {
        return (
            <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Lobby</Text>
                    <Text style={styles.subtitle}>Loading...</Text>
                </View>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading lobby data...</Text>
                </View>
            </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Lobby</Text>
                <Text style={styles.subtitle}>{getSubtitle()}</Text>
                {isQuickplay && <Text style={styles.modeTag}>Quickplay</Text>}
                {estimatedQueueTime !== null && estimatedQueueTime !== undefined && (
                    <Text style={styles.estimatedTimeText}>
                        Tahmini kaç dakikada oyun bulacak: {formatEstimatedTime(estimatedQueueTime)}
                    </Text>
                )}
                <View style={styles.headerStatusRow}>
                    <Text style={styles.headerStatusText}>Members: {lobby?.members?.length || 0}</Text>
                    <Text style={styles.headerStatusText}>Queue ID: {lobby?.gameConfig?.queueId || '-'}</Text>
                </View>
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.inviteButtonRow}>
                    <Button
                        title="Invite friends"
                        onPress={() => setShowInviteModal(true)}
                        buttonStyle={styles.primaryButton}
                        containerStyle={{ width: '100%' }}
                    />
                </View>

                {/* Quickplay Setup */}
                {isQuickplay ? (
                    <QuickplaySetup 
                        lobby={lobby} 
                        onReady={() => { }} 
                        onError={onError}
                        onSuccess={onSuccess}
                    />
                ) : (
                    /* Standard Member List */
                    <View style={styles.membersContainer}>
                        {!lobby.members || lobby.members.length === 0 ? (
                            <View style={styles.emptyStateContainer}>
                                <Text style={styles.emptyStateText}>No members in lobby</Text>
                                <Text style={styles.emptyStateSubtext}>Waiting for players to join...</Text>
                            </View>
                        ) : (
                            lobby.members.map((member: any, index: number) => {
                            // Get member name from fetched names or fallback to member properties
                            // Check if we're still fetching (not in fetchedIdsRef means we haven't tried yet or it failed)
                            const isFetching = member.summonerId && !fetchedIdsRef.current.has(member.summonerId) && !memberNames[member.summonerId];
                            const memberName = memberNames[member.summonerId] || 
                                             member.summonerName || 
                                             member.displayName || 
                                             member.gameName || 
                                             member.name || 
                                             (isFetching ? 'Loading...' : 'Unknown Player');
                            
                            // Get profile icon ID
                            const profileIconId = member.summonerIconId || 
                                                member.profileIconId || 
                                                member.icon || 
                                                29; // Default icon
                            
                            const isLeader = member.isLeader || false;
                            const isLocalPlayer = member.puuid === localMember?.puuid;
                            
                            return (
                                <View key={index} style={styles.memberRow}>
                                    <View style={styles.memberInfo}>
                                        <View style={styles.profileIconContainer}>
                                            <Image
                                                source={{ uri: `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${profileIconId}.png` }}
                                                style={styles.profileIcon}
                                            />
                                            {isLeader && (
                                                <View style={styles.leaderBadge}>
                                                    <Text style={styles.leaderBadgeText}>👑</Text>
                                                </View>
                                            )}
                                        </View>
                                        <View style={styles.memberTextContainer}>
                                            {isFetching ? (
                                                <View style={styles.skeletonName} />
                                            ) : (
                                                <Text style={styles.memberName}>
                                                    {memberName}
                                                </Text>
                                            )}
                                            <View style={styles.memberChipsRow}>
                                                {isLeader && <Text style={styles.leaderChip}>Group Leader</Text>}
                                                {isLocalPlayer && <Text style={styles.localPlayerTag}>you</Text>}
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.actionsRow}>
                                        {/* Role Selection (Only for local member in Draft modes) */}
                                        {isLocalPlayer && lobby?.gameConfig?.showPositionSelector && (
                                            <View style={styles.roleContainer}>
                                                <TouchableOpacity onPress={() => openRolePicker(true)} style={styles.roleButton}>
                                                    <Text style={styles.roleText}>{member.firstPositionPreference || 'FILL'}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => openRolePicker(false)} style={styles.roleButton}>
                                                    <Text style={styles.roleText}>{member.secondPositionPreference || 'FILL'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}

                                        {localMember?.isLeader && !isLocalPlayer && (
                                            <View style={styles.memberActions}>
                                                    <Button
                                                        title="Promote"
                                                        type="outline"
                                                        onPress={async () => {
                                                            try {
                                                                await lcuBridge.request(`/lol-lobby/v2/lobby/members/${member.summonerId}/promote`, 'POST');
                                                            } catch (err: any) {
                                                                console.error('Failed to promote', err?.message);
                                                            }
                                                        }}
                                                        buttonStyle={styles.smallOutline}
                                                        titleStyle={styles.actionTitle}
                                                        containerStyle={styles.actionContainer}
                                                    />
                                                    <Button
                                                        title="Kick"
                                                        type="outline"
                                                        onPress={async () => {
                                                            try {
                                                                await lcuBridge.request(`/lol-lobby/v2/lobby/members/${member.summonerId}/kick`, 'POST');
                                                            } catch (err: any) {
                                                                console.error('Failed to kick', err?.message);
                                                            }
                                                        }}
                                                        buttonStyle={styles.smallDanger}
                                                        titleStyle={styles.actionTitle}
                                                        containerStyle={styles.actionContainer}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                        )}
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
                {onOpenCreateLobby && (
                    <Button
                        title="Create New Lobby"
                        onPress={() => {
                            onLeaveLobby();
                            onOpenCreateLobby();
                        }}
                        buttonStyle={styles.secondaryButton}
                        containerStyle={styles.buttonContainer}
                        type="outline"
                    />
                )}
            </View>

            <RolePicker
                visible={showRolePicker}
                onSelect={handleRoleSelect}
                onClose={() => setShowRolePicker(false)}
                currentRole={pickingFirstRole ? localMember?.firstPositionPreference : localMember?.secondPositionPreference}
            />
            <Modal
                visible={showInviteModal}
                animationType="slide"
                transparent
                onRequestClose={closeInviteModal}
            >
                <View style={styles.modalRoot} pointerEvents="box-none">
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeInviteModal} />
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Invite friends</Text>
                            <Button
                                title="Close"
                                type="clear"
                                titleStyle={styles.modalClose}
                                onPress={closeInviteModal}
                            />
                        </View>
                        {loadingFriends ? (
                            <View style={styles.modalLoading}>
                                <ActivityIndicator size="large" color="#4f46e5" />
                                <Text style={styles.modalLoadingText}>Loading friends...</Text>
                            </View>
                        ) : friends.length === 0 ? (
                            <View style={styles.modalLoading}>
                                <Text style={styles.modalLoadingText}>No friends found.</Text>
                                <Button title="Refresh" onPress={loadFriends} type="outline" />
                            </View>
                        ) : (
                            <>
                                <View style={styles.searchRow}>
                                    <View style={styles.searchInputWrapper}>
                                        <TextInput
                                            value={friendSearch}
                                            onChangeText={setFriendSearch}
                                            placeholder="Search friends..."
                                            placeholderTextColor="#6b7280"
                                            style={styles.searchInput}
                                        />
                                    </View>
                                    <View style={styles.filterButtonsCompact}>
                                        <Button
                                            title="All"
                                            type={availabilityFilter === 'all' ? 'solid' : 'outline'}
                                            onPress={() => setAvailabilityFilter('all')}
                                            buttonStyle={availabilityFilter === 'all' ? styles.modeButtonActive : styles.modeButton}
                                            titleStyle={styles.modeButtonTitle}
                                            containerStyle={styles.filterButtonContainer}
                                        />
                                        <Button
                                            title="Online"
                                            type={availabilityFilter === 'online' ? 'solid' : 'outline'}
                                            onPress={() => setAvailabilityFilter('online')}
                                            buttonStyle={availabilityFilter === 'online' ? styles.modeButtonActive : styles.modeButton}
                                            titleStyle={styles.modeButtonTitle}
                                            containerStyle={styles.filterButtonContainer}
                                        />
                                    </View>
                                </View>

                                <View style={styles.inviteSummaryRow}>
                                    <Text style={styles.inviteSummaryText}>Pending: {pendingInvites}</Text>
                                    <Text style={styles.inviteSummaryText}>Accepted: {acceptedInvites}</Text>
                                    <Text style={styles.inviteSummaryText}>Declined: {declinedInvites}</Text>
                                </View>

                                <ScrollView style={styles.friendList}>
                                    {(filteredFriends.length ? filteredFriends : friends).map((friend: any) => {
                                        const name = renderFriendName(friend);
                                        const status = renderFriendStatus(friend);
                                        const existing = combinedInvites.find((inv) => inv.toSummonerId === friend.summonerId);
                                        const isPending = existing?.state === 'Pending';
                                        const disabled = !!invitingId || !friend.summonerId || isPending;
                                        return (
                                            <View key={friend.puuid || friend.id || name} style={styles.friendRow}>
                                                <View>
                                                    <Text style={styles.friendName}>{name}</Text>
                                                    <Text style={styles.friendStatus}>
                                                        <Text style={{ color: availabilityColor(friend.availability) }}>● </Text>
                                                        {status}
                                                    </Text>
                                                </View>
                                                <Button
                                                    title={
                                                        isPending
                                                            ? 'Invited'
                                                            : invitingId === friend.summonerId
                                                            ? 'Inviting...'
                                                            : 'Invite'
                                                    }
                                                    onPress={() => sendInvite(friend.summonerId)}
                                                    disabled={disabled}
                                                    buttonStyle={styles.inviteAction}
                                                    containerStyle={styles.inviteActionContainer}
                                                />
                                            </View>
                                        );
                                    })}
                                </ScrollView>
                            </>
                        )}

                        {combinedInvites.length > 0 && (
                            <View style={styles.invitationList}>
                                <Text style={styles.sectionSubtitle}>Sent invites</Text>
                                {combinedInvites.map((invite: any, idx: number) => (
                                    <View key={invite.invitationId || invite.id || invite.toSummonerId || idx} style={styles.invitationRow}>
                                        <Text style={styles.invitationName}>{memberNames[invite.toSummonerId] || 'Unknown player'}</Text>
                                        <Text style={styles.inviteStatus}>{renderInviteState(invite.state)}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
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
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
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
    inviteButtonRow: {
        marginBottom: 16,
    },
    primaryButton: {
        backgroundColor: '#4f46e5',
        paddingVertical: 12,
        borderRadius: 10,
    },
    modalRoot: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalCard: {
        backgroundColor: '#0f0f0f',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1f1f1f',
        width: '100%',
        maxHeight: '80%',
        padding: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    modalClose: {
        color: '#9ca3af',
        fontSize: 14,
    },
    modalLoading: {
        alignItems: 'center',
        padding: 20,
    },
    modalLoadingText: {
        color: '#9ca3af',
        marginTop: 8,
    },
    friendList: {
        maxHeight: 300,
    },
    friendRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#1f1f1f',
    },
    friendName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    friendStatus: {
        color: '#9ca3af',
        fontSize: 12,
        marginTop: 2,
    },
    inviteAction: {
        backgroundColor: '#4f46e5',
        paddingHorizontal: 14,
    },
    inviteActionContainer: {
        minWidth: 110,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    searchInputWrapper: {
        flex: 1,
    },
    searchInput: {
        backgroundColor: '#0f0f0f',
        borderWidth: 1,
        borderColor: '#1f1f1f',
        borderRadius: 8,
        color: '#e5e7eb',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    filterButtons: {
        flexDirection: 'row',
        gap: 6,
    },
    filterButtonsCompact: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    filterButtonContainer: {
        minWidth: 80,
    },
    inviteSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    inviteSummaryText: {
        color: '#9ca3af',
        fontSize: 12,
    },
    sectionSubtitle: {
        color: '#a3a3a3',
        fontSize: 13,
        marginBottom: 10,
    },
    invitationList: {
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#1f1f1f',
        paddingTop: 10,
        gap: 8,
    },
    invitationRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#0f0f0f',
        borderWidth: 1,
        borderColor: '#1f1f1f',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    invitationName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    inviteStatus: {
        color: '#a3a3a3',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    modeButton: {
        borderColor: '#4f46e5',
        backgroundColor: 'transparent',
    },
    modeButtonActive: {
        backgroundColor: '#4f46e5',
    },
    modeButtonTitle: {
        color: '#e5e7eb',
        fontSize: 12,
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
    profileIconContainer: {
        position: 'relative',
    },
    profileIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    leaderBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: '#eab308',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#171717',
    },
    leaderBadgeText: {
        fontSize: 12,
    },
    memberTextContainer: {
        flex: 1,
    },
    memberName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    memberChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    leaderChip: {
        backgroundColor: '#fbbf24',
        color: '#0f172a',
        fontSize: 10,
        fontWeight: '700',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        textTransform: 'uppercase',
    },
    localPlayerTag: {
        color: '#4f46e5',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
    },
    skeletonName: {
        width: 120,
        height: 14,
        borderRadius: 6,
        backgroundColor: '#1f2937',
    },
    memberSubtext: {
        color: '#737373',
        fontSize: 12,
        marginTop: 2,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    memberActions: {
        flexDirection: 'row',
        gap: 6,
    },
    smallOutline: {
        borderColor: '#4f46e5',
    },
    smallDanger: {
        borderColor: '#ef4444',
    },
    actionTitle: {
        color: '#e5e7eb',
        fontSize: 12,
    },
    actionContainer: {
        paddingHorizontal: 0,
    },
    estimatedTimeText: {
        color: '#eab308',
        fontSize: 14,
        fontWeight: '500',
        marginTop: 8,
        textAlign: 'center',
    },
    headerStatusRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 6,
    },
    headerStatusText: {
        color: '#9ca3af',
        fontSize: 12,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        color: '#a3a3a3',
        fontSize: 16,
    },
    emptyStateContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyStateText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyStateSubtext: {
        color: '#737373',
        fontSize: 14,
        textAlign: 'center',
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
        marginBottom: 6,
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
    secondaryButton: {
        borderColor: '#4f46e5',
        paddingVertical: 15,
        borderRadius: 12,
    },
});
