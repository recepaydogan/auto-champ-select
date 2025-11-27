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
}

const numColumns = 4;
const screenWidth = Dimensions.get('window').width;
const itemWidth = (screenWidth - 40) / numColumns; // 40 for padding

export default function ChampionGrid({ champions, onSelect, disabled, version = '14.23.1' }: ChampionGridProps) {
    const [search, setSearch] = useState('');

    const filteredChampions = useMemo(() => {
        return champions.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }, [champions, search]);

    const renderItem = ({ item }: { item: Champion }) => (
        <TouchableOpacity
            onPress={() => onSelect(item.id)}
            disabled={disabled}
            style={styles.item}
        >
            <Image
                source={{ uri: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${item.image.full}` }}
                style={styles.image}
            />
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <TextInput
                style={styles.searchBar}
                placeholder="Search Champion..."
                placeholderTextColor="#a3a3a3"
                value={search}
                onChangeText={setSearch}
            />
            <FlatList
                data={filteredChampions}
                renderItem={renderItem}
                keyExtractor={item => item.key}
                numColumns={numColumns}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
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
    name: {
        color: '#a3a3a3',
        fontSize: 10,
        textAlign: 'center',
    },
});
