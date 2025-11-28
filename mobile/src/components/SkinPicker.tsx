import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Modal } from 'react-native';
import { Button } from '@rneui/themed';

interface Skin {
    id: number;
    name: string;
    splashPath?: string | null;
    owned: boolean;
}

interface SkinPickerProps {
    visible: boolean;
    onSelect: (skinId: number) => void;
    onClose: () => void;
    skins: Skin[];
    currentSkinId?: number;
    championName?: string;
    fallbackSplash?: string;
    championIcon?: string;
}

const safeUri = (uri?: string | null) => {
    if (!uri || typeof uri !== 'string' || uri.trim() === '') return null;
    return uri;
};

export default function SkinPicker({ visible, onSelect, onClose, skins, currentSkinId, championName, fallbackSplash, championIcon }: SkinPickerProps) {
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.headerRow}>
                        {championIcon ? (
                            <Image source={{ uri: championIcon }} style={styles.headerIcon} />
                        ) : null}
                        <Text style={styles.title}>{championName ? `Select Skin • ${championName}` : 'Select Skin'}</Text>
                    </View>
                    <ScrollView contentContainerStyle={styles.list}>
                        {skins.map((skin) => {
                            const uri = safeUri(skin.splashPath) || safeUri(fallbackSplash) || safeUri(championIcon);
                            return (
                            <TouchableOpacity
                                key={skin.id}
                                style={[
                                    styles.skinItem,
                                    currentSkinId === skin.id && styles.selectedSkin
                                ]}
                                onPress={() => onSelect(skin.id)}
                            >
                                {uri ? (
                                    <Image source={{ uri }} style={styles.skinImage} />
                                ) : (
                                    <View style={[styles.skinImage, styles.skinPlaceholder]}>
                                        <Text style={styles.placeholderText}>Image unavailable</Text>
                                    </View>
                                )}
                                <View style={styles.skinInfo}>
                                    <Text style={styles.skinName} numberOfLines={1}>{skin.name}</Text>
                                </View>
                            </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <Button title="Cancel" onPress={onClose} buttonStyle={styles.cancelButton} />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 20,
        width: '90%',
        maxHeight: '80%',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 10,
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        flex: 1,
    },
    headerIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#111827',
    },
    list: {
        paddingBottom: 20,
    },
    skinItem: {
        marginBottom: 15,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#333',
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    selectedSkin: {
        borderColor: '#d4af37',
    },
    skinImage: {
        width: '100%',
        height: 150,
        resizeMode: 'cover',
    },
    skinPlaceholder: {
        backgroundColor: '#111827',
    },
    skinInfo: {
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.7)',
        position: 'absolute',
        bottom: 0,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    skinName: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        flex: 1,
    },
    cancelButton: {
        backgroundColor: '#757575',
        marginTop: 10,
    },
});
