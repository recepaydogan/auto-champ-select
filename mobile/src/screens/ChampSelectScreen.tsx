import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Tab, TabView, Avatar } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from '../components/ChampionGrid';
import TeamView from '../components/TeamView';
import SpellPicker from '../components/SpellPicker';
import SkinPicker from '../components/SkinPicker';
import RunePicker from '../components/RunePicker';

interface ChampSelectScreenProps {
    champSelect: any;
    onPick: (championId: number) => void;
    onBan: (championId: number) => void;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
}

export default function ChampSelectScreen({ champSelect, onPick, onBan, onError, onSuccess }: ChampSelectScreenProps) {
    const [index, setIndex] = useState(0);
    const [champions, setChampions] = useState<any[]>([]);
    const [championMap, setChampionMap] = useState<{ [key: number]: any }>({});
    const [runes, setRunes] = useState<any[]>([]);
    const [perkStyles, setPerkStyles] = useState<any[]>([]);
    const [runeIconMap, setRuneIconMap] = useState<Record<number, string>>({});
    const [spells, setSpells] = useState<any[]>([]);
    const [bench, setBench] = useState<any[]>([]);
    const [rerollState, setRerollState] = useState<any>(null);
    const [ddragonVersion, setDdragonVersion] = useState('14.23.1');
    const [loading, setLoading] = useState(true);
    const [selectionMode, setSelectionMode] = useState<'pick' | 'ban'>('pick');
    const [confirmModal, setConfirmModal] = useState<{ visible: boolean; championId: number | null; action: 'pick' | 'ban' }>({ visible: false, championId: null, action: 'pick' });
    const [timeLeft, setTimeLeft] = useState<number>(() => champSelect?.timer?.adjustedTimeLeftInPhase ? Math.ceil(champSelect.timer.adjustedTimeLeftInPhase / 1000) : 0);

    // Picker States
    const [showSpellPicker, setShowSpellPicker] = useState(false);
    const [pickingFirstSpell, setPickingFirstSpell] = useState(true);
    const [showSkinPicker, setShowSkinPicker] = useState(false);
    const [showRunePicker, setShowRunePicker] = useState(false);
    const [showRuneBuilder, setShowRuneBuilder] = useState(false);
    const [skins, setSkins] = useState<any[]>([]);

    // Rune builder states
    const [runePageName, setRunePageName] = useState('My Rune Page');
    const [primaryStyleId, setPrimaryStyleId] = useState<number | null>(null);
    const [subStyleId, setSubStyleId] = useState<number | null>(null);
    const [keystoneId, setKeystoneId] = useState<number | null>(null);
    const [primaryPerks, setPrimaryPerks] = useState<{ [slot: number]: number | null }>({});
    const [secondaryPerks, setSecondaryPerks] = useState<number[]>([]);
    const [statShards, setStatShards] = useState<number[]>([5008, 5008, 5002]);

    // Swap loading state - track which champion is being swapped
    const [swappingChampionId, setSwappingChampionId] = useState<number | null>(null);

    // Track failed rune image loads for fallback handling
    const [failedRuneImages, setFailedRuneImages] = useState<Set<string>>(new Set());

    const lcuBridge = getLCUBridge();
    const localPlayerCellId = champSelect?.localPlayerCellId;
    const myTeam = champSelect?.myTeam || [];
    const theirTeam = champSelect?.theirTeam || [];
    const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
    const isARAM = champSelect?.benchEnabled;
    const currentAction = useMemo(() => {
        const actions = champSelect?.actions || [];
        for (const turn of actions) {
            for (const action of turn) {
                if (action.actorCellId === localPlayerCellId && !action.completed) {
                    return action;
                }
            }
        }
        return null;
    }, [champSelect?.actions, localPlayerCellId]);
    useEffect(() => {
        if (currentAction?.type) {
            setSelectionMode(currentAction.type.toLowerCase() === 'ban' ? 'ban' : 'pick');
        }
    }, [currentAction?.type]);

    useEffect(() => {
        const ms = champSelect?.timer?.adjustedTimeLeftInPhase;
        if (typeof ms === 'number') {
            setTimeLeft(Math.max(0, Math.ceil(ms / 1000)));
        }
        let interval: NodeJS.Timeout | null = null;
        if (ms !== undefined) {
            interval = setInterval(() => {
                setTimeLeft(prev => Math.max(0, prev - 1));
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [champSelect?.timer?.adjustedTimeLeftInPhase]);

    // Debug logging for bench data
    useEffect(() => {
        if (isARAM && champSelect) {
            console.log('[ChampSelect] ARAM Mode Detected');
            console.log('[ChampSelect] Bench Enabled:', champSelect.benchEnabled);
            console.log('[ChampSelect] Bench Champion IDs:', champSelect.benchChampionIds);
            console.log('[ChampSelect] Bench Count:', champSelect.benchChampionIds?.length || 0);
        }
    }, [isARAM, champSelect?.benchChampionIds]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            // 1. Fetch DDragon Version
            const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
            const versions = await versionRes.json();
            const version = versions[0];
            setDdragonVersion(version);

            // 2. Fetch Champions
            const champsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
            const champsData = await champsRes.json();
            const champList = Object.values(champsData.data).map((c: any) => ({
                id: parseInt(c.key),
                key: c.id,
                name: c.name,
                image: c.image
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));

            setChampions(champList);

            // Create a map for easy lookup by ID
            const map: { [key: number]: any } = {};
            champList.forEach((c: any) => map[c.id] = c);
            setChampionMap(map);

            // 3. Fetch Runes
            const runesResult = await lcuBridge.request('/lol-perks/v1/pages');
            if (runesResult.status === 200) setRunes(runesResult.content);

            // 3a. Fetch rune icon map from CommunityDragon
            try {
                const perksJson = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json');
                if (perksJson.ok) {
                    const perksData = await perksJson.json();
                    const perkMap: Record<number, string> = {};
                    perksData.forEach((perk: any) => {
                        if (perk?.id && perk?.iconPath) {
                            perkMap[perk.id] = perk.iconPath;
                        }
                    });
                    setRuneIconMap(perkMap);
                    const samplePerk = perksData.find((p: any) => p?.iconPath);
                    if (samplePerk) {
                        console.log('[ChampSelect] Rune perks.json sample:', {
                            id: samplePerk.id,
                            iconPath: samplePerk.iconPath,
                            normalized: normalizeRuneIcon(perkMap[samplePerk.id] || samplePerk.iconPath, samplePerk.id),
                        });
                    }
                } else {
                    console.warn('[ChampSelect] Failed to fetch perks.json', perksJson.status);
                }
            } catch (e) {
                console.warn('[ChampSelect] Failed to load perks.json', e);
            }
            const stylesResult = await lcuBridge.request('/lol-perks/v1/styles');
            if (stylesResult.status === 200) {
                setPerkStyles(stylesResult.content);
                if (Array.isArray(stylesResult.content) && stylesResult.content.length > 0) {
                    const firstStyle = stylesResult.content[0];
                    const samplePerk = firstStyle?.slots?.[0]?.perks?.[0];
                    const isPerkId = typeof samplePerk === 'number';
                    console.log('[ChampSelect] Rune style sample:', {
                        styleName: firstStyle?.name,
                        samplePerk,
                        isPerkId,
                        slotStructure: firstStyle?.slots?.[0],
                        normalized: isPerkId ? normalizeRuneIcon(runeIconMap[samplePerk] || undefined, samplePerk) : normalizeRuneIcon(samplePerk?.iconPath || samplePerk?.icon, samplePerk?.id),
                    });
                }
            } else {
                console.warn('[ChampSelect] Failed to load rune styles:', stylesResult.status);
            }

            // 4. Fetch Spells
            const spellsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`);
            const spellsData = await spellsRes.json();
            const spellList = Object.values(spellsData.data).map((s: any) => ({
                id: parseInt(s.key),
                name: s.name,
                key: s.id,
                iconPath: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${s.id}.png`
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));
            console.log('[ChampSelect] Loaded spells (DDragon):', spellList.slice(0, 5));
            console.log('[ChampSelect] Spell sample:', spellList[0]);
            setSpells(spellList);

            // Helper to get spell name from ID for image URL
            (window as any).spellMap = {};
            spellList.forEach((s: any) => (window as any).spellMap[s.id] = s.key);

            if (isARAM) {
                // Load Reroll State
                const rerollResult = await lcuBridge.request('/lol-summoner/v1/current-summoner/rerollPoints');
                if (rerollResult.status === 200) setRerollState(rerollResult.content);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load skins when champion is picked
    useEffect(() => {
        if (localPlayer?.championId && localPlayer.championId > 0) {
            loadSkins(localPlayer.championId);
        }
    }, [localPlayer?.championId]);

    const loadSkins = async (championId: number) => {
        try {
            const skinsRes = await lcuBridge.request(`/lol-champions/v1/inventories/${localPlayer.summonerId}/skins-minimal`);
            if (skinsRes.status === 200) {
                const champSkins = skinsRes.content.filter((s: any) => s.championId === championId);
                setSkins(champSkins);
            }
        } catch (error) {
            console.error('Failed to load skins:', error);
        }
    };

    const activeRunePage = useMemo(() => runes.find((r: any) => r.isActive), [runes]);

    const allowedSpellIds = useMemo(() => {
        const spellData = champSelect?.summonerSpells;
        if (!spellData) return null;
        const disabled = Array.isArray(spellData.disabledSummonerSpells) ? spellData.disabledSummonerSpells : [];

        let pool: number[] = [];
        if (spellData.allowedSummonerSpells && spellData.allowedSummonerSpells.length > 0) {
            pool = spellData.allowedSummonerSpells;
        } else if (spellData.summonerSpellMap) {
            pool = Object.keys(spellData.summonerSpellMap).map(id => parseInt(id, 10));
        }
        if (pool.length === 0) return null;
        const deduped = Array.from(new Set(pool));
        return deduped.filter(id => !disabled.includes(id));
    }, [champSelect?.summonerSpells]);

    const filteredSpells = useMemo(() => {
        // Remove duplicates by id and apply allowed filter if present
        const unique = spells.reduce((acc: Record<number, any>, spell) => {
            if (!acc[spell.id]) acc[spell.id] = spell;
            return acc;
        }, {});
        const list = Object.values(unique) as any[];
        if (!allowedSpellIds || allowedSpellIds.length === 0) return list;
        return list.filter((s: any) => allowedSpellIds.includes(s.id));
    }, [spells, allowedSpellIds]);

    const perkSlotMap = useMemo(() => {
        const map: { [id: number]: { styleId: number; slot: number } } = {};
        perkStyles.forEach((style: any) => {
            style.slots?.forEach((slot: any, idx: number) => {
                slot.perks?.forEach((perk: any) => {
                    // Perks can be either IDs (numbers) or objects with id property
                    const perkId = typeof perk === 'number' ? perk : perk?.id;
                    if (perkId) {
                        map[perkId] = { styleId: style.id, slot: idx };
                    }
                });
            });
        });
        return map;
    }, [perkStyles]);

    const normalizeRuneIcon = (rawPath: string | undefined, id?: number) => {
        const cdragonBase = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';

        // 1. Try to use the ID map first if available
        if (id && runeIconMap[id]) {
            const mappedPath = runeIconMap[id];
            // Recursively normalize the mapped path (but don't pass ID again to avoid infinite loop if map points to self)
            return normalizeRuneIcon(mappedPath);
        }

        // 2. If no raw path and no map entry, try fallback by ID
        if (!rawPath || rawPath.trim().length === 0) {
            if (id) {
                return `${cdragonBase}v1/perk-icons/${id}.png`;
            }
            return '';
        }

        // 3. If it's already a full URL, return it (encoded)
        if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
            try {
                return encodeURI(rawPath);
            } catch (e) {
                return rawPath;
            }
        }

        // 4. Clean up the path
        let cleaned = rawPath.replace(/^\/+/, ''); // Remove leading slashes

        // Remove common prefixes that might be in the LCU data
        const prefixesToRemove = [
            'lol-game-data/assets/',
            'assets/',
            'plugins/rcp-be-lol-game-data/global/default/'
        ];

        for (const prefix of prefixesToRemove) {
            if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
                cleaned = cleaned.substring(prefix.length);
            }
        }

        // 5. Ensure it starts with v1/ if it looks like a standard icon path
        // Most perk icons are in v1/perk-icons/ or v1/perk-images/
        if (!cleaned.startsWith('v1/')) {
            cleaned = `v1/${cleaned}`;
        }

        // 6. Construct final URL
        try {
            return encodeURI(`${cdragonBase}${cleaned}`);
        } catch (e) {
            return `${cdragonBase}${cleaned}`;
        }
    };

    const safeImageUri = (uri?: string | null) => {
        if (!uri || typeof uri !== 'string') return null;
        if (uri.trim() === '') return null;
        return encodeURI(uri);
    };

    const getRuneIconUri = (perk: any) => {
        const perkId = typeof perk === 'number' ? perk : perk?.id;
        const iconPath = (perk as any)?.iconPath || (perk as any)?.icon;
        const uri = normalizeRuneIcon(iconPath, perkId);
        if (__DEV__ && (!uri || failedRuneImages.has(uri))) {
            console.warn('[RuneIcon] Missing/failing icon', { perkId, iconPath, uri });
        }
        return uri;
    };

    const initRuneBuilder = useCallback(() => {
        if (!perkStyles.length) return;
        const defaultPrimary = activeRunePage?.primaryStyleId || perkStyles[0].id;
        const fallbackSub = perkStyles.find((s: any) => s.id !== defaultPrimary)?.id || perkStyles[0].id;
        const defaultSub = activeRunePage?.subStyleId && activeRunePage.subStyleId !== defaultPrimary ? activeRunePage.subStyleId : fallbackSub;
        setPrimaryStyleId(defaultPrimary);
        setSubStyleId(defaultSub);

        const defaultShards = activeRunePage?.selectedPerkIds?.slice(-3) || [5008, 5008, 5002];
        setStatShards(defaultShards);

        const activePerks = activeRunePage?.selectedPerkIds || [];
        const primaryPicks: { [slot: number]: number | null } = {};
        const secondaryPicks: number[] = [];

        activePerks.forEach((perkId: number) => {
            const slotInfo = perkSlotMap[perkId];
            if (!slotInfo) return;
            if (slotInfo.styleId === defaultPrimary) {
                if (slotInfo.slot === 0) setKeystoneId(perkId);
                else primaryPicks[slotInfo.slot] = perkId;
            } else if (slotInfo.styleId === defaultSub && slotInfo.slot > 0 && secondaryPicks.length < 2) {
                secondaryPicks.push(perkId);
            }
        });

        const primaryStyle = perkStyles.find((s: any) => s.id === defaultPrimary);
        const subStyle = perkStyles.find((s: any) => s.id === defaultSub);

        // Helper to get perk ID (handles both number IDs and objects)
        const getPerkId = (perk: any) => typeof perk === 'number' ? perk : perk?.id;

        if (!keystoneId && primaryStyle) {
            const firstPerk = primaryStyle.slots?.[0]?.perks?.[0];
            setKeystoneId(firstPerk ? getPerkId(firstPerk) : null);
        }
        setPrimaryPerks({
            1: primaryPicks[1] || (primaryStyle?.slots?.[1]?.perks?.[0] ? getPerkId(primaryStyle.slots[1].perks[0]) : null),
            2: primaryPicks[2] || (primaryStyle?.slots?.[2]?.perks?.[0] ? getPerkId(primaryStyle.slots[2].perks[0]) : null),
            3: primaryPicks[3] || (primaryStyle?.slots?.[3]?.perks?.[0] ? getPerkId(primaryStyle.slots[3].perks[0]) : null),
        });
        setSecondaryPerks(secondaryPicks.length ? secondaryPicks.slice(0, 2) : (subStyle ? [
            subStyle.slots?.[1]?.perks?.[0] ? getPerkId(subStyle.slots[1].perks[0]) : null,
            subStyle.slots?.[2]?.perks?.[0] ? getPerkId(subStyle.slots[2].perks[0]) : null
        ].filter((id): id is number => id !== null) : []));
        setRunePageName(`My ${primaryStyle?.name || 'Rune'} Page`);
    }, [activeRunePage, perkStyles, perkSlotMap, keystoneId]);

    const openRuneBuilder = () => {
        if (!perkStyles.length) {
            if (onError) onError('Runes are still loading, please wait a moment.');
            return;
        }
        initRuneBuilder();
        setShowRuneBuilder(true);
    };

    const toggleSecondaryPerk = (perkId: number, slot: number) => {
        const slotInfo = perkSlotMap[perkId] || { slot };
        const filtered = secondaryPerks.filter((id) => (perkSlotMap[id]?.slot ?? slot) !== slotInfo.slot);
        const already = secondaryPerks.includes(perkId);
        const next = already ? filtered : [...filtered, perkId].slice(0, 2);
        setSecondaryPerks(next);
    };

    const handleCreateRunePage = async () => {
        if (!primaryStyleId || !subStyleId || !keystoneId || !primaryPerks[1] || !primaryPerks[2] || !primaryPerks[3] || secondaryPerks.length < 2) {
            if (onError) onError('Please complete your rune selections.');
            return;
        }
        const payload = {
            name: runePageName.trim() || 'Custom Page',
            primaryStyleId,
            subStyleId,
            selectedPerkIds: [
                keystoneId,
                primaryPerks[1],
                primaryPerks[2],
                primaryPerks[3],
                secondaryPerks[0],
                secondaryPerks[1],
                ...(statShards || [5008, 5008, 5002]),
            ],
            current: true,
        };
        try {
            const res = await lcuBridge.request('/lol-perks/v1/pages', 'POST', payload);
            if (res.status >= 400) throw new Error(res.content?.message || 'Failed to create rune page');
            const runesResult = await lcuBridge.request('/lol-perks/v1/pages');
            if (runesResult.status === 200) setRunes(runesResult.content);
            setShowRuneBuilder(false);
            if (onSuccess) onSuccess('Rune page created');
        } catch (e: any) {
            console.error('Failed to create rune page:', e);
            if (onError) onError(e.message || 'Failed to create rune page');
        }
    };

    const handleSpellSelect = async (spellId: number) => {
        try {
            const first = pickingFirstSpell ? spellId : localPlayer?.spell1Id;
            const second = !pickingFirstSpell ? spellId : localPlayer?.spell2Id;
            await lcuBridge.request('/lol-champ-select/v1/session/my-selection', 'PATCH', { spell1Id: first, spell2Id: second });
            setShowSpellPicker(false);
        } catch (error) {
            console.error('Failed to select spell:', error);
        }
    };

    const handleSkinSelect = async (skinId: number) => {
        try {
            await lcuBridge.request('/lol-champ-select/v1/session/my-selection', 'PATCH', { selectedSkinId: skinId });
            setShowSkinPicker(false);
        } catch (error) {
            console.error('Failed to select skin:', error);
        }
    };

    const handleRunePageSelect = async (pageId: number) => {
        try {
            await lcuBridge.request('/lol-perks/v1/currentpage', 'PUT', pageId);
            setShowRunePicker(false);
        } catch (error) {
            console.error('Failed to select rune page:', error);
        }
    };

    const openSpellPicker = (isFirst: boolean) => {
        setPickingFirstSpell(isFirst);
        setShowSpellPicker(true);
    };

    const handleReroll = async () => {
        try {
            await lcuBridge.request('/lol-aram/v1/reroll', 'POST');
        } catch (error) {
            console.error('Failed to reroll:', error);
        }
    };

    const handleSwap = async (championId: number) => {
        // Validate inputs
        if (!championId || championId <= 0) {
            const errorMsg = 'Invalid champion ID';
            console.error(errorMsg);
            if (onError) onError(errorMsg);
            return;
        }

        // Check if already swapping
        if (swappingChampionId !== null) {
            console.log('Swap already in progress');
            return;
        }

        // Get champion name for messages
        const championName = championMap[championId]?.name || 'Champion';

        setSwappingChampionId(championId);

        try {
            console.log(`[ChampSelect] Attempting to swap with champion ${championId} (${championName})`);

            const result = await lcuBridge.request(`/lol-champ-select/v1/session/bench/swap/${championId}`, 'POST');

            if (result.status === 200 || result.status === 204) {
                console.log(`[ChampSelect] Successfully swapped with ${championName}`);

                // Show success message
                if (onSuccess) {
                    onSuccess(`Swapped to ${championName}`);
                }

                // Refresh champ select data after a short delay to allow server to update
                setTimeout(async () => {
                    try {
                        const refreshResult = await lcuBridge.request('/lol-champ-select/v1/session');
                        if (refreshResult.status === 200 && refreshResult.content) {
                            // The parent component will update champSelect via the observer
                            // We just need to reload skins for the new champion
                            const updatedLocalPlayer = refreshResult.content.myTeam?.find(
                                (m: any) => m.cellId === refreshResult.content.localPlayerCellId
                            );
                            if (updatedLocalPlayer?.championId && updatedLocalPlayer.championId > 0) {
                                loadSkins(updatedLocalPlayer.championId);
                            }
                        }
                    } catch (refreshError) {
                        console.error('Failed to refresh champ select after swap:', refreshError);
                    }
                }, 500);
            } else {
                throw new Error(`Swap failed with status ${result.status}`);
            }
        } catch (error: any) {
            console.error('Failed to swap:', error);
            const errorMsg = error.message || `Failed to swap to ${championName}. Please try again.`;
            if (onError) {
                onError(errorMsg);
            }
        } finally {
            setSwappingChampionId(null);
        }
    };

    const handleChampionSelect = (championId: number) => {
        setConfirmModal({ visible: true, championId, action: selectionMode });
    };

    const confirmChampionAction = () => {
        if (!confirmModal.championId) {
            setConfirmModal({ visible: false, championId: null, action: selectionMode });
            return;
        }
        if (confirmModal.action === 'ban') {
            onBan(confirmModal.championId);
        } else {
            onPick(confirmModal.championId);
        }
        setConfirmModal({ visible: false, championId: null, action: selectionMode });
    };

    // Enhance team members with champion data
    const enhancedMyTeam = useMemo(() => {
        return myTeam.map((m: any) => ({
            ...m,
            championName: championMap[m.championId]?.key || 'Unknown'
        }));
    }, [myTeam, championMap]);

    const enhancedTheirTeam = useMemo(() => {
        return theirTeam.map((m: any) => ({
            ...m,
            championName: championMap[m.championId]?.key || 'Unknown'
        }));
    }, [theirTeam, championMap]);

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={styles.loadingText}>Loading Champion Select...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.timerText}>{timeLeft > 0 ? timeLeft : '--'}</Text>
                    <Text style={styles.phaseText}>{currentAction?.type?.toLowerCase() === 'ban' ? 'Ban Phase' : 'Pick Phase'}</Text>
                </View>

                <Tab
                    value={index}
                    onChange={(e) => setIndex(e)}
                    indicatorStyle={{ backgroundColor: '#4f46e5', height: 3 }}
                    variant="primary"
                >
                    <Tab.Item title="Champion" titleStyle={styles.tabTitle} containerStyle={styles.tabItem} />
                    <Tab.Item title="Loadout" titleStyle={styles.tabTitle} containerStyle={styles.tabItem} />
                    {isARAM && <Tab.Item title="ARAM" titleStyle={styles.tabTitle} containerStyle={styles.tabItem} />}
                </Tab>

                <TabView value={index} onChange={setIndex} animationType="spring">
                    {/* Champion Tab */}
                    <TabView.Item style={styles.tabContent}>
                        <View style={styles.championTabContent}>
                            <View style={styles.teamViewContainer}>
                                <TeamView
                                    myTeam={enhancedMyTeam}
                                    theirTeam={enhancedTheirTeam}
                                    bans={[]}
                                    version={ddragonVersion}
                                />
                            </View>

                            {!isARAM && (
                                <>
                                    <View style={styles.pickModeRow}>
                                        <Text style={styles.sectionLabel}>
                                            {currentAction?.type?.toLowerCase() === 'ban' ? 'Ban Phase' : 'Pick Phase'}
                                        </Text>
                                    </View>
                                    <View style={styles.gridContainer}>
                                        <ChampionGrid
                                            champions={champions}
                                            onSelect={handleChampionSelect}
                                            version={ddragonVersion}
                                        />
                                    </View>
                                </>
                            )}

                            {isARAM && (
                                <ScrollView style={styles.aramScrollWrapper}>
                                    <View style={styles.aramMessageContainer}>
                                        <Text style={styles.aramMessage}>ARAM: Random Champion Assigned</Text>
                                        <Text style={styles.aramSubMessage}>Tap a bench champion below to swap</Text>
                                    </View>

                                    {champSelect?.benchChampionIds && champSelect.benchChampionIds.length > 0 && (
                                        <>
                                            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Available to Swap</Text>
                                            <View style={styles.benchGrid}>
                                                {champSelect.benchChampionIds.map((id: number) => {
                                                    const isSwapping = swappingChampionId === id;
                                                    const champion = championMap[id];
                                                    const championName = champion?.name || 'Unknown';

                                                    return (
                                                        <TouchableOpacity
                                                            key={`bench-${id}`}
                                                            onPress={() => handleSwap(id)}
                                                            style={[
                                                                styles.benchItem,
                                                                isSwapping && styles.benchItemSwapping
                                                            ]}
                                                            disabled={isSwapping || swappingChampionId !== null}
                                                        >
                                                            {isSwapping ? (
                                                                <View style={styles.benchLoadingContainer}>
                                                                    <ActivityIndicator size="small" color="#4f46e5" />
                                                                </View>
                                                            ) : (
                                                                <>
                                                                    {safeImageUri(champion?.key ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champion?.key}.png` : null) ? (
                                                                        <Image
                                                                            source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champion?.key}.png` }}
                                                                            style={styles.benchImage}
                                                                        />
                                                                    ) : (
                                                                        <View style={[styles.benchImage, styles.benchPlaceholder]} />
                                                                    )}
                                                                    <View style={styles.benchOverlay}>
                                                                        <Text style={styles.benchSwapText}>SWAP</Text>
                                                                    </View>
                                                                </>
                                                            )}
                                                            <Text style={styles.benchChampionName} numberOfLines={1}>
                                                                {championName}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </>
                                    )}
                                </ScrollView>
                            )}
                        </View>
                    </TabView.Item>

                    {/* Loadout Tab */}
                    <TabView.Item style={styles.tabContent}>
                        <ScrollView>
                            <Text style={styles.sectionTitle}>Runes</Text>
                            <TouchableOpacity style={styles.selectorButton} onPress={() => setShowRunePicker(true)}>
                                <Text style={styles.selectorButtonText}>
                                    {runes.find(r => r.isActive)?.name || 'Select Runes'}
                                </Text>
                            </TouchableOpacity>
                            <Button
                                title="Create Custom Rune Page"
                                type="outline"
                                onPress={openRuneBuilder}
                                buttonStyle={styles.secondaryButton}
                                titleStyle={styles.secondaryButtonTitle}
                                containerStyle={styles.secondaryButtonContainer}
                            />

                            <Text style={styles.sectionTitle}>Spells</Text>
                            <View style={styles.spellsContainer}>
                                <TouchableOpacity style={styles.spellButton} onPress={() => openSpellPicker(true)}>
                                    <Image
                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(localPlayer?.spell1Id)}.png` }}
                                        style={styles.spellIcon}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.spellButton} onPress={() => openSpellPicker(false)}>
                                    <Image
                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(localPlayer?.spell2Id)}.png` }}
                                        style={styles.spellIcon}
                                    />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.sectionTitle}>Skins</Text>
                            <TouchableOpacity style={styles.selectorButton} onPress={() => setShowSkinPicker(true)}>
                                <Text style={styles.selectorButtonText}>
                                    {skins.find(s => s.id === localPlayer?.selectedSkinId)?.name || 'Select Skin'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </TabView.Item>



                    {/* ARAM Tab */}
                    {isARAM && (
                        <TabView.Item style={styles.tabContent}>
                            <ScrollView>
                                <View style={styles.rerollContainer}>
                                    <Text style={styles.rerollText}>Rerolls: {rerollState?.numberOfRolls}/{rerollState?.maxRolls}</Text>
                                    <Button
                                        title="Reroll"
                                        onPress={handleReroll}
                                        disabled={rerollState?.numberOfRolls === 0}
                                        buttonStyle={styles.rerollButton}
                                    />
                                </View>

                                <Text style={styles.sectionTitle}>Bench</Text>
                                {!champSelect?.benchChampionIds || champSelect.benchChampionIds.length === 0 ? (
                                    <View style={styles.emptyBenchContainer}>
                                        <Text style={styles.emptyBenchText}>No champions available on bench</Text>
                                        <Text style={styles.emptyBenchSubText}>Reroll to get more champions</Text>
                                    </View>
                                ) : (
                                    <View style={styles.benchGrid}>
                                        {champSelect.benchChampionIds.map((id: number) => {
                                            const isSwapping = swappingChampionId === id;
                                            const champion = championMap[id];
                                            const championName = champion?.name || 'Unknown';

                                            return (
                                                <TouchableOpacity
                                                    key={id}
                                                    onPress={() => handleSwap(id)}
                                                    style={[
                                                        styles.benchItem,
                                                        isSwapping && styles.benchItemSwapping
                                                    ]}
                                                    disabled={isSwapping || swappingChampionId !== null}
                                                >
                                                    {isSwapping ? (
                                                        <View style={styles.benchLoadingContainer}>
                                                            <ActivityIndicator size="small" color="#4f46e5" />
                                                        </View>
                                                    ) : (
                                                        <>
                                                            <Image
                                                                source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${champion?.key}.png` }}
                                                                style={styles.benchImage}
                                                            />
                                                            <View style={styles.benchOverlay}>
                                                                <Text style={styles.benchSwapText}>SWAP</Text>
                                                            </View>
                                                        </>
                                                    )}
                                                    <Text style={styles.benchChampionName} numberOfLines={1}>
                                                        {championName}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </ScrollView>
                        </TabView.Item>
                    )}
                </TabView>

                {/* Pickers */}
                <SpellPicker
                    visible={showSpellPicker}
                    onSelect={handleSpellSelect}
                    onClose={() => setShowSpellPicker(false)}
                    spells={filteredSpells}
                    allowedSpellIds={allowedSpellIds}
                    currentSpellId={pickingFirstSpell ? localPlayer?.spell1Id : localPlayer?.spell2Id}
                />
                <SkinPicker
                    visible={showSkinPicker}
                    onSelect={handleSkinSelect}
                    onClose={() => setShowSkinPicker(false)}
                    skins={skins}
                    currentSkinId={localPlayer?.selectedSkinId}
                />
                <RunePicker
                    visible={showRunePicker}
                    onSelect={handleRunePageSelect}
                    onClose={() => setShowRunePicker(false)}
                    pages={runes}
                    currentPageId={runes.find(r => r.isActive)?.id}
                />

                {/* Confirm pick/ban */}
                <Modal
                    visible={confirmModal.visible}
                    animationType="fade"
                    transparent
                    onRequestClose={() => setConfirmModal({ visible: false, championId: null, action: selectionMode })}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle}>
                                {confirmModal.action === 'ban' ? 'Confirm Ban' : 'Confirm Pick'}
                            </Text>
                            <Text style={styles.modalBody}>
                                Are you sure you want to {confirmModal.action} "{championMap[confirmModal.championId || 0]?.name || 'this champion'}"?
                            </Text>
                            <View style={styles.modalActions}>
                                <Button
                                    title="Cancel"
                                    type="outline"
                                    onPress={() => setConfirmModal({ visible: false, championId: null, action: selectionMode })}
                                    buttonStyle={styles.modalCancel}
                                    titleStyle={styles.modalCancelText}
                                    containerStyle={styles.modalActionContainer}
                                />
                                <Button
                                    title="Yes"
                                    onPress={confirmChampionAction}
                                    buttonStyle={styles.modalConfirm}
                                    containerStyle={styles.modalActionContainer}
                                />
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Rune builder */}
                <Modal
                    visible={showRuneBuilder}
                    animationType="slide"
                    transparent
                    onRequestClose={() => setShowRuneBuilder(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalCard, { maxHeight: '90%', width: '95%', padding: 0, overflow: 'hidden' }]}>
                            {/* Sticky Header */}
                            <View style={styles.runeBuilderHeader}>
                                <View>
                                    <Text style={styles.modalTitle}>Create Rune Page</Text>
                                    <Text style={styles.modalSubtitle}>Customize your playstyle</Text>
                                </View>
                                <View style={styles.headerActions}>
                                    <Button
                                        title="Cancel"
                                        type="clear"
                                        onPress={() => setShowRuneBuilder(false)}
                                        titleStyle={{ color: '#9ca3af' }}
                                    />
                                    <Button
                                        title="Save Page"
                                        onPress={handleCreateRunePage}
                                        buttonStyle={styles.saveButton}
                                        icon={{ name: 'save', type: 'font-awesome', color: 'white', size: 14 }}
                                    />
                                </View>
                            </View>

                            <ScrollView style={styles.runeBuilderContent} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                                <TextInput
                                    value={runePageName}
                                    onChangeText={setRunePageName}
                                    placeholder="Rune Page Name"
                                    placeholderTextColor="#666"
                                    style={styles.runeNameInput}
                                />

                                <View style={styles.runeSection}>
                                    <Text style={styles.sectionLabel}>Primary Style</Text>
                                    <View style={styles.styleRow}>
                                        {perkStyles.map((style: any, idx: number) => (
                                            <TouchableOpacity
                                                key={`style-${style.id || idx}`}
                                                style={[
                                                    styles.styleChip,
                                                    primaryStyleId === style.id && styles.styleChipActive
                                                ]}
                                                onPress={() => {
                                                    setPrimaryStyleId(style.id);
                                                    const getPerkId = (perk: any) => typeof perk === 'number' ? perk : perk?.id;
                                                    setKeystoneId(style.slots?.[0]?.perks?.[0] ? getPerkId(style.slots[0].perks[0]) : null);
                                                    setPrimaryPerks({
                                                        1: style.slots?.[1]?.perks?.[0] ? getPerkId(style.slots[1].perks[0]) : null,
                                                        2: style.slots?.[2]?.perks?.[0] ? getPerkId(style.slots[2].perks[0]) : null,
                                                        3: style.slots?.[3]?.perks?.[0] ? getPerkId(style.slots[3].perks[0]) : null,
                                                    });
                                                }}
                                            >
                                                {/* Ideally show style icon here too */}
                                                <Text style={[styles.styleChipText, primaryStyleId === style.id && styles.styleChipTextActive]}>{style.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                {primaryStyleId && (
                                    <View style={styles.runeSection}>
                                        <View style={styles.runeRowHeader}>
                                            <Text style={styles.sectionLabel}>Keystone</Text>
                                            <View style={styles.divider} />
                                        </View>
                                        <View style={styles.perkRow}>
                                            {(perkStyles.find((s: any) => s.id === primaryStyleId)?.slots?.[0]?.perks || [])
                                                .filter(Boolean)
                                                .map((perk: any, perkIdx: number) => {
                                                    const perkId = typeof perk === 'number' ? perk : perk?.id;
                                                    const perkName = typeof perk === 'number' ? `Perk ${perk}` : perk?.name || `Perk ${perkId}`;
                                                    const iconUri = safeImageUri(getRuneIconUri(perk));
                                                    const hasFailed = iconUri ? failedRuneImages.has(iconUri) : true;
                                                    const isSelected = keystoneId === perkId;

                                                    return (
                                                        <TouchableOpacity
                                                            key={`keystone-${perkId ?? `idx-${perkIdx}`}`}
                                                            style={[
                                                                styles.keystoneCard,
                                                                isSelected && styles.keystoneCardActive
                                                            ]}
                                                            onPress={() => setKeystoneId(perkId)}
                                                        >
                                                            {iconUri && !hasFailed ? (
                                                                <Image
                                                                    source={{ uri: iconUri }}
                                                                    style={[styles.keystoneIcon, !isSelected && { opacity: 0.5 }]}
                                                                    onError={(e) => {
                                                                        if (__DEV__) console.warn('[RuneIcon] Failed to load keystone image:', iconUri, e.nativeEvent.error);
                                                                        setFailedRuneImages(prev => new Set(prev).add(iconUri));
                                                                    }}
                                                                />
                                                            ) : (
                                                                <View style={[styles.keystoneIcon, styles.benchPlaceholder]} />
                                                            )}
                                                            {isSelected && <Text style={styles.perkNameActive} numberOfLines={1}>{perkName}</Text>}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                        </View>

                                        {[1, 2, 3].map((slotIdx) => (
                                            <View key={slotIdx} style={styles.slotContainer}>
                                                <View style={styles.perkRow}>
                                                    {(perkStyles.find((s: any) => s.id === primaryStyleId)?.slots?.[slotIdx]?.perks || [])
                                                        .filter(Boolean)
                                                        .map((perk: any, perkIdx: number) => {
                                                            const perkId = typeof perk === 'number' ? perk : perk?.id;
                                                            const perkName = typeof perk === 'number' ? `Perk ${perk}` : perk?.name || `Perk ${perkId}`;
                                                            const iconUri = safeImageUri(getRuneIconUri(perk));
                                                            const hasFailed = iconUri ? failedRuneImages.has(iconUri) : true;
                                                            const isSelected = primaryPerks[slotIdx] === perkId;

                                                            return (
                                                                <TouchableOpacity
                                                                    key={`primary-${slotIdx}-${perkId ?? `idx-${perkIdx}`}`}
                                                                    style={[
                                                                        styles.perkCard,
                                                                        isSelected && styles.perkCardActive
                                                                    ]}
                                                                    onPress={() => setPrimaryPerks(prev => ({ ...prev, [slotIdx]: perkId }))}
                                                                >
                                                                    {iconUri && !hasFailed ? (
                                                                        <Image
                                                                            source={{ uri: iconUri }}
                                                                            style={[styles.perkIcon, !isSelected && { opacity: 0.4 }]}
                                                                            onError={(e) => {
                                                                                if (__DEV__) console.warn('[RuneIcon] Failed to load primary slot image:', iconUri, e.nativeEvent.error);
                                                                                setFailedRuneImages(prev => new Set(prev).add(iconUri));
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <View style={[styles.perkIcon, styles.benchPlaceholder]} />
                                                                    )}
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.runeSection}>
                                    <Text style={styles.sectionLabel}>Secondary Style</Text>
                                    <View style={styles.styleRow}>
                                        {perkStyles.filter((s: any) => s.id !== primaryStyleId).map((style: any, idx: number) => (
                                            <TouchableOpacity
                                                key={`sub-${style.id || idx}`}
                                                style={[
                                                    styles.styleChip,
                                                    subStyleId === style.id && styles.styleChipActive
                                                ]}
                                                onPress={() => {
                                                    setSubStyleId(style.id);
                                                    setSecondaryPerks([]);
                                                }}
                                            >
                                                <Text style={[styles.styleChipText, subStyleId === style.id && styles.styleChipTextActive]}>{style.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {subStyleId && (
                                        <View style={styles.secondaryContainer}>
                                            {perkStyles.find((s: any) => s.id === subStyleId)?.slots
                                                ?.filter((_: any, idx: number) => idx > 0)
                                                .map((slot: any, idx: number) => (
                                                    <View key={`secondary-slot-${idx}`} style={styles.slotContainer}>
                                                        <View style={styles.perkRow}>
                                                            {(slot.perks || []).filter(Boolean).map((perk: any, perkIdx: number) => {
                                                                const perkId = typeof perk === 'number' ? perk : perk?.id;
                                                                const perkName = typeof perk === 'number' ? `Perk ${perk}` : perk?.name || `Perk ${perkId}`;
                                                                const iconUri = safeImageUri(getRuneIconUri(perk));
                                                                const hasFailed = iconUri ? failedRuneImages.has(iconUri) : true;
                                                                const isSelected = secondaryPerks.includes(perkId);

                                                                return (
                                                                    <TouchableOpacity
                                                                        key={`secondary-${idx}-${perkId ?? `idx-${perkIdx}`}`}
                                                                        style={[
                                                                            styles.perkCard,
                                                                            isSelected && styles.perkCardActive
                                                                        ]}
                                                                        onPress={() => toggleSecondaryPerk(perkId, idx + 1)}
                                                                    >
                                                                        {iconUri && !hasFailed ? (
                                                                            <Image
                                                                                source={{ uri: iconUri }}
                                                                                style={[styles.perkIcon, !isSelected && { opacity: 0.4 }]}
                                                                                onError={(e) => {
                                                                                    if (__DEV__) console.warn('[RuneIcon] Failed to load secondary slot image:', iconUri, e.nativeEvent.error);
                                                                                    setFailedRuneImages(prev => new Set(prev).add(iconUri));
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            <View style={[styles.perkIcon, styles.benchPlaceholder]} />
                                                                        )}
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    </View>
                                                ))}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.runeSection}>
                                    <Text style={styles.sectionLabel}>Stat Shards</Text>
                                    <View style={styles.shardContainer}>
                                        <View style={styles.shardRow}>
                                            {[5008, 5005, 5007].map((id) => (
                                                <TouchableOpacity
                                                    key={id}
                                                    style={[styles.shardButton, statShards[0] === id && styles.shardButtonActive]}
                                                    onPress={() => setStatShards([id, statShards[1], statShards[2]])}
                                                >
                                                    <Text style={[styles.shardText, statShards[0] === id && styles.shardTextActive]}>
                                                        {id === 5008 ? 'Adaptive' : id === 5005 ? 'Atk Spd' : 'Haste'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View style={styles.shardRow}>
                                            {[5008, 5002, 5003].map((id) => (
                                                <TouchableOpacity
                                                    key={id}
                                                    style={[styles.shardButton, statShards[1] === id && styles.shardButtonActive]}
                                                    onPress={() => setStatShards([statShards[0], id, statShards[2]])}
                                                >
                                                    <Text style={[styles.shardText, statShards[1] === id && styles.shardTextActive]}>
                                                        {id === 5008 ? 'Adaptive' : id === 5002 ? 'Armor' : 'MR'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View style={styles.shardRow}>
                                            {[5001, 5002, 5003].map((id) => (
                                                <TouchableOpacity
                                                    key={id}
                                                    style={[styles.shardButton, statShards[2] === id && styles.shardButtonActive]}
                                                    onPress={() => setStatShards([statShards[0], statShards[1], id])}
                                                >
                                                    <Text style={[styles.shardText, statShards[2] === id && styles.shardTextActive]}>
                                                        {id === 5001 ? 'Health' : id === 5002 ? 'Armor' : 'MR'}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </View >
        </SafeAreaView>
    );
}

// Helper function to get spell key from ID (needs to be outside or memoized)
const getSpellName = (id: number) => {
    // This is a bit hacky, ideally we use the map we created.
    // For now, let's rely on the global or passed prop if possible, 
    // or just iterate the spells list if we had access to it here.
    // Since we are inside the component in the render, we can use the 'spells' state if we move this function inside or pass spells to it.
    // But for the image source in render, we can just find it.
    return (window as any).spellMap?.[id] || 'SummonerFlash'; // Fallback
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#ffffff',
        marginTop: 10,
    },
    header: {
        paddingTop: 40,
        paddingBottom: 10,
        alignItems: 'center',
        backgroundColor: '#171717',
    },
    timerText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    phaseText: {
        fontSize: 12,
        color: '#a3a3a3',
        textTransform: 'uppercase',
    },
    tabTitle: {
        fontSize: 14,
        color: '#ffffff',
    },
    tabItem: {
        backgroundColor: '#171717',
    },
    tabContent: {
        width: '100%',
        flex: 1,
    },
    championTabContent: {
        flexGrow: 1,
        paddingBottom: 24,
    },
    teamViewContainer: {
        paddingHorizontal: 10,
        paddingBottom: 10,
        backgroundColor: '#171717',
        borderBottomWidth: 1,
        borderBottomColor: '#262626',
        marginBottom: 12,
    },
    gridContainer: {
        flex: 1,
        padding: 10,
    },
    pickModeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    sectionLabel: {
        color: '#d1d5db',
        fontSize: 14,
        fontWeight: '600',
    },
    modeButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    modeButton: {
        borderColor: '#4f46e5',
    },
    modeButtonActive: {
        backgroundColor: '#4f46e5',
    },
    modeButtonTitle: {
        color: '#fff',
        fontSize: 12,
    },
    modeButtonContainer: {
        minWidth: 80,
    },
    aramScrollWrapper: {
        paddingHorizontal: 10,
    },
    sectionTitle: {
        color: '#737373',
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 20,
        marginBottom: 10,
        paddingHorizontal: 20,
    },
    runePage: {
        padding: 15,
        backgroundColor: '#171717',
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#262626',
        marginHorizontal: 20,
    },
    activeRunePage: {
        borderColor: '#4f46e5',
        backgroundColor: '#1e1b4b',
    },
    runePageName: {
        color: '#a3a3a3',
    },
    activeRunePageText: {
        color: '#ffffff',
        fontWeight: 'bold',
    },
    spellsContainer: {
        flexDirection: 'row',
        gap: 20,
        paddingHorizontal: 20,
    },
    selectorButton: {
        backgroundColor: '#171717',
        padding: 15,
        borderRadius: 8,
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: '#333',
    },
    secondaryButton: {
        borderColor: '#4f46e5',
        marginTop: 8,
    },
    secondaryButtonTitle: {
        color: '#c7d2fe',
    },
    secondaryButtonContainer: {
        marginHorizontal: 20,
        marginTop: 8,
    },
    selectorButtonText: {
        color: 'white',
        fontSize: 16,
    },
    spellButton: {
        width: 60,
        height: 60,
        backgroundColor: '#171717',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    spellIcon: {
        width: 50,
        height: 50,
        borderRadius: 6,
    },
    rerollContainer: {
        alignItems: 'center',
        marginBottom: 30,
        marginTop: 20,
    },
    rerollText: {
        color: '#ffffff',
        fontSize: 18,
        marginBottom: 10,
    },
    rerollButton: {
        backgroundColor: '#eab308',
        paddingHorizontal: 40,
        borderRadius: 20,
    },
    benchGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        paddingHorizontal: 20,
    },
    benchItem: {
        width: 80,
        backgroundColor: '#171717',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#262626',
        overflow: 'hidden',
        marginBottom: 8,
    },
    benchItemSwapping: {
        opacity: 0.6,
        borderColor: '#4f46e5',
    },
    benchImage: {
        width: 80,
        height: 80,
    },
    benchPlaceholder: {
        backgroundColor: '#1f2937',
    },
    benchOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    benchSwapText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    benchChampionName: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: '500',
        marginTop: 4,
        textAlign: 'center',
        paddingHorizontal: 4,
        maxWidth: 80,
    },
    benchLoadingContainer: {
        width: 80,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#171717',
    },
    emptyBenchContainer: {
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyBenchText: {
        color: '#737373',
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyBenchSubText: {
        color: '#525252',
        fontSize: 14,
        textAlign: 'center',
    },
    aramChampionTabContainer: {
        flex: 1,
        paddingHorizontal: 10,
    },
    aramMessageContainer: {
        paddingVertical: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    aramMessage: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    aramSubMessage: {
        color: '#888',
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalCard: {
        backgroundColor: '#111827',
        borderRadius: 12,
        padding: 16,
        width: '90%',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 10,
    },
    modalBody: {
        color: '#d1d5db',
        fontSize: 14,
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 10,
    },
    modalConfirm: {
        backgroundColor: '#4f46e5',
    },
    modalCancel: {
        borderColor: '#6b7280',
    },
    modalCancelText: {
        color: '#e5e7eb',
    },
    modalActionContainer: {
        minWidth: 100,
    },
    runeNameInput: {
        backgroundColor: '#0f172a',
        borderColor: '#1f2937',
        borderWidth: 1,
        borderRadius: 8,
        color: '#e5e7eb',
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
    },
    styleRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    styleChip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#0f172a',
    },
    styleChipActive: {
        borderColor: '#4f46e5',
        backgroundColor: '#1f2937',
    },
    styleChipText: {
        color: '#e5e7eb',
        fontSize: 12,
    },
    perkRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginVertical: 6,
    },
    perkCard: {
        width: 90,
        padding: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#1f2937',
        backgroundColor: '#0b1220',
        alignItems: 'center',
    },
    perkCardActive: {
        borderColor: '#4f46e5',
        backgroundColor: '#1e1b4b',
    },
    perkIcon: {
        width: 48,
        height: 48,
        marginBottom: 6,
    },
    perkName: {
        color: '#e5e7eb',
        fontSize: 11,
        textAlign: 'center',
    },
    shardRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginVertical: 6,
    },
    shardButtonContainer: {
        minWidth: 110,
    },
    // New Rune Builder Styles
    runeBuilderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
        backgroundColor: '#111827',
    },
    modalSubtitle: {
        color: '#9ca3af',
        fontSize: 12,
        marginTop: 2,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    saveButton: {
        backgroundColor: '#4f46e5',
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    runeBuilderContent: {
        flex: 1,
        backgroundColor: '#0b1220',
    },
    runeSection: {
        marginBottom: 24,
    },
    runeRowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: '#1f2937',
        marginLeft: 12,
    },
    keystoneCard: {
        width: 100,
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1f2937',
        backgroundColor: '#111827',
        marginRight: 12,
    },
    keystoneCardActive: {
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
    },
    keystoneIcon: {
        width: 64,
        height: 64,
        marginBottom: 8,
    },
    perkNameActive: {
        color: '#4f46e5',
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    styleChipTextActive: {
        color: '#4f46e5',
        fontWeight: '600',
    },
    secondaryContainer: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#111827',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#1f2937',
    },
    shardContainer: {
        flexDirection: 'column',
        gap: 8,
    },
    shardButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#1f2937',
        backgroundColor: '#111827',
        alignItems: 'center',
        marginRight: 8,
    },
    shardButtonActive: {
        borderColor: '#4f46e5',
        backgroundColor: '#4f46e5',
    },
    shardText: {
        color: '#9ca3af',
        fontSize: 12,
    },
    shardTextActive: {
        color: '#ffffff',
        fontWeight: '600',
    },
    slotContainer: {
        marginBottom: 12,
    },
});
