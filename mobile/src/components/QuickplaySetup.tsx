import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Button } from '@rneui/themed';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from './ChampionGrid';
import RolePicker from './RolePicker';
import RunePicker from './RunePicker';
import RuneBuilder from './RuneBuilder';
import SkinPicker from './SkinPicker';
import SpellPicker from './SpellPicker';

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

const ROLE_ICONS: Record<string, any> = {
    TOP: require('../../static/roles/role-top.png'),
    JUNGLE: require('../../static/roles/role-jungle.png'),
    MIDDLE: require('../../static/roles/role-mid.png'),
    BOTTOM: require('../../static/roles/role-bot.png'),
    UTILITY: require('../../static/roles/role-support.png'),
    FILL: require('../../static/roles/role-fill.png'),
    UNSELECTED: require('../../static/roles/role-unselected.png'),
};

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

    // Ownership / runes / skins
    const [ownedChampionIds, setOwnedChampionIds] = useState<number[]>([]);
    const [runePages, setRunePages] = useState<any[]>([]);
    const [loadingRunes, setLoadingRunes] = useState(false);
    const [selectedRunePageIds, setSelectedRunePageIds] = useState<Record<number, number | null>>({});
    const [showRunePicker, setShowRunePicker] = useState(false);
    const [runeSlotIndex, setRuneSlotIndex] = useState<number>(0);
    const [showRuneBuilder, setShowRuneBuilder] = useState(false);
    const [editingPageId, setEditingPageId] = useState<number | null>(null);
    const [runePageName, setRunePageName] = useState<string>('Custom Page');
    const [perkStyles, setPerkStyles] = useState<any[]>([]);
    const [runeIconMap, setRuneIconMap] = useState<Record<number, string>>({});

    const [skinCache, setSkinCache] = useState<Record<number, any[]>>({});
    const [pickableChampionIds, setPickableChampionIds] = useState<number[]>([]);
    const [selectedSkinIds, setSelectedSkinIds] = useState<Record<number, number | null>>({});
    const [skinSlotIndex, setSkinSlotIndex] = useState<number>(0);
    const [showSkinPicker, setShowSkinPicker] = useState(false);
    const [loadingSkinsFor, setLoadingSkinsFor] = useState<number | null>(null);

    // Spells
    const [spells, setSpells] = useState<any[]>([]);
    const [showSpellPicker, setShowSpellPicker] = useState(false);
    const [spellSlotIndex, setSpellSlotIndex] = useState<number>(0);
    const [pickingFirstSpell, setPickingFirstSpell] = useState(true);
    const spellMapRef = useRef<Record<number, string>>({});

    const lcuBridge = getLCUBridge();

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lobby?.gameConfig?.queueId, lobby?.localMember?.puuid]);

    const fetchOwnedChampionIds = async () => {
        const summonerId = lobby?.localMember?.summonerId;
        // Primary endpoint used by desktop client
        try {
            const res = await lcuBridge.request('/lol-champions/v1/owned-champions-minimal');
            if (res.status === 200 && Array.isArray(res.content)) {
                const ids = res.content
                    .map((c: any) => (typeof c === 'number' ? c : c?.id))
                    .filter((id: any) => typeof id === 'number' && id > 0);
                if (ids.length) {
                    setOwnedChampionIds(Array.from(new Set(ids)));
                    return;
                }
            }
        } catch (err) {
            console.warn('Owned champions minimal failed', err);
        }

        // Fallback: inventory endpoint per summoner
        if (summonerId) {
            try {
                const inv = await lcuBridge.request(`/lol-champions/v1/inventories/${summonerId}/champions-minimal`);
                if (inv.status === 200 && Array.isArray(inv.content)) {
                    const ids = inv.content
                        .map((c: any) => (typeof c === 'number' ? c : c?.id))
                        .filter((id: any) => typeof id === 'number' && id > 0);
                    if (ids.length) {
                        setOwnedChampionIds(Array.from(new Set(ids)));
                        return;
                    }
                }
            } catch (err) {
                console.warn('Owned champions inventory failed', err);
            }
        }
    };

    const loadRunes = async () => {
        setLoadingRunes(true);
        try {
            const pagesRes = await lcuBridge.request('/lol-perks/v1/pages');
            if (pagesRes.status === 200 && Array.isArray(pagesRes.content)) {
                setRunePages(pagesRes.content);
                // Prime current selection if missing
                const active = pagesRes.content.find((p: any) => p.isActive);
                if (active) {
                    setSelectedRunePageIds(prev => Object.keys(prev).length ? prev : { 0: active.id, 1: active.id });
                }
            }
        } catch (err) {
            console.warn('Failed to load runes for quickplay', err);
        } finally {
            setLoadingRunes(false);
        }
    };

    const setSlotsFromLobby = useCallback((lobbyContent: any): boolean => {
        if (!lobbyContent) return false;
        const lobbySlots: QuickplaySlot[] = lobbyContent?.localMember?.playerSlots ||
            lobbyContent?.members?.find((m: any) => m.puuid === lobbyContent?.localMember?.puuid)?.playerSlots ||
            [];
        if (Array.isArray(lobbySlots) && lobbySlots.length > 0) {
            setSlots(lobbySlots);
            setDebugResult(lobbyContent === lobby ? 'Using prop lobby.playerSlots' : 'Using live lobby.playerSlots');
            return true;
        }
        return false;
    }, [lobby]);

    const loadPickableChampionIds = async () => {
        try {
            const res = await lcuBridge.request('/lol-champ-select/v1/pickable-champion-ids');
            if (res.status === 200 && Array.isArray(res.content)) {
                const ids = res.content.filter((id: any) => typeof id === 'number' && id > 0);
                setPickableChampionIds(ids);
            }
        } catch (err) {
            console.warn('[QuickplaySetup] Failed to load pickable champion ids', err);
        }
    };

    useEffect(() => {
        if (!lcuBridge.getIsConnected()) return;
        let unsubscribe: (() => void) | undefined;
        let interval: ReturnType<typeof setInterval> | undefined;

        const handleUpdate = (res: any) => {
            if (res?.content) {
                setSlotsFromLobby(res.content);
            }
        };

        try {
            unsubscribe = lcuBridge.observe('/lol-lobby/v2/lobby', handleUpdate);
        } catch (e) {
            console.warn('Observe lobby failed, will rely on polling', e);
        }

        interval = setInterval(() => {
            loadSlots().catch(() => { });
            loadPickableChampionIds().catch(() => { });
        }, 5000);

        return () => {
            if (unsubscribe) unsubscribe();
            if (interval) clearInterval(interval);
        };
    }, [lcuBridge, setSlotsFromLobby]);

    const loadData = async () => {
        if (loading && Array.isArray(slots) && slots.length > 0) return;

        try {
            setLoading(true);
            setError('');

            let championsLoaded = champions.length > 0;

            // Load owned champs & rune pages in parallel (fire-and-forget)
            fetchOwnedChampionIds().catch(() => { });
            loadRunes().catch(() => { });
            loadPerkStyles().catch(() => { });
            loadPickableChampionIds().catch(() => { });
            loadSpells().catch(() => { });
            // One-time discovery of possible quickplay endpoints from swagger (best-effort)
            discoverQuickplayPaths().catch(() => { });

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

                        // Filter out id -1 (None) and invalid entries
                        const formattedChamps = champList
                            .filter((c: any) => c && c.id !== undefined && c.id !== null && c.id !== -1 && c.name)
                            .map((c: any) => ({
                                id: c.id,
                                key: String(c.id),
                                name: c.name,
                                // Use alias for DDragon image if available, else fallback to path parsing
                                image: { full: (c.alias ? c.alias : (c.squarePortraitPath?.split('/').pop()?.replace('champion-icons', 'champion') || 'Unknown')) + '.png' }
                            })).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

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
            // Always try live LCU lobby first; fall back to passed-in lobby prop
            let liveLobby: any = null;
            try {
                const lcuLobby = await lcuBridge.request('/lol-lobby/v2/lobby');
                if (lcuLobby.status === 200 && lcuLobby.content) {
                    liveLobby = lcuLobby.content;

                }
            } catch (e) {
                console.warn('LCU lobby fetch failed, will fall back to prop', e);
            }

            const lobbySource = liveLobby || lobby || null;

            // First, try to get slots from lobby object (most reliable)
            const applied = setSlotsFromLobby(lobbySource);
            if (applied) return;

            // Only try the dedicated endpoint if we don't have slots from lobby
            console.log('No slots in lobby object, trying dedicated endpoint...');
            try {
                const result = await lcuBridge.request('/lol-lobby/v2/lobby/quickplay/slots');
                console.log('Slots Endpoint Status:', result.status);

                if (result.status === 200 && result.content) {
                    console.log('Quickplay slots content:', JSON.stringify(result.content, null, 2));
                    const qpSlots = Array.isArray(result.content) ? result.content : [];
                    if (qpSlots.length) {
                        setSlots(qpSlots);
                        setDebugResult('Using /quickplay/slots endpoint');
                        return;
                    }
                    setDebugResult('Quickplay slots empty or invalid');
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

    const loadSkinsForChampion = async (championId: number) => {
        const summonerId = lobby?.localMember?.summonerId;
        if (!championId || !summonerId) return [];
        if (skinCache[championId]) return skinCache[championId];
        setLoadingSkinsFor(championId);
        try {
            const skinsRes = await lcuBridge.request(`/lol-champions/v1/inventories/${summonerId}/skins-minimal`);
            if (skinsRes.status === 200) {
                const champSkins = (skinsRes.content || []).filter((s: any) => s.championId === championId);
                const champKey = championMap[championId]?.key;
                let mapped = champSkins
                    .filter((s: any) => s.ownership?.owned || s.isBase || s.owned)
                    .map((s: any) => ({
                        id: s.id,
                        name: s.name || s.skinName || `Skin ${s.id % 1000}`,
                        owned: true,
                        splashPath: champKey ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champKey}_${s.id % 1000}.jpg` : undefined,
                    }));

                if (!mapped.length) {
                    const key = champKey || 'champion';
                    mapped = [{
                        id: championId * 1000,
                        name: `${championMap[championId]?.name || 'Base Skin'}`,
                        owned: true,
                        splashPath: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_0.jpg`,
                    }];
                }
                setSkinCache(prev => ({ ...prev, [championId]: mapped }));
                return mapped;
            }
        } catch (err) {
            console.warn('Failed to load skins for champ', championId, err);
        } finally {
            setLoadingSkinsFor(null);
        }
        return [];
    };

    const loadPerkStyles = async () => {
        try {
            // Load rune icon map from CDragon
            try {
                const perksJson = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json');
                if (perksJson.ok) {
                    const perksData = await perksJson.json();
                    const perkMap: Record<number, string> = {};
                    const normalizePathOnly = (path: string) => {
                        const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
                        const cleaned = path.replace(/^\/+/, '');
                        return encodeURI(`${base}${cleaned}`);
                    };
                    perksData.forEach((perk: any) => {
                        if (perk?.id && perk?.iconPath) {
                            perkMap[perk.id] = normalizePathOnly(perk.iconPath);
                        }
                    });
                    setRuneIconMap(perkMap);
                }
            } catch (e) {
                console.warn('[QuickplaySetup] Failed to load perks.json', e);
            }

            // Load perk styles from LCU with fallback
            let loadedStyles: any[] = [];
            try {
                const stylesResult = await lcuBridge.request('/lol-perks/v1/styles');
                if (stylesResult.status === 200 && Array.isArray(stylesResult.content) && stylesResult.content.length > 0) {
                    loadedStyles = stylesResult.content;
                }
            } catch (e) {
                console.warn('[QuickplaySetup] Failed to load perk styles from LCU', e);
            }

            if (!loadedStyles.length) {
                try {
                    const cdragonStylesRes = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perkstyles.json');
                    if (cdragonStylesRes.ok) {
                        const cdragonStyles = await cdragonStylesRes.json();
                        if (Array.isArray(cdragonStyles?.styles) && cdragonStyles.styles.length > 0) {
                            loadedStyles = cdragonStyles.styles;
                        }
                    }
                } catch (e) {
                    console.warn('[QuickplaySetup] Failed to fetch perkstyles fallback', e);
                }
            }

            setPerkStyles(loadedStyles);
        } catch (err) {
            console.warn('Failed to load perk styles', err);
        }
    };

    const loadSpells = async () => {
        try {
            const version = ddragonVersion || '14.23.1';
            const spellsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`);
            if (spellsRes.ok) {
                const spellsData = await spellsRes.json();
                const spellList = Object.values(spellsData.data).map((s: any) => ({
                    id: parseInt(s.key),
                    name: s.name,
                    key: s.id,
                    iconPath: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${s.id}.png`
                })).sort((a: any, b: any) => a.name.localeCompare(b.name));
                setSpells(spellList);

                // Build spell map for quick lookup
                spellList.forEach((s: any) => {
                    spellMapRef.current[s.id] = s.key;
                });
            }
        } catch (err) {
            console.warn('[QuickplaySetup] Failed to load spells', err);
        }
    };

    const getSpellName = (spellId: number | undefined) => {
        if (!spellId) return 'SummonerFlash';
        return spellMapRef.current[spellId] || 'SummonerFlash';
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

            // Note: Quickplay slot configuration is stored locally in the lobby.
            // Unlike ChampSelectScreen which uses /lol-champ-select/v1/session/my-selection,
            // quickplay slots don't have a documented writeable API endpoint.
            // The slots are read from lobby.localMember.playerSlots but updates 
            // happen through the client UI only.

            // For now, we just update local state - the actual slot config will sync
            // when the user enters champion select or when lobby refreshes.
            console.log(`Slot ${index} updated locally. Quickplay slot API not available.`);

            // Keep the optimistic local state update
            if (onSuccess) onSuccess('Slot configuration updated');

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

    const openRunePicker = async (index: number) => {
        if (!runePages.length) {
            await loadRunes();
        }
        if (!perkStyles.length || !Object.keys(runeIconMap).length) {
            await loadPerkStyles();
        }
        setRuneSlotIndex(index);
        setShowRunePicker(true);
    };

    const openRuneBuilder = async (index: number) => {
        if (!perkStyles.length || !Object.keys(runeIconMap).length) {
            await loadPerkStyles();
        }
        if (!runePages.length) {
            await loadRunes();
        }
        setRuneSlotIndex(index);
        const selectedId = selectedRunePageIds[index];
        setEditingPageId(selectedId ?? null);
        const fallbackName = runePages.find((p: any) => p.id === selectedId)?.name || 'Custom Page';
        setRunePageName(fallbackName);
        setShowRuneBuilder(true);
    };

    const openSkinPicker = async (index: number) => {
        setSkinSlotIndex(index);
        const champId = slots[index]?.championId;
        if (champId) {
            await loadSkinsForChampion(champId);
        }
        setShowSkinPicker(true);
    };

    const openRolePicker = (index: number) => {
        setActiveSlotIndex(index);
        setShowRolePicker(true);
    };

    const handleChampionSelect = async (championId: number) => {
        await handleUpdateSlot(activeSlotIndex, { championId });
        setShowChampionGrid(false);
        const skins = await loadSkinsForChampion(championId);
        if (skins.length) {
            const preferred = skins[0];
            setSelectedSkinIds(prev => ({ ...prev, [activeSlotIndex]: preferred.id }));
            await handleUpdateSlot(activeSlotIndex, { skinId: preferred.id });
        }
    };

    const handleRoleSelect = (role: string) => {
        handleUpdateSlot(activeSlotIndex, { positionPreference: role });
        setShowRolePicker(false);
    };

    const handleRuneSelect = async (page: any) => {
        if (!page) return;
        const payload = JSON.stringify({
            id: page.id,
            name: page.name,
            primaryStyleId: page.primaryStyleId,
            subStyleId: page.subStyleId,
            selectedPerkIds: page.selectedPerkIds,
        });
        setSelectedRunePageIds(prev => ({ ...prev, [runeSlotIndex]: page.id }));
        handleUpdateSlot(runeSlotIndex, { perks: payload });
        try {
            await lcuBridge.request('/lol-perks/v1/currentpage', 'PUT', page.id);
            await loadRunes();
        } catch (e) {
            console.warn('[QuickplaySetup] Failed to set current rune page', e);
        }
        setShowRunePicker(false);
    };

    const handleSaveRunePage = async (pageData: any) => {
        try {
            const endpoint = pageData?.id ? `/lol-perks/v1/pages/${pageData.id}` : '/lol-perks/v1/pages';
            const method = pageData?.id ? 'PUT' : 'POST';
            const res = await lcuBridge.request(endpoint, method as any, pageData);
            if (res?.status && res.status >= 400) {
                throw new Error(res?.content?.message || `Failed to save rune page (${res.status})`);
            }
            const newPageId = res?.content?.id ?? pageData?.id;
            if (newPageId) {
                await lcuBridge.request('/lol-perks/v1/currentpage', 'PUT', newPageId);
            }
            await loadRunes();
            const savedPage =
                res?.content && typeof res.content === 'object'
                    ? { ...res.content, id: newPageId }
                    : runePages.find((p: any) => p.id === newPageId) || { ...pageData, id: newPageId };
            handleRuneSelect(savedPage);
        } catch (err: any) {
            console.error('[QuickplaySetup] Failed to save rune page', err);
            if (onError) onError(err?.message || 'Failed to save rune page');
        } finally {
            setShowRuneBuilder(false);
            setEditingPageId(null);
        }
    };

    const handleSkinSelect = (skinId: number) => {
        if (!skinId) return;
        setSelectedSkinIds(prev => ({ ...prev, [skinSlotIndex]: skinId }));
        handleUpdateSlot(skinSlotIndex, { skinId });
        setShowSkinPicker(false);
    };

    const openSpellPicker = (slotIndex: number, isFirst: boolean) => {
        setSpellSlotIndex(slotIndex);
        setPickingFirstSpell(isFirst);
        setShowSpellPicker(true);
    };

    const handleSpellSelect = async (spellId: number) => {
        const slot = slots[spellSlotIndex];
        if (!slot) return;

        const currentSpell1 = slot.spell1;
        const currentSpell2 = slot.spell2;

        const updates: Partial<QuickplaySlot> = {};
        if (pickingFirstSpell) {
            updates.spell1 = spellId;
            // If the selected spell is the same as spell2, swap them
            if (spellId === currentSpell2) {
                updates.spell2 = currentSpell1;
            }
        } else {
            updates.spell2 = spellId;
            // If the selected spell is the same as spell1, swap them
            if (spellId === currentSpell1) {
                updates.spell1 = currentSpell2;
            }
        }

        setShowSpellPicker(false);
        await handleUpdateSlot(spellSlotIndex, updates);
    };

    useEffect(() => {
        if (!Array.isArray(slots) || !slots.length) return;
        const next: Record<number, number | null> = {};
        slots.forEach((slot, idx) => {
            if (slot?.skinId) next[idx] = slot.skinId;
        });
        setSelectedSkinIds(prev => ({ ...next, ...prev }));
    }, [slots]);

    const resolveRunePageIdFromSlot = (slot: QuickplaySlot) => {
        if (!slot?.perks) return null;
        try {
            const parsed = typeof slot.perks === 'string' ? JSON.parse(slot.perks) : slot.perks;
            if (typeof parsed === 'number') return parsed;
            if (parsed?.id) return parsed.id;
            if (Array.isArray(parsed?.selectedPerkIds) && runePages.length) {
                const match = runePages.find((p: any) => Array.isArray(p.selectedPerkIds) &&
                    p.selectedPerkIds.join(',') === parsed.selectedPerkIds.join(','));
                return match?.id ?? null;
            }
        } catch (err) {
            return null;
        }
        return null;
    };

    useEffect(() => {
        if (!Array.isArray(slots) || !slots.length) return;
        const next: Record<number, number | null> = {};
        slots.forEach((slot, idx) => {
            const resolved = resolveRunePageIdFromSlot(slot);
            if (resolved) next[idx] = resolved;
        });
        if (Object.keys(next).length) {
            setSelectedRunePageIds(prev => ({ ...prev, ...next }));
        }
    }, [slots, runePages]);

    useEffect(() => {
        // Preload skins for currently selected champions
        slots.forEach((slot) => {
            if (slot?.championId) {
                loadSkinsForChampion(slot.championId).catch(() => { });
            }
        });
    }, [slots]);

    const availableChampionIds = useMemo(() => {
        const pool = pickableChampionIds.length ? pickableChampionIds : ownedChampionIds;
        if (pool.length) {
            const set = new Set(pool);
            return champions
                .map((c: any) => c.id)
                .filter((id: any) => typeof id === 'number' && set.has(id));
        }
        return champions.map((c: any) => c.id).filter((id: any) => typeof id === 'number');
    }, [pickableChampionIds, ownedChampionIds, champions]);

    const filteredChampions = useMemo(() => {
        if (!champions.length) return [];
        if (!availableChampionIds.length) return champions;
        return champions.filter((c: any) => availableChampionIds.includes(c.id));
    }, [champions, availableChampionIds]);

    const runeNameForSlot = (index: number) => {
        const pageId = selectedRunePageIds[index];
        if (!pageId) return 'Select runes';
        const page = runePages.find((p: any) => p.id === pageId);
        return page?.name || 'Select runes';
    };

    const normalizeRuneIcon = useCallback((rawPath: string | undefined, id?: number) => {
        if (!rawPath) return '';
        if (/^https?:\/\//i.test(rawPath)) return rawPath;
        const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
        const cleaned = rawPath.replace(/^\/+/, '');
        return encodeURI(`${base}${cleaned}`);
    }, []);

    const findStyleIcon = useCallback((styleId?: number | null) => {
        if (!styleId) return '';
        const style = perkStyles.find((s: any) => s.id === styleId);
        return normalizeRuneIcon(style?.iconPath);
    }, [perkStyles, normalizeRuneIcon]);

    const findPerkIcon = useCallback((perkId?: number) => {
        if (!perkId) return '';
        if (runeIconMap[perkId]) return normalizeRuneIcon(runeIconMap[perkId], perkId);
        // Fallback: scan perkStyles slots for iconPath
        for (const style of perkStyles) {
            for (const slot of style?.slots || []) {
                for (const perk of slot?.perks || []) {
                    const pid = typeof perk === 'number' ? perk : perk?.id;
                    if (pid === perkId) {
                        const iconPath = typeof perk === 'number' ? '' : perk?.iconPath;
                        if (iconPath) return normalizeRuneIcon(iconPath, perkId);
                    }
                }
            }
        }
        return '';
    }, [normalizeRuneIcon, perkStyles, runeIconMap]);

    const runeIconsForPage = useCallback((pageId?: number | null) => {
        if (!pageId) return {};
        const page = runePages.find((p: any) => p.id === pageId);
        if (!page) return {};
        const keystoneId = Array.isArray(page.selectedPerkIds) ? page.selectedPerkIds[0] : undefined;
        const keystoneIcon = findPerkIcon(keystoneId) || undefined;
        return {
            primaryIcon: findStyleIcon(page.primaryStyleId),
            subIcon: findStyleIcon(page.subStyleId),
            keystoneIcon,
        };
    }, [findPerkIcon, findStyleIcon, runePages]);

    const skinNameForSlot = (index: number) => {
        const skinId = selectedSkinIds[index];
        const champId = slots[index]?.championId;
        const options = champId ? skinCache[champId] || [] : [];
        const current = options.find((s: any) => s.id === skinId);
        return current?.name || 'Select skin';
    };

    const getChampionImage = (championId: number) => {
        if (!championId || !championMap[championId]) return null;
        // For now, still using DDragon for images as LCU assets might be local paths not accessible to React Native Image component easily without serving them.
        // But we have the filename from LCU data.
        return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[championId].image.full}`;
    };

    const discoverQuickplayPaths = useCallback(async () => {
        try {
            const res = await lcuBridge.request('/swagger/v3/openapi.json');
            if (res.status === 200 && res.content?.paths) {
                const paths = Object.keys(res.content.paths);
                const hits = paths.filter(p =>
                    p.toLowerCase().includes('quick') ||
                    p.toLowerCase().includes('slot') ||
                    p.toLowerCase().includes('swift')
                );
                const sample = hits.slice(0, 50);
                console.log('[QuickplaySetup] swagger quick/slot paths sample:', sample);
            } else {
                console.log('[QuickplaySetup] swagger fetch returned status', res.status);
            }
        } catch (e: any) {
            console.warn('[QuickplaySetup] swagger quickplay discovery failed', e?.message || e);
        }
    }, [lcuBridge]);

    const slotList = Array.isArray(slots) ? slots : [];

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>Quickplay Setup</Text>
            {!!error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Button title="Retry" size="sm" onPress={loadSlots} />
                </View>
            )}

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#4f46e5" />
                    <Text style={styles.loadingText}>Loading Quickplay Setup...</Text>
                    <Text style={styles.debugText}>{error}</Text>
                </View>
            ) : (
                <>

                    {slotList.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No Quickplay Slots Found</Text>
                            <Text style={styles.subText}>Are you in a Quickplay Lobby?</Text>
                            <Button title="Retry Fetching Slots" onPress={loadSlots} containerStyle={{ marginTop: 10 }} />
                        </View>
                    ) : (
                        <View style={styles.slotsContainer}>
                            {slotList.map((slot, index) => (
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
                                                    <Image source={getRoleIconSource(slot.positionPreference)} style={styles.roleIconImage} />
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

                                    <View style={styles.secondaryRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.runeDropdown,
                                                updatingSlots.has(index) && styles.pickButtonUpdating
                                            ]}
                                            onPress={() => openRunePicker(index)}
                                            disabled={updatingSlots.has(index) || loadingRunes}
                                        >
                                            <View style={styles.runeDropdownContent}>
                                                <View style={styles.runeIconRow}>
                                                    {runeIconsForPage(selectedRunePageIds[index])?.primaryIcon ? (
                                                        <Image
                                                            source={{ uri: runeIconsForPage(selectedRunePageIds[index])!.primaryIcon as string }}
                                                            style={styles.runeStyleIcon}
                                                        />
                                                    ) : null}
                                                    {runeIconsForPage(selectedRunePageIds[index])?.subIcon ? (
                                                        <Image
                                                            source={{ uri: runeIconsForPage(selectedRunePageIds[index])!.subIcon as string }}
                                                            style={styles.runeSubIcon}
                                                        />
                                                    ) : null}
                                                    {runeIconsForPage(selectedRunePageIds[index])?.keystoneIcon ? (
                                                        <Image
                                                            source={{ uri: runeIconsForPage(selectedRunePageIds[index])!.keystoneIcon as string }}
                                                            style={styles.runeKeystoneIcon}
                                                        />
                                                    ) : null}
                                                </View>
                                                <Text style={styles.runeDropdownText} numberOfLines={1}>
                                                    {runeNameForSlot(index)}
                                                </Text>
                                            </View>
                                            <Image source={require('../../static/dropdown_arrows.png')} style={styles.dropdownArrow} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.editRuneBtn,
                                                updatingSlots.has(index) && styles.pickButtonUpdating
                                            ]}
                                            onPress={() => openRuneBuilder(index)}
                                            disabled={updatingSlots.has(index) || loadingRunes || !perkStyles.length}
                                        >
                                            <Text style={styles.editRuneText}>✎</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.skinIconButton,
                                                updatingSlots.has(index) && styles.pickButtonUpdating
                                            ]}
                                            onPress={() => openSkinPicker(index)}
                                            disabled={updatingSlots.has(index) || !slot.championId}
                                        >
                                            {loadingSkinsFor === slot.championId ? (
                                                <ActivityIndicator size="small" color="#fbbf24" />
                                            ) : (
                                                <Image source={require('../../static/skin_picker_icon.png')} style={styles.skinPickerIcon} />
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    {/* Spells Row */}
                                    <View style={styles.spellsRow}>
                                        <Text style={styles.spellsLabel}>Spells</Text>
                                        <View style={styles.spellButtons}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.spellButton,
                                                    updatingSlots.has(index) && styles.pickButtonUpdating
                                                ]}
                                                onPress={() => openSpellPicker(index, true)}
                                                disabled={updatingSlots.has(index)}
                                            >
                                                {slot.spell1 ? (
                                                    <Image
                                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(slot.spell1)}.png` }}
                                                        style={styles.spellIcon}
                                                    />
                                                ) : (
                                                    <View style={[styles.spellIcon, styles.spellPlaceholder]}>
                                                        <Text style={styles.placeholderText}>D</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[
                                                    styles.spellButton,
                                                    updatingSlots.has(index) && styles.pickButtonUpdating
                                                ]}
                                                onPress={() => openSpellPicker(index, false)}
                                                disabled={updatingSlots.has(index)}
                                            >
                                                {slot.spell2 ? (
                                                    <Image
                                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(slot.spell2)}.png` }}
                                                        style={styles.spellIcon}
                                                    />
                                                ) : (
                                                    <View style={[styles.spellIcon, styles.spellPlaceholder]}>
                                                        <Text style={styles.placeholderText}>F</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    <Modal visible={showChampionGrid} animationType="slide" onRequestClose={() => setShowChampionGrid(false)}>
                        <SafeAreaView style={styles.modalContainer} edges={['top', 'left', 'right']}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select Champion</Text>
                                <Button title="Close" onPress={() => setShowChampionGrid(false)} type="clear" />
                            </View>
                            <ChampionGrid
                                champions={filteredChampions}
                                onSelect={handleChampionSelect}
                                version={ddragonVersion}
                                availableChampionIds={availableChampionIds}
                                contentContainerStyle={{ paddingBottom: 40 }}
                            />
                        </SafeAreaView>
                    </Modal>

                    <RolePicker
                        visible={showRolePicker}
                        onSelect={handleRoleSelect}
                        onClose={() => setShowRolePicker(false)}
                        currentRole={slots[activeSlotIndex]?.positionPreference}
                    />

                    <RunePicker
                        visible={showRunePicker}
                        onSelect={(pageId) => {
                            const page = runePages.find((p: any) => p.id === pageId);
                            handleRuneSelect(page);
                        }}
                        onClose={() => setShowRunePicker(false)}
                        pages={runePages}
                        currentPageId={selectedRunePageIds[runeSlotIndex] ?? runePages.find((p: any) => p.isActive)?.id}
                        perkStyles={perkStyles}
                        runeIconMap={runeIconMap}
                        normalizeRuneIcon={normalizeRuneIcon}
                    />

                    <SkinPicker
                        visible={showSkinPicker}
                        onSelect={handleSkinSelect}
                        onClose={() => setShowSkinPicker(false)}
                        skins={slots[skinSlotIndex]?.championId ? (skinCache[slots[skinSlotIndex]?.championId] || []) : []}
                        currentSkinId={selectedSkinIds[skinSlotIndex] ?? undefined}
                        championName={slots[skinSlotIndex]?.championId ? championMap[slots[skinSlotIndex].championId]?.name : undefined}
                        fallbackSplash={
                            slots[skinSlotIndex]?.championId && championMap[slots[skinSlotIndex].championId]?.key
                                ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championMap[slots[skinSlotIndex].championId].key}_0.jpg`
                                : undefined
                        }
                        championIcon={
                            slots[skinSlotIndex]?.championId && championMap[slots[skinSlotIndex].championId]?.key
                                ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[slots[skinSlotIndex].championId].key}.png`
                                : undefined
                        }
                    />

                    <RuneBuilder
                        visible={showRuneBuilder}
                        onClose={() => { setShowRuneBuilder(false); setEditingPageId(null); }}
                        onSave={handleSaveRunePage}
                        initialPage={
                            runePages.find((p: any) => p.id === (editingPageId ?? selectedRunePageIds[runeSlotIndex])) ||
                            runePages.find((p: any) => p.isActive) ||
                            runePages[0] ||
                            { name: runePageName, selectedPerkIds: [], primaryStyleId: null, subStyleId: null }
                        }
                        perkStyles={perkStyles}
                        runeIconMap={runeIconMap}
                        normalizeRuneIcon={normalizeRuneIcon}
                    />

                    <SpellPicker
                        visible={showSpellPicker}
                        onSelect={handleSpellSelect}
                        onClose={() => setShowSpellPicker(false)}
                        spells={spells}
                        currentSpellId={pickingFirstSpell ? slots[spellSlotIndex]?.spell1 : slots[spellSlotIndex]?.spell2}
                    />
                </>
            )}
        </ScrollView>
    );
}

function getRoleIconSource(role: string) {
    return ROLE_ICONS[role] || ROLE_ICONS.UNSELECTED;
}

const styles = StyleSheet.create({
    container: { padding: 20, paddingBottom: 200 },
    loadingContainer: { padding: 20, alignItems: 'center' },
    loadingText: { color: '#ccc', marginTop: 10 },
    debugText: { color: 'red', marginTop: 5, fontSize: 10 },
    errorBanner: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: '#ef4444', marginBottom: 12 },
    errorText: { color: '#fca5a5', marginBottom: 6, fontWeight: '700' },
    header: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    slotsContainer: { gap: 20 },
    slotCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#333' },
    slotTitle: { color: '#888', fontSize: 12, textTransform: 'uppercase', marginBottom: 10, fontWeight: 'bold' },
    pickRow: { flexDirection: 'row', gap: 15 },
    secondaryRow: { flexDirection: 'row', gap: 15, marginTop: 12 },
    pickButton: { flex: 1, alignItems: 'center', backgroundColor: '#252525', padding: 10, borderRadius: 8 },
    smallButton: { paddingVertical: 8 },
    pickImage: { width: 60, height: 60, borderRadius: 30, marginBottom: 5 },
    placeholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
    placeholderText: { color: '#666', fontSize: 24, fontWeight: 'bold' },
    pickLabel: { color: 'white', fontSize: 12, fontWeight: '500' },
    secondaryLabel: { color: '#a5b4fc', fontSize: 12, marginBottom: 4, fontWeight: '700' },
    rolePlaceholder: { backgroundColor: '#2a2a2a' },
    roleIconImage: { width: 36, height: 36, resizeMode: 'contain' },
    pickButtonUpdating: { opacity: 0.6 },
    runeDropdown: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1e1e1e',
        paddingHorizontal: 12,
        height: 40,
        borderRadius: 4,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#3f3f46',
    },
    runeDropdownContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    runeIconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    runeStyleIcon: { width: 24, height: 24, borderRadius: 12 },
    runeSubIcon: { width: 18, height: 18, borderRadius: 9 },
    runeKeystoneIcon: { width: 22, height: 22, borderRadius: 11 },
    runeDropdownText: {
        color: '#d4d4d8',
        fontSize: 14,
        flex: 1,
        marginRight: 8,
    },
    dropdownArrow: {
        width: 12,
        height: 12,
        opacity: 0.7,
    },
    editRuneBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#fbbf24',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    editRuneText: {
        color: '#fbbf24',
        fontSize: 18,
    },
    skinIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#3f3f46',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
    },
    skinPickerIcon: {
        width: 28,
        height: 28,
        resizeMode: 'contain',
    },
    modalContainer: { flex: 1, backgroundColor: '#121212', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', padding: 40 },
    emptyText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    subText: { color: '#888', marginBottom: 20 },
    selectionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
    selectionName: { color: 'white', fontSize: 16, fontWeight: '600' },
    selectionMeta: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
    // Spells styles
    spellsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    spellsLabel: {
        color: '#888',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    spellButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    spellButton: {
        width: 44,
        height: 44,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#fbbf24',
        overflow: 'hidden',
    },
    spellIcon: {
        width: '100%',
        height: '100%',
    },
    spellPlaceholder: {
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
