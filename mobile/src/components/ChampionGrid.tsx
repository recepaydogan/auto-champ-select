
import React, { useState, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, TextInput, Dimensions } from 'react-native';
import { Text } from '@rneui/themed';

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
}

const numColumns = 4;
const screenWidth = Dimensions.get('window').width;
const itemWidth = (screenWidth - 40) / numColumns; // 40 for padding

export default function ChampionGrid({ champions, onSelect, disabled, version = '14.23.1', hoveredId, teammateHoveredIds = [], pickedIds = [], bannedIds = [] }: ChampionGridProps) {
    const [search, setSearch] = useState('');

    const filteredChampions = useMemo(() => {
        return champions.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }, [champions, search]);

    const renderItem = ({ item }: { item: Champion }) => {
        const isHovered = hoveredId === item.id;
        const isTeammateHovered = teammateHoveredIds.includes(item.id);
        const isPicked = pickedIds.includes(item.id);
        const isBanned = bannedIds.includes(item.id);
        const isDisabled = disabled || isPicked || isBanned;

        return (
            <TouchableOpacity
                onPress={() => onSelect(item.id)}
                disabled={isDisabled}
                style={[
                    styles.item,
                    isHovered && styles.itemHovered,
                    isTeammateHovered && styles.itemTeammateHovered,
                    isPicked && styles.itemPicked,
                    isBanned && styles.itemBanned
                ]}
            >
                <View style={styles.imageContainer}>
                    <Image
                        source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${item.image.full}` }}
                        style={[
                            styles.image,
                            isHovered && styles.imageHovered,
                            isTeammateHovered && styles.imageTeammateHovered,
                            (isPicked || isBanned) && styles.imageDisabled
                        ]}
                    />
                    {isHovered && (
                        <View style={styles.hoverOverlay}>
                            <Text style={styles.hoverText}>HOVER</Text>
                        </View>
                    )}
                    {isTeammateHovered && !isHovered && (
                        <View style={styles.teammateHoverOverlay}>
                            <Text style={styles.teammateHoverText}>TEAM</Text>
                        </View>
                    )}
                    {isPicked && (
                        <View style={styles.pickedOverlay}>
                            <Text style={styles.pickedText}>PICKED</Text>
                        </View>
                    )}
                    {isBanned && (
                        <View style={styles.bannedOverlay}>
                            <Text style={styles.bannedText}>BANNED</Text>
                        </View>
                    )}
                </View>
                <Text style={[
                    styles.name,
                    isHovered && styles.nameHovered,
                    isTeammateHovered && styles.nameTeammateHovered,
                    (isPicked || isBanned) && styles.nameDisabled
                ]} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <TextInput
                style={styles.searchBar}
                placeholder="Search champions..."
                placeholderTextColor="#a3a3a3"
                value={search}
                onChangeText={setSearch}
            />
            <FlatList
                data={filteredChampions}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listContent}
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
        backgroundColor: '#171717',
        color: '#ffffff',
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#262626',
    },
    listContent: {
        paddingBottom: 20,
    },
    row: {
        justifyContent: 'flex-start',
        gap: 10,
    },
    item: {
        width: itemWidth - 8, // Adjust for gap
        marginBottom: 15,
        alignItems: 'center',
    },
    image: {
        width: itemWidth - 8,
        height: itemWidth - 8,
        borderRadius: 8,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: '#262626',
    },
    imageContainer: {
        position: 'relative',
    },
    itemHovered: {
        borderColor: '#3b82f6',
        borderWidth: 2,
        borderRadius: 8,
        backgroundColor: '#1e3a8a',
    },
    itemTeammateHovered: {
        borderColor: '#eab308', // Yellow/Gold for teammate
        borderWidth: 2,
        borderRadius: 8,
        backgroundColor: '#422006',
    },
    itemPicked: {
        opacity: 0.8,
        borderColor: '#10b981', // Green border for picked
        borderWidth: 2,
        borderRadius: 8,
    },
    itemBanned: {
        opacity: 0.6,
        borderColor: '#ef4444', // Red border for banned
        borderWidth: 2,
        borderRadius: 8,
    },
    imageHovered: {
        borderColor: '#3b82f6',
        borderWidth: 0, // Border handled by item container
    },
    imageTeammateHovered: {
        borderColor: '#eab308',
        borderWidth: 0,
    },
    imageDisabled: {
        opacity: 0.7,
        borderColor: 'transparent',
    },
    hoverOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    teammateHoverOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(234, 179, 8, 0.3)', // Yellow tint
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    pickedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(16, 185, 129, 0.2)', // Slight green tint
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    bannedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(239, 68, 68, 0.3)', // Red tint
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    hoverText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    teammateHoverText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    pickedText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    bannedText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    nameHovered: {
        color: '#60a5fa',
        fontWeight: 'bold',
    },
    nameTeammateHovered: {
        color: '#facc15', // Yellow text
        fontWeight: 'bold',
    },
    nameDisabled: {
        color: '#737373',
    },
    name: {
        color: '#d4d4d4',
        fontSize: 12,
        textAlign: 'center',
    },
});
