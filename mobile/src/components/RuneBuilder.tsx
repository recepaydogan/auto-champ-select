import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Image, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface RuneBuilderProps {
    visible: boolean;
    onClose: () => void;
    onSave: (page: any) => void | Promise<void>;
    initialPage?: any;
    perkStyles: any[];
    runeIconMap: Record<number, string>;
    normalizeRuneIcon: (path: string | undefined, id?: number) => string;
    onDelete?: () => void | Promise<void>;
    canDelete?: boolean;
    onCreateNew?: () => void;
}

const GOLD = '#c7b37b';
const INK = '#0b1a26';
const PANEL = '#0f1c2d';
const TEXT = '#f0e6d2';
const MUTED = '#9aa7b5';
const BORDER = '#2c3c4c';

const statShardsRows = [
    [
        { id: 5008, label: 'AP/AD', icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png' },
        { id: 5005, label: 'ATKSPD', icon: 'perk-images/StatMods/StatModsAttackSpeedIcon.png' },
        { id: 5007, label: 'CDR', icon: 'perk-images/StatMods/StatModsCDRScalingIcon.png' }
    ],
    [
        { id: 5008, label: 'AP/AD', icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png' },
        { id: 5010, label: 'MS', icon: 'perk-images/StatMods/StatModsMovementSpeedIcon.png' },
        { id: 5001, label: 'HP', icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png' }
    ],
    [
        { id: 5011, label: 'HP', icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png' },
        { id: 5013, label: 'TENACITY', icon: 'perk-images/StatMods/StatModsTenacityIcon.png' },
        { id: 5001, label: 'HP', icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png' }
    ]
];

const shardIds = new Set(statShardsRows.flatMap(row => row.map(s => s.id)));

export default function RuneBuilder({
    visible,
    onClose,
    onSave,
    initialPage,
    perkStyles,
    normalizeRuneIcon,
    onDelete,
    canDelete,
    onCreateNew
}: RuneBuilderProps) {
    const [pageName, setPageName] = useState('Custom Page');
    const [primaryStyleId, setPrimaryStyleId] = useState<number | null>(null);
    const [subStyleId, setSubStyleId] = useState<number | null>(null);
    const [keystoneId, setKeystoneId] = useState<number | null>(null);
    const [primaryRows, setPrimaryRows] = useState<(number | null)[]>([null, null, null]);
    const [secondaryRows, setSecondaryRows] = useState<(number | null)[]>([null, null, null]);
    const [statShards, setStatShards] = useState<number[]>([5008, 5008, 5001]);
    const [error, setError] = useState('');
    const [hydratedKey, setHydratedKey] = useState<string | null>(null);
    const isDirtyRef = React.useRef(false);

    const styleById = useMemo(() => {
        const map: Record<number, any> = {};
        perkStyles.forEach((style: any) => {
            if (style?.id) map[style.id] = style;
        });
        return map;
    }, [perkStyles]);

    const slotMap = useMemo(() => {
        const map: { [id: number]: { styleId: number; slot: number } } = {};
        perkStyles.forEach((style: any) => {
            style?.slots?.forEach((slot: any, idx: number) => {
                slot?.perks?.forEach((perk: any) => {
                    const perkId = typeof perk === 'number' ? perk : perk?.id;
                    if (perkId) {
                        map[perkId] = { styleId: style.id, slot: idx };
                    }
                });
            });
        });
        return map;
    }, [perkStyles]);

    const pickFirstPerk = useCallback((styleId: number | null, slotIndex: number) => {
        if (!styleId) return null;
        const style = styleById[styleId];
        const perk = style?.slots?.[slotIndex]?.perks?.[0];
        if (!perk) return null;
        return typeof perk === 'number' ? perk : perk.id;
    }, [styleById]);

    const defaultSecondaryRows = useCallback((styleId: number | null): (number | null)[] => {
        const defaults: (number | null)[] = [
            pickFirstPerk(styleId, 1),
            pickFirstPerk(styleId, 2),
            pickFirstPerk(styleId, 3)
        ];
        if (defaults.filter(Boolean).length > 2) {
            defaults[2] = null;
        }
        return defaults;
    }, [pickFirstPerk]);

    const markDirty = () => { isDirtyRef.current = true; };

    const computePageKey = useCallback((pageData?: any) => {
        if (!pageData) return 'new';
        const perkSig = Array.isArray(pageData.selectedPerkIds) ? pageData.selectedPerkIds.join(',') : 'none';
        return `${pageData.id ?? 'new'}-${pageData.name ?? 'Custom'}-${perkSig}`;
    }, []);

    const applyInitialFromPage = useCallback((pageData?: any) => {
        if (!perkStyles.length) return;

        const fallbackPrimary = pageData?.primaryStyleId || perkStyles[0]?.id || null;
        let fallbackSub = pageData?.subStyleId;
        if (!fallbackSub || fallbackSub === fallbackPrimary) {
            const alt = perkStyles.find((s: any) => s.id !== fallbackPrimary);
            fallbackSub = alt?.id || fallbackPrimary;
        }

        const incoming = Array.isArray(pageData?.selectedPerkIds) ? pageData.selectedPerkIds : [];

        let keystone = pickFirstPerk(fallbackPrimary, 0);
        const primaries = [
            pickFirstPerk(fallbackPrimary, 1),
            pickFirstPerk(fallbackPrimary, 2),
            pickFirstPerk(fallbackPrimary, 3)
        ];
        let secondaries: (number | null)[] = [null, null, null];

        incoming.forEach((perkId: number) => {
            if (shardIds.has(perkId)) return;
            const slotInfo = slotMap[perkId];
            if (!slotInfo) return;

            if (slotInfo.styleId === fallbackPrimary) {
                if (slotInfo.slot === 0) keystone = perkId;
                else if (slotInfo.slot >= 1 && slotInfo.slot <= 3) {
                    primaries[slotInfo.slot - 1] = perkId;
                }
            } else if (slotInfo.styleId === fallbackSub && slotInfo.slot > 0) {
                const rowIndex = slotInfo.slot - 1;
                if (rowIndex >= 0 && rowIndex < secondaries.length) {
                    secondaries[rowIndex] = perkId;
                }
            }
        });

        const baseSecondaryDefaults = [
            pickFirstPerk(fallbackSub, 1),
            pickFirstPerk(fallbackSub, 2),
            pickFirstPerk(fallbackSub, 3)
        ];

        let filledSecondary = secondaries.filter(Boolean).length;
        if (filledSecondary < 2) {
            for (let i = 0; i < baseSecondaryDefaults.length && filledSecondary < 2; i++) {
                if (!secondaries[i] && baseSecondaryDefaults[i]) {
                    secondaries[i] = baseSecondaryDefaults[i];
                    filledSecondary += 1;
                }
            }
        } else if (filledSecondary > 2) {
            const trimmed: (number | null)[] = [null, null, null];
            let kept = 0;
            for (let i = 0; i < secondaries.length; i++) {
                if (secondaries[i] && kept < 2) {
                    trimmed[i] = secondaries[i];
                    kept += 1;
                }
            }
            secondaries = trimmed;
        }

        const incomingShards = incoming.filter((id: number) => shardIds.has(id));
        const shardSelection = [
            incomingShards[0] || statShardsRows[0][0].id,  // Row 0: AP/AD (5008)
            incomingShards[1] || statShardsRows[1][1].id,  // Row 1: ARMOR (5002)
            incomingShards[2] || statShardsRows[2][2].id   // Row 2: MR (5003)
        ];

        setPageName(pageData?.name || 'Custom Page');
        setPrimaryStyleId(fallbackPrimary);
        setSubStyleId(fallbackSub);
        setKeystoneId(keystone);
        setPrimaryRows(primaries);
        setSecondaryRows(secondaries);
        setStatShards(shardSelection);
        setError('');
        isDirtyRef.current = false;
    }, [perkStyles, pickFirstPerk, slotMap]);

    useEffect(() => {
        if (!visible) {
            setHydratedKey(null);
            isDirtyRef.current = false;
            return;
        }
        const nextKey = computePageKey(initialPage);
        if (isDirtyRef.current && hydratedKey === nextKey) return;
        if (hydratedKey === nextKey) return;
        applyInitialFromPage(initialPage);
        setHydratedKey(nextKey);
    }, [visible, initialPage, applyInitialFromPage, computePageKey, hydratedKey]);

    const setPrimaryStyle = (styleId: number) => {
        markDirty();
        setPrimaryStyleId(styleId);
        setKeystoneId(pickFirstPerk(styleId, 0));
        setPrimaryRows([
            pickFirstPerk(styleId, 1),
            pickFirstPerk(styleId, 2),
            pickFirstPerk(styleId, 3)
        ]);
        if (subStyleId === styleId) {
            const fallback = perkStyles.find((s: any) => s.id !== styleId);
            setSubStyleId(fallback?.id || null);
            setSecondaryRows(defaultSecondaryRows(fallback?.id || null));
        }
        setError('');
    };

    const setSecondaryStyle = (styleId: number) => {
        markDirty();
        setSubStyleId(styleId);
        setSecondaryRows(defaultSecondaryRows(styleId));
        setError('');
    };

    const togglePrimaryRune = (slotIndex: number, perkId: number) => {
        markDirty();
        if (slotIndex === 0) {
            setKeystoneId(perkId);
        } else {
            const next = [...primaryRows];
            next[slotIndex - 1] = perkId;
            setPrimaryRows(next);
        }
        setError('');
    };

    const toggleSecondaryRune = (rowIndex: number, perkId: number) => {
        markDirty();
        setSecondaryRows(prev => {
            const next = [...prev];
            next[rowIndex] = next[rowIndex] === perkId ? null : perkId;
            let filled = next.filter(Boolean).length;
            if (filled > 2) {
                for (let i = 0; i < next.length && filled > 2; i++) {
                    if (i !== rowIndex && next[i]) {
                        next[i] = null;
                        filled -= 1;
                    }
                }
            }
            return next;
        });
        setError('');
    };

    const toggleShard = (rowIndex: number, shardId: number) => {
        markDirty();
        const next = [...statShards];
        next[rowIndex] = shardId;
        setStatShards(next);
        setError('');
    };

    const buildSelectedPerks = () => {
        if (!primaryStyleId || !subStyleId) throw new Error('Pick both rune paths.');
        if (!keystoneId) throw new Error('Pick a keystone.');
        if (primaryRows.some(p => !p)) throw new Error('Pick all primary runes.');

        const secondary = secondaryRows.filter(Boolean).slice(0, 2) as number[];
        if (secondary.length < 2) throw new Error('Pick two secondary runes.');

        return [
            keystoneId,
            ...(primaryRows as number[]),
            ...secondary,
            ...statShards
        ];
    };

    const handleSave = async () => {
        try {
            const selectedPerkIds = buildSelectedPerks();
            const payload = {
                id: initialPage?.id,
                name: pageName.trim() || 'Custom Page',
                primaryStyleId,
                subStyleId,
                selectedPerkIds
            };
            await onSave(payload);
            setError('');
        } catch (err: any) {
            setError(err?.message || 'Please complete your rune page.');
        }
    };

    const handleReset = () => {
        markDirty();
        applyInitialFromPage({ name: 'Custom Page' });
    };

    const handleDelete = async () => {
        if (!onDelete || !canDelete) return;
        try {
            await onDelete();
        } catch (err: any) {
            setError(err?.message || 'Could not delete page.');
        }
    };

    const renderIcon = (uri: string, style: any, placeholder: string) => {
        if (!uri) {
            return (
                <View style={[style, styles.iconFallback]}>
                    <Text style={styles.iconFallbackText}>{placeholder}</Text>
                </View>
            );
        }
        return <Image source={{ uri }} style={style} />;
    };

    const renderStyleSelector = (selectedId: number | null, onSelect: (id: number) => void, disabledId?: number | null) => (
        <View style={styles.pathRow}>
            {perkStyles.map((style: any) => {
                const isSelected = selectedId === style.id;
                const isDisabled = disabledId === style.id;
                const iconUri = normalizeRuneIcon(style.iconPath, style.id);
                return (
                    <TouchableOpacity
                        key={style.id}
                        disabled={isDisabled}
                        onPress={() => onSelect(style.id)}
                        style={[
                            styles.pathBubble,
                            isSelected && styles.pathBubbleActive,
                            isDisabled && styles.pathBubbleDisabled
                        ]}
                    >
                        {renderIcon(iconUri, [styles.pathIcon, (!isSelected || isDisabled) && styles.dimIcon], '?')}
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    const renderRuneRow = (perks: any[], slotIndex: number, opts?: { keystone?: boolean; secondary?: boolean; rowIndex?: number }) => {
        const isKeystone = opts?.keystone;
        const isSecondary = opts?.secondary;
        const secondaryRowIndex = opts?.rowIndex ?? 0;

        const selectedId = isKeystone
            ? keystoneId
            : isSecondary
                ? secondaryRows[secondaryRowIndex]
                : primaryRows[slotIndex - 1];

        const onSelect = (perkId: number) => {
            if (isKeystone) togglePrimaryRune(0, perkId);
            else if (isSecondary) toggleSecondaryRune(secondaryRowIndex, perkId);
            else togglePrimaryRune(slotIndex, perkId);
        };

        return (
            <View style={styles.runeRow}>
                {perks.map((perk: any) => {
                    const perkId = typeof perk === 'number' ? perk : perk?.id;
                    const iconUri = normalizeRuneIcon((perk as any)?.iconPath || (perk as any)?.icon, perkId);
                    const isSelected = perkId && selectedId === perkId;
                    return (
                        <TouchableOpacity
                            key={perkId}
                            onPress={() => onSelect(perkId)}
                            style={[styles.runeCell, isKeystone && styles.keystoneCell]}
                        >
                            {renderIcon(iconUri, [
                                styles.runeIcon,
                                isKeystone && styles.keystoneIcon,
                                !isSelected && styles.dimIcon
                            ], '!')}
                            {isSelected && <View style={styles.runeRing} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    const renderStatRow = (row: { id: number; label: string; icon: string }[], rowIndex: number) => (
        <View style={styles.statRow}>
            {row.map((shard) => {
                const iconUri = normalizeRuneIcon(shard.icon, shard.id);
                const isSelected = statShards[rowIndex] === shard.id;
                return (
                    <TouchableOpacity
                        key={shard.id}
                        onPress={() => toggleShard(rowIndex, shard.id)}
                        style={[styles.statBubble, isSelected && styles.statBubbleActive]}
                    >
                        {renderIcon(iconUri, [styles.statIcon, !isSelected && styles.dimIcon], '*')}
                        <Text style={[styles.statLabel, isSelected && styles.statLabelActive]}>{shard.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    const primaryStyle = primaryStyleId ? styleById[primaryStyleId] : null;
    const secondaryStyle = subStyleId ? styleById[subStyleId] : null;

    const RowWithRail = ({ children }: { children: React.ReactNode }) => (
        <View style={styles.rowWithRail}>
            <View style={styles.railColumn}>
                <View style={styles.railLine} />
                <View style={styles.railDiamond} />
            </View>
            <View style={styles.rowContent}>
                {children}
            </View>
        </View>
    );

    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.sectionBody}>
                {children}
            </View>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <SafeAreaView style={{ flex: 1, width: '100%' }}>
                    <View style={{ flex: 1, paddingVertical: 20 }}>
                        <LinearGradient colors={[INK, PANEL]} style={styles.card}>
                            <View style={styles.titleBar}>
                                <View>
                                    <Text style={styles.titleText}>Edit Rune Pages</Text>
                                    <Text style={styles.subtitle}>Tune every slot before you lock in</Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                    <Text style={styles.closeText}>X</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.pageBar}>
                                <View style={styles.nameBox}>
                                    <TextInput
                                        value={pageName}
                                        onChangeText={(txt) => { setPageName(txt); markDirty(); }}
                                        placeholder="Custom Page"
                                        placeholderTextColor={MUTED}
                                        style={styles.nameInput}
                                    />
                                    <Text style={styles.dropdownGlyph}>v</Text>
                                </View>
                                <TouchableOpacity onPress={onCreateNew || handleReset} style={styles.roundButton}>
                                    <Text style={styles.roundButtonText}>+</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleDelete}
                                    disabled={!canDelete}
                                    style={[styles.roundButton, { marginLeft: 8 }, !canDelete && styles.roundButtonDisabled]}
                                >
                                    <Text style={[styles.roundButtonText, !canDelete && styles.roundButtonTextDisabled]}>DEL</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                                <Section title="PRIMARY TREE">
                                    <RowWithRail>
                                        {renderStyleSelector(primaryStyleId, setPrimaryStyle)}
                                    </RowWithRail>
                                    {primaryStyle?.slots?.[0] && (
                                        <RowWithRail>
                                            {renderRuneRow(primaryStyle.slots[0].perks, 0, { keystone: true })}
                                        </RowWithRail>
                                    )}
                                    {primaryStyle?.slots?.slice(1, 4).map((slot: any, idx: number) => (
                                        <RowWithRail key={idx}>
                                            {renderRuneRow(slot.perks, idx + 1)}
                                        </RowWithRail>
                                    ))}
                                </Section>

                                <Section title="SECONDARY TREE">
                                    <RowWithRail>
                                        {renderStyleSelector(subStyleId, setSecondaryStyle, primaryStyleId)}
                                    </RowWithRail>
                                    {secondaryStyle?.slots?.slice(1, 4).map((slot: any, idx: number) => (
                                        <RowWithRail key={idx}>
                                            {renderRuneRow(slot.perks, idx + 1, { secondary: true, rowIndex: idx })}
                                        </RowWithRail>
                                    ))}
                                </Section>

                                <Section title="STAT MODS">
                                    {statShardsRows.map((row, idx) => (
                                        <RowWithRail key={idx}>
                                            {renderStatRow(row, idx)}
                                        </RowWithRail>
                                    ))}
                                </Section>
                            </ScrollView>

                            {error ? <Text style={styles.errorText}>{error}</Text> : null}

                            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                                <Text style={styles.saveText}>Save & Apply</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        paddingHorizontal: 12,
        // paddingVertical is dynamic based on insets
    },
    card: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 18
    },
    titleBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    titleText: {
        color: TEXT,
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5
    },
    subtitle: {
        color: MUTED,
        fontSize: 12,
        marginTop: 4
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: GOLD,
        alignItems: 'center',
        justifyContent: 'center'
    },
    closeText: {
        color: GOLD,
        fontSize: 14,
        fontWeight: '700'
    },
    pageBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12
    },
    nameBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: PANEL,
        borderWidth: 1,
        borderColor: BORDER,
        paddingHorizontal: 12,
        height: 40,
        marginRight: 8
    },
    nameInput: {
        flex: 1,
        color: TEXT,
        fontSize: 14
    },
    dropdownGlyph: {
        color: GOLD,
        fontSize: 14,
        marginLeft: 6
    },
    roundButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: GOLD,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PANEL
    },
    roundButtonDisabled: {
        borderColor: BORDER
    },
    roundButtonText: {
        color: GOLD,
        fontSize: 13,
        fontWeight: '700'
    },
    roundButtonTextDisabled: {
        color: MUTED
    },
    scroll: {
        flex: 1
    },
    section: {
        marginTop: 10,
        marginBottom: 12
    },
    sectionTitle: {
        color: TEXT,
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 10
    },
    sectionBody: {
        // Default column layout
    },
    rowWithRail: {
        flexDirection: 'row',
        alignItems: 'stretch' // Ensure rail stretches to match content height
    },
    railColumn: {
        width: 30,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
    },
    railLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: GOLD
    },
    railDiamond: {
        width: 12,
        height: 12,
        backgroundColor: GOLD,
        transform: [{ rotate: '45deg' }],
        zIndex: 1
    },
    rowContent: {
        flex: 1,
        paddingLeft: 10
    },
    pathRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        marginBottom: 4
    },
    pathBubble: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: PANEL,
        alignItems: 'center',
        justifyContent: 'center'
    },
    pathBubbleActive: {
        borderColor: GOLD,
        backgroundColor: '#162330'
    },
    pathBubbleDisabled: {
        opacity: 0.4
    },
    pathIcon: {
        width: 30,
        height: 30
    },
    runeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12
    },
    runeCell: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center'
    },
    keystoneCell: {
        width: 70,
        height: 70,
        borderRadius: 35
    },
    runeIcon: {
        width: 48,
        height: 48,
        borderRadius: 24
    },
    keystoneIcon: {
        width: 60,
        height: 60,
        borderRadius: 30
    },
    runeRing: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 60,
        borderWidth: 2,
        borderColor: GOLD
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10
    },
    statBubble: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: PANEL,
        width: 88
    },
    statBubbleActive: {
        borderColor: GOLD,
        backgroundColor: '#1a2c3a'
    },
    statIcon: {
        width: 26,
        height: 26,
        marginBottom: 4
    },
    statLabel: {
        color: MUTED,
        fontSize: 11,
        fontWeight: '700'
    },
    statLabelActive: {
        color: GOLD
    },
    dimIcon: {
        opacity: 0.35
    },
    iconFallback: {
        backgroundColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center'
    },
    iconFallbackText: {
        color: TEXT,
        fontSize: 12,
        fontWeight: '700'
    },
    errorText: {
        color: '#f87171',
        fontSize: 12,
        marginTop: 8
    },
    saveButton: {
        marginTop: 10,
        backgroundColor: GOLD,
        paddingVertical: 12,
        alignItems: 'center'
    },
    saveText: {
        color: INK,
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 1
    }
});
