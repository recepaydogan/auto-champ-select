import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';

interface GameQueue {
    category: string;
    gameMode: string;
    description: string;
    id: number;
    queueAvailability: string;
    mapId: number;
    isCustom?: boolean;
    shortName?: string;
    name?: string;
    // Additional optional fields from various LCU payload shapes
    queueId?: number;
    queueType?: string;
    type?: string;
    map?: { id?: number; mapId?: number };
    showQuickPlaySlotSelection?: boolean;
}

interface CreateLobbyScreenProps {
    onClose: () => void;
    onSuccess: () => void;
    onError?: (message: string) => void;
    onLeaveLobby?: () => void;
}

const GOLD = '#c7b37b';
const OFFWHITE = '#f0e6d2';

const mapIcons: Record<string, { default: any; active: any }> = {
    sr: {
        default: require('../../static/maps/sr-default.png'),
        active: require('../../static/maps/sr-active.png')
    },
    ha: {
        default: require('../../static/maps/ha-default.png'),
        active: require('../../static/maps/ha-active.png')
    },
    tt: {
        default: require('../../static/maps/tt-default.png'),
        active: require('../../static/maps/tt-active.png')
    },
    tft: {
        default: require('../../static/maps/tft-default.png'),
        active: require('../../static/maps/tft-active.png')
    },
    rgm: {
        default: require('../../static/maps/rgm-default.png'),
        active: require('../../static/maps/rgm-active.png')
    }
};

const mapBackgrounds: Record<number | 'default', any> = {
    10: require('../../static/backgrounds/bg-tt.jpg'),
    11: require('../../static/backgrounds/bg-sr.jpg'),
    12: require('../../static/backgrounds/bg-ha.jpg'),
    22: require('../../static/backgrounds/bg-tft.jpg'),
    default: require('../../static/magic-background.jpg')
};

const isShamataQueue = (q: GameQueue): boolean => {
    const mapIdNum = Number(q.mapId ?? q.map?.id ?? q.map?.mapId);
    if (mapIdNum !== 12) return false;
    const gmUpper = (q.gameMode || '').toUpperCase();
    const text = `${q.description || ''} ${q.shortName || ''}`.toLowerCase();
    return gmUpper === 'KIWI' ||
        text.includes('şamata') ||
        text.includes('samata') ||
        text.includes('shamata');
    return gmUpper === 'KIWI' ||
        text.includes('şamata') ||
        text.includes('samata') ||
        text.includes('shamata');
};

let cachedQueues: GameQueue[] | null = null;

export default function CreateLobbyScreen({ onClose, onSuccess, onError, onLeaveLobby }: CreateLobbyScreenProps) {
    const lcuBridge = getLCUBridge();

    const [queues, setQueues] = useState<GameQueue[]>([]);
    const [selectedSection, setSelectedSection] = useState<string>('');
    const [selectedQueueId, setSelectedQueueId] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        loadQueues();
    }, []);

    const loadQueues = async () => {
        if (!lcuBridge.getIsConnected()) {
            if (onError) onError('Not connected to desktop client.');
            return;
        }

        if (cachedQueues && cachedQueues.length > 0) {
            setQueues(cachedQueues);
            return;
        }

        setLoading(true);
        try {
            const queuesRes = await lcuBridge.request('/lol-game-queues/v1/queues');
            const normalizeQueues = (items: any[]): GameQueue[] =>
                (items || []).map((q: any) => {
                    const idNum = Number(q.id ?? q.queueId);
                    const mapIdNum = Number(q.mapId ?? q.map?.id ?? q.map?.mapId);
                    const gameMode = (q.gameMode || q.queueType || q.type || '').toString();
                    return {
                        ...q,
                        id: isNaN(idNum) ? q.id : idNum,
                        mapId: isNaN(mapIdNum) ? q.mapId : mapIdNum,
                        gameMode
                    };
                });

            if (queuesRes?.status === 200) {
                const content = queuesRes.content;
                let normalized: GameQueue[] = [];
                if (Array.isArray(content)) {
                    normalized = normalizeQueues(content);
                } else if (content && typeof content === 'object') {
                    normalized = normalizeQueues(Object.values(content));
                } else if (typeof content === 'string') {
                    try {
                        const parsed = JSON.parse(content);
                        if (Array.isArray(parsed)) {
                            normalized = normalizeQueues(parsed);
                        } else if (parsed && typeof parsed === 'object') {
                            normalized = normalizeQueues(Object.values(parsed));
                        }
                    } catch {
                        normalized = [];
                    }
                }

                setQueues(normalized);
                cachedQueues = normalized; // Cache the result
                console.log('[CreateLobbyScreen] queues loaded', normalized.length);
                const swift = normalized.filter(q => (q.gameMode || '').toUpperCase() === 'SWIFTPLAY');
                if (swift.length) {
                    console.log('[CreateLobbyScreen] swiftplay queues', swift.map(q => ({ id: q.id, desc: q.description, name: q.name })));
                }
            } else {
                setQueues([]);
            }
        } catch (error) {
            console.error('[CreateLobbyScreen] Failed to load queues', error);
            if (onError) onError('Failed to load queues');
        } finally {
            setLoading(false);
        }
    };

    const availableQueues = useMemo(() => {
        const ret: Record<string, GameQueue[]> = {};

        for (const queue of queues) {
            const idNum = Number(queue.id ?? queue.queueId);
            const mapIdNum = Number(queue.mapId ?? queue.map?.id ?? queue.map?.mapId);
            const originalGameMode = (queue.gameMode || '').toUpperCase();
            let gameMode = originalGameMode;

            // Only drop queues that are explicitly not available.
            if (queue.queueAvailability && queue.queueAvailability.toLowerCase() !== 'available') continue;

            // Filter out custom queues
            if (queue.isCustom) continue;

            // Hide special/tournament Summoner's Rift queues.
            const text = `${queue.description || ''} ${queue.name || ''} ${queue.shortName || ''}`.toLowerCase();
            // Hide training/education queues anywhere.
            if (text.includes('eğitim') || text.includes('egitim')) continue;
            if (text.includes('giriş') || text.includes('giris') || text.includes('başlang') || text.includes('baslang') || text.includes('orta')) continue;
            if (text.includes('clash')) continue;

            if (mapIdNum === 11 && gameMode !== 'URF' && (text.includes('özel') || text.includes('ozel') || text.includes('turnuva') || text.includes('rastgele') || text.includes('rasgele'))) continue;


            // Treat Swiftplay (Tam Gaz) as SR classic so it shows with ranked/normal queues.
            if (mapIdNum === 11 && gameMode === 'SWIFTPLAY') {
                gameMode = 'CLASSIC';
            }

            const sectionGameMode = isShamataQueue(queue) ? 'ARAM' : gameMode;

            // Group URF and Arena (CHERRY) into RGM section (Map 30)
            const isURF = gameMode === 'URF';
            const isArena = gameMode === 'CHERRY' || mapIdNum === 30;

            let keyMapId = mapIdNum;
            let keyGameMode = sectionGameMode;

            if (isURF || isArena) {
                keyMapId = 30;
                keyGameMode = 'RGM';
            }

            const key = `${isNaN(keyMapId) ? 0 : keyMapId}-${keyGameMode || 'UNKNOWN'}`;
            if (!ret[key]) ret[key] = [];
            ret[key].push({ ...queue, id: idNum, mapId: mapIdNum, gameMode });
        }

        // Sort within each section alphabetically and dedupe.
        Object.values(ret).forEach(sectionQueues => {
            // Sort by category first (PvP > Custom) to ensure we keep the official queue
            // when deduplicating by name/description
            sectionQueues.sort((a, b) => {
                const catA = (a.category || '').toUpperCase();
                const catB = (b.category || '').toUpperCase();
                if (catA === 'PVP' && catB !== 'PVP') return -1;
                if (catB === 'PVP' && catA !== 'PVP') return 1;
                return 0;
            });

            const original = [...sectionQueues];
            const unique: GameQueue[] = [];
            const seen = new Set<string>();
            let aramClassicKept = false;
            let aramShamataKept = false;
            let firstAramSource: GameQueue | null = null;

            sectionQueues.forEach(q => {
                const mapId = Number(q.mapId);
                const gm = (q.gameMode || '').toUpperCase();
                if (mapId === 12 && !firstAramSource) firstAramSource = q;

                // Special-case ARAM: keep max one ARAM and one Shamata (KIWI)
                if (mapId === 12) {
                    if (gm === 'ARAM') {
                        if (aramClassicKept) return;
                        aramClassicKept = true;
                        unique.push(q);
                        return;
                    }
                    const isShamata = isShamataQueue(q);
                    if (isShamata) {
                        if (aramShamataKept) return;
                        aramShamataKept = true;
                        unique.push(q);
                        return;
                    }
                }

                const sig = `${(q.description || q.shortName || q.name || q.id || '').toString().toLowerCase()}`;
                if (seen.has(sig)) return;
                seen.add(sig);
                unique.push(q);
            });

            if (firstAramSource && !aramClassicKept && Number(firstAramSource.mapId) === 12) {
                unique.unshift({
                    ...firstAramSource,
                    gameMode: 'ARAM',
                    description: firstAramSource.description || firstAramSource.shortName || 'ARAM'
                });
            }

            unique.sort((a, b) => (a.shortName || a.description || a.gameMode).localeCompare(b.shortName || b.description || b.gameMode));
            sectionQueues.splice(0, sectionQueues.length, ...unique);
        });

        return ret;
    }, [queues]);

    const sections = useMemo(() => {
        return Object.keys(availableQueues).sort((a, b) => {
            const [aMap, aGameMode] = a.split('-');
            const [bMap, bGameMode] = b.split('-');

            if (aMap === '11' && bMap !== '11') return -1;
            if (bMap === '11' && aMap !== '11') return 1;

            if (aGameMode === 'CLASSIC' && bGameMode !== 'CLASSIC') return -1;
            if (bGameMode === 'CLASSIC' && aGameMode !== 'CLASSIC') return 1;

            if (aGameMode === 'ARAM' && bGameMode !== 'ARAM') return -1;
            if (bGameMode === 'ARAM' && aGameMode !== 'ARAM') return 1;

            return 0;
        });
    }, [availableQueues]);

    useEffect(() => {
        if (!sections.length) {
            setSelectedSection('');
            setSelectedQueueId(0);
            return;
        }

        // Preserve selection if still valid
        if (selectedSection && availableQueues[selectedSection]) {
            const currentQueues = availableQueues[selectedSection];
            if (currentQueues.some(q => q.id === selectedQueueId)) return;
        }

        const firstSection = sections[0];
        setSelectedSection(firstSection);
        const firstQueue = (availableQueues[firstSection] || [])[0];
        setSelectedQueueId(firstQueue ? firstQueue.id : 0);
    }, [sections, availableQueues, selectedSection, selectedQueueId]);

    const selectedQueues = selectedSection ? availableQueues[selectedSection] || [] : [];

    const sectionSlug = (section: string): keyof typeof mapIcons => {
        const [mapId] = section.split('-');
        if (mapId === '10') return 'tt';
        if (mapId === '11') return 'sr';
        if (mapId === '12') return 'ha';
        if (mapId === '22') return 'tft';
        return 'rgm';
    };

    const backgroundSource = (): any => {
        if (!selectedSection) return mapBackgrounds.default;
        const [mapIdStr] = selectedSection.split('-');
        const mapId = parseInt(mapIdStr, 10);
        return mapBackgrounds[mapId as keyof typeof mapBackgrounds] || mapBackgrounds.default;
    };

    const queueDisplayName = (q: GameQueue): string => {
        const base = q.description || q.shortName || q.name || q.gameMode;
        const desc = (q.description || '').toLowerCase();
        const mode = (q.gameMode || '').toLowerCase();

        // Map-specific overrides
        const isShamata = isShamataQueue(q);
        const isAramMap = Number(q.mapId ?? q.map?.id ?? q.map?.mapId) === 12;
        if (isShamata) {
            return 'ARAM: \u015eamata';
        }
        if (isAramMap && q.gameMode === 'ARAM') {
            return 'ARAM';
        }

        // Quickplay / Tam Gaz (e.g., queue id 490 or strings containing tam gaz/quick)
        const isTamGaz =
            q.id === 490 ||
            mode.includes('quick') ||
            desc.includes('tam gaz') ||
            desc.includes('quick');
        if (isTamGaz) {
            return 'Tam Gaz';
        }

        if (q.gameMode === 'URF') {
            return 'URF';
        }

        if (q.gameMode === 'CHONCC') {
            return "Mekacık'ın Sınavı";
        }

        return base;
    };

    const findQueueById = (id: number): GameQueue | undefined => {
        for (const qList of Object.values(availableQueues)) {
            const match = qList.find(q => q.id === id);
            if (match) return match;
        }
        return undefined;
    };

    const handleCreateLobby = async () => {
        if (!selectedQueueId || creating) return;
        if (!lcuBridge.getIsConnected()) {
            if (onError) onError('Not connected to desktop client.');
            return;
        }

        // Check gameflow phase to prevent creating lobby while in game
        try {
            const phaseResult = await lcuBridge.request('/lol-gameflow/v1/gameflow-phase');
            if (phaseResult.status === 200 && typeof phaseResult.content === 'string') {
                const phase = phaseResult.content;
                if (phase === 'InProgress' || phase === 'ChampSelect' || phase === 'GameStart' || phase === 'Reconnect') {
                    if (onError) onError('Cannot create lobby while in game.');
                    return;
                }
            }
        } catch (e) {
            console.warn('[CreateLobbyScreen] Failed to check gameflow phase', e);
        }

        try {
            setCreating(true);
            const selectedQueue = findQueueById(selectedQueueId);
            const requestBody: any = { queueId: selectedQueueId };
            if (selectedQueue?.isCustom && selectedQueue?.gameMode === 'PRACTICETOOL' && selectedQueue.mapId) {
                requestBody.mapId = selectedQueue.mapId;
            }

            // Try to create lobby directly
            let result = await lcuBridge.request('/lol-lobby/v2/lobby', 'POST', requestBody);

            // If failed (likely because lobby exists), try to delete and recreate
            if (result.status >= 400) {
                console.log('[CreateLobbyScreen] POST failed, trying DELETE then POST');
                await lcuBridge.request('/lol-lobby/v2/lobby', 'DELETE');
                // Small delay to ensure cleanup
                await new Promise(r => setTimeout(r, 500));
                result = await lcuBridge.request('/lol-lobby/v2/lobby', 'POST', requestBody);
            }

            if (result.status >= 400) {
                // Fallback to PATCH if DELETE+POST failed (unlikely but safe)
                console.log('[CreateLobbyScreen] DELETE+POST failed, trying PATCH');
                result = await lcuBridge.request('/lol-lobby/v2/lobby', 'PATCH', requestBody);
            }

            if (result.content && result.content.error) {
                throw new Error(result.content.error);
            }

            // Check status again just in case
            if (result.status >= 400) {
                throw new Error(result.content?.message || 'Failed to create lobby');
            }

            onSuccess();
        } catch (error: any) {
            console.error('[CreateLobbyScreen] Failed to create/switch lobby', error);
            if (onError) {
                const message =
                    error?.content?.error ||
                    error?.content?.message ||
                    error?.message ||
                    'Failed to create lobby';
                onError(message);
            }
        } finally {
            setCreating(false);
        }
    };

    const formatTime = (date: Date) => {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ImageBackground source={backgroundSource()} style={styles.bg} imageStyle={styles.bgImage}>
                <View style={styles.overlay}>
                    <View style={styles.topBar}>
                        <TouchableOpacity onPress={onClose} style={styles.backRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={styles.backIcon}>{'\u2039'}</Text>
                            <Text style={styles.backText}>Create Lobby</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.sectionHeader}>
                        <Text style={styles.title}>Rotating Game Mode</Text>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={GOLD} />
                            <Text style={styles.loadingText}>Loading queues...</Text>
                        </View>
                    ) : (
                        <>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{ flexGrow: 0, marginBottom: 20 }}
                                contentContainerStyle={styles.sectionsRow}
                            >
                                {sections.map(section => {
                                    const slug = sectionSlug(section);
                                    const active = section === selectedSection;
                                    const icon = mapIcons[slug][active ? 'active' : 'default'];
                                    return (
                                        <TouchableOpacity
                                            key={section}
                                            onPress={() => {
                                                setSelectedSection(section);
                                                const firstQueue = (availableQueues[section] || [])[0];
                                                setSelectedQueueId(firstQueue ? firstQueue.id : 0);
                                            }}
                                        >
                                            <Image source={icon} style={styles.sectionIcon} resizeMode="contain" />
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <ScrollView style={styles.queueList} contentContainerStyle={styles.queueListContent}>
                                {selectedQueues.map(queue => {
                                    const isSelected = queue.id === selectedQueueId;
                                    return (
                                        <TouchableOpacity
                                            key={queue.id}
                                            style={[styles.queueRow, isSelected && styles.queueRowSelected]}
                                            onPress={() => setSelectedQueueId(queue.id)}
                                            activeOpacity={0.85}
                                        >
                                            <View style={styles.diamondOuter}>
                                                <View style={[styles.diamondInner, isSelected && styles.diamondInnerActive]} />
                                            </View>
                                            <Text style={[styles.queueText, isSelected && styles.queueTextSelected]}>
                                                {queueDisplayName(queue)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}

                                {!selectedQueues.length && (
                                    <Text style={styles.emptyText}>No queues available for this map right now.</Text>
                                )}
                            </ScrollView>
                        </>
                    )}

                    <View style={styles.footer}>
                        {onLeaveLobby && (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={onLeaveLobby}
                            >
                                <Text style={styles.actionButtonText}>LEAVE LOBBY</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.actionButton, (!selectedQueueId || creating || loading) && styles.actionButtonDisabled]}
                            onPress={handleCreateLobby}
                            disabled={!selectedQueueId || creating || loading}
                        >
                            <Text style={styles.actionButtonText}>{creating ? 'CREATING...' : 'CONFIRM'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ImageBackground>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#000' },
    bg: { flex: 1 },
    bgImage: { resizeMode: 'cover' },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    clock: {
        color: OFFWHITE,
        fontSize: 16,
        fontWeight: '700'
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    backIcon: {
        color: GOLD,
        fontSize: 24,
        fontWeight: '900'
    },
    backText: {
        color: GOLD,
        fontSize: 16,
        fontWeight: '700',
    },
    sectionHeader: {
        alignItems: 'center',
        marginBottom: 12
    },
    title: {
        color: OFFWHITE,
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase'
    },
    sectionsRow: {
        paddingVertical: 10,
        gap: 12
    },

    sectionIcon: {
        width: 84,
        height: 84
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginVertical: 10
    },
    queueList: {
        flex: 1
    },
    queueListContent: {
        paddingBottom: 12
    },
    queueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 12,
        paddingHorizontal: 8

    },
    queueRowSelected: {
        backgroundColor: 'rgba(199,179,123,0.08)',
        borderRadius: 10,
    },
    diamondOuter: {
        width: 20,
        height: 20,
        transform: [{ rotate: '45deg' }],
        backgroundColor: GOLD,
        justifyContent: 'center',
        alignItems: 'center'
    },
    diamondInner: {
        width: 10,
        height: 10,
        backgroundColor: '#0b1a24'
    },
    diamondInnerActive: {
        backgroundColor: OFFWHITE
    },
    queueText: {
        color: OFFWHITE,
        fontSize: 16,
        fontWeight: '700',
        flexShrink: 1
    },
    queueTextSelected: {
        color: GOLD
    },
    emptyText: {
        color: '#cfd5dd',
        fontSize: 14,
        paddingVertical: 12
    },
    footer: {
        marginTop: 6,
        gap: 10,
    },
    actionButton: {
        backgroundColor: 'rgba(30, 35, 40, 0.9)',
        borderWidth: 2,
        borderColor: GOLD,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonDisabled: {
        opacity: 0.5,
        borderColor: '#6b7280',
    },
    actionButtonText: {
        color: GOLD,
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
        fontFamily: 'serif',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10
    },
    loadingText: {
        color: OFFWHITE
    }
});
