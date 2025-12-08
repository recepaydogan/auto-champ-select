import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Modal, ImageBackground, Dimensions, Vibration, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Tab, TabView } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from '../components/ChampionGrid';
import TeamView from '../components/TeamView';
import SpellPicker from '../components/SpellPicker';
import SkinPicker from '../components/SkinPicker';
import RunePicker from '../components/RunePicker';
import CustomModal from '../components/CustomModal';
import RuneBuilder from '../components/RuneBuilder';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../state/appStore';

interface ChampSelectScreenProps {
    champSelect: any;
    onPick: (championId: number) => void;
    onBan: (championId: number) => void;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
}

const mapBackgrounds: Record<number | 'default', any> = {
    10: require('../../static/backgrounds/bg-tt.jpg'),
    11: require('../../static/backgrounds/bg-sr.jpg'),
    12: require('../../static/backgrounds/bg-ha.jpg'),
    22: require('../../static/backgrounds/bg-tft.jpg'),
    default: require('../../static/magic-background.jpg'),
};

export default function ChampSelectScreen({ champSelect, onPick, onBan, onError, onSuccess }: ChampSelectScreenProps) {
    const [index, setIndex] = useState(0);
    const [champions, setChampions] = useState<any[]>([]);
    const [championMap, setChampionMap] = useState<{ [key: number]: any }>({});
    const [runes, setRunes] = useState<any[]>([]);
    const [perkStyles, setPerkStyles] = useState<any[]>([]);
    const [runeIconMap, setRuneIconMap] = useState<Record<number, string>>({});
    const [spells, setSpells] = useState<any[]>([]);
    const [pickableChampionIds, setPickableChampionIds] = useState<number[]>(
        () => Array.isArray(champSelect?.pickableChampionIds) ? champSelect.pickableChampionIds : []
    );
    const [loadingPickablePool, setLoadingPickablePool] = useState(false);
    const [loadingBench, setLoadingBench] = useState(false);
    const [ddragonVersion, setDdragonVersion] = useState('14.23.1');
    const [loadingResources, setLoadingResources] = useState(true);
    const spellMapRef = React.useRef<Record<number, string>>({});
    const [selectionMode, setSelectionMode] = useState<'pick' | 'ban' | 'planning'>('planning');
    const [confirmModal, setConfirmModal] = useState<{ visible: boolean; championId: number | null; action: 'pick' | 'ban' | 'planning' }>({ visible: false, championId: null, action: 'pick' });

    // Robust Timer Logic
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const phaseEndTimeRef = useRef<number>(0);

    useEffect(() => {
        // Calculate the absolute end time based on the server's "timeLeftInPhase" snapshot
        const serverTimeLeft = champSelect?.timer?.adjustedTimeLeftInPhase || 0;
        const now = Date.now();
        const estimatedEndTime = now + serverTimeLeft;

        // Only update our ref if the deviation is significant (>1s) to prevent jitter from network differences
        if (Math.abs(estimatedEndTime - phaseEndTimeRef.current) > 1000) {
            phaseEndTimeRef.current = estimatedEndTime;
        }

        // Immediate update
        const remaining = Math.max(0, Math.ceil((phaseEndTimeRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);

        // Tick loop
        const interval = setInterval(() => {
            const currentRemaining = Math.max(0, Math.ceil((phaseEndTimeRef.current - Date.now()) / 1000));
            setTimeLeft(currentRemaining);
        }, 100); // 100ms for responsiveness

        return () => clearInterval(interval);
    }, [champSelect?.timer?.adjustedTimeLeftInPhase, champSelect?.timer?.phase]);

    // Picker States
    const [showSpellPicker, setShowSpellPicker] = useState(false);
    const [pickingFirstSpell, setPickingFirstSpell] = useState(true);
    const [showSkinPicker, setShowSkinPicker] = useState(false);
    const [showRunePicker, setShowRunePicker] = useState(false);
    const [showRuneBuilder, setShowRuneBuilder] = useState(false);
    const [editingPageId, setEditingPageId] = useState<number | null>(null);
    const [tempPageData, setTempPageData] = useState<any>(null);
    const [skins, setSkins] = useState<any[]>([]);

    // Rune builder states
    const [runePageName, setRunePageName] = useState('My Rune Page');
    const [primaryStyleId, setPrimaryStyleId] = useState<number | null>(null);
    const [subStyleId, setSubStyleId] = useState<number | null>(null);
    const [keystoneId, setKeystoneId] = useState<number | null>(null);
    const [primaryPerks, setPrimaryPerks] = useState<{ [slot: number]: number | null }>({});
    const [secondaryPerks, setSecondaryPerks] = useState<number[]>([]);
    const [statShards, setStatShards] = useState<number[]>([5008, 5010, 5011]);
    const [benchChampionIds, setBenchChampionIds] = useState<number[]>([]);
    const [ownedPageCount, setOwnedPageCount] = useState<number>(2); // Default to 2

    // Swap loading state - track which champion is being swapped
    const [swappingChampionId, setSwappingChampionId] = useState<number | null>(null);
    const [tradeRequestingCellId, setTradeRequestingCellId] = useState<number | null>(null);
    const [hoveredChampionId, setHoveredChampionId] = useState<number | null>(null);
    const [lastIntentChampionId, setLastIntentChampionId] = useState<number | null>(null);
    const setSharedMapId = useAppStore(state => state.setMapId);
    const sharedMapId = useAppStore(state => state.mapId);

    // Track failed rune image loads for fallback handling
    const [failedRuneImages, setFailedRuneImages] = useState<Set<string>>(new Set());
    const [isGridOpen, setIsGridOpen] = useState(true);

    // Animation for blinking ban
    const blinkAnim = useRef(new Animated.Value(1)).current;
    const hoverBlinkAnim = useRef(new Animated.Value(1)).current;

    const lcuBridge = getLCUBridge();
    const localPlayerCellId = champSelect?.localPlayerCellId;
    const myTeam = champSelect?.myTeam || [];
    const theirTeam = champSelect?.theirTeam || [];
    const allyCellIds = useMemo(() => new Set((myTeam || []).map((m: any) => m?.cellId).filter((id: any) => typeof id === 'number')), [myTeam]);
    const enemyCellIds = useMemo(() => new Set((theirTeam || []).map((m: any) => m?.cellId).filter((id: any) => typeof id === 'number')), [theirTeam]);
    const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
    const phaseUpper = ((champSelect?.timer?.phase as string) || '').toUpperCase();
    const isIntentPhase = phaseUpper === 'PLANNING' || phaseUpper === 'BAN_PICK_INTENT';

    useEffect(() => {
        if (selectionMode === 'ban' && hoveredChampionId) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(blinkAnim, {
                        toValue: 0.4,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(blinkAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            blinkAnim.setValue(1);
        }
    }, [selectionMode, hoveredChampionId]);

    useEffect(() => {
        if (hoveredChampionId && (selectionMode === 'pick' || isIntentPhase)) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(hoverBlinkAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
                    Animated.timing(hoverBlinkAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
                ])
            ).start();
        } else {
            hoverBlinkAnim.setValue(1);
        }
    }, [hoveredChampionId, selectionMode, isIntentPhase]);

    const hasPickedChampion = !!(localPlayer?.championId && localPlayer.championId > 0);
    const effectiveHoveredChampionId = hoveredChampionId
        ?? ((isIntentPhase || selectionMode === 'pick') ? lastIntentChampionId : null)
        ?? (hasPickedChampion ? localPlayer?.championId : null)
        ?? null;
    const normalizedGameMode = (champSelect?.gameMode || '').toUpperCase();
    // Force isARAM to false if mapId is 11 (Summoner's Rift) to ensure bans are shown in Draft Pick
    const isSummonersRift = champSelect?.mapId === 11;
    const isARAM = !isSummonersRift && (normalizedGameMode === 'ARAM' || normalizedGameMode === 'KIWI' || champSelect?.benchEnabled || champSelect?.mapId === 12);
    const showBench = champSelect?.benchEnabled || normalizedGameMode === 'KIWI';

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

    // Log draft phase information to help identify intent/prep phase from Riot data
    useEffect(() => {
        const phase = champSelect?.timer?.phase;
        console.log('[ChampSelect] Phase Check:', phase, 'CurrentAction:', currentAction?.type);

        if (phaseUpper === 'PLANNING' || phaseUpper === 'BAN_PICK_INTENT') {
            setSelectionMode('planning');
            setIsGridOpen(true);
            return;
        }

        if (currentAction?.type) {
            const newMode = currentAction.type.toLowerCase() === 'ban' ? 'ban' : 'pick';
            setSelectionMode(newMode);

            if (newMode === 'ban') {
                // clear hover leaving intent; ban uses fresh hover
                setHoveredChampionId(null);
            } else if (newMode === 'pick') {
                // restore intent hover into pick if available
                if (lastIntentChampionId) {
                    setHoveredChampionId(lastIntentChampionId);
                }
            }
        } else {
            setSelectionMode('planning');
            setIsGridOpen(true);
            setHoveredChampionId(null);
        }
    }, [currentAction?.type, champSelect?.timer?.phase, phaseUpper, lastIntentChampionId]);


    // Track if we were in intent to restore hover later
    const wasIntentPhaseRef = useRef<boolean>(false);

    useEffect(() => {
        // Persist hovered champ from server intent data if present
        const intentId = (localPlayer as any)?.championPickIntent;
        if (isIntentPhase && typeof intentId === 'number' && intentId > 0) {
            if (lastIntentChampionId !== intentId) {
                setLastIntentChampionId(intentId);
            }
            if (!hoveredChampionId) {
                setHoveredChampionId(intentId);
            }
        }

        // When leaving intent, clear hover so grid isn't stuck highlighted
        if (!isIntentPhase && wasIntentPhaseRef.current) {
            setHoveredChampionId(null);
        }

        // If hovered gets banned, clear it
        if (hoveredChampionId && combinedBans.includes(hoveredChampionId)) {
            setHoveredChampionId(null);
        }

        // If in pick and nothing hovered, restore last intent hover
        if (!isIntentPhase && selectionMode === 'pick' && lastIntentChampionId && !hoveredChampionId) {
            setHoveredChampionId(lastIntentChampionId);
        }

        wasIntentPhaseRef.current = isIntentPhase;
    }, [isIntentPhase, localPlayer, lastIntentChampionId, hoveredChampionId, selectionMode]);

    // Restore intent hover when entering Pick phase if nothing is hovered
    // Restore intent hover when entering Pick phase if nothing is hovered
    useEffect(() => {
        if (selectionMode === 'pick' && !hoveredChampionId && lastIntentChampionId) {
            setHoveredChampionId(lastIntentChampionId);
        }
    }, [selectionMode, hoveredChampionId, lastIntentChampionId]);

    // Clear local hover once our action is locked/complete (prevents lingering blink after lock)
    useEffect(() => {
        if (hoveredChampionId === null) return;
        if (currentAction?.completed || hasPickedChampion) {
            setHoveredChampionId(null);
        }
    }, [currentAction?.completed, hasPickedChampion, hoveredChampionId]);

    const swapCooldownRef = React.useRef<Map<number, number>>(new Map());

    // Debug logging for bench data
    useEffect(() => {
        if (isARAM && champSelect) {
            console.log('[ChampSelect] ARAM Mode Detected');
            console.log('[ChampSelect] Bench Enabled:', champSelect.benchEnabled);
            console.log('[ChampSelect] Bench Champion IDs:', champSelect.benchChampionIds);
            console.log('[ChampSelect] Bench Count:', champSelect.benchChampionIds?.length || 0);
        }
    }, [isARAM, champSelect?.benchChampionIds]);

    const normalizeBenchPayload = useCallback((payload: any): number[] => {
        const ids: number[] = [];
        const addId = (champId: any) => {
            const parsed = typeof champId === 'number' ? champId : parseInt(champId, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            ids.push(parsed);
        };
        const tryArray = (arr?: any[]) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((entry: any) => {
                if (typeof entry === 'number' || typeof entry === 'string') {
                    addId(entry);
                } else if (entry && typeof entry === 'object') {
                    addId(entry.championId ?? entry.id ?? entry.championID);
                }
            });
        };

        if (!payload) return [];

        if (Array.isArray(payload)) {
            tryArray(payload);
        } else if (typeof payload === 'object') {
            tryArray(payload.benchChampionIds);
            tryArray(payload.benchChampions);
            tryArray(payload.champions);
            tryArray(payload.championIds);
        }

        return Array.from(new Set(ids));
    }, []);

    // Keep pickable champion IDs in sync (single fetch; avoid long polling)
    useEffect(() => {
        let cancelled = false;
        const inlinePickable = Array.isArray(champSelect?.pickableChampionIds)
            ? champSelect.pickableChampionIds.filter((id: any) => typeof id === 'number' && id > 0)
            : [];

        if (inlinePickable.length > 0) {
            setPickableChampionIds(Array.from(new Set(inlinePickable)));
            setLoadingPickablePool(false);
            return () => { cancelled = true; };
        } else {
            setPickableChampionIds([]);
        }

        const fetchOnce = async () => {
            setLoadingPickablePool(true);
            try {
                const result = await lcuBridge.request('/lol-champ-select/v1/pickable-champion-ids');
                if (!cancelled && result.status === 200 && Array.isArray(result.content)) {
                    const filtered = result.content.filter((id: any) => typeof id === 'number' && id > 0);
                    if (filtered.length > 0) {
                        setPickableChampionIds(Array.from(new Set(filtered)));
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    console.warn('[ChampSelect] Failed to fetch pickable champion ids', error);
                }
            } finally {
                if (!cancelled) setLoadingPickablePool(false);
            }
        };

        fetchOnce();
        return () => { cancelled = true; };
    }, [champSelect?.pickableChampionIds, lcuBridge]);

    // Keep bench champions in sync, pulling from dedicated bench endpoint when session payload omits them
    useEffect(() => {
        // No extra bench polling; rely on session updates
        setLoadingBench(false);
    }, []);

    const refreshRunes = useCallback(async () => {
        try {
            const pagesRes = await lcuBridge.request('/lol-perks/v1/pages');
            let pages = Array.isArray(pagesRes?.content) ? pagesRes.content : [];

            const currentRes = await lcuBridge.request('/lol-perks/v1/currentpage');
            const currentId = currentRes?.status === 200 ? (currentRes.content?.id ?? currentRes.content) : null;
            if (Array.isArray(pages) && currentId) {
                pages = pages.map((p: any) => ({ ...p, isActive: p.id === currentId }));
            }
            setRunes(pages);

            // Also refresh inventory count
            const invRes = await lcuBridge.request('/lol-perks/v1/inventory');
            if (invRes.status === 200 && invRes.content?.ownedPageCount) {
                setOwnedPageCount(invRes.content.ownedPageCount);
            }
        } catch (e) {
            console.warn('[ChampSelect] Failed to refresh runes', e);
        }
    }, [lcuBridge]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoadingResources(true);
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

            // 3. Fetch Runes (and current page)
            await refreshRunes();

            // 3a. Fetch rune icon map from CommunityDragon
            try {
                const perksJson = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json');
                if (perksJson.ok) {
                    const perksData = await perksJson.json();
                    const perkMap: Record<number, string> = {};
                    const normalizePathOnly = (path: string) => {
                        const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
                        let cleaned = path.replace(/^\/+/, '');
                        ['lol-game-data/assets/', 'assets/', 'plugins/rcp-be-lol-game-data/global/default/'].forEach(prefix => {
                            if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
                                cleaned = cleaned.substring(prefix.length);
                            }
                        });
                        if (!cleaned.toLowerCase().startsWith('v1/')) cleaned = `v1/${cleaned}`;
                        cleaned = cleaned.toLowerCase();
                        return encodeURI(`${base}${cleaned}`);
                    };
                    perksData.forEach((perk: any) => {
                        if (perk?.id && perk?.iconPath) {
                            perkMap[perk.id] = normalizePathOnly(perk.iconPath);
                        }
                    });
                    setRuneIconMap(perkMap);
                } else {
                    console.warn('[ChampSelect] Failed to fetch perks.json', perksJson.status);
                }
            } catch (e) {
                console.warn('[ChampSelect] Failed to load perks.json', e);
            }
            let loadedStyles: any[] = [];
            const stylesResult = await lcuBridge.request('/lol-perks/v1/styles');
            if (stylesResult.status === 200 && Array.isArray(stylesResult.content) && stylesResult.content.length > 0) {
                loadedStyles = stylesResult.content;
            } else {
                console.warn('[ChampSelect] Failed to load rune styles from LCU:', stylesResult.status);
            }

            if (!loadedStyles.length) {
                // Fallback to CommunityDragon perk styles so UI is not empty
                try {
                    const cdragonStylesRes = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perkstyles.json');
                    if (cdragonStylesRes.ok) {
                        const cdragonStyles = await cdragonStylesRes.json();
                        if (Array.isArray(cdragonStyles?.styles) && cdragonStyles.styles.length > 0) {
                            loadedStyles = cdragonStyles.styles;
                            console.log('[ChampSelect] Using CDragon perkstyles fallback');
                        }
                    }
                } catch (e) {
                    console.warn('[ChampSelect] Failed to fetch perkstyles fallback', e);
                }
            }

            setPerkStyles(loadedStyles);

            // 4. Fetch Spells
            const spellsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`);
            const spellsData = await spellsRes.json();
            const spellList = Object.values(spellsData.data).map((s: any) => ({
                id: parseInt(s.key),
                name: s.name,
                key: s.id,
                iconPath: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${s.id}.png`
            })).sort((a: any, b: any) => a.name.localeCompare(b.name));
            setSpells(spellList);

            // Helper to get spell name from ID for image URL
            spellMapRef.current = {};
            spellList.forEach((s: any) => spellMapRef.current[s.id] = s.key);

        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoadingResources(false);
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
                const champSkins = (skinsRes.content || []).filter((s: any) => s.championId === championId);
                const champKey = championMap[championId]?.key;

                const resolveSplash = (skin: any) => {
                    const skinNum = skin.id % 1000;

                    // 1) If LCU already gives a URL, use it
                    if (skin.splashPath && typeof skin.splashPath === 'string' && skin.splashPath.startsWith('http')) {
                        try { return encodeURI(skin.splashPath); } catch { return skin.splashPath; }
                    }

                    // 2) DDragon splash
                    if (champKey) {
                        return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champKey}_${skinNum}.jpg`;
                    }

                    // 3) DDragon loading fallback
                    if (champKey) {
                        return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champKey}_${skinNum}.jpg`;
                    }

                    return undefined;
                };

                let mapped = champSkins
                    .filter((s: any) => s.ownership?.owned || s.isBase || s.owned) // only owned
                    .map((s: any) => ({
                        id: s.id,
                        name: s.name || s.skinName || `Skin ${s.id % 1000}`,
                        owned: true,
                        splashPath: resolveSplash(s),
                    }));

                // If no owned skins were returned, fall back to base skin splash
                if (mapped.length === 0 && champKey) {
                    mapped = [{
                        id: championId * 1000,
                        name: `${champKey} (Base)`,
                        owned: true,
                        splashPath: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champKey}_0.jpg`,
                    }];
                }
                setSkins(mapped);
            }
        } catch (error) {
            console.error('Failed to load skins:', error);
        }
    };

    const activeRunePage = useMemo(() => runes.find((r: any) => r.isActive), [runes]);
    const editingRunePage = useMemo(() => {
        if (!editingPageId) return null;
        return runes.find((r: any) => r.id === editingPageId) || null;
    }, [editingPageId, runes]);

    const trades = champSelect?.trades || [];
    const incomingTrade = useMemo(() => trades.find((t: any) => t.state === 'RECEIVED'), [trades]);
    const incomingTradeMember = useMemo(() => {
        if (!incomingTrade) return null;
        return myTeam.find((m: any) => m.cellId === incomingTrade.cellId) || null;
    }, [incomingTrade, myTeam]);

    // Vibrate on incoming trade
    useEffect(() => {
        if (incomingTrade) {
            Vibration.vibrate();
        }
    }, [incomingTrade]);

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
        // Remove duplicates by id first
        const unique = spells.reduce((acc: Record<number, any>, spell) => {
            if (!acc[spell.id]) acc[spell.id] = spell;
            return acc;
        }, {});
        let list = Object.values(unique) as any[];

        // If server provides explicit allowed list, trust it
        if (allowedSpellIds && allowedSpellIds.length > 0) {
            list = list.filter((s: any) => allowedSpellIds.includes(s.id));
        } else {
            // Otherwise apply simple mode-based rules
            const mode = (champSelect?.gameMode || '').toUpperCase();
            const mapId = champSelect?.mapId;
            const containsBannedText = (s: any) => {
                const name = (s.name || '').toLowerCase();
                const key = (s.key || '').toLowerCase();
                return name.includes('placeholder') || name.includes('poro') || name.includes('snowball') || key.includes('snowball') || key.includes('poro');
            };

            // Summoner's Rift defaults (includes Smite/TP, excludes ARAM-only)
            const srAllowed = new Set([21, 3, 1, 4, 14, 7, 6, 12, 11]); // Barrier, Exhaust, Cleanse, Flash, Ignite, Heal, Ghost, Teleport, Smite
            // ARAM (Howling Abyss map 12): exclude Smite/Teleport; allow Snowball/Clarity
            if (mode === 'ARAM' || mapId === 12) {
                const aramAllow = new Set([1, 3, 4, 6, 7, 13, 21, 32, 14]); // Cleanse, Exhaust, Flash, Ghost, Heal, Clarity, Barrier, Snowball, Ignite
                list = list.filter((s: any) => aramAllow.has(s.id) && !containsBannedText(s));
            } else {
                // Summoner's Rift / default: only allow standard SR spells, no Snowball/Clarity/poro/placeholder/odd smite clones
                list = list.filter((s: any) => srAllowed.has(s.id) && !containsBannedText(s));
            }
        }

        return list;
    }, [spells, allowedSpellIds, champSelect?.gameMode, champSelect?.mapId]);

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
        // Prefer the pre-normalized map entry if available
        if (id && runeIconMap[id]) return runeIconMap[id];

        if (!rawPath || rawPath.trim().length === 0) return '';

        // Already a full URL
        if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
            try {
                return encodeURI(rawPath);
            } catch (e) {
                return rawPath;
            }
        }

        const cdragonBase = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';

        // Remove leading slashes and common prefixes
        let cleaned = rawPath.replace(/^\/+/, '');
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

        if (!cleaned.toLowerCase().startsWith('v1/')) cleaned = `v1/${cleaned}`;
        cleaned = cleaned.toLowerCase();

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
        const iconPath = (perk as any)?.iconPath || (perk as any)?.icon || (perkId ? runeIconMap[perkId] : undefined);
        const uri = normalizeRuneIcon(iconPath, perkId);
        if (__DEV__ && (!uri || failedRuneImages.has(uri))) {
            console.warn('[RuneIcon] Missing/failing icon', { perkId, iconPath, uri });
        }
        return uri;
    };

    const initRuneBuilder = useCallback((opts?: { preserveName?: boolean }) => {
        if (!perkStyles.length) return;
        const defaultPrimary = activeRunePage?.primaryStyleId || perkStyles[0].id;
        const fallbackSub = perkStyles.find((s: any) => s.id !== defaultPrimary)?.id || perkStyles[0].id;
        const defaultSub = activeRunePage?.subStyleId && activeRunePage.subStyleId !== defaultPrimary ? activeRunePage.subStyleId : fallbackSub;
        setPrimaryStyleId(defaultPrimary);
        setSubStyleId(defaultSub);

        const defaultShards = activeRunePage?.selectedPerkIds?.slice(-3) || [5008, 5010, 5011];
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

        if (!opts?.preserveName) {
            setRunePageName(activeRunePage?.name || `My ${primaryStyle?.name || 'Rune'} Page`);
        }
    }, [activeRunePage, perkStyles, perkSlotMap, keystoneId]);

    const getUniqueRuneName = useCallback(() => {
        const existing = new Set((runes || []).map((r: any) => r?.name).filter(Boolean));
        const base = 'Custom Page';
        let i = 1;
        let candidate = `${base} ${i}`;
        while (existing.has(candidate)) {
            i += 1;
            candidate = `${base} ${i}`;
        }
        return candidate;
    }, [runes]);

    const openRuneBuilder = (opts?: { edit?: boolean; name?: string }) => {
        if (!perkStyles.length) {
            if (onError) onError('Runes are still loading, please wait a moment.');
            return;
        }
        if (!runes.length) {
            refreshRunes();
        }
        const editExisting = opts?.edit !== false && activeRunePage;
        // Default: edit currently active page if present
        setEditingPageId(editExisting ? activeRunePage.id : null);
        if (editExisting && activeRunePage?.name) {
            setRunePageName(activeRunePage.name);
        } else {
            setRunePageName(opts?.name || getUniqueRuneName());
        }
        initRuneBuilder({ preserveName: true });
        setShowRuneBuilder(true);
    };

    const openNewRuneBuilder = () => {
        const newName = getUniqueRuneName();
        setEditingPageId(null);
        setTempPageData({ name: newName });
        setRunePageName(newName);
        initRuneBuilder({ preserveName: true });
        setShowRuneBuilder(true);
    };

    const handleRequestNewPage = () => {
        if (runes.length >= ownedPageCount) {
            if (onError) onError(`You have reached the maximum of ${ownedPageCount} rune pages.`);
            return;
        }
        openNewRuneBuilder();
    };

    const handleCreateRunePage = async (pageData?: any) => {
        // Use provided data or fallback to state
        const nameToUse = pageData?.name || runePageName;
        const primaryStyleToUse = pageData?.primaryStyleId ?? primaryStyleId;
        const subStyleToUse = pageData?.subStyleId ?? subStyleId;
        const perksToUse = pageData?.selectedPerkIds || [];

        // If using state (legacy/fallback), construct perks array
        let finalPerks = perksToUse;
        if (!pageData) {
            const sec = secondaryPerks.filter((id): id is number => typeof id === 'number');
            let shards = (statShards || []).filter((id): id is number => typeof id === 'number');
            // Ensure we always have 3 shards
            while (shards.length < 3) shards.push(5008);

            finalPerks = [
                keystoneId,
                primaryPerks[1],
                primaryPerks[2],
                primaryPerks[3],
                sec[0],
                sec[1],
                ...shards.slice(0, 3),
            ].filter(id => typeof id === 'number');
        }

        if (finalPerks.length < 6) { // Basic validation
            if (onError) onError('Please select all runes.');
            return;
        }

        const payload = {
            name: nameToUse.trim() || 'Custom Page',
            primaryStyleId: primaryStyleToUse,
            subStyleId: subStyleToUse,
            selectedPerkIds: finalPerks,
            current: true,
        };
        try {
            const endpoint = editingPageId ? `/lol-perks/v1/pages/${editingPageId}` : '/lol-perks/v1/pages';
            const method = editingPageId ? 'PUT' : 'POST';
            const res = await lcuBridge.request(endpoint, method as any, payload);
            if (res.status >= 400) throw new Error(res.content?.message || 'Failed to save rune page');

            // Activate the new/updated page in both client and our state
            const newPageId = res?.content?.id ?? editingPageId;
            if (newPageId) {
                await lcuBridge.request('/lol-perks/v1/currentpage', 'PUT', newPageId);
            }

            await refreshRunes();

            setShowRuneBuilder(false);
            setEditingPageId(null);
        } catch (e: any) {
            console.error('Failed to create rune page:', e, { payload });
            const msg = e?.message || 'Failed to create rune page';
            if (onError) onError(msg);
        }
    };

    const handleDeleteRunePage = async () => {
        const targetId = editingPageId || activeRunePage?.id;
        if (!targetId) {
            if (onError) onError('No rune page to delete.');
            return;
        }
        try {
            const res = await lcuBridge.request(`/lol-perks/v1/pages/${targetId}`, 'DELETE');
            if (res?.status && res.status >= 400) {
                throw new Error(res?.content?.message || 'Failed to delete rune page');
            }

            await refreshRunes();
            setShowRuneBuilder(false);
            setEditingPageId(null);
        } catch (e) {
            console.error('Failed to delete rune page:', e);
            if (onError) onError('Failed to delete rune page');
        }
    };

    // Optimistic state for spells to ensure UI updates immediately
    const [optimisticSpells, setOptimisticSpells] = useState<{ spell1Id: number | null; spell2Id: number | null }>({ spell1Id: null, spell2Id: null });

    // Helper to get spell name (ensure it exists)
    const getSpellName = (spellId: number | undefined) => {
        if (!spellId) return 'SummonerFlash'; // Fallback
        return spellMapRef.current[spellId] || 'SummonerFlash';
    };

    const handleSpellSelect = async (spellId: number) => {
        const currentSpell1 = optimisticSpells.spell1Id ?? localPlayer?.spell1Id;
        const currentSpell2 = optimisticSpells.spell2Id ?? localPlayer?.spell2Id;

        const first = pickingFirstSpell ? spellId : currentSpell1;
        const second = !pickingFirstSpell ? spellId : currentSpell2;

        // Optimistic update
        setOptimisticSpells({ spell1Id: first, spell2Id: second });
        setShowSpellPicker(false);

        try {
            await lcuBridge.request('/lol-champ-select/v1/session/my-selection', 'PATCH', { spell1Id: first, spell2Id: second });
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
            // Refresh pages so active selection is reflected in UI
            const runesResult = await lcuBridge.request('/lol-perks/v1/pages');
            if (runesResult.status === 200) setRunes(runesResult.content);
            setShowRunePicker(false);
        } catch (error) {
            console.error('Failed to select rune page:', error);
        }
    };

    const openSpellPicker = (isFirst: boolean) => {
        setPickingFirstSpell(isFirst);
        setShowSpellPicker(true);
    };

    const handleSwap = async (championId: number) => {
        // Validate inputs
        if (!championId || championId <= 0) {
            const errorMsg = 'Invalid champion ID';
            console.error(errorMsg);
            if (onError) onError(errorMsg);
            return;
        }

        if (combinedBans.includes(championId) || pickedChampionIds.includes(championId) || !availableChampionIds.includes(championId)) {
            if (onError) onError('Cannot swap to that champion.');
            return;
        }

        // Check if already swapping
        if (swappingChampionId !== null) {
            console.log('Swap already in progress');
            return;
        }

        // Get champion name for messages
        const championName = championMap[championId]?.name || 'Champion';
        const now = Date.now();
        const cooldownEnd = swapCooldownRef.current.get(championId);
        if (cooldownEnd && cooldownEnd > now) {
            const msg = 'Wait a moment before selecting this champion from bench.';
            if (onError) onError(msg);
            return;
        }

        setSwappingChampionId(championId);

        try {
            console.log(`[ChampSelect] Attempting to swap with champion ${championId} (${championName})`);

            // Always attempt the swap; if LCU says not ready, we prompt the wait modal
            const result = await lcuBridge.request(`/lol-champ-select/v1/session/bench/swap/${championId}`, 'POST');

            if (result.status === 200 || result.status === 204) {
                // Apply 3s cooldown to the outgoing champion (local player current pick)
                const outgoingChampionId = localPlayer?.championId && localPlayer.championId > 0 ? localPlayer.championId : null;
                if (outgoingChampionId) {
                    swapCooldownRef.current.set(outgoingChampionId, Date.now() + 3000);
                }

                // Refresh bench state once to reflect the swap quickly
                try {
                    const benchRes = await lcuBridge.request('/lol-champ-select/v1/session/bench');
                    if (benchRes.status === 200 && benchRes.content) {
                        const parsed = normalizeBenchPayload(benchRes.content);
                        if (parsed.length > 0) setBenchChampionIds(parsed); // Need to define setBenchChampionIds or use local var? 

                    }
                } catch { /* ignore */ }

                // Refresh session once to update local player skin/pick info
                try {
                    const refreshResult = await lcuBridge.request('/lol-champ-select/v1/session');
                    // ... (refresh logic)
                } catch { /* ignore */ }
            } else {
                throw new Error(`Swap failed with status ${result.status}`);
            }
        } catch (error: any) {
            console.warn('Failed to swap:', error);
            const errorMsg = 'Wait for a while to swap!';
            if (onError) onError(errorMsg);
        } finally {
            setSwappingChampionId(null);
            const nowTs = Date.now();
            swapCooldownRef.current.forEach((end, key) => {
                if (end <= nowTs) swapCooldownRef.current.delete(key);
            });
        }
    };

    const handleChampionSelect = async (championId: number) => {
        setHoveredChampionId(championId);
        if (isIntentPhase) {
            setLastIntentChampionId(championId);
        }

        const actions = champSelect?.actions || [];
        const allActions = actions.flat();

        // Pick intent: patch future pick action
        if (isIntentPhase) {
            const pickAction = allActions.find((a: any) =>
                a.actorCellId === localPlayerCellId &&
                (a.type || '').toLowerCase() === 'pick' &&
                !a.completed
            );
            if (pickAction?.id !== undefined) {
                try {
                    console.log(`[ChampSelect] Intent hover -> pick action ${pickAction.id}`);
                    await lcuBridge.request(`/lol-champ-select/v1/session/actions/${pickAction.id}`, 'PATCH', {
                        championId
                    });
                } catch (error) {
                    console.warn('[ChampSelect] Failed to sync intent hover:', error);
                }
            } else {
                console.log('[ChampSelect] No pick action found for intent hover');
            }
            return;
        }

        // Ban hover: patch active ban action
        if (selectionMode === 'ban') {
            const banAction = allActions.find((a: any) =>
                a.actorCellId === localPlayerCellId &&
                (a.type || '').toLowerCase() === 'ban' &&
                !a.completed
            );
            if (banAction?.id !== undefined) {
                try {
                    console.log(`[ChampSelect] Ban hover -> ban action ${banAction.id}`);
                    await lcuBridge.request(`/lol-champ-select/v1/session/actions/${banAction.id}`, 'PATCH', {
                        championId
                    });
                } catch (error) {
                    console.warn('[ChampSelect] Failed to sync ban hover:', error);
                }
            } else {
                console.log('[ChampSelect] No active ban action found for hover');
            }
            return;
        }

        // Pick hover during pick phase
        if (selectionMode === 'pick') {
            const pickAction = allActions.find((a: any) =>
                a.actorCellId === localPlayerCellId &&
                (a.type || '').toLowerCase() === 'pick' &&
                !a.completed
            );
            if (pickAction?.id !== undefined) {
                try {
                    console.log(`[ChampSelect] Pick hover -> action ${pickAction.id}`);
                    await lcuBridge.request(`/lol-champ-select/v1/session/actions/${pickAction.id}`, 'PATCH', {
                        championId
                    });
                } catch (error) {
                    console.warn('[ChampSelect] Failed to sync pick hover:', error);
                }
            } else {
                console.log('[ChampSelect] No active pick action found for hover');
            }
        }
    };

    const handleLockIn = async () => {
        const lockable =
            selectionMode !== 'planning' &&
            currentAction &&
            !currentAction.completed &&
            currentAction.isInProgress !== false &&
            !!hoveredChampionId;

        if (!lockable) {
            console.log('[ChampSelect] handleLockIn blocked', {
                selectionMode,
                currentActionId: currentAction?.id,
                currentActionType: currentAction?.type,
                currentActionCompleted: currentAction?.completed,
                currentActionInProgress: currentAction?.isInProgress,
                hoveredChampionId
            });
            return;
        }

        if (selectionMode === 'ban') {
            onBan(hoveredChampionId as number);
        } else {
            onPick(hoveredChampionId as number);
        }
        setHoveredChampionId(null);
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

    const handleTrade = async (cellId: number) => {
        if (!cellId || cellId === localPlayerCellId) return;
        if (tradeRequestingCellId) return;
        if (!hasPickedChampion) {
            if (onError) onError('Pick your champion before sending a swap request.');
            return;
        }

        // Ensure we own the teammate's champion before requesting a swap
        const targetMember = myTeam.find((m: any) => m.cellId === cellId);
        if (!targetMember || !targetMember.championId || !pickableChampionIds.includes(targetMember.championId)) {
            if (onError) onError('You do not own that champion to swap.');
            return;
        }

        setTradeRequestingCellId(cellId);
        try {
            const res = await lcuBridge.request(`/lol-champ-select/v1/session/trades/${cellId}/request`, 'POST');
            if (res?.status && res.status >= 400) {
                throw new Error(res?.content?.message || `Trade request failed (${res.status})`);
            }
            if (onSuccess) onSuccess('Swap request sent');
        } catch (error) {
            console.error('Failed to request trade:', error);
            if (onError) onError('Failed to send swap request');
        } finally {
            setTradeRequestingCellId(null);
        }
    };

    const handleAcceptTrade = async (tradeId: number) => {
        try {
            const res = await lcuBridge.request(`/lol-champ-select/v1/session/trades/${tradeId}/accept`, 'POST');
            if (res?.status && res.status >= 400) {
                throw new Error(res?.content?.message || `Failed (${res.status})`);
            }
            if (onSuccess) onSuccess('Swap accepted');
        } catch (error) {
            console.error('Failed to accept trade:', error);
            if (onError) onError('Failed to accept swap');
        }
    };

    const handleDeclineTrade = async (tradeId: number) => {
        try {
            const res = await lcuBridge.request(`/lol-champ-select/v1/session/trades/${tradeId}/decline`, 'POST');
            if (res?.status && res.status >= 400) {
                throw new Error(res?.content?.message || `Failed (${res.status})`);
            }
        } catch (error) {
            console.error('Failed to decline trade:', error);
            if (onError) onError('Failed to decline swap');
        }
    };

    // Helper to determine member status from actions
    const hoveredByCellId = useMemo(() => {
        const map: Record<number, number> = {};
        const actions = champSelect?.actions || [];
        actions.forEach((turn: any[]) => {
            turn.forEach((a: any) => {
                if (!a) return;
                if (!a.completed && typeof a.actorCellId === 'number' && a.championId && a.championId > 0) {
                    map[a.actorCellId] = a.championId;
                }
            });
        });
        return map;
    }, [champSelect?.actions]);

    const getMemberStatus = useCallback((cellId: number, currentChampionId: number) => {
        const actions = champSelect?.actions || [];
        const hasCompletedPick = actions.some((turn: any[]) =>
            turn.some((a: any) => a.actorCellId === cellId && a.type === 'pick' && a.completed)
        );
        if (hasCompletedPick) return 'picked';
        if (hoveredByCellId[cellId]) return 'hovering';
        if (currentChampionId) return 'picked';
        return 'none';
    }, [champSelect?.actions, hoveredByCellId]);

    const enhancedMyTeam = useMemo(() => {
        return myTeam.map((m: any) => ({
            ...m,
            championName: championMap[m.championId]?.key || 'Unknown',
            hoverChampionId: hoveredByCellId[m.cellId],
            status: getMemberStatus(m.cellId, m.championId)
        }));
    }, [myTeam, championMap, getMemberStatus, hoveredByCellId]);

    const enhancedTheirTeam = useMemo(() => {
        return theirTeam.map((m: any) => ({
            ...m,
            championName: championMap[m.championId]?.key || 'Unknown',
            hoverChampionId: hoveredByCellId[m.cellId],
            status: getMemberStatus(m.cellId, m.championId)
        }));
    }, [theirTeam, championMap, getMemberStatus, hoveredByCellId]);

    const allyBans = useMemo(() => {
        const ids = new Set<number>();
        const add = (val: any) => {
            const parsed = typeof val === 'number' ? val : parseInt(val, 10);
            if (Number.isFinite(parsed) && parsed > 0) ids.add(parsed);
        };

        const myBans = Array.isArray(champSelect?.bans?.myTeamBans) ? champSelect.bans.myTeamBans : [];
        myBans.forEach(add);

        // Fallback to completed ban actions from allied cells
        (champSelect?.actions || []).forEach((turn: any) => {
            if (!Array.isArray(turn)) return;
            turn.forEach((action: any) => {
                if ((action?.type || '').toLowerCase() !== 'ban') return;
                if (!action?.completed) return;
                if (!allyCellIds.has(action.actorCellId)) return;
                add(action.championId ?? action?.championPickIntent);
            });
        });

        return Array.from(ids);
    }, [champSelect?.bans, champSelect?.actions, allyCellIds]);

    const enemyBans = useMemo(() => {
        const ids = new Set<number>();
        const add = (val: any) => {
            const parsed = typeof val === 'number' ? val : parseInt(val, 10);
            if (Number.isFinite(parsed) && parsed > 0) ids.add(parsed);
        };

        const theirBans = Array.isArray(champSelect?.bans?.theirTeamBans) ? champSelect.bans.theirTeamBans : [];
        theirBans.forEach(add);

        // Fallback to completed ban actions from enemy cells
        (champSelect?.actions || []).forEach((turn: any) => {
            if (!Array.isArray(turn)) return;
            turn.forEach((action: any) => {
                if ((action?.type || '').toLowerCase() !== 'ban') return;
                if (!action?.completed) return;
                if (enemyCellIds.has(action.actorCellId)) {
                    add(action.championId ?? action?.championPickIntent);
                }
            });
        });

        return Array.from(ids);
    }, [champSelect?.bans, champSelect?.actions, enemyCellIds]);

    const combinedBans = useMemo(() => Array.from(new Set([...allyBans, ...enemyBans])), [allyBans, enemyBans]);

    const allChampionIds = useMemo(() => {
        if (!Array.isArray(champions)) return [];
        return champions.map((c) => c.id).filter((id) => typeof id === 'number' && id > 0);
    }, [champions]);

    const pickedChampionIds = useMemo(() => {
        const ids: number[] = [];
        [...myTeam, ...theirTeam].forEach((m: any) => {
            if (typeof m?.championId === 'number' && m.championId > 0) {
                ids.push(m.championId);
            }
        });
        return Array.from(new Set(ids));
    }, [myTeam, theirTeam]);

    const availableChampionIds = useMemo(() => {
        // During bans, all champions should be available regardless of ownership
        if (selectionMode === 'ban') return allChampionIds;
        if (!Array.isArray(pickableChampionIds)) return [];
        return Array.from(new Set(pickableChampionIds));
    }, [pickableChampionIds, selectionMode, allChampionIds]);

    const visibleChampions = useMemo(() => {
        if (!Array.isArray(champions)) return [];
        // In ban phase, show everything; in planning/pick, show only owned (availableChampionIds)
        if (selectionMode === 'ban') return champions;
        const owned = new Set(availableChampionIds);
        return champions.filter((c) => owned.has(c.id));
    }, [champions, selectionMode, availableChampionIds]);

    const propsBenchIds = useMemo(() => {
        const parsed = normalizeBenchPayload({
            benchChampionIds: champSelect?.benchChampionIds,
            benchChampions: (champSelect as any)?.benchChampions,
            champions: (champSelect as any)?.champions,
            championIds: (champSelect as any)?.championIds
        });
        return Array.isArray(parsed) ? parsed : [];
    }, [champSelect, normalizeBenchPayload]);

    useEffect(() => {
        if (propsBenchIds.length > 0) {
            setBenchChampionIds(propsBenchIds);
        }
    }, [propsBenchIds]);

    const offeredChampionIds = useMemo(() => {
        if (!isARAM) return [];
        if (benchChampionIds.length > 0) return Array.from(new Set(benchChampionIds));
        const inline = Array.isArray(pickableChampionIds) ? pickableChampionIds : [];
        if (inline.length > 0) return Array.from(new Set(inline));
        return [];
    }, [benchChampionIds, isARAM, pickableChampionIds]);

    const activeSpell1 = optimisticSpells.spell1Id ?? localPlayer?.spell1Id;
    const activeSpell2 = optimisticSpells.spell2Id ?? localPlayer?.spell2Id;

    // --- RENDER ---

    // Background logic simplified to use bgSource directly
    // const backgroundUri = ... removed in favor of direct local asset usage

    const bgSource = useMemo(() => {
        const mapId = sharedMapId ?? champSelect?.mapId ?? champSelect?.gameData?.mapId;
        return mapBackgrounds[mapId as number] || mapBackgrounds.default;
    }, [sharedMapId, champSelect?.mapId, champSelect?.gameData?.mapId]);

    return (
        <ImageBackground source={bgSource} style={styles.container} resizeMode="cover">
            <SafeAreaView style={styles.safeArea}>
                <LinearGradient
                    colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
                    style={StyleSheet.absoluteFill}
                />

                {/* Base Layer: Team View (Always rendered) */}
                <View style={{ flex: 1 }}>
                    <ScrollView style={styles.mainContent}>
                        {/* Header Info */}
                        <View style={styles.header}>
                            <View style={styles.headerTop}>
                                <Text style={styles.headerTitle}>
                                    {selectionMode === 'ban' ? 'BAN A CHAMPION' : 'CHOOSE YOUR CHAMPION'}
                                </Text>
                                <Text style={styles.timerText}>{timeLeft}</Text>
                            </View>

                            {/* Incoming trade banner */}
                            {incomingTrade && (
                                <View style={styles.tradeBanner}>
                                    <Text style={styles.tradeBannerText}>
                                        Swap request from {incomingTradeMember?.gameName || incomingTradeMember?.summonerName || incomingTradeMember?.championName || 'teammate'}
                                    </Text>
                                    <View style={styles.tradeBannerActions}>
                                        <TouchableOpacity
                                            style={[styles.tradeBannerBtn, styles.tradeBannerAccept, { marginRight: 8 }]}
                                            onPress={() => incomingTrade?.id && handleAcceptTrade(incomingTrade.id)}
                                            disabled={!incomingTrade?.id}
                                        >
                                            <Text style={styles.tradeBannerBtnText}>Accept</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.tradeBannerBtn, styles.tradeBannerDecline]}
                                            onPress={() => incomingTrade?.id && handleDeclineTrade(incomingTrade.id)}
                                            disabled={!incomingTrade?.id}
                                        >
                                            <Text style={styles.tradeBannerBtnText}>Decline</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* ARAM Bench */}
                            {isARAM && (
                                <View style={styles.benchContainer}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {benchChampionIds.map((id: number) => {
                                            const disabled = combinedBans.includes(id) || pickedChampionIds.includes(id) || !availableChampionIds.includes(id);
                                            return (
                                                <TouchableOpacity
                                                    key={id}
                                                    style={[styles.benchItem, disabled && styles.benchItemDisabled]}
                                                    onPress={() => !disabled && handleSwap(id)}
                                                    disabled={disabled}
                                                >
                                                    <Image
                                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[id]?.key}.png` }}
                                                        style={[styles.benchIcon, disabled && styles.benchIconDisabled]}
                                                    />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            )}
                        </View>

                        {/* My Team */}
                        <View style={styles.teamSection}>
                            <Text style={styles.teamTitle}>Your team</Text>
                            {enhancedMyTeam.map((member: any, idx: number) => {
                                const isMe = member.cellId === localPlayerCellId;
                                const tradeState = trades.find((t: any) => t.cellId === member.cellId);

                                const ownsTeammateChamp = pickableChampionIds.includes(member.championId);

                                // Determine if trade is allowed
                                const localMember = enhancedMyTeam.find((m: any) => m.cellId === localPlayerCellId);
                                const isLocalPicked = isARAM ? hasPickedChampion : localMember?.status === 'picked';
                                const isTeammatePicked = isARAM ? member.championId > 0 : member.status === 'picked';

                                const canTrade = !isMe &&
                                    member.championId > 0 &&
                                    ownsTeammateChamp &&
                                    (isARAM || (isLocalPicked && isTeammatePicked));

                                const isTradePendingHere = tradeRequestingCellId === member.cellId;
                                const hasIncomingTrade = tradeState?.state === 'RECEIVED';
                                const hasOutgoingTrade = tradeState?.state === 'SENT';
                                const tradeDisabled = !canTrade || isTradePendingHere || !!hasIncomingTrade || !!hasOutgoingTrade;

                                const hoveringCandidateId = hoveredByCellId[member.cellId] || (isMe ? (hoveredChampionId || lastIntentChampionId) : null);
                                const displayChampionId = hoveringCandidateId || (member.championId && member.championId > 0 ? member.championId : null);
                                const displayChampionKey = displayChampionId ? championMap[displayChampionId]?.key : member.championName;
                                const isHovering = member.status === 'hovering';

                                return (
                                    <View key={member.cellId} style={styles.teamRow}>
                                        {/* Splash Background for Row */}
                                        <Animated.Image
                                            source={{ uri: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${displayChampionKey}_0.jpg` }}
                                            style={[styles.splashImageTopCrop, { opacity: isHovering ? hoverBlinkAnim : 1 }]}
                                            blurRadius={0}
                                        />
                                        <Animated.View style={[
                                            styles.teamRowOverlay,
                                            isHovering ? { opacity: hoverBlinkAnim } : null
                                        ]} />

                                        <View style={styles.teamRowContent}>
                                            {/* Spells */}
                                            <View style={styles.rowSpells}>
                                                <Image source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(member.spell1Id)}.png` }} style={styles.smallSpellIcon} />
                                                <Image source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(member.spell2Id)}.png` }} style={styles.smallSpellIcon} />
                                            </View>

                                            {/* Name & Hovered/Picked Champ */}
                                            <View style={styles.memberNameBlock}>
                                                <Text style={styles.memberName}>
                                                    {member.gameName
                                                        || member.summonerName
                                                        || displayChampionKey
                                                        || 'waiting for pick'}
                                                </Text>
                                            </View>

                                            {/* Trade Button / Status */}
                                            {canTrade && (
                                                <TouchableOpacity
                                                    onPress={() => handleTrade(member.cellId)}
                                                    style={[styles.rowAction, tradeDisabled && { borderColor: '#525252' }]}
                                                    disabled={tradeDisabled}
                                                >
                                                    <Image
                                                        source={tradeDisabled
                                                            ? require('../../static/icon/tft_swap_disabled.png')
                                                            : require('../../static/icon/tft_swap_default.png')
                                                        }
                                                        style={[styles.tradeIcon, tradeDisabled && { opacity: 0.5 }]}
                                                    />
                                                </TouchableOpacity>
                                            )}

                                            {/* Incoming Trade Request */}
                                            {tradeState && tradeState.state === 'RECEIVED' && (
                                                <View style={styles.tradeRequest}>
                                                    <Text style={styles.tradeText}>Trade?</Text>
                                                    <TouchableOpacity onPress={() => handleAcceptTrade(tradeState.id)} style={styles.tradeBtnAccept}>
                                                        <Text style={styles.tradeBtnText}>✓</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => handleDeclineTrade(tradeState.id)} style={styles.tradeBtnDecline}>
                                                        <Text style={styles.tradeBtnText}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Bans (Non-ARAM) */}
                        {!isARAM && (
                            <View style={styles.bansSection}>
                                <Text style={styles.teamTitle}>Bans</Text>
                                <View style={styles.banGroupsRow}>
                                    <View style={[styles.banGroup, { marginRight: 12 }]}>
                                        <Text style={styles.banGroupTitle}>Allies</Text>
                                        <ScrollView horizontal>
                                            {allyBans.length === 0 && (
                                                <Text style={styles.banEmpty}>None yet</Text>
                                            )}
                                            {allyBans.map((id: number) => (
                                                <Image
                                                    key={`ally-ban-${id}`}
                                                    source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[id]?.key}.png` }}
                                                    style={styles.banIcon}
                                                />
                                            ))}
                                            {selectionMode === 'ban' && hoveredChampionId && !allyBans.includes(hoveredChampionId) && (
                                                <Animated.Image
                                                    source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[hoveredChampionId]?.key}.png` }}
                                                    style={[styles.banIcon, { opacity: blinkAnim, borderColor: '#ef4444', borderWidth: 2 }]}
                                                />
                                            )}
                                        </ScrollView>
                                    </View>

                                    <View style={styles.banGroup}>
                                        <Text style={styles.banGroupTitle}>Enemies</Text>
                                        <ScrollView horizontal>
                                            {enemyBans.length === 0 && (
                                                <Text style={styles.banEmpty}>None yet</Text>
                                            )}
                                            {enemyBans.map((id: number) => (
                                                <Image
                                                    key={`enemy-ban-${id}`}
                                                    source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[id]?.key}.png` }}
                                                    style={styles.banIcon}
                                                />
                                            ))}
                                        </ScrollView>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Enemy Team - mirror ally UI */}
                        <View style={styles.teamSection}>
                            <Text style={styles.teamTitle}>Enemy team</Text>
                            {enhancedTheirTeam.map((member: any, idx: number) => {
                                const hoveringCandidateId = hoveredByCellId[member.cellId];
                                const displayChampionId = hoveringCandidateId || (member.championId && member.championId > 0 ? member.championId : null);
                                const displayChampionKey = displayChampionId ? championMap[displayChampionId]?.key : member.championName;
                                const name = member.gameName || member.summonerName || displayChampionKey || `Summoner ${idx + 1}`;
                                const isHovering = member.status === 'hovering';
                                return (
                                    <View key={member.cellId || idx} style={styles.teamRow}>
                                        <Animated.Image
                                            source={{ uri: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${displayChampionKey}_0.jpg` }}
                                            style={[styles.splashImageTopCrop, { opacity: isHovering ? hoverBlinkAnim : 1 }]}
                                            blurRadius={0}
                                        />
                                        <Animated.View style={[
                                            styles.teamRowOverlay,
                                            isHovering ? { opacity: hoverBlinkAnim } : null
                                        ]} />
                                        <View style={styles.teamRowContent}>
                                            <View style={styles.rowSpells}>
                                                <View style={[styles.smallSpellIcon, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                                                <View style={[styles.smallSpellIcon, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                                            </View>
                                            <View style={styles.memberNameBlock}>
                                                <Text style={styles.memberName}>
                                                    {name}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                </View>

                {/* Overlay: Champion Grid */}
                {(!isARAM && !hasPickedChampion && (selectionMode === 'pick' || selectionMode === 'ban' || selectionMode === 'planning') && isGridOpen) && (
                    <SafeAreaView style={styles.gridOverlay} edges={['top', 'bottom']}>
                        <ChampionGrid
                            champions={visibleChampions}
                            onSelect={handleChampionSelect}
                            version={ddragonVersion}
                            disabled={false}
                            hoveredId={effectiveHoveredChampionId}
                            teammateHoveredIds={Object.values(hoveredByCellId).filter((id) => id && id !== effectiveHoveredChampionId)}
                            pickedIds={pickedChampionIds}
                            bannedIds={combinedBans}
                            availableChampionIds={availableChampionIds}
                            ListHeaderComponent={
                                <View style={styles.header}>
                                    <View style={styles.headerTop}>
                                        <Text style={styles.headerTitle}>
                                            {selectionMode === 'ban' ? 'BAN A CHAMPION' : 'CHOOSE YOUR CHAMPION'}
                                        </Text>
                                        <View style={styles.headerActions}>
                                            <Text style={styles.timerText}>{timeLeft}</Text>
                                        </View>
                                    </View>
                                </View>
                            }
                            ListFooterComponent={
                                <View style={styles.gridFooter} />
                            }
                        />
                        {/* Close Champions Pill - Bottom Center */}
                        <TouchableOpacity style={styles.stickyCloseButton} onPress={() => setIsGridOpen(false)}>
                            <Text style={styles.stickyOpenButtonText}>▼ CLOSE CHAMPIONS</Text>
                        </TouchableOpacity>
                        {/* Lock Button - Absolute Positioned */}
                        {!isIntentPhase && (
                            <TouchableOpacity
                                style={[
                                    styles.lockInButton,
                                    (!hoveredChampionId || !currentAction || currentAction.completed || currentAction.isInProgress === false) && styles.lockInButtonDisabled,
                                    { position: 'absolute', bottom: 90, left: 20, right: 20 }
                                ]}
                                onPress={handleLockIn}
                                disabled={!hoveredChampionId || !currentAction || currentAction.completed || currentAction.isInProgress === false}
                            >
                                <Text style={styles.lockInButtonText}>
                                    LOCK
                                </Text>
                            </TouchableOpacity>
                        )}
                    </SafeAreaView>
                )}

                {/* Sticky Open Button */}
                {(!isARAM && !hasPickedChampion && (selectionMode === 'pick' || selectionMode === 'ban' || selectionMode === 'planning') && !isGridOpen) && (
                    <TouchableOpacity style={styles.stickyOpenButton} onPress={() => setIsGridOpen(true)}>
                        <Text style={styles.stickyOpenButtonText}>▲ OPEN CHAMPIONS</Text>
                    </TouchableOpacity>
                )
                }

                {/* Bottom Bar: Loadout */}
                <View style={styles.bottomBar}>
                    {/* Rune Dropdown */}
                    <TouchableOpacity style={styles.runeDropdown} onPress={() => setShowRunePicker(true)}>
                        <Text style={styles.runeDropdownText} numberOfLines={1}>
                            {runes.find(r => r.isActive)?.name || 'Runes'}
                        </Text>
                        <Image source={require('../../static/dropdown_arrows.png')} style={styles.dropdownArrow} />
                    </TouchableOpacity>

                    {/* Edit Rune Page */}
                    <TouchableOpacity style={styles.editRuneBtn} onPress={() => openRuneBuilder()}>
                        <Text style={styles.editRuneText}>✎</Text>
                    </TouchableOpacity>

                    {/* Spells & Skin */}
                    <View style={styles.bottomRightGroup}>
                        <View style={styles.bottomSpells}>
                            <TouchableOpacity onPress={() => openSpellPicker(true)}>
                                <Image source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(activeSpell1)}.png` }} style={styles.bottomSpellIcon} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => openSpellPicker(false)}>
                                <Image source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(activeSpell2)}.png` }} style={styles.bottomSpellIcon} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity onPress={() => setShowSkinPicker(true)}>
                            <Image source={require('../../static/skin_picker_icon.png')} style={styles.skinPickerIcon} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Modals */}
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
                    championName={championMap[localPlayer?.championId || 0]?.name}
                    fallbackSplash={
                        championMap[localPlayer?.championId || 0]?.key
                            ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championMap[localPlayer?.championId || 0]?.key}_0.jpg`
                            : undefined
                    }
                    championIcon={
                        championMap[localPlayer?.championId || 0]?.key
                            ? `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[localPlayer?.championId || 0]?.key}.png`
                            : undefined
                    }
                />
                <RunePicker
                    visible={showRunePicker}
                    onSelect={handleRunePageSelect}
                    onClose={() => setShowRunePicker(false)}
                    pages={runes}
                    currentPageId={runes.find(r => r.isActive)?.id}
                />
                <CustomModal
                    visible={confirmModal.visible}
                    title={confirmModal.action === 'ban' ? 'Confirm Ban' : 'Confirm Pick'}
                    message={`Are you sure you want to ${confirmModal.action} "${championMap[confirmModal.championId || 0]?.name || 'this champion'}"?`}
                    buttons={[
                        { text: 'Cancel', onPress: () => setConfirmModal({ visible: false, championId: null, action: selectionMode }), style: 'cancel' },
                        { text: 'Yes', onPress: confirmChampionAction, style: 'primary' },
                    ]}
                    onClose={() => setConfirmModal({ visible: false, championId: null, action: selectionMode })}
                />


                <RuneBuilder
                    visible={showRuneBuilder}
                    onClose={() => setShowRuneBuilder(false)}
                    onSave={(pageData) => {
                        setRunePageName(pageData.name);
                        setPrimaryStyleId(pageData.primaryStyleId);
                        setSubStyleId(pageData.subStyleId);
                        handleCreateRunePage(pageData);
                    }}
                    initialPage={{
                        id: editingPageId ?? undefined,
                        name: runePageName,
                        primaryStyleId,
                        subStyleId,
                        isEditable: (editingRunePage ?? activeRunePage)?.isEditable,
                        selectedPerkIds: [
                            keystoneId,
                            primaryPerks[1],
                            primaryPerks[2],
                            primaryPerks[3],
                            ...secondaryPerks,
                            ...statShards
                        ].filter((id): id is number => typeof id === 'number')
                    }}
                    perkStyles={perkStyles}
                    runeIconMap={runeIconMap}
                    normalizeRuneIcon={normalizeRuneIcon}
                    onDelete={handleDeleteRunePage}
                    canDelete={!!editingPageId}
                    onCreateNew={handleRequestNewPage}
                />
            </SafeAreaView >
        </ImageBackground >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        padding: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        color: '#fbbf24', // Gold
        fontSize: 18,
        fontWeight: 'bold',
    },
    timerText: {
        color: '#fbbf24',
        fontSize: 18,
        fontWeight: 'bold',
    },
    minimizeButton: {
        marginLeft: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: '#1f2937',
    },
    minimizeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    benchContainer: {
        flexDirection: 'row',
        marginTop: 10,
    },
    benchItem: {
        marginRight: 8,
    },
    benchItemDisabled: {
        opacity: 0.35,
    },
    benchIcon: {
        width: 40,
        height: 40,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#fbbf24',
    },
    benchIconDisabled: {
        borderColor: '#4b5563',
    },
    mainContent: {
        flex: 1,
    },
    teamSection: {
        marginBottom: 20,
    },
    teamTitle: {
        color: '#9ca3af',
        fontSize: 14,
        marginLeft: 16,
        marginBottom: 8,
    },
    teamRow: {
        height: 80,
        marginBottom: 8, // Increased spacing for cleaner look
        position: 'relative',
        justifyContent: 'center',
        overflow: 'hidden', // Mask the splash art
        borderRadius: 8, // Polished corners
    },
    teamRowOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.2)', // Reduced opacity for better visibility
    },
    teamRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    rowSpells: {
        flexDirection: 'column',
        marginRight: 12,
    },
    smallSpellIcon: {
        width: 20,
        height: 20,
        marginBottom: 2,
        borderRadius: 2,
    },
    memberName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        flex: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.9)', // Stronger shadow
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 4, // Tighter radius for sharpness
    },
    memberNameBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    hoveredRowBadge: {
        marginLeft: 8,
        padding: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(15,23,42,0.8)',
        borderWidth: 1,
        borderColor: '#fbbf24',
    },
    hoveredRowIcon: {
        width: 40,
        height: 40,
        borderRadius: 8,
    },
    rowAction: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#fbbf24',
        justifyContent: 'center',
        alignItems: 'center',
    },
    enemyRow: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    enemyRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    enemyIconWrapper: {
        width: 40,
        height: 40,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#fbbf24',
        backgroundColor: '#0f172a',
    },
    enemyIcon: {
        width: '100%',
        height: '100%',
    },
    enemyIconPlaceholder: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    enemyName: {
        color: '#fbbf24',
        fontWeight: '700',
    },
    gridToggleButton: {
        alignItems: 'center',
        padding: 10,
        marginTop: 8,
    },
    gridToggleText: {
        color: '#fbbf24',
        fontSize: 24,
        fontWeight: 'bold',
    },
    bansSection: {
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    splashImageTopCrop: {
        position: 'absolute',
        width: '100%',
        height: undefined,
        aspectRatio: 1.6, // Standardize wide splash ratio
        top: -20, // Shift up slightly to frame faces (typically in top 30%)
        opacity: 0.8, // Slight dim for text readability vs bright splashes
    },
    banGroupsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    banGroup: {
        flex: 1,
    },
    banGroupTitle: {
        color: '#e5e7eb',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
    },
    banEmpty: {
        color: '#9ca3af',
        fontStyle: 'italic',
        marginRight: 8,
        alignSelf: 'center',
    },
    banIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        opacity: 0.7,
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        height: 80,
    },
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
    runeDropdownText: {
        color: '#d4d4d8',
        fontSize: 14,
        flex: 1,
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
    runePathIconContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    runePathIcon: {
        width: 32,
        height: 32,
    },
    bottomRightGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    bottomSpells: {
        flexDirection: 'row',
        gap: 8,
        marginRight: 16,
    },
    bottomSpellIcon: {
        width: 40,
        height: 40,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#fbbf24',
    },
    skinPickerIcon: {
        width: 40,
        height: 40,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#fbbf24',
    },
    gridContainer: {
        padding: 10,
        minHeight: 300,
    },
    tradeIcon: {
        width: 20,
        height: 20,
    },
    tradeRequest: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 4,
        borderRadius: 4,
        position: 'absolute',
        right: 10,
    },
    tradeText: {
        color: '#fff',
        fontSize: 12,
        marginRight: 8,
    },
    tradeBtnAccept: {
        backgroundColor: '#22c55e',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 4,
    },
    tradeBtnDecline: {
        backgroundColor: '#ef4444',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tradeBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    tradeBanner: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderColor: '#fbbf24',
        borderWidth: 1,
        padding: 10,
        borderRadius: 6,
        marginTop: 8,
        marginHorizontal: 4
    },
    tradeBannerText: {
        color: '#f0e6d2',
        fontWeight: '700',
        marginBottom: 6
    },
    tradeBannerActions: {
        flexDirection: 'row'
    },
    tradeBannerBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 4
    },
    tradeBannerAccept: {
        backgroundColor: '#22c55e'
    },
    tradeBannerDecline: {
        backgroundColor: '#ef4444'
    },
    tradeBannerBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 12
    },
    stickyButtonContainer: {
        position: 'absolute',
        bottom: 90, // Above bottom bar (80 height + padding)
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: 10,
        zIndex: 10,
    },
    lockInButton: {
        backgroundColor: 'rgba(30, 35, 40, 0.9)',
        borderWidth: 2,
        borderColor: '#fbbf24', // Gold
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockInButtonDisabled: {
        opacity: 0.5,
        borderColor: '#6b7280',
    },
    lockInButtonText: {
        color: '#fbbf24', // Gold
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
        fontFamily: 'serif', // If supported, otherwise system font
    },
    memberStatus: {
        color: '#fbbf24',
        fontSize: 12,
        fontStyle: 'italic',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 4,
    },
    gridFooter: {
        padding: 16,
        paddingBottom: 32,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    gridOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
        backgroundColor: '#09090b', // Dark background for overlay
    },
    stickyOpenButton: {
        position: 'absolute',
        bottom: 100,
        alignSelf: 'center',
        backgroundColor: '#fbbf24',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 25,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        zIndex: 90,
    },
    stickyOpenButtonText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16,
    },
    stickyCloseButton: {
        position: 'absolute',
        bottom: 20, // Inside SafeAreaView, this is roughly bottom of grid
        alignSelf: 'center',
        backgroundColor: '#fbbf24',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 25,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        zIndex: 90,
    },

});
