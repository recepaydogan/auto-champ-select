import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Modal } from 'react-native';
import { Button } from '@rneui/themed';

interface Skin {
    id: number;
    name: string;
    splashPath: string;
    owned: boolean;
}

interface SkinPickerProps {
    visible: boolean;
    onSelect: (skinId: number) => void;
    onClose: () => void;
    skins: Skin[];
    currentSkinId?: number;
}

export default function SkinPicker({ visible, onSelect, onClose, skins, currentSkinId }: SkinPickerProps) {
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.title}>Select Skin</Text>
                    <ScrollView contentContainerStyle={styles.list}>
                        {skins.filter(s => s.owned).map((skin) => (
                            <TouchableOpacity
                                key={skin.id}
                                style={[
                                    styles.skinItem,
                                    currentSkinId === skin.id && styles.selectedSkin
                                ]}
                                onPress={() => onSelect(skin.id)}
                            >
                                <Image source={{ uri: skin.splashPath }} style={styles.skinImage} />
                                <View style={styles.skinInfo}>
                                    <Text style={styles.skinName}>{skin.name}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
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
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
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
    skinInfo: {
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.7)',
        position: 'absolute',
        bottom: 0,
        width: '100%',
    },
    skinName: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    cancelButton: {
        backgroundColor: '#757575',
        marginTop: 10,
    },
});
