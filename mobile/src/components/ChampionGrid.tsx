
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, TextInput, Dimensions, Animated, Text } from 'react-native';

interface Champion {
    id: number;
    key: string;
    name: string;
    image: {
        full: string;
    };
}



interface ChampionGridProps {
    champions: Champion[];
    onSelect: (championId: number) => void;
    disabled?: boolean;
    version?: string;
    hoveredId?: number | null;
    teammateHoveredIds?: number[];
    pickedIds?: number[];
    bannedIds?: number[];
    availableChampionIds?: number[];
    ListHeaderComponent?: React.ReactElement | null;
    ListFooterComponent?: React.ReactElement | null;
    contentContainerStyle?: any;
}

const numColumns = 4;
const screenWidth = Dimensions.get('window').width;
const itemWidth = (screenWidth - 40) / numColumns; // 40 for padding

export default function ChampionGrid({
    champions,
    onSelect,
    disabled,
    version = '14.23.1',
    hoveredId,
    teammateHoveredIds = [],
    pickedIds = [],
    bannedIds = [],
    availableChampionIds = [],
    ListHeaderComponent,
    ListFooterComponent,
    contentContainerStyle
}: ChampionGridProps) {
    const [search, setSearch] = useState('');
    const teammateBlinkAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (teammateHoveredIds.length > 0) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(teammateBlinkAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
                    Animated.timing(teammateBlinkAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            ).start();
        } else {
            teammateBlinkAnim.stopAnimation(() => teammateBlinkAnim.setValue(1));
        }
    }, [teammateHoveredIds.length, teammateBlinkAnim]);

    const filteredChampions = useMemo(() => {
        return champions.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }, [champions, search]);

    const renderItem = ({ item }: { item: Champion }) => {
        const isHovered = hoveredId === item.id;
        const isTeammateHovered = teammateHoveredIds.includes(item.id);
        const isPicked = pickedIds.includes(item.id);
        const isBanned = bannedIds.includes(item.id);
        const isOwned = availableChampionIds.includes(item.id);
        const isUnavailable = isPicked || isBanned || !isOwned;
        const isDisabled = disabled || isUnavailable;

        return (
            <TouchableOpacity onPress={() => onSelect(item.id)} disabled={isDisabled} style={styles.item}>
                <View style={[
                    styles.imageContainer,
                    isHovered && styles.containerHovered,
                    isTeammateHovered && styles.containerTeammateHovered,
                    isUnavailable && styles.containerUnavailable,
                ]}>
                    <Image
                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${item.image.full}` }}
                        style={[
                            styles.image,
                            isUnavailable && styles.imageDisabled
                        ]}
                    />
                    {isTeammateHovered && !isHovered && (
                        <Animated.View style={[styles.teammateHoverOverlay, { opacity: teammateBlinkAnim }]} />
                    )}
                </View>
                <Text style={[styles.name, isUnavailable && styles.nameDisabled]} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <FlatList
                ListHeaderComponent={
                    <>
                        {ListHeaderComponent}
                        <TextInput
                            style={styles.searchBar}
                            placeholder="Search champions..."
                            placeholderTextColor="#a1a1aa"
                            value={search}
                            onChangeText={setSearch}
                        />
                    </>
                }
                ListFooterComponent={ListFooterComponent}
                data={filteredChampions}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                columnWrapperStyle={styles.row}
                contentContainerStyle={[styles.listContent, contentContainerStyle]}
                showsVerticalScrollIndicator={false}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={5}
                removeClippedSubviews={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    searchBar: {
        backgroundColor: '#050a10',
        color: '#f0e6d2',
        padding: 12,
        borderRadius: 4,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#c7b37b', // Gold
        fontSize: 16,
    },
    listContent: {
        paddingBottom: 40,
    },
    row: {
        justifyContent: 'flex-start',
        gap: 10,
    },
    item: {
        width: itemWidth - 8,
        marginBottom: 16,
        alignItems: 'center',
    },
    imageContainer: {
        width: itemWidth - 8,
        height: itemWidth - 8,
        padding: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#3f3f46', // Subtle border for all
        marginBottom: 6,
        position: 'relative',
        backgroundColor: '#000',
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 2,
    },
    containerHovered: {
        borderColor: '#c7b37b',
        borderWidth: 2,
        shadowColor: '#c7b37b',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    containerTeammateHovered: {
        borderColor: '#fbbf24',
        borderWidth: 2,
    },
    containerUnavailable: {
        opacity: 0.3,
        borderColor: '#1f2937',
        backgroundColor: '#000',
    },
    imageDisabled: {
        opacity: 0.4,
        backgroundColor: '#000',
    },
    teammateHoverOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
        borderRadius: 2,
        margin: 0,
    },
    nameDisabled: {
        color: '#525252',
    },
    name: {
        color: '#e5e7eb',
        fontSize: 12,
        textAlign: 'center',
        fontWeight: '600',
    },
});
