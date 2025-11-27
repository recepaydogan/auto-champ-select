import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Modal } from 'react-native';
import { Button } from '@rneui/themed';

interface Spell {
    id: number;
    name: string;
    iconPath: string;
}

interface SpellPickerProps {
    visible: boolean;
    onSelect: (spellId: number) => void;
    onClose: () => void;
    spells: Spell[];
    currentSpellId?: number;
}

export default function SpellPicker({ visible, onSelect, onClose, spells, currentSpellId }: SpellPickerProps) {
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.title}>Select Summoner Spell</Text>
                    <ScrollView contentContainerStyle={styles.grid}>
                        {spells.map((spell) => (
                            <TouchableOpacity
                                key={spell.id}
                                style={[
                                    styles.spellItem,
                                    currentSpellId === spell.id && styles.selectedSpell
                                ]}
                                onPress={() => onSelect(spell.id)}
                            >
                                <Image source={{ uri: spell.iconPath }} style={styles.spellIcon} />
                                <Text style={styles.spellName}>{spell.name}</Text>
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 15,
    },
    spellItem: {
        width: 80,
        alignItems: 'center',
        marginBottom: 15,
        padding: 5,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    selectedSpell: {
        borderColor: '#d4af37',
        backgroundColor: '#3a3a3a',
    },
    spellIcon: {
        width: 50,
        height: 50,
        borderRadius: 8,
        marginBottom: 5,
    },
    spellName: {
        color: '#ccc',
        fontSize: 10,
        textAlign: 'center',
    },
    cancelButton: {
        backgroundColor: '#757575',
        marginTop: 20,
    },
});
