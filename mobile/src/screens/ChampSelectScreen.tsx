import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Tab, TabView } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';
import ChampionGrid from '../components/ChampionGrid';
import TeamView from '../components/TeamView';
import SpellPicker from '../components/SpellPicker';
import SkinPicker from '../components/SkinPicker';
import RunePicker from '../components/RunePicker';
import CustomModal from '../components/CustomModal';

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
    const [pickableChampionIds, setPickableChampionIds] = useState<number[]>(
        () => Array.isArray(champSelect?.pickableChampionIds) ? champSelect.pickableChampionIds : []
    );
    const [loadingPickablePool, setLoadingPickablePool] = useState(false);
    const [loadingBench, setLoadingBench] = useState(false);
    const [ddragonVersion, setDdragonVersion] = useState('14.23.1');
    const [loadingResources, setLoadingResources] = useState(true);
    const spellMapRef = React.useRef<Record<number, string>>({});
    const [selectionMode, setSelectionMode] = useState<'pick' | 'ban'>('pick');
    const [confirmModal, setConfirmModal] = useState<{ visible: boolean; championId: number | null; action: 'pick' | 'ban' }>({ visible: false, championId: null, action: 'pick' });
    const [timeLeft, setTimeLeft] = useState<number>(() => champSelect?.timer?.adjustedTimeLeftInPhase ? Math.ceil(champSelect.timer.adjustedTimeLeftInPhase / 1000) : 0);

    // Picker States
    const [showSpellPicker, setShowSpellPicker] = useState(false);
    const [pickingFirstSpell, setPickingFirstSpell] = useState(true);
    const [showSkinPicker, setShowSkinPicker] = useState(false);
    const [showRunePicker, setShowRunePicker] = useState(false);
    const [showRuneBuilder, setShowRuneBuilder] = useState(false);
    const [editingPageId, setEditingPageId] = useState<number | null>(null);
    const [skins, setSkins] = useState<any[]>([]);

    // Rune builder states
    const [runePageName, setRunePageName] = useState('My Rune Page');
    const [primaryStyleId, setPrimaryStyleId] = useState<number | null>(null);
    const [subStyleId, setSubStyleId] = useState<number | null>(null);
    const [keystoneId, setKeystoneId] = useState<number | null>(null);
    const [primaryPerks, setPrimaryPerks] = useState<{ [slot: number]: number | null }>({});
    const [secondaryPerks, setSecondaryPerks] = useState<number[]>([]);
    const [statShards, setStatShards] = useState<number[]>([5008, 5010, 5011]);

    // Swap loading state - track which champion is being swapped
    const [swappingChampionId, setSwappingChampionId] = useState<number | null>(null);

    // Track failed rune image loads for fallback handling
    const [failedRuneImages, setFailedRuneImages] = useState<Set<string>>(new Set());

    const lcuBridge = getLCUBridge();
    const localPlayerCellId = champSelect?.localPlayerCellId;
    const myTeam = champSelect?.myTeam || [];
    const theirTeam = champSelect?.theirTeam || [];
    const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
    const hasPickedChampion = !!(localPlayer?.championId && localPlayer.championId > 0);
    const normalizedGameMode = (champSelect?.gameMode || '').toUpperCase();
    const isARAM = normalizedGameMode === 'ARAM' || normalizedGameMode === 'KIWI' || champSelect?.benchEnabled || champSelect?.mapId === 12;
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

    useEffect(() => {
        if (currentAction?.type) {
            setSelectionMode(currentAction.type.toLowerCase() === 'ban' ? 'ban' : 'pick');
        }
    }, [currentAction?.type]);

    const timerSyncRef = React.useRef<{ msLeft: number; syncedAt: number }>({ msLeft: 0, syncedAt: Date.now() });
    const swapCooldownRef = React.useRef<Map<number, number>>(new Map());

    useEffect(() => {
        const compute = () => {
            const timer = champSelect?.timer;
            if (timer && typeof timer.adjustedTimeLeftInPhase === 'number') {
                const serverNow = typeof timer.internalNowInEpochMs === 'number' ? timer.internalNowInEpochMs : Date.now();
                const delta = Date.now() - serverNow;
                const remainingMs = timer.adjustedTimeLeftInPhase - delta;
                timerSyncRef.current = { msLeft: timer.adjustedTimeLeftInPhase, syncedAt: serverNow };
                setTimeLeft(Math.max(0, Math.round(remainingMs / 1000)));
                return;
            }

            // Fallback to last known timer
            const { msLeft, syncedAt } = timerSyncRef.current;
            const elapsed = Date.now() - syncedAt;
            const remainingMs = msLeft - elapsed;
            setTimeLeft(Math.max(0, Math.round(remainingMs / 1000)));
        };

        compute();
        const interval = setInterval(compute, 150);
        return () => clearInterval(interval);
    }, [champSelect?.timer?.adjustedTimeLeftInPhase, champSelect?.timer?.phase, champSelect?.timer?.internalNowInEpochMs]);

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

        if (!isARAM) {
            setLoadingPickablePool(false);
            return () => { cancelled = true; };
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
    }, [champSelect?.pickableChampionIds, isARAM, lcuBridge]);

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
                    const samplePerk = perksData.find((p: any) => p?.iconPath);
                    if (samplePerk) {
                        console.log('[ChampSelect] Rune perks.json sample:', {
                            id: samplePerk.id,
                            iconPath: perkMap[samplePerk.id],
                        });
                    }
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
            if (Array.isArray(loadedStyles) && loadedStyles.length > 0) {
                const firstStyle = loadedStyles[0];
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
                if (__DEV__) {
                    console.log('[ChampSelect] Skins mapped (owned only)', mapped.slice(0, 3));
                }
                setSkins(mapped);
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

    const shardRows = useMemo(() => ([
        [
            { id: 5008, label: 'Adaptive Force', desc: '+9 Adaptive Force' },
            { id: 5005, label: 'Attack Speed', desc: '+10% Attack Speed' },
            { id: 5007, label: 'Ability Haste', desc: '+8 Ability Haste' },
        ],
        [
            { id: 5008, label: 'Adaptive Force', desc: '+9 Adaptive Force' },
            { id: 5010, label: 'Move Speed', desc: '+2.5% Move Speed' },
            { id: 5001, label: 'Health Scaling', desc: '+10-180 Health (lvl based)' },
        ],
        [
            { id: 5011, label: 'Health', desc: '+65 Health' },
            { id: 5013, label: 'Tenacity', desc: '+15% Tenacity & Slow Resist' },
            { id: 5001, label: 'Health Scaling', desc: '+10-180 Health (lvl based)' },
        ],
    ]), []);

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
        if (__DEV__) {
            console.log('[RuneBuilder] Opening with styles:', perkStyles.length, 'runes:', runes.length, 'iconMap:', Object.keys(runeIconMap || {}).length);
        }
        initRuneBuilder({ preserveName: true });
        setShowRuneBuilder(true);
    };

    const openNewRuneBuilder = () => {
        openRuneBuilder({ edit: false, name: getUniqueRuneName() });
    };

    const toggleSecondaryPerk = (perkId: number, slot: number) => {
        const slotInfo = perkSlotMap[perkId] || { slot };
        const filtered = secondaryPerks.filter((id) => (perkSlotMap[id]?.slot ?? slot) !== slotInfo.slot);
        const already = secondaryPerks.includes(perkId);
        let next = already ? filtered : [...filtered, perkId];
        // Keep only two selections total; keep the most recent two
        if (next.length > 2) {
            next = next.slice(next.length - 2);
        }
        setSecondaryPerks(next);
    };

    const handleCreateRunePage = async () => {
        const sec = secondaryPerks.filter((id): id is number => typeof id === 'number');
        let shards = (statShards || []).filter((id): id is number => typeof id === 'number');
        const core = [keystoneId, primaryPerks[1], primaryPerks[2], primaryPerks[3]];
        if (core.some((id) => !id) || sec.length < 2) {
            if (onError) onError('Please select all primary and secondary runes.');
            return;
        }
        // Ensure we always have 3 shards (fill missing with defaults)
        while (shards.length < 3) {
            shards.push(5008);
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
                sec[0],
                sec[1],
                ...shards.slice(0, 3),
            ],
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
            // Revert optimistic update on failure (optional, but good practice)
            // For now, we rely on the next LCU update to fix it if it failed
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

    const waitForBenchAvailability = useCallback(async (championId: number, attempts = 8, delayMs = 300) => {
        for (let i = 0; i < attempts; i++) {
            try {
                const result = await lcuBridge.request('/lol-champ-select/v1/session/bench');
                if (result.status === 200) {
                    const parsed = normalizeBenchPayload(result.content);
                    if (parsed.length > 0) {
                        setBenchChampionIds(parsed);
                    }
                    if (parsed.includes(championId)) {
                        return true;
                    }
                }
            } catch (error) {
                console.warn('[ChampSelect] Bench availability check failed', error);
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        return false;
    }, [lcuBridge, normalizeBenchPayload]);

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
                        if (parsed.length > 0) setBenchChampionIds(parsed);
                    }
                } catch { /* ignore */ }

                // Refresh session once to update local player skin/pick info
                try {
                    const refreshResult = await lcuBridge.request('/lol-champ-select/v1/session');
                    if (refreshResult.status === 200 && refreshResult.content) {
                        const updatedLocalPlayer = refreshResult.content.myTeam?.find(
                            (m: any) => m.cellId === refreshResult.content.localPlayerCellId
                        );
                        if (updatedLocalPlayer?.championId && updatedLocalPlayer.championId > 0) {
                            loadSkins(updatedLocalPlayer.championId);
                        }
                        const inlinePickable = Array.isArray(refreshResult.content.pickableChampionIds)
                            ? refreshResult.content.pickableChampionIds.filter((id: any) => typeof id === 'number' && id > 0)
                            : [];
                        if (inlinePickable.length > 0) {
                            setPickableChampionIds(Array.from(new Set(inlinePickable)));
                        }
                        // update bench from session payload too
                        const parsedSessionBench = normalizeBenchPayload({
                            benchChampionIds: refreshResult.content.benchChampionIds,
                            benchChampions: (refreshResult.content as any)?.benchChampions,
                            champions: (refreshResult.content as any)?.champions,
                            championIds: (refreshResult.content as any)?.championIds
                        });
                        if (parsedSessionBench.length > 0) setBenchChampionIds(parsedSessionBench);
                    }
                } catch { /* ignore */ }
            } else {
                throw new Error(`Swap failed with status ${result.status}`);
            }
        } catch (error: any) {
            console.warn('Failed to swap:', error);
            const errorMsg = 'Wait for a while to swap!';
            if (onError) onError(errorMsg);

            // If swap fails (likely bench not ready), refresh bench once
            try {
                const benchRefresh = await lcuBridge.request('/lol-champ-select/v1/session/bench');
                if (benchRefresh.status === 200 && benchRefresh.content) {
                    const parsed = normalizeBenchPayload(benchRefresh.content);
                    if (parsed.length > 0) setBenchChampionIds(parsed);
                }
            } catch {
                // ignore
            }
        } finally {
            setSwappingChampionId(null);
            const nowTs = Date.now();
            swapCooldownRef.current.forEach((end, key) => {
                if (end <= nowTs) swapCooldownRef.current.delete(key);
            });
        }
    };

    const handleChampionSelect = async (championId: number) => {
        try {
            // Always work from the freshest session to avoid stale actions
            let session = champSelect;
            try {
                const res = await lcuBridge.request('/lol-champ-select/v1/session');
                if (res.status === 200 && res.content) {
                    session = res.content;
                    setChampSelect?.(res.content as any);
                }
            } catch {
                // ignore; fall back to current champSelect prop
            }
            if (!session) return;

            const localPlayerCellId = session.localPlayerCellId;
            const myTeam = session.myTeam || [];
            const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
            const hasPicked = !!(localPlayer?.championId && localPlayer.championId > 0);

            // In ARAM/Şamata modes, ensure we only try to pick from the offered pool
            if (isARAM) {
                const offeredSet = new Set(offeredChampionIds);
                if (offeredSet.size > 0 && !offeredSet.has(championId)) {
                    const msg = 'This champion is not in your offered pool for this roll.';
                    if (onError) onError(msg);
                    return;
                }
            }

            const actions = session.actions || [];
            const current = (() => {
                for (const turn of actions) {
                    for (const action of turn) {
                        if (
                            action.actorCellId === localPlayerCellId &&
                            !action.completed &&
                            action.isInProgress &&
                            (action.type || '').toLowerCase() === 'pick' &&
                            typeof action.id === 'number' &&
                            action.id >= 0
                        ) {
                            return action;
                        }
                    }
                }
                return null;
            })();

            if (!current) {
                const msg = 'No active pick turn right now.';
                if (onError) onError(msg);
                return;
            }

            // Hover the champion first if we have an active action
            if (current) {
                try {
                    await lcuBridge.request(`/lol-champ-select/v1/session/actions/${current.id}`, 'PATCH', { championId, completed: false });
                } catch (e) {
                    console.warn('[ChampSelect] Failed to hover champion', e);
                }
            }

            // Show confirmation modal
            setConfirmModal({ visible: true, championId, action: selectionMode });
        } catch (error) {
            console.warn('[ChampSelect] handleChampionSelect failed', error);
        }
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

    // Helper to determine member status from actions
    const getMemberStatus = useCallback((cellId: number, currentChampionId: number) => {
        if (!currentChampionId) return 'none';

        // Find the pick action for this cellId
        const actions = champSelect?.actions || [];
        for (const turn of actions) {
            for (const action of turn) {
                if (action.actorCellId === cellId && action.type === 'pick') {
                    if (action.completed) return 'picked';
                    // If action is in progress and they have a champion selected, it's a hover
                    // Note: LCU updates member.championId when hovering during their turn
                    if (action.championId === currentChampionId) return 'hovering';
                }
            }
        }

        // Fallback: if we have a championId but no active pick action found (e.g. post-lock or enemy),
        // we might assume it's picked if the phase is done, but for now let's assume 'hovering'
        // unless we can verify it's locked. 
        // Actually, for enemies in draft, we only see them when they lock (usually) or during their turn.
        // If it's blind pick, we don't see enemy.
        // Let's stick to: if championId > 0, check if there's a completed pick action.

        // Simplified check:
        // If there is ANY completed pick action for this cellId with this championId, it's picked.
        const hasCompletedPick = actions.some((turn: any[]) =>
            turn.some((a: any) => a.actorCellId === cellId && a.type === 'pick' && a.completed)
        );
        if (hasCompletedPick) return 'picked';

        return 'hovering';
    }, [champSelect?.actions]);

    // Enhance team members with champion data and status
    const enhancedMyTeam = useMemo(() => {
        return myTeam.map((m: any) => ({
            ...m,
            championName: championMap[m.championId]?.key || 'Unknown',
            status: getMemberStatus(m.cellId, m.championId)
        }));
    }, [myTeam, championMap, getMemberStatus]);

    const enhancedTheirTeam = useMemo(() => {
        return theirTeam.map((m: any) => ({
            ...m,
            championName: championMap[m.championId]?.key || 'Unknown',
            status: getMemberStatus(m.cellId, m.championId)
        }));
    }, [theirTeam, championMap, getMemberStatus]);

    // Calculate grid states
    const hoveredId = localPlayer?.championId && localPlayer.championId > 0 ? localPlayer.championId : null;

    const teammateHoveredIds = useMemo(() => {
        return enhancedMyTeam
            .filter((m: any) => m.cellId !== localPlayerCellId && m.status === 'hovering' && m.championId > 0)
            .map((m: any) => m.championId);
    }, [enhancedMyTeam, localPlayerCellId]);

    const pickedIds = useMemo(() => {
        const ids = new Set<number>();
        [...enhancedMyTeam, ...enhancedTheirTeam].forEach((m: any) => {
            if (m.status === 'picked' && m.championId > 0) {
                ids.add(m.championId);
            }
        });
        return Array.from(ids);
    }, [enhancedMyTeam, enhancedTheirTeam]);

    const bannedIds = useMemo(() => {
        const ids = new Set<number>();
        if (champSelect?.bans?.myTeamBans) champSelect.bans.myTeamBans.forEach((id: number) => ids.add(id));
        if (champSelect?.bans?.theirTeamBans) champSelect.bans.theirTeamBans.forEach((id: number) => ids.add(id));
        return Array.from(ids);
    }, [champSelect?.bans]);

    // Sync optimistic spells with real state when it updates
    useEffect(() => {
        if (!localPlayer) return;
        // If real state matches optimistic, or if real state changed to something else, clear optimistic
        if (optimisticSpells.spell1Id && localPlayer.spell1Id === optimisticSpells.spell1Id) {
            setOptimisticSpells(prev => ({ ...prev, spell1Id: null }));
        }
        if (optimisticSpells.spell2Id && localPlayer.spell2Id === optimisticSpells.spell2Id) {
            setOptimisticSpells(prev => ({ ...prev, spell2Id: null }));
        }
    }, [localPlayer?.spell1Id, localPlayer?.spell2Id, optimisticSpells]);

    const activeSpell1 = optimisticSpells.spell1Id ?? localPlayer?.spell1Id;
    const activeSpell2 = optimisticSpells.spell2Id ?? localPlayer?.spell2Id;

    // Filter champions for ARAM pick phase (if specific pool is provided)
    const displayedChampions = useMemo(() => {
        if (isARAM && pickableChampionIds.length > 0) {
            const allowed = new Set(pickableChampionIds);
            return champions.filter(c => allowed.has(c.id));
        }
        return champions;
    }, [champions, isARAM, pickableChampionIds]);

    const benchChampionIds = useMemo(() => {
        const parsed = normalizeBenchPayload({
            benchChampionIds: champSelect?.benchChampionIds,
            benchChampions: (champSelect as any)?.benchChampions,
            champions: (champSelect as any)?.champions,
            championIds: (champSelect as any)?.championIds
        });
        return Array.isArray(parsed) ? parsed : [];
    }, [champSelect, normalizeBenchPayload]);

    const offeredChampionIds = useMemo(() => {
        if (!isARAM) return [];

        if (benchChampionIds.length > 0) return Array.from(new Set(benchChampionIds));

        const inline = Array.isArray(pickableChampionIds) ? pickableChampionIds : [];
        if (inline.length > 0) return Array.from(new Set(inline));

        return [];
    }, [benchChampionIds, isARAM, pickableChampionIds]);

    const hasOfferedPool = offeredChampionIds.length > 0;
    const showBenchWidget = isARAM;

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.timerText}>{timeLeft > 0 ? timeLeft : '--'}</Text>
                    <Text style={styles.phaseText}>{currentAction?.type?.toLowerCase() === 'ban' ? 'Ban Phase' : 'Pick Phase'}</Text>
                    {/* Debug Info for ARAM */}
                    <Text style={{ color: 'yellow', fontSize: 10 }}>
                        ARAM:{isARAM ? 'Y' : 'N'} BenchEn:{showBench ? 'Y' : 'N'}
                        Bench#{benchChampionIds.length}
                        Pick#{pickableChampionIds.length}
                        {loadingBench ? ' (bench..)' : ''}
                    </Text>
                    {loadingResources && <ActivityIndicator size="small" color="#4f46e5" style={{ marginTop: 5 }} />}
                </View>

                <Tab
                    value={index}
                    onChange={(e) => setIndex(e)}
                    indicatorStyle={{ backgroundColor: '#4f46e5', height: 3 }}
                    variant="primary"
                >
                    <Tab.Item title="Champion" titleStyle={styles.tabTitle} containerStyle={styles.tabItem} />
                    <Tab.Item title="Loadout" titleStyle={styles.tabTitle} containerStyle={styles.tabItem} />
                </Tab>

                <TabView value={index} onChange={setIndex} animationType="spring">
                    {/* Champion Tab */}
                    <TabView.Item style={styles.tabContent}>
                        {isARAM ? (
                            <ScrollView
                                style={styles.championTabContent}
                                contentContainerStyle={styles.championTabContentContainer}
                                showsVerticalScrollIndicator={false}
                                nestedScrollEnabled
                            >
                                <View style={styles.teamViewContainer}>
                                    <TeamView
                                        myTeam={enhancedMyTeam}
                                        theirTeam={enhancedTheirTeam}
                                        bans={[]}
                                        version={ddragonVersion}
                                    />
                                </View>

                                {showBenchWidget && (
                                    <View style={styles.aramScrollWrapper}>
                                        <View style={styles.aramMessageContainer}>
                                            <Text style={styles.aramMessage}>ARAM Bench</Text>
                                            <Text style={styles.aramSubMessage}>Your available swaps appear below.</Text>
                                        </View>

                                        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Available to Swap</Text>
                                        {(!benchChampionIds || benchChampionIds.length === 0) ? (
                                            <View style={styles.emptyBenchContainer}>
                                                {loadingBench ? (
                                                    <ActivityIndicator size="small" color="#4f46e5" />
                                                ) : (
                                                    <>
                                                        <Text style={styles.emptyBenchText}>Bench is empty right now</Text>
                                                        <Text style={styles.emptyBenchSubText}>Unpicked champs will appear here</Text>
                                                    </>
                                                )}
                                            </View>
                                        ) : (
                                            <View style={styles.benchGrid}>
                                                {benchChampionIds.map((id: number) => {
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
                                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                            activeOpacity={0.8}
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
                                        )}
                                    </View>
                                )}
                            </ScrollView>
                        ) : (
                            <View style={styles.championTabContent}>
                                <View style={styles.teamViewContainer}>
                                    <TeamView
                                        myTeam={enhancedMyTeam}
                                        theirTeam={enhancedTheirTeam}
                                        bans={bannedIds}
                                        version={ddragonVersion}
                                    />
                                </View>

                                <View style={styles.pickModeRow}>
                                    <Text style={styles.sectionLabel}>
                                        {currentAction?.type?.toLowerCase() === 'ban' ? 'Ban Phase' : 'Pick Phase'}
                                    </Text>
                                </View>
                                <View style={styles.gridContainer}>
                                    <ChampionGrid
                                        champions={displayedChampions}
                                        onSelect={handleChampionSelect}
                                        version={ddragonVersion}
                                        disabled={!isARAM && hasPickedChampion && selectionMode === 'pick' && !currentAction}
                                        hoveredId={hoveredId}
                                        teammateHoveredIds={teammateHoveredIds}
                                        pickedIds={pickedIds}
                                        bannedIds={bannedIds}
                                    />
                                </View>
                            </View>
                        )}
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
                            <View style={styles.runeActionsRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.currentRuneLabel}>Current Page</Text>
                                    <Text style={styles.currentRuneName}>{runes.find(r => r.isActive)?.name || 'None selected'}</Text>
                                </View>
                                <View style={styles.runeActionButtons}>
                                    <Button
                                        title="Edit"
                                        type="outline"
                                        onPress={() => openRuneBuilder({ edit: true })}
                                        buttonStyle={styles.secondaryButton}
                                        titleStyle={styles.secondaryButtonTitle}
                                        containerStyle={[styles.secondaryButtonContainer, { marginRight: 6 }]}
                                    />
                                    <Button
                                        title="New Page"
                                        type="solid"
                                        onPress={openNewRuneBuilder}
                                        buttonStyle={[styles.secondaryButton, { backgroundColor: '#4f46e5' }]}
                                        titleStyle={styles.secondaryButtonTitle}
                                        containerStyle={styles.secondaryButtonContainer}
                                    />
                                </View>
                            </View>

                            <Text style={styles.sectionTitle}>Spells</Text>
                            <View style={styles.spellsContainer}>
                                <TouchableOpacity style={styles.spellButton} onPress={() => openSpellPicker(true)}>
                                    <Image
                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(activeSpell1)}.png` }}
                                        style={styles.spellIcon}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.spellButton} onPress={() => openSpellPicker(false)}>
                                    <Image
                                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${getSpellName(activeSpell2)}.png` }}
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

                {/* Confirm pick/ban */}
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

                {/* Rune builder */}
                <Modal
                    visible={showRuneBuilder}
                    animationType="slide"
                    transparent
                    onRequestClose={() => setShowRuneBuilder(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalCard, { maxHeight: '90%', width: '95%', padding: 0, overflow: 'hidden', flex: 1 }]}>
                            {/* Sticky Header */}
                            <View style={styles.runeBuilderHeader}>
                                <View>
                                    <Text style={styles.modalTitle}>{editingPageId ? 'Edit Rune Page' : 'Create Rune Page'}</Text>
                                    <Text style={styles.modalSubtitle}>{editingPageId ? 'Update your current setup' : 'Customize your playstyle'}</Text>
                                </View>
                                <View style={styles.headerActions}>
                                    <Button
                                        title="Cancel"
                                        type="clear"
                                        onPress={() => setShowRuneBuilder(false)}
                                        titleStyle={{ color: '#9ca3af' }}
                                    />
                                    <Button
                                        title={editingPageId ? 'Save Changes' : 'Create Page'}
                                        onPress={handleCreateRunePage}
                                        buttonStyle={styles.saveButton}
                                        icon={{ name: 'save', type: 'font-awesome', color: 'white', size: 14 }}
                                    />
                                </View>
                            </View>

                            <ScrollView style={styles.runeBuilderContent} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                                {!perkStyles.length ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                                        <ActivityIndicator color="#4f46e5" />
                                        <Text style={{ color: '#9ca3af', marginTop: 12 }}>Loading runes from LCU...</Text>
                                    </View>
                                ) : null}

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
                                            {(perkStyles.find((s: any) => s.id === subStyleId)?.slots || [])
                                                .slice(1) // drop keystone slot
                                                .slice(0, 3) // ensure three rows
                                                .map((slot: any, slotIdx: number) => {
                                                    const slotIndex = slotIdx + 1; // matches original slot numbering (1,2,3)
                                                    return (
                                                        <View key={`secondary-slot-${slotIndex}`} style={styles.slotContainer}>
                                                            <View style={styles.perkRow}>
                                                                {(slot.perks || []).filter(Boolean).map((perk: any, perkIdx: number) => {
                                                                    const perkId = typeof perk === 'number' ? perk : perk?.id;
                                                                    const iconUri = safeImageUri(getRuneIconUri(perk));
                                                                    const hasFailed = iconUri ? failedRuneImages.has(iconUri) : true;
                                                                    const isSelected = secondaryPerks.includes(perkId);

                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={`secondary-${slotIndex}-${perkId ?? `idx-${perkIdx}`}`}
                                                                            style={[
                                                                                styles.perkCard,
                                                                                isSelected && styles.perkCardActive
                                                                            ]}
                                                                            onPress={() => toggleSecondaryPerk(perkId, slotIndex)}
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
                                                    );
                                                })}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.runeSection}>
                                    <View style={styles.runeRowHeader}>
                                        <Text style={styles.sectionLabel}>Stat Shards</Text>
                                        <View style={styles.divider} />
                                    </View>
                                    <View style={styles.shardContainer}>
                                        {shardRows.map((row, idx) => (
                                            <View key={`shard-row-${idx}`} style={styles.shardRow}>
                                                {row.map((opt) => {
                                                    const selected = statShards[idx] === opt.id;
                                                    return (
                                                        <TouchableOpacity
                                                            key={`shard-${idx}-${opt.id}`}
                                                            style={[styles.shardButton, selected && styles.shardButtonActive]}
                                                            onPress={() => {
                                                                const next = [...statShards];
                                                                next[idx] = opt.id;
                                                                setStatShards(next as number[]);
                                                            }}
                                                        >
                                                            {safeImageUri(getRuneIconUri(opt.id)) ? (
                                                                <Image
                                                                    source={{ uri: getRuneIconUri(opt.id)! }}
                                                                    style={[styles.shardIcon, !selected && { opacity: 0.45 }]}
                                                                />
                                                            ) : null}
                                                            <Text style={[styles.shardText, selected && styles.shardTextActive]}>
                                                                {opt.label}
                                                            </Text>
                                                            <Text style={styles.shardSubText}>{opt.desc}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        ))}
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
        flex: 1,
    },
    championTabContentContainer: {
        paddingBottom: 32,
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
    offeredPlaceholder: {
        marginHorizontal: 16,
        marginTop: 12,
        padding: 16,
        borderRadius: 12,
        backgroundColor: '#111827',
        borderWidth: 1,
        borderColor: '#1f2937',
        alignItems: 'center',
    },
    offeredHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    offeredHint: {
        color: '#9ca3af',
        fontSize: 12,
    },
    offeredTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    offeredSubtitle: {
        color: '#9ca3af',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },
    offeredAction: {
        marginTop: 6,
        color: '#4f46e5',
        fontSize: 12,
        fontWeight: '700',
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
    runeActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginHorizontal: 20,
    },
    runeActionButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    currentRuneLabel: {
        color: '#9ca3af',
        fontSize: 12,
    },
    currentRuneName: {
        color: '#e5e7eb',
        fontSize: 14,
        fontWeight: '700',
        marginTop: 2,
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
    benchGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 6,
        paddingBottom: 24,
    },
    offeredContainer: {
        paddingHorizontal: 20,
        marginTop: 12,
    },
    offeredRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    offeredItem: {
        alignItems: 'center',
        width: 80,
        marginRight: 10,
        marginBottom: 10,
    },
    offeredIcon: {
        width: 64,
        height: 64,
        borderRadius: 10,
        marginBottom: 6,
        backgroundColor: '#171717',
    },
    benchItem: {
        width: 104,
        backgroundColor: '#171717',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#262626',
        overflow: 'hidden',
        marginBottom: 14,
    },
    benchItemSwapping: {
        opacity: 0.6,
        borderColor: '#4f46e5',
    },
    benchImage: {
        width: 104,
        height: 104,
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
        letterSpacing: 0.5,
    },
    benchChampionName: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 6,
        maxWidth: 104,
    },
    benchLoadingContainer: {
        width: 104,
        height: 104,
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
    shardIcon: {
        width: 28,
        height: 28,
        marginBottom: 6,
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
        gap: 12,
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
        textAlign: 'center',
        fontWeight: '600',
    },
    shardTextActive: {
        color: '#ffffff',
        fontWeight: '600',
    },
    shardSubText: {
        color: '#6b7280',
        fontSize: 10,
        marginTop: 2,
        textAlign: 'center',
    },
    slotContainer: {
        marginBottom: 12,
    },
});
