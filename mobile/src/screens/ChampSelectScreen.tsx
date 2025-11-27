import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
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
}

export default function ChampSelectScreen({ champSelect, onPick, onBan }: ChampSelectScreenProps) {
    const [index, setIndex] = useState(0);
    const [champions, setChampions] = useState<any[]>([]);
    const [championMap, setChampionMap] = useState<{ [key: number]: any }>({});
    const [runes, setRunes] = useState<any[]>([]);
    const [spells, setSpells] = useState<any[]>([]);
    const [bench, setBench] = useState<any[]>([]);
    const [rerollState, setRerollState] = useState<any>(null);
    const [ddragonVersion, setDdragonVersion] = useState('14.23.1');
    const [loading, setLoading] = useState(true);

    // Picker States
    const [showSpellPicker, setShowSpellPicker] = useState(false);
    const [pickingFirstSpell, setPickingFirstSpell] = useState(true);
    const [showSkinPicker, setShowSkinPicker] = useState(false);
    const [showRunePicker, setShowRunePicker] = useState(false);
    const [skins, setSkins] = useState<any[]>([]);

    const lcuBridge = getLCUBridge();
    const localPlayerCellId = champSelect?.localPlayerCellId;
    const myTeam = champSelect?.myTeam || [];
    const theirTeam = champSelect?.theirTeam || [];
    const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId);
    const isARAM = champSelect?.benchEnabled;

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
        try {
            await lcuBridge.request(`/lol-champ-select/v1/session/bench/swap/${championId}`, 'POST');
        } catch (error) {
            console.error('Failed to swap:', error);
        }
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
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.timerText}>{champSelect?.timer?.adjustedTimeLeftInPhase ? Math.ceil(champSelect.timer.adjustedTimeLeftInPhase / 1000) : '--'}</Text>
                <Text style={styles.phaseText}>{champSelect?.timer?.phase}</Text>
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
                    <View style={{ flex: 1 }}>
                        {/* Team View */}
                        <View style={styles.teamViewContainer}>
                            <TeamView
                                myTeam={enhancedMyTeam}
                                theirTeam={enhancedTheirTeam}
                                bans={[]}
                                version={ddragonVersion}
                            />
                        </View>

                        {/* Champion Grid - Hide in ARAM */}
                        {!isARAM && (
                            <View style={styles.gridContainer}>
                                <ChampionGrid
                                    champions={champions}
                                    onSelect={onPick}
                                    version={ddragonVersion}
                                />
                            </View>
                        )}

                        {/* ARAM Bench in Champion Tab (if preferred) or just keep in ARAM tab */}
                        {isARAM && (
                            <View style={styles.aramMessageContainer}>
                                <Text style={styles.aramMessage}>ARAM: Random Champion Assigned</Text>
                                <Text style={styles.aramSubMessage}>Use the ARAM tab to reroll or swap.</Text>
                            </View>
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
                            <View style={styles.benchGrid}>
                                {champSelect?.benchChampionIds?.map((id: number) => (
                                    <TouchableOpacity key={id} onPress={() => handleSwap(id)} style={styles.benchItem}>
                                        <Image
                                            source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championMap[id]?.key}.png` }}
                                            style={styles.benchImage}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </TabView.Item>
                )}
            </TabView>

            {/* Pickers */}
            <SpellPicker
                visible={showSpellPicker}
                onSelect={handleSpellSelect}
                onClose={() => setShowSpellPicker(false)}
                spells={spells}
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
        </View >
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
    teamViewContainer: {
        paddingHorizontal: 10,
        paddingBottom: 10,
        backgroundColor: '#171717',
        borderBottomWidth: 1,
        borderBottomColor: '#262626',
        maxHeight: 200, // Limit height so grid has space
    },
    gridContainer: {
        flex: 1,
        padding: 10,
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
        width: 60,
        height: 60,
        backgroundColor: '#171717',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#262626',
        overflow: 'hidden',
    },
    benchImage: {
        width: '100%',
        height: '100%',
    },
    aramMessageContainer: {
        flex: 1,
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
});
