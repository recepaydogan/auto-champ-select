import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Switch,
    ScrollView,
    Image,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    FavoriteChampionConfig,
    Lane,
    lanes,
    updateLanePreference,
    updateBanPreference,
} from '../lib/favoriteChampions';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from './ChampionGrid';

const GOLD = '#c8aa6e';
const DARK_BG = '#0a1428';
const CARD_BG = 'rgba(10, 20, 40, 0.9)';

const LANE_LABELS: Record<Lane, string> = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'ADC',
    UTILITY: 'Support',
    FILL: 'Fill',
};

const LANE_ICONS: Record<Lane, any> = {
    TOP: require('../../static/roles/role-top.png'),
    JUNGLE: require('../../static/roles/role-jungle.png'),
    MIDDLE: require('../../static/roles/role-mid.png'),
    BOTTOM: require('../../static/roles/role-bot.png'),
    UTILITY: require('../../static/roles/role-support.png'),
    FILL: require('../../static/roles/role-fill.png'),
};

interface SettingsPanelProps {
    visible: boolean;
    onClose: () => void;
    favoriteConfig: FavoriteChampionConfig;
    onSaveFavoriteConfig: (config: FavoriteChampionConfig) => void;
}

export default function SettingsPanel({
    visible,
    onClose,
    favoriteConfig,
    onSaveFavoriteConfig,
}: SettingsPanelProps) {
    const [editingConfig, setEditingConfig] = useState<FavoriteChampionConfig>(favoriteConfig);
    const [allChampions, setAllChampions] = useState<any[]>([]);
    const [ownedChampionIds, setOwnedChampionIds] = useState<Set<number>>(new Set());
    const [championMap, setChampionMap] = useState<Record<number, any>>({});
    const [loadingChamps, setLoadingChamps] = useState(false);
    const [ddragonVersion, setDdragonVersion] = useState('14.23.1');

    // Champion picker state
    const [showChampionPicker, setShowChampionPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'lane' | 'ban'>('lane');
    const [activeLane, setActiveLane] = useState<Lane | null>(null);

    const lcuBridge = getLCUBridge();

    // Sync with parent config when it changes
    useEffect(() => {
        setEditingConfig(favoriteConfig);
    }, [favoriteConfig]);

    // Load champions
    useEffect(() => {
        if (!visible) return;

        const loadChampions = async () => {
            setLoadingChamps(true);
            try {
                // Get DDragon version and all champions
                const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
                const versions = await versionRes.json();
                const version = versions[0] || '14.23.1';
                setDdragonVersion(version);

                const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
                const champData = await champRes.json();
                const champs = Object.values(champData.data).map((c: any) => ({
                    id: parseInt(c.key, 10),
                    name: c.name,
                    key: c.id,
                    image: { full: `${c.id}.png` },
                }));
                setAllChampions(champs);
                const map: Record<number, any> = {};
                champs.forEach((c: any) => { map[c.id] = c; });
                setChampionMap(map);

                // Get owned champions from LCU
                if (lcuBridge.getIsConnected()) {
                    const ownedRes = await lcuBridge.request('/lol-champions/v1/owned-champions-minimal');
                    if (ownedRes.status === 200 && Array.isArray(ownedRes.content)) {
                        const ownedIds = new Set<number>(
                            ownedRes.content
                                .filter((c: any) => c.id > 0 && c.ownership?.owned)
                                .map((c: any) => c.id)
                        );
                        setOwnedChampionIds(ownedIds);
                    }
                } else {
                    // If not connected, assume all champions are owned
                    setOwnedChampionIds(new Set(champs.map((c: any) => c.id)));
                }
            } catch (error) {
                console.warn('[SettingsPanel] Failed to load champions', error);
            } finally {
                setLoadingChamps(false);
            }
        };

        loadChampions();
    }, [visible, lcuBridge]);

    // Get champions to display based on picker mode, filtering out already-selected ones
    const displayChampions = (() => {
        if (pickerMode === 'ban') {
            // For bans: show all champions but filter out already-selected bans
            const existingBans = new Set(editingConfig.favoriteBans || []);
            return allChampions.filter(c => !existingBans.has(c.id));
        } else {
            // For lanes: show owned champions but filter out already-selected for this lane
            const existingLaneFavorites = activeLane
                ? new Set(editingConfig.preferences[activeLane] || [])
                : new Set<number>();
            return allChampions
                .filter(c => ownedChampionIds.has(c.id))
                .filter(c => !existingLaneFavorites.has(c.id));
        }
    })();

    const updateToggle = (key: 'autoHover' | 'autoLock' | 'allowFillFallback' | 'autoBanHover', value: boolean) => {
        const updated = { ...editingConfig, [key]: value };
        setEditingConfig(updated);
        onSaveFavoriteConfig(updated);
    };

    const openLanePicker = (lane: Lane) => {
        setActiveLane(lane);
        setPickerMode('lane');
        setShowChampionPicker(true);
    };

    const openBanPicker = () => {
        setPickerMode('ban');
        setShowChampionPicker(true);
    };

    const handleChampionSelect = (championId: number) => {
        let updated: FavoriteChampionConfig;
        if (pickerMode === 'lane' && activeLane) {
            updated = updateLanePreference(editingConfig, activeLane, championId);
        } else {
            updated = updateBanPreference(editingConfig, championId);
        }
        setEditingConfig(updated);
        onSaveFavoriteConfig(updated);
        setShowChampionPicker(false);
    };

    const handleRemoveLaneFavorite = (lane: Lane, championId: number) => {
        const preferences = { ...editingConfig.preferences };
        preferences[lane] = (preferences[lane] || []).filter(id => id !== championId);
        const updated = { ...editingConfig, preferences };
        setEditingConfig(updated);
        onSaveFavoriteConfig(updated);
    };

    const handleRemoveBanFavorite = (championId: number) => {
        const favoriteBans = (editingConfig.favoriteBans || []).filter(id => id !== championId);
        const updated = { ...editingConfig, favoriteBans };
        setEditingConfig(updated);
        onSaveFavoriteConfig(updated);
    };

    const getChampionImage = (championId: number) => {
        const champ = championMap[championId];
        if (!champ) return null;
        return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champ.key || champ.name}.png`;
    };

    const renderChampionSlot = (championId: number | undefined, onPress: () => void, onRemove?: () => void) => {
        if (!championId) {
            return (
                <TouchableOpacity style={styles.emptySlot} onPress={onPress}>
                    <Text style={styles.emptySlotText}>+</Text>
                </TouchableOpacity>
            );
        }

        const imageUrl = getChampionImage(championId);
        return (
            <TouchableOpacity style={styles.championSlot} onPress={onRemove}>
                {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.championImage} />
                ) : (
                    <View style={styles.championPlaceholder}>
                        <Text style={styles.championPlaceholderText}>{championId}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={styles.modalContainer} edges={['top', 'left', 'right', 'bottom']}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>⚙️ Settings</Text>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.closeButton}
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        >
                            <Text style={styles.closeButtonText}>×</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* PICK FAVORITES SECTION */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>PICK FAVORITES</Text>
                            <View style={styles.divider} />

                            {/* Toggles */}
                            <View style={styles.toggleRow}>
                                <Text style={styles.toggleLabel}>👆 Auto-hover picks</Text>
                                <Switch
                                    value={editingConfig.autoHover}
                                    onValueChange={(v) => updateToggle('autoHover', v)}
                                    trackColor={{ false: '#3f3f46', true: GOLD }}
                                    thumbColor="#fff"
                                />
                            </View>
                            <View style={styles.toggleRow}>
                                <Text style={styles.toggleLabel}>🔒 Auto-lock picks</Text>
                                <Switch
                                    value={editingConfig.autoLock}
                                    onValueChange={(v) => updateToggle('autoLock', v)}
                                    trackColor={{ false: '#3f3f46', true: GOLD }}
                                    thumbColor="#fff"
                                />
                            </View>
                            <View style={styles.toggleRow}>
                                <Text style={styles.toggleLabel}>↩️ Use Fill as fallback</Text>
                                <Switch
                                    value={editingConfig.allowFillFallback}
                                    onValueChange={(v) => updateToggle('allowFillFallback', v)}
                                    trackColor={{ false: '#3f3f46', true: GOLD }}
                                    thumbColor="#fff"
                                />
                            </View>

                            {/* Lane Cards */}
                            <View style={styles.lanesContainer}>
                                {lanes.map((lane) => (
                                    <View key={lane} style={styles.laneCard}>
                                        <View style={styles.laneHeader}>
                                            <Image source={LANE_ICONS[lane]} style={styles.laneIcon} />
                                            <Text style={styles.laneName}>{LANE_LABELS[lane]}</Text>
                                        </View>
                                        <View style={styles.laneChampions}>
                                            {[0, 1, 2].map((idx) => {
                                                const champId = editingConfig.preferences[lane]?.[idx];
                                                return (
                                                    <View key={idx}>
                                                        {renderChampionSlot(
                                                            champId,
                                                            () => openLanePicker(lane),
                                                            champId ? () => handleRemoveLaneFavorite(lane, champId) : undefined
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* BAN FAVORITES SECTION */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>BAN FAVORITES</Text>
                            <View style={styles.divider} />

                            {/* Toggle */}
                            <View style={styles.toggleRow}>
                                <Text style={styles.toggleLabel}>🚫 Auto-hover bans</Text>
                                <Switch
                                    value={editingConfig.autoBanHover}
                                    onValueChange={(v) => updateToggle('autoBanHover', v)}
                                    trackColor={{ false: '#3f3f46', true: GOLD }}
                                    thumbColor="#fff"
                                />
                            </View>

                            {/* Ban Champions */}
                            <View style={styles.banChampions}>
                                {[0, 1, 2, 3, 4].map((idx) => {
                                    const champId = editingConfig.favoriteBans?.[idx];
                                    return (
                                        <View key={idx}>
                                            {renderChampionSlot(
                                                champId,
                                                openBanPicker,
                                                champId ? () => handleRemoveBanFavorite(champId) : undefined
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </SafeAreaView>

            {/* Champion Picker Modal */}
            <Modal
                visible={showChampionPicker}
                animationType="slide"
                transparent
                onRequestClose={() => setShowChampionPicker(false)}
            >
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerContainer}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>
                                {pickerMode === 'lane' && activeLane
                                    ? `Select ${LANE_LABELS[activeLane]} Champion`
                                    : 'Select Ban Champion'}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setShowChampionPicker(false)}
                                style={styles.doneButton}
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            >
                                <Text style={styles.pickerClose}>Done</Text>
                            </TouchableOpacity>
                        </View>
                        {loadingChamps ? (
                            <View style={styles.pickerLoading}>
                                <ActivityIndicator size="large" color={GOLD} />
                                <Text style={styles.pickerLoadingText}>Loading champions...</Text>
                            </View>
                        ) : (
                            <ChampionGrid
                                champions={displayChampions}
                                onSelect={handleChampionSelect}
                                version={ddragonVersion}
                                availableChampionIds={displayChampions.map(c => c.id)}
                                contentContainerStyle={{ paddingHorizontal: 16 }}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: DARK_BG,
    },
    container: {
        flex: 1,
        backgroundColor: DARK_BG,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: GOLD,
    },
    headerTitle: {
        color: GOLD,
        fontSize: 20,
        fontWeight: '700',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 24,
        lineHeight: 26,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    section: {
        marginBottom: 24,
        backgroundColor: CARD_BG,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(200, 170, 110, 0.3)',
    },
    sectionTitle: {
        color: GOLD,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 1,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(200, 170, 110, 0.3)',
        marginVertical: 12,
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    toggleLabel: {
        color: '#e5e7eb',
        fontSize: 15,
    },
    lanesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 12,
    },
    laneCard: {
        width: '47%',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: 'rgba(200, 170, 110, 0.2)',
    },
    laneHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    laneIcon: {
        width: 20,
        height: 20,
        marginRight: 6,
        tintColor: GOLD,
    },
    laneName: {
        color: GOLD,
        fontSize: 13,
        fontWeight: '600',
    },
    laneChampions: {
        flexDirection: 'row',
        gap: 6,
    },
    emptySlot: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(200, 170, 110, 0.3)',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptySlotText: {
        color: GOLD,
        fontSize: 20,
    },
    championSlot: {
        width: 40,
        height: 40,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: GOLD,
    },
    championImage: {
        width: '100%',
        height: '100%',
    },
    championPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
    },
    championPlaceholderText: {
        color: '#666',
        fontSize: 10,
    },
    banChampions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        justifyContent: 'center',
    },
    // Champion Picker
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
    },
    pickerContainer: {
        flex: 1,
        backgroundColor: DARK_BG,
        marginTop: 60,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(200, 170, 110, 0.3)',
    },
    pickerTitle: {
        color: GOLD,
        fontSize: 16,
        fontWeight: '700',
    },
    doneButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(200, 170, 110, 0.2)',
        borderRadius: 8,
    },
    pickerClose: {
        color: GOLD,
        fontSize: 15,
        fontWeight: '600',
    },
    pickerLoading: {
        padding: 40,
        alignItems: 'center',
    },
    pickerLoadingText: {
        color: '#9ca3af',
        marginTop: 12,
    },
});
