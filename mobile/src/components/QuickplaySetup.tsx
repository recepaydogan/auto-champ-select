import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator } from 'react-native';
import { Button } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from './ChampionGrid';
import RolePicker from './RolePicker';

interface QuickplaySlot {
    championId: number;
    perks: string; // JSON string
    position: string;
    skinId: number;
    spell1Id: number;
    spell2Id: number;
}

interface QuickplaySetupProps {
    onReady: () => void;
}

export default function QuickplaySetup({ onReady }: QuickplaySetupProps) {
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

    const lcuBridge = getLCUBridge();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        if (loading && slots.length > 0) return;

        try {
            setLoading(true);
            setError('');

            // 1. Fetch Champions from LCU
            try {
                console.log('Fetching champions from LCU...');
                const champsRes = await lcuBridge.request('/lol-game-data/assets/v1/champions.json');

                if (champsRes.status === 200 && champsRes.content) {
                    const champsData = champsRes.content;
                    const champList = Array.isArray(champsData) ? champsData : Object.values(champsData);

                    const formattedChamps = champList.map((c: any) => ({
                        id: c.id,
                        key: c.id.toString(),
                        name: c.name,
                        image: { full: c.squarePortraitPath.split('/').pop() }
                    })).sort((a: any, b: any) => a.name.localeCompare(b.name));

                    console.log(`Loaded ${formattedChamps.length} champions from LCU`);
                    setChampions(formattedChamps);

                    const map: { [key: number]: any } = {};
                    formattedChamps.forEach((c: any) => map[c.id] = c);
                    setChampionMap(map);
                } else {
                    throw new Error(`LCU Champ Fetch Failed: ${champsRes.status}`);
                }
            } catch (e: any) {
                console.error('Failed to fetch champions from LCU:', e);
                setError(prev => `${prev} | LCU Champ fetch failed: ${e.message}`);
            }

            // 2. Fetch Slots
            await loadSlots();

        } catch (error: any) {
            console.error('Failed to load Quickplay data:', error);
            setError(prev => `${prev} | General error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadSlots = async () => {
        try {
            const result = await lcuBridge.request('/lol-lobby/v2/lobby/quickplay/slots');
            setDebugResult(JSON.stringify(result, null, 2));
            if (result.status === 200) {
                console.log('Quickplay slots:', result.content);
                setSlots(result.content);
            } else {
                setError(prev => `${prev} | Failed to load slots: ${result.status}`);
            }
        } catch (error: any) {
            console.error('Failed to load slots:', error);
            setError(prev => `${prev} | Error loading slots: ${error.message}`);
        }
    };

    const handleUpdateSlot = async (index: number, updates: Partial<QuickplaySlot>) => {
        try {
            const newSlots = [...slots];
            newSlots[index] = { ...newSlots[index], ...updates };
            setSlots(newSlots);
            await lcuBridge.request(`/lol-lobby/v2/lobby/quickplay/slots/${index}`, 'PUT', newSlots[index]);
        } catch (error) {
            console.error('Failed to update slot:', error);
            await loadSlots();
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
        handleUpdateSlot(activeSlotIndex, { position: role });
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
                                <TouchableOpacity style={styles.pickButton} onPress={() => openChampionPicker(index)}>
                                    {slot.championId ? (
                                        <Image source={{ uri: getChampionImage(slot.championId) || '' }} style={styles.pickImage} />
                                    ) : (
                                        <View style={styles.placeholder}>
                                            <Text style={styles.placeholderText}>?</Text>
                                        </View>
                                    )}
                                    <Text style={styles.pickLabel}>{championMap[slot.championId]?.name || 'Select Champ'}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.pickButton} onPress={() => openRolePicker(index)}>
                                    <View style={[styles.placeholder, styles.rolePlaceholder]}>
                                        <Text style={styles.roleIcon}>{getRoleIcon(slot.position)}</Text>
                                    </View>
                                    <Text style={styles.pickLabel}>{slot.position || 'Select Role'}</Text>
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
                currentRole={slots[activeSlotIndex]?.position}
            />
        </View>
    );
}

function getRoleIcon(role: string) {
    switch (role) {
        case 'TOP': return '🛡️';
        case 'JUNGLE': return '🌲';
        case 'MIDDLE': return '⚔️';
        case 'BOTTOM': return '🏹';
        case 'UTILITY': return '❤️';
        default: return '❓';
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
    modalContainer: { flex: 1, backgroundColor: '#121212', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', padding: 40 },
    emptyText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    subText: { color: '#888', marginBottom: 20 },
});
