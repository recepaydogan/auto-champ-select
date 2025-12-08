import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator } from 'react-native';
import { Button } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from './ChampionGrid';
import RolePicker from './RolePicker';

interface QuickplaySlot {
    championId: number;
    perks: string; // JSON string
    positionPreference: string;
    skinId: number;
    spell1: number;
    spell2: number;
}

interface QuickplaySetupProps {
    lobby?: any;
    onReady: () => void;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
}

export default function QuickplaySetup({ lobby, onReady, onError, onSuccess }: QuickplaySetupProps) {
    const [slots, setSlots] = useState<QuickplaySlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [champions, setChampions] = useState<any[]>([]);
    const [championMap, setChampionMap] = useState<{ [key: number]: any }>({});
    const [ddragonVersion, setDdragonVersion] = useState('14.23.1');

    // Debug States
    const [error, setError] = useState<string>('');
    const [debugResult, setDebugResult] = useState<string>('');

    // Picker States
    const [showChampionGrid, setShowChampionGrid] = useState(false);
    const [showRolePicker, setShowRolePicker] = useState(false);
    const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
    
    // Update states for individual slots
    const [updatingSlots, setUpdatingSlots] = useState<Set<number>>(new Set());

    const lcuBridge = getLCUBridge();

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lobby?.gameConfig?.queueId, lobby?.localMember?.puuid]);

    const loadData = async () => {
        if (loading && slots.length > 0) return;

        try {
            setLoading(true);
            setError('');

            let championsLoaded = champions.length > 0;

            // 1. Try LCU (champion-summary.json is lighter)
            if (!championsLoaded) {
                try {
                    console.log('Fetching champions from LCU (summary)...');
                    const champsRes = await lcuBridge.request('/lol-game-data/assets/v1/champion-summary.json');

                    if (champsRes.status === 200 && champsRes.content) {
                        const champsData = champsRes.content;
                        const champList = Array.isArray(champsData) ? champsData : Object.values(champsData);

                        // Log first champion to verify structure
                        if (champList.length > 0) {
                            const validChamp = champList.find((c: any) => c.id !== -1);
                            if (validChamp) {
                                console.log('LCU Valid Champion Sample:', JSON.stringify(validChamp, null, 2));
                            }
                        }

                        // Filter out id -1 (None) if present
                        const formattedChamps = champList
                            .filter((c: any) => c.id !== -1)
                            .map((c: any) => ({
                                id: c.id,
                                key: c.id.toString(),
                                name: c.name,
                                // Use alias for DDragon image if available, else fallback to path parsing
                                image: { full: (c.alias ? c.alias : c.squarePortraitPath.split('/').pop().replace('champion-icons', 'champion')) + '.png' }
                            })).sort((a: any, b: any) => a.name.localeCompare(b.name));

                        console.log(`Loaded ${formattedChamps.length} champions from LCU`);
                        setChampions(formattedChamps);

                        const map: { [key: number]: any } = {};
                        formattedChamps.forEach((c: any) => map[c.id] = c);
                        setChampionMap(map);
                        championsLoaded = true;
                    } else {
                        console.warn(`LCU Champ Summary Fetch Failed: ${champsRes.status}`);
                    }
                } catch (e: any) {
                    console.error('Failed to fetch champions from LCU:', e);
                    setError(prev => `${prev} | LCU failed: ${e.message}`);
                }
            }

            // 2. Fallback to DDragon if LCU failed
            if (!championsLoaded) {
                console.log('Falling back to DDragon...');
                try {
                    const version = '14.23.1'; // Hardcoded for safety
                    const champUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`;

                    const champsRes = await fetch(champUrl);
                    if (champsRes.ok) {
                        const champsData = await champsRes.json();
                        const champList = Object.values(champsData.data).map((c: any) => ({
                            id: parseInt(c.key),
                            key: c.id,
                            name: c.name,
                            image: c.image
                        })).sort((a: any, b: any) => a.name.localeCompare(b.name));

                        setChampions(champList);
                        const map: { [key: number]: any } = {};
                        champList.forEach((c: any) => map[c.id] = c);
                        setChampionMap(map);
                        setError(prev => `${prev} | Loaded from DDragon`);
                    } else {
                        throw new Error(`DDragon status: ${champsRes.status}`);
                    }
                } catch (e: any) {
                    console.error('DDragon Fallback failed:', e);
                    setError(prev => `${prev} | DDragon failed: ${e.message}`);
                }
            }

            // 3. Fetch Slots
            await loadSlots();

        } catch (error: any) {
            console.error('Failed to load Quickplay data:', error);
            setError(prev => `${prev} | General error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadSlots = async () => {
        console.log('Calling loadSlots...');
        try {
            const lobbyRes = lobby ? { status: 200, content: lobby } : await lcuBridge.request('/lol-lobby/v2/lobby');
            if (lobbyRes.status === 200) {
                console.log('=== FULL LOBBY OBJECT ===');
                console.log(JSON.stringify(lobbyRes.content, null, 2));
                console.log('=== LOCAL MEMBER DETAILS ===');
                console.log(JSON.stringify(lobbyRes.content.localMember, null, 2));
                console.log('=== PLAYER SLOTS ===');
                console.log(JSON.stringify(lobbyRes.content.localMember?.playerSlots, null, 2));
                
                // Log all possible endpoint paths we could try
                console.log('=== POSSIBLE ENDPOINTS TO TRY ===');
                console.log('1. /lol-lobby/v2/lobby/localMember/playerSlots');
                console.log('2. /lol-lobby/v2/lobby/members/localMember/playerSlots');
                console.log('3. /lol-lobby/v2/lobby/localMember/playerSlots/0');
                console.log('4. /lol-lobby/v2/lobby/quickplay/slots');
                console.log('5. /lol-lobby/v2/lobby/quickplay/slots/0');
            }

            // First, try to get slots from lobby object (most reliable)
            const lobbySlots: QuickplaySlot[] = lobbyRes?.content?.localMember?.playerSlots ||
                lobbyRes?.content?.members?.find((m: any) => m.puuid === lobbyRes?.content?.localMember?.puuid)?.playerSlots ||
                [];

            if (lobbySlots.length > 0) {
                console.log(`Loaded ${lobbySlots.length} slots from lobby.playerSlots`);
                setSlots(lobbySlots);
                setDebugResult('Using lobby.playerSlots');
                // If we have slots from lobby, we don't need to call the endpoint
                return;
            }

            // Only try the dedicated endpoint if we don't have slots from lobby
            console.log('No slots in lobby object, trying dedicated endpoint...');
            try {
                const result = await lcuBridge.request('/lol-lobby/v2/lobby/quickplay/slots');
                console.log('Slots Endpoint Status:', result.status);
                
                if (result.status === 200 && result.content) {
                    console.log('Quickplay slots content:', JSON.stringify(result.content, null, 2));
                    setSlots(result.content);
                    setDebugResult('Using /quickplay/slots endpoint');
                } else if (result.status === 404) {
                    // Endpoint doesn't exist - not an error, just not available
                    console.log('Quickplay slots endpoint not available (404)');
                    setDebugResult('Endpoint not available (404)');
                } else if (result.status >= 500) {
                    // Server error - log but don't treat as critical if we have fallback
                    console.warn(`Quickplay slots endpoint returned ${result.status} - this endpoint may not be available`);
                    setDebugResult(`Endpoint error: ${result.status}`);
                } else {
                    console.warn(`Unexpected status from slots endpoint: ${result.status}`);
                    setDebugResult(`Unexpected status: ${result.status}`);
                }
            } catch (endpointError: any) {
                // Endpoint call failed - log but don't treat as critical
                console.warn('Quickplay slots endpoint failed:', endpointError.message);
                setDebugResult(`Endpoint error: ${endpointError.message}`);
            }
        } catch (error: any) {
            console.error('Failed to load slots:', error);
            // Final fallback to lobby prop if available
            const lobbySlots: QuickplaySlot[] = lobby?.localMember?.playerSlots ||
                lobby?.members?.find((m: any) => m.puuid === lobby?.localMember?.puuid)?.playerSlots ||
                [];
            if (lobbySlots.length > 0) {
                console.log(`Using fallback slots from lobby prop: ${lobbySlots.length} slots`);
                setSlots(lobbySlots);
                setDebugResult('Fallback to lobby.playerSlots');
            } else {
                // Only show error if we truly have no slots
                setError(prev => `${prev} | Error loading slots: ${error.message}`);
            }
        }
    };

    const handleUpdateSlot = async (index: number, updates: Partial<QuickplaySlot>) => {
        // Validation
        if (index < 0 || index >= slots.length) {
            const errorMsg = 'Invalid slot index';
            console.error(errorMsg);
            if (onError) onError(errorMsg);
            return;
        }

        // Validate champion ID if updating champion
        if (updates.championId !== undefined) {
            if (!updates.championId || updates.championId <= 0) {
                const errorMsg = 'Invalid champion ID';
                console.error(errorMsg);
                if (onError) onError(errorMsg);
                return;
            }
            if (!championMap[updates.championId]) {
                const errorMsg = 'Champion not found';
                console.error(errorMsg);
                if (onError) onError(errorMsg);
                return;
            }
        }

        // Check connection
        if (!lcuBridge.getIsConnected()) {
            const errorMsg = 'Not connected to desktop client';
            console.error(errorMsg);
            if (onError) onError(errorMsg);
            return;
        }

        // Store original slot for rollback
        const originalSlot = slots[index];
        const newSlots = [...slots];
        newSlots[index] = { ...newSlots[index], ...updates };
        
        // Optimistic update
        setSlots(newSlots);
        setUpdatingSlots(prev => new Set(prev).add(index));

        try {
            // Prepare the full slot object with all required fields
            const slotToUpdate: QuickplaySlot = {
                championId: newSlots[index].championId,
                perks: newSlots[index].perks || '{}',
                positionPreference: newSlots[index].positionPreference || 'UNSELECTED',
                skinId: newSlots[index].skinId || 0,
                spell1: newSlots[index].spell1 || 0,
                spell2: newSlots[index].spell2 || 0,
            };

            console.log(`=== UPDATING SLOT ${index} ===`);
            console.log('Slot data to update:', JSON.stringify(slotToUpdate, null, 2));
            
            // Get current lobby to get the full playerSlots array
            const lobbyRes = await lcuBridge.request('/lol-lobby/v2/lobby');
            if (lobbyRes.status !== 200) {
                throw new Error(`Failed to get lobby: ${lobbyRes.status}`);
            }

            const currentSlots = lobbyRes.content?.localMember?.playerSlots || [];
            console.log('Current slots array:', JSON.stringify(currentSlots, null, 2));
            if (index >= currentSlots.length) {
                throw new Error(`Slot index ${index} is out of range (${currentSlots.length} slots available)`);
            }

            // Try multiple endpoint variations - LCU API is undocumented and endpoints vary
            const localMember = lobbyRes.content.localMember;
            const summonerId = localMember.summonerId;
            let result;
            
            // Update the specific slot in the array
            const updatedSlots = [...currentSlots];
            updatedSlots[index] = slotToUpdate;
            
            // Try 1: Dedicated quickplay endpoints
            try {
                console.log(`Trying endpoint 1: /lol-lobby/v2/lobby/quickplay/slots`);
                result = await lcuBridge.request(
                    '/lol-lobby/v2/lobby/quickplay/slots',
                    'PUT',
                    updatedSlots
                );
                if (result.status === 200 || result.status === 204) {
                    console.log(`✓ Successfully updated slot ${index} via /quickplay/slots`);
                } else {
                    throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                }
            } catch (error0: any) {
                console.log(`✗ Endpoint 1 failed: ${error0.message}`);

                // Try individual quickplay slot
                try {
                    console.log(`Trying endpoint 2: /lol-lobby/v2/lobby/quickplay/slots/${index}`);
                    result = await lcuBridge.request(
                        `/lol-lobby/v2/lobby/quickplay/slots/${index}`,
                        'PUT',
                        slotToUpdate
                    );
                    if (result.status === 200 || result.status === 204) {
                        console.log(`✓ Successfully updated slot ${index} via /quickplay/slots/${index}`);
                    } else {
                        throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                    }
                } catch (error0b: any) {
                    console.log(`✗ Quickplay slot endpoints failed: ${error0b.message}`);

                    // Try playerSlots variations
                    try {
                        console.log(`Trying endpoint 3: /lol-lobby/v2/lobby/members/localMember/playerSlots (same pattern as position-preferences)`);
                        result = await lcuBridge.request(
                            '/lol-lobby/v2/lobby/members/localMember/playerSlots',
                            'PUT',
                            updatedSlots
                        );
                        if (result.status === 200 || result.status === 204) {
                            console.log(`✓ Successfully updated slot ${index} via playerSlots endpoint`);
                        } else {
                            throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                        }
                    } catch (error1: any) {
                        console.log(`✗ Endpoint 3 failed: ${error1.message}`);
                        
                        // Try 4: Hyphenated version (player-slots instead of playerSlots)
                        try {
                            console.log(`Trying endpoint 4: /lol-lobby/v2/lobby/members/localMember/player-slots (hyphenated)`);
                            result = await lcuBridge.request(
                                '/lol-lobby/v2/lobby/members/localMember/player-slots',
                                'PUT',
                                updatedSlots
                            );
                            if (result.status === 200 || result.status === 204) {
                                console.log(`✓ Successfully updated slot ${index} via player-slots endpoint`);
                            } else {
                                throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                            }
                        } catch (error2: any) {
                            console.log(`✗ Endpoint 4 failed: ${error2.message}`);
                            
                            // Try 5: Update individual slot (player-slots/{index})
                            try {
                                console.log(`Trying endpoint 5: /lol-lobby/v2/lobby/members/localMember/player-slots/${index}`);
                                result = await lcuBridge.request(
                                    `/lol-lobby/v2/lobby/members/localMember/player-slots/${index}`,
                                    'PUT',
                                    slotToUpdate
                                );
                                if (result.status === 200 || result.status === 204) {
                                    console.log(`✓ Successfully updated slot ${index} via individual player-slots endpoint`);
                                } else {
                                    throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                                }
                            } catch (error3: any) {
                                console.log(`✗ Endpoint 5 failed: ${error3.message}`);
                                
                                // Try 6: Update via summonerId (like position-preferences but with playerSlots)
                                try {
                                    console.log(`Trying endpoint 6: /lol-lobby/v2/lobby/members/${summonerId}/playerSlots`);
                                    result = await lcuBridge.request(
                                        `/lol-lobby/v2/lobby/members/${summonerId}/playerSlots`,
                                        'PUT',
                                        updatedSlots
                                    );
                                    if (result.status === 200 || result.status === 204) {
                                        console.log(`✓ Successfully updated slot ${index} via summonerId endpoint`);
                                    } else {
                                        throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                                    }
                                } catch (error4: any) {
                                    console.log(`✗ Endpoint 6 failed: ${error4.message}`);
                                    
                                    // Try 7: Update entire localMember object (playerSlots might be read-only, need to update parent)
                                    try {
                                        console.log(`Trying endpoint 7: PUT /lol-lobby/v2/lobby/members/localMember (updating entire object)`);
                                        const updatedLocalMember = {
                                            ...localMember,
                                            playerSlots: updatedSlots
                                        };
                                        result = await lcuBridge.request(
                                            '/lol-lobby/v2/lobby/members/localMember',
                                            'PUT',
                                            updatedLocalMember
                                        );
                                        if (result.status === 200 || result.status === 204) {
                                            console.log(`✓ Successfully updated slot ${index} via localMember update`);
                                        } else {
                                            throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                                        }
                                    } catch (error5: any) {
                                        console.log(`✗ Endpoint 7 failed: ${error5.message}`);
                                        
                                        // Try 8: PATCH instead of PUT for localMember
                                        try {
                                            console.log(`Trying endpoint 8: PATCH /lol-lobby/v2/lobby/members/localMember`);
                                            const updatedLocalMember = {
                                                ...localMember,
                                                playerSlots: updatedSlots
                                            };
                                            result = await lcuBridge.request(
                                                '/lol-lobby/v2/lobby/members/localMember',
                                                'PATCH',
                                                updatedLocalMember
                                            );
                                            if (result.status === 200 || result.status === 204) {
                                                console.log(`✓ Successfully updated slot ${index} via PATCH localMember`);
                                            } else {
                                                throw new Error(`Status ${result.status}: ${JSON.stringify(result.content)}`);
                                            }
                                        } catch (error6: any) {
                                            console.log(`✗ All endpoint attempts failed. Last error: ${error6.message}`);
                                            console.log(`\n=== DEBUGGING INFO ===`);
                                            console.log(`The LCU API doesn't seem to support direct playerSlots updates.`);
                                            console.log(`To find the correct endpoint:`);
                                            console.log(`1. Open League of Legends client`);
                                            console.log(`2. Press F12 to open DevTools`);
                                            console.log(`3. Go to Network tab`);
                                            console.log(`4. Change a quickplay slot in the League client`);
                                            console.log(`5. Look for the PUT/PATCH request and share the URL`);
                                            throw new Error(`Failed to update slot: All endpoint attempts failed. The playerSlots endpoint may not exist or use a different structure. Please check the League client Network tab (F12) when changing a slot to find the correct endpoint.`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (result && (result.status === 200 || result.status === 204)) {
                console.log(`Successfully updated slot ${index}`);
                
                // Verify the update by refreshing slots after a short delay
                setTimeout(async () => {
                    try {
                        await loadSlots();
                    } catch (refreshError) {
                        console.error('Failed to refresh slots after update:', refreshError);
                    }
                }, 500);

                // Show success message
                const updateType = updates.championId !== undefined ? 'champion' : 'role';
                const successMsg = `Successfully updated ${updateType}`;
                if (onSuccess) onSuccess(successMsg);
            } else {
                throw new Error(`API returned status ${result.status}: ${JSON.stringify(result.content)}`);
            }
        } catch (error: any) {
            console.error('Failed to update slot:', error);
            
            // Rollback optimistic update
            setSlots(prev => {
                const rolledBack = [...prev];
                rolledBack[index] = originalSlot;
                return rolledBack;
            });

            // Show error message
            const errorMsg = error.message || 'Failed to update slot. Please try again.';
            if (onError) onError(errorMsg);
            
            // Reload slots to get current state
            try {
                await loadSlots();
            } catch (refreshError) {
                console.error('Failed to reload slots after error:', refreshError);
            }
        } finally {
            setUpdatingSlots(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const openChampionPicker = (index: number) => {
        setActiveSlotIndex(index);
        setShowChampionGrid(true);
    };

    const openRolePicker = (index: number) => {
        setActiveSlotIndex(index);
        setShowRolePicker(true);
    };

    const handleChampionSelect = (championId: number) => {
        handleUpdateSlot(activeSlotIndex, { championId });
        setShowChampionGrid(false);
    };

    const handleRoleSelect = (role: string) => {
        handleUpdateSlot(activeSlotIndex, { positionPreference: role });
        setShowRolePicker(false);
    };

    const getChampionImage = (championId: number) => {
        if (!championId || !championMap[championId]) return null;
        // For now, still using DDragon for images as LCU assets might be local paths not accessible to React Native Image component easily without serving them.
        // But we have the filename from LCU data.
        return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[championId].image.full}`;
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={styles.loadingText}>Loading Quickplay Setup...</Text>
                <Text style={styles.debugText}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Quickplay Setup</Text>

            <View style={{ marginBottom: 20, padding: 10, backgroundColor: '#330000', borderWidth: 1, borderColor: 'red' }}>
                <Text style={{ color: 'red', fontWeight: 'bold', fontSize: 16 }}>DEBUG CONSOLE</Text>
                <Text style={{ color: '#ffaaaa' }}>Slots Loaded: {slots.length}</Text>
                <Text style={{ color: '#ffaaaa' }}>Champs: {champions.length}</Text>
                {error ? <Text style={{ color: 'red', fontWeight: 'bold' }}>ERROR: {error}</Text> : <Text style={{ color: '#0f0' }}>No Errors</Text>}
                <Text style={{ color: '#aaa', fontSize: 10, marginTop: 5 }}>API Response: {debugResult.slice(0, 100)}</Text>
                <Button title="Force Reload" onPress={loadData} size="sm" color="warning" />
            </View>

            {slots.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No Quickplay Slots Found</Text>
                    <Text style={styles.subText}>Are you in a Quickplay Lobby?</Text>
                    <Button title="Retry Fetching Slots" onPress={loadSlots} containerStyle={{ marginTop: 10 }} />
                </View>
            ) : (
                <View style={styles.slotsContainer}>
                    {slots.map((slot, index) => (
                        <View key={index} style={styles.slotCard}>
                            <Text style={styles.slotTitle}>{index === 0 ? 'Primary Pick' : 'Secondary Pick'}</Text>

                            <View style={styles.pickRow}>
                                <TouchableOpacity 
                                    style={[
                                        styles.pickButton,
                                        updatingSlots.has(index) && styles.pickButtonUpdating
                                    ]} 
                                    onPress={() => openChampionPicker(index)}
                                    disabled={updatingSlots.has(index)}
                                >
                                    {updatingSlots.has(index) ? (
                                        <ActivityIndicator size="small" color="#4f46e5" style={{ marginBottom: 5 }} />
                                    ) : slot.championId ? (
                                        <Image source={{ uri: getChampionImage(slot.championId) || '' }} style={styles.pickImage} />
                                    ) : (
                                        <View style={styles.placeholder}>
                                            <Text style={styles.placeholderText}>?</Text>
                                        </View>
                                    )}
                                    <Text style={styles.pickLabel}>
                                        {updatingSlots.has(index) 
                                            ? 'Updating...' 
                                            : (championMap[slot.championId]?.name || 'Select Champ')
                                        }
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[
                                        styles.pickButton,
                                        updatingSlots.has(index) && styles.pickButtonUpdating
                                    ]} 
                                    onPress={() => openRolePicker(index)}
                                    disabled={updatingSlots.has(index)}
                                >
                                    {updatingSlots.has(index) ? (
                                        <ActivityIndicator size="small" color="#4f46e5" style={{ marginBottom: 5 }} />
                                    ) : (
                                        <View style={[styles.placeholder, styles.rolePlaceholder]}>
                                            <Text style={styles.roleIcon}>{getRoleIcon(slot.positionPreference)}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.pickLabel}>
                                        {updatingSlots.has(index) 
                                            ? 'Updating...' 
                                            : (slot.positionPreference || 'Select Role')
                                        }
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            <Modal visible={showChampionGrid} animationType="slide" onRequestClose={() => setShowChampionGrid(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Champion</Text>
                        <Button title="Close" onPress={() => setShowChampionGrid(false)} type="clear" />
                    </View>
                    <ChampionGrid
                        champions={champions}
                        onSelect={handleChampionSelect}
                        version={ddragonVersion}
                    />
                </View>
            </Modal>

            <RolePicker
                visible={showRolePicker}
                onSelect={handleRoleSelect}
                onClose={() => setShowRolePicker(false)}
                currentRole={slots[activeSlotIndex]?.positionPreference}
            />
        </View>
    );
}

function getRoleIcon(role: string) {
    switch (role) {
        case 'TOP': return "T";
        case 'JUNGLE': return "J";
        case 'MIDDLE': return "M";
        case 'BOTTOM': return "B";
        case 'UTILITY': return "S";
        default: return "?";
    }
}

const styles = StyleSheet.create({
    container: { padding: 20 },
    loadingContainer: { padding: 20, alignItems: 'center' },
    loadingText: { color: '#ccc', marginTop: 10 },
    debugText: { color: 'red', marginTop: 5, fontSize: 10 },
    header: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    slotsContainer: { gap: 20 },
    slotCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#333' },
    slotTitle: { color: '#888', fontSize: 12, textTransform: 'uppercase', marginBottom: 10, fontWeight: 'bold' },
    pickRow: { flexDirection: 'row', gap: 15 },
    pickButton: { flex: 1, alignItems: 'center', backgroundColor: '#252525', padding: 10, borderRadius: 8 },
    pickImage: { width: 60, height: 60, borderRadius: 30, marginBottom: 5 },
    placeholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
    placeholderText: { color: '#666', fontSize: 24, fontWeight: 'bold' },
    pickLabel: { color: 'white', fontSize: 12, fontWeight: '500' },
    rolePlaceholder: { backgroundColor: '#2a2a2a' },
    roleIcon: { fontSize: 24 },
    pickButtonUpdating: { opacity: 0.6 },
    modalContainer: { flex: 1, backgroundColor: '#121212', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', padding: 40 },
    emptyText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    subText: { color: '#888', marginBottom: 20 },
});
